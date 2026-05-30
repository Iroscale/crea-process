"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { analyzeAdImage } from "@/lib/analyze-ad-image";
import { chatTurn, finalizeBrief as finalizeBriefAgent } from "@/lib/brief-agent";
import { loadBrandContextForBrief } from "@/lib/brand-context";
import { generateAngleCopyVariants } from "@/lib/copy-variants-generator";
import {
  generateConceptVariants,
  generateConceptVariantFromIdea,
} from "@/lib/concept-variants-generator";
import type {
  Brief,
  ConceptVariant,
  CopyVariant,
  RenderStyle,
} from "@/lib/brief-schema";

function safeName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

/**
 * Run an async worker over each item with a fixed concurrency cap. Items are
 * pulled from a shared cursor, so faster items keep the pool busy. Errors are
 * absorbed by the worker (each call site catches its own exceptions to keep
 * accumulating in an `errors[]` array).
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runOne = async (): Promise<void> => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
    }
  };
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runOne()
  );
  await Promise.all(workers);
}

async function loadBriefForUser(briefId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, project_id, user_id, mode, status, user_input")
    .eq("id", briefId)
    .maybeSingle();
  if (!brief) throw new Error("Brief introuvable");

  return { supabase, user, brief };
}

export async function uploadInspirations(briefId: string, formData: FormData) {
  const { supabase, user, brief } = await loadBriefForUser(briefId);

  const allFiles = formData.getAll("files");
  const files = allFiles.filter(
    (f): f is File => f instanceof File && f.size > 0
  );

  if (files.length === 0) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        `Aucun fichier reçu (${allFiles.length} entrées dans le form)`
      )}`
    );
  }

  const errors: string[] = [];

  // Parallelize the per-file pipeline (storage upload → Claude vision → DB
  // insert). Each step is mostly waiting on a remote API, so a worker pool
  // of 4 cuts a 10-image batch from ~150s sequential to ~30-40s.
  const CONCURRENCY = 4;
  await runWithConcurrency(files, CONCURRENCY, async (file) => {
    if (!file.type.startsWith("image/")) {
      errors.push(`${file.name} ignoré (mime ${file.type || "inconnu"})`);
      return;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const cleanName = safeName(file.name);
      const path = `${user.id}/${brief.project_id}/${briefId}_${Date.now()}_${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from("inspirations")
        .upload(path, buffer, { contentType: file.type, upsert: false });
      if (uploadError) {
        errors.push(`${file.name}: storage → ${uploadError.message}`);
        return;
      }

      let analysis: string | null = null;
      try {
        analysis = await analyzeAdImage(buffer, file.type);
      } catch (e) {
        errors.push(`${file.name}: vision → ${(e as Error).message}`);
      }

      const { error: insertError } = await supabase
        .from("brief_inspirations")
        .insert({
          brief_id: briefId,
          storage_path: path,
          mime_type: file.type,
          analysis: analysis ? { description: analysis } : null,
        });
      if (insertError) {
        errors.push(`${file.name}: db → ${insertError.message}`);
      }
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  });

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);

  if (errors.length > 0) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        errors.join(" • ")
      )}`
    );
  }
}

/**
 * Re-run vision analysis on an inspiration that previously failed (e.g. an
 * older Claude 5MB-cap rejection before the sharp downscale was added).
 * Pulls the original from storage, runs vision, updates the analysis JSON.
 */
export async function reanalyzeInspiration(
  briefId: string,
  inspirationId: string
) {
  const { supabase, brief } = await loadBriefForUser(briefId);

  const { data: insp } = await supabase
    .from("brief_inspirations")
    .select("storage_path, mime_type")
    .eq("id", inspirationId)
    .maybeSingle();

  if (!insp?.storage_path) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Inspiration introuvable"
      )}`
    );
  }

  const { data: blob, error: dlError } = await supabase.storage
    .from("inspirations")
    .download(insp.storage_path);

  if (dlError || !blob) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        `Téléchargement : ${dlError?.message ?? "fichier introuvable"}`
      )}`
    );
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = insp.mime_type ?? blob.type ?? "image/jpeg";

  let analysis: string;
  try {
    analysis = await analyzeAdImage(buffer, mime);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        `Vision : ${(e as Error).message}`
      )}`
    );
  }

  await supabase
    .from("brief_inspirations")
    .update({ analysis: { description: analysis } })
    .eq("id", inspirationId);

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

export async function deleteInspiration(
  briefId: string,
  inspirationId: string
) {
  const { supabase, brief } = await loadBriefForUser(briefId);

  const { data: insp } = await supabase
    .from("brief_inspirations")
    .select("storage_path")
    .eq("id", inspirationId)
    .maybeSingle();

  if (insp?.storage_path) {
    await supabase.storage.from("inspirations").remove([insp.storage_path]);
  }
  await supabase
    .from("brief_inspirations")
    .delete()
    .eq("id", inspirationId);

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

export async function sendChatMessage(briefId: string, formData: FormData) {
  const { supabase, user, brief } = await loadBriefForUser(briefId);
  const content = String(formData.get("content") ?? "").trim();
  // Files attached to this message — uploaded as inspirations + analyzed
  // by Claude vision, then bound to the message via the `attachments` column.
  const allFiles = formData.getAll("attachments");
  const files = allFiles.filter(
    (f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/")
  );

  if (!content && files.length === 0) return;

  // ── 1) Upload + analyze each attachment, in parallel (concurrency 4) ────
  type Attachment = {
    inspiration_id: string;
    storage_path: string;
    mime_type: string;
  };
  const attachments: Attachment[] = [];
  if (files.length > 0) {
    await runWithConcurrency(files, 4, async (file) => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const cleanName = safeName(file.name);
        const path = `${user.id}/${brief.project_id}/${briefId}_chat_${Date.now()}_${cleanName}`;
        const { error: uploadErr } = await supabase.storage
          .from("inspirations")
          .upload(path, buffer, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadErr) {
          console.error("chat attachment upload", uploadErr.message);
          return;
        }
        let analysis: string | null = null;
        try {
          analysis = await analyzeAdImage(buffer, file.type);
        } catch (e) {
          console.error("chat attachment vision", (e as Error).message);
        }
        const { data: insp } = await supabase
          .from("brief_inspirations")
          .insert({
            brief_id: briefId,
            storage_path: path,
            mime_type: file.type,
            analysis: analysis ? { description: analysis } : null,
          })
          .select("id")
          .single();
        if (insp) {
          attachments.push({
            inspiration_id: insp.id,
            storage_path: path,
            mime_type: file.type,
          });
        }
      } catch (e) {
        console.error("chat attachment failed", (e as Error).message);
      }
    });
  }

  // ── 2) Persist the user message with attachments ────────────────────────
  // The text body is mandatory in the DB ; if the user sent only images, we
  // synthesize a tiny placeholder so the message can be inserted.
  const userText = content || `📎 ${files.length} image(s) jointe(s)`;
  await supabase.from("brief_messages").insert({
    brief_id: briefId,
    role: "user",
    content: userText,
    attachments: attachments.length > 0 ? attachments : null,
  });
  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);

  // Load history + inspirations for context
  const { data: history } = await supabase
    .from("brief_messages")
    .select("role, content")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: true });

  const { data: inspirations } = await supabase
    .from("brief_inspirations")
    .select("analysis")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: true });

  const inspirationAnalyses =
    inspirations
      ?.map((i) => {
        const a = i.analysis as { description?: string } | null;
        return a?.description ?? null;
      })
      .filter((s): s is string => Boolean(s)) ?? [];

  // Strip the just-inserted user message from history (we pass it explicitly)
  const trimmed = (history ?? []).slice(0, -1) as {
    role: "user" | "assistant";
    content: string;
  }[];

  // If the user sent only images (no text), pass a meta-indication to the
  // AI so it knows to react to the freshly attached visuals (whose analyses
  // are already in `inspirationAnalyses`).
  const messageForAgent = content
    ? files.length > 0
      ? `${content}\n\n[L'utilisateur vient de joindre ${files.length} image(s) en plus de ce message — leur analyse vision est dans le contexte.]`
      : content
    : `[L'utilisateur a joint ${files.length} image(s) sans texte — réagis aux visuels (leur analyse vision est dans le contexte) : qu'est-ce qui les inspire, quel angle marketing en tirer, quelle direction artistique en déduire ?]`;

  let assistantReply: string;
  try {
    assistantReply = await chatTurn(
      brief.project_id,
      trimmed,
      messageForAgent,
      inspirationAnalyses
    );
  } catch (e) {
    assistantReply = `[Erreur agent : ${(e as Error).message}]`;
  }

  await supabase.from("brief_messages").insert({
    brief_id: briefId,
    role: "assistant",
    content: assistantReply,
  });

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

export async function finalizeBrief(briefId: string) {
  const { supabase, brief } = await loadBriefForUser(briefId);

  const { data: messages } = await supabase
    .from("brief_messages")
    .select("role, content")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: true });

  const { data: inspirations } = await supabase
    .from("brief_inspirations")
    .select("analysis")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: true });

  const inspirationAnalyses =
    inspirations
      ?.map((i) => {
        const a = i.analysis as { description?: string } | null;
        return a?.description ?? null;
      })
      .filter((s): s is string => Boolean(s)) ?? [];

  // If the brief is associated with a brand, inject its DA into the agent's
  // system prompt so angles/concepts respect colors, typo, voice, do/don't say.
  const brand = await loadBrandContextForBrief(supabase, briefId);

  // Region targeting (default 'international')
  const { data: briefRegion } = await supabase
    .from("briefs")
    .select("region")
    .eq("id", briefId)
    .maybeSingle();
  const region = briefRegion?.region ?? "international";

  try {
    const briefData = await finalizeBriefAgent(brief.project_id, {
      userInput: brief.user_input,
      messages: (messages ?? []) as {
        role: "user" | "assistant";
        content: string;
      }[],
      inspirationAnalyses,
      brand,
      region,
    });

    await supabase
      .from("briefs")
      .update({
        brief_data: briefData,
        status: "ready",
        // Track which brand was applied at finalize. UI compares this to the
        // current brand_id to detect "user changed brand AFTER finalize" and
        // shows a re-finalize hint.
        brand_id_at_finalize: brand?.id ?? null,
      })
      .eq("id", briefId);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Associate (or detach) a brand to/from this brief. The brand's DA will be
 * injected into the next finalize + image generations.
 */
export async function setBriefBrand(
  briefId: string,
  brandId: string | null
) {
  const { supabase, user, brief } = await loadBriefForUser(briefId);

  // If a brandId is provided, verify ownership before associating
  if (brandId) {
    const { data: brand } = await supabase
      .from("brands")
      .select("id, user_id")
      .eq("id", brandId)
      .maybeSingle();
    if (!brand || brand.user_id !== user.id) {
      redirect(
        `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
          "Marque introuvable"
        )}`
      );
    }
  }

  const { error } = await supabase
    .from("briefs")
    .update({ brand_id: brandId })
    .eq("id", briefId);
  if (error) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Associate a French region (or 'international') to this brief. The region
 * is injected into the next finalize + image generations to localise the
 * angles, concepts, and visuals (landmarks, démonymes, architecture).
 */
export async function setBriefRegion(briefId: string, region: string) {
  const { supabase, brief } = await loadBriefForUser(briefId);

  const { error } = await supabase
    .from("briefs")
    .update({ region })
    .eq("id", briefId);
  if (error) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

// =============================================================================
// COPY VARIANTS — gestion des variantes de copy par angle
// =============================================================================
//
// Chaque angle du brief peut avoir N variantes de copy (différents hooks pour
// le MÊME angle marketing). L'utilisateur les ajoute via "Générer N variantes"
// sur le form Phase 1, peut en éditer / supprimer une, ou tout regénérer.
//
// Persistance : brief_data.angles[idx].copy_variants[] dans la table briefs.

async function loadBriefDataForVariants(briefId: string) {
  const { supabase, brief } = await loadBriefForUser(briefId);
  const { data: row } = await supabase
    .from("briefs")
    .select("brief_data, brand_id, region")
    .eq("id", briefId)
    .maybeSingle();
  const briefData = (row?.brief_data ?? null) as Brief | null;
  if (!briefData) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Finalise le brief avant de générer des variantes"
      )}`
    );
  }
  return {
    supabase,
    brief,
    briefData,
    region: (row?.region as string | null) ?? "international",
  };
}

async function persistAngles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  briefId: string,
  briefData: Brief,
  newAngles: Brief["angles"]
) {
  const next: Brief = { ...briefData, angles: newAngles };
  const { error } = await supabase
    .from("briefs")
    .update({ brief_data: next })
    .eq("id", briefId);
  return error;
}

async function persistConcepts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  briefId: string,
  briefData: Brief,
  newConcepts: Brief["concepts"]
) {
  const next: Brief = { ...briefData, concepts: newConcepts };
  const { error } = await supabase
    .from("briefs")
    .update({ brief_data: next })
    .eq("id", briefId);
  return error;
}

/**
 * Generate N copy variants for a given angle and persist them on the brief.
 * Uses the brief's brand + region context so variants respect the DA + locale.
 *
 * Form fields :
 *   - angle_idx (string, integer)
 *   - count     (string, integer, default 5, clamped 1-10)
 */
export async function regenerateAngleCopyVariants(
  briefId: string,
  formData: FormData
) {
  const { supabase, brief, briefData, region } =
    await loadBriefDataForVariants(briefId);

  const angleIdx = parseInt(String(formData.get("angle_idx") ?? ""), 10);
  if (
    !Number.isInteger(angleIdx) ||
    angleIdx < 0 ||
    angleIdx >= briefData.angles.length
  ) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Angle introuvable"
      )}`
    );
  }
  const count = Math.min(
    Math.max(parseInt(String(formData.get("count") ?? "5"), 10) || 5, 1),
    10
  );

  const angle = briefData.angles[angleIdx];
  const brand = await loadBrandContextForBrief(supabase, briefId);

  let variants: CopyVariant[];
  try {
    variants = await generateAngleCopyVariants({
      angle: {
        name: angle.name,
        rationale: angle.rationale,
        headline: angle.headline,
        body: angle.body,
        cta: angle.cta,
      },
      count,
      brand,
      region,
      productSummary: briefData.product_summary,
    });
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  const newAngles = briefData.angles.map((a, i) =>
    i === angleIdx ? { ...a, copy_variants: variants } : a
  );
  const dbErr = await persistAngles(supabase, briefId, briefData, newAngles);
  if (dbErr) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        dbErr.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Update one variant in place (user edited a few words).
 *
 * Form fields :
 *   - angle_idx, variant_id
 *   - headline (required), body, cta
 */
export async function updateAngleCopyVariant(
  briefId: string,
  formData: FormData
) {
  const { supabase, brief, briefData } =
    await loadBriefDataForVariants(briefId);

  const angleIdx = parseInt(String(formData.get("angle_idx") ?? ""), 10);
  const variantId = String(formData.get("variant_id") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();
  const bodyRaw = String(formData.get("body") ?? "").trim();
  const ctaRaw = String(formData.get("cta") ?? "").trim();

  if (
    !Number.isInteger(angleIdx) ||
    angleIdx < 0 ||
    angleIdx >= briefData.angles.length ||
    !variantId ||
    !headline
  ) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Édition variante : champs invalides (headline obligatoire)"
      )}`
    );
  }

  const angle = briefData.angles[angleIdx];
  const variants = angle.copy_variants ?? [];
  const exists = variants.some((v) => v.id === variantId);
  if (!exists) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Variante introuvable"
      )}`
    );
  }

  const updatedVariants = variants.map((v) =>
    v.id === variantId
      ? {
          ...v,
          headline,
          body: bodyRaw.length > 0 ? bodyRaw : undefined,
          cta: ctaRaw.length > 0 ? ctaRaw : undefined,
        }
      : v
  );
  const newAngles = briefData.angles.map((a, i) =>
    i === angleIdx ? { ...a, copy_variants: updatedVariants } : a
  );

  const dbErr = await persistAngles(supabase, briefId, briefData, newAngles);
  if (dbErr) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        dbErr.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Generate copy variants for a CUSTOM angle (typed by the user, not saved to
 * the brief). Unlike `regenerateAngleCopyVariants`, this one DOES NOT persist
 * — it just returns the variants to the client which keeps them in form state.
 * The variants will travel with the rest of the custom angle in the form's
 * `custom_angles_json` payload at submit time.
 */
export async function generateCustomAngleCopyVariants(
  briefId: string,
  args: {
    name: string;
    headline: string;
    body?: string;
    cta?: string;
    count?: number;
  }
): Promise<CopyVariant[]> {
  const { supabase, briefData, region } =
    await loadBriefDataForVariants(briefId);

  const headline = args.headline?.trim() ?? "";
  if (!headline) throw new Error("Headline obligatoire pour générer des variantes");
  const name = args.name?.trim() || "Angle personnalisé";
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);

  const brand = await loadBrandContextForBrief(supabase, briefId);

  return generateAngleCopyVariants({
    angle: {
      name,
      rationale: "Angle personnalisé écrit par l'utilisateur",
      headline,
      body: args.body?.trim() || undefined,
      cta: args.cta?.trim() || undefined,
    },
    count,
    brand,
    region,
    productSummary: briefData.product_summary,
  });
}

/**
 * Delete a single variant (user disliked it specifically).
 */
export async function deleteAngleCopyVariant(
  briefId: string,
  formData: FormData
) {
  const { supabase, brief, briefData } =
    await loadBriefDataForVariants(briefId);

  const angleIdx = parseInt(String(formData.get("angle_idx") ?? ""), 10);
  const variantId = String(formData.get("variant_id") ?? "").trim();

  if (
    !Number.isInteger(angleIdx) ||
    angleIdx < 0 ||
    angleIdx >= briefData.angles.length ||
    !variantId
  ) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Suppression variante : paramètres invalides"
      )}`
    );
  }

  const angle = briefData.angles[angleIdx];
  const variants = angle.copy_variants ?? [];
  const updatedVariants = variants.filter((v) => v.id !== variantId);
  const newAngles = briefData.angles.map((a, i) =>
    i === angleIdx ? { ...a, copy_variants: updatedVariants } : a
  );

  const dbErr = await persistAngles(supabase, briefId, briefData, newAngles);
  if (dbErr) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        dbErr.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

// =============================================================================
// CONCEPT VARIANTS — variations visuelles d'un même concept
// =============================================================================
//
// Pour chaque concept brief, l'utilisateur peut produire des variations qui
// gardent le THÈME (sécurité / performance / social proof…) mais changent les
// objets, scènes, métaphores. Ex : "triangle de sécurité" → coffre-fort,
// cadenas, voûte de banque…
//
// Persistance : brief_data.concepts[idx].concept_variants[].

/**
 * Generate N concept variants and persist them on the brief concept.
 * Form fields :
 *   - concept_idx (string, integer)
 *   - count       (string, integer, default 5, clamped 1-10)
 */
export async function regenerateConceptVariants(
  briefId: string,
  formData: FormData
) {
  const { supabase, brief, briefData, region } =
    await loadBriefDataForVariants(briefId);

  const conceptIdx = parseInt(String(formData.get("concept_idx") ?? ""), 10);
  if (
    !Number.isInteger(conceptIdx) ||
    conceptIdx < 0 ||
    conceptIdx >= briefData.concepts.length
  ) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Concept introuvable"
      )}`
    );
  }
  const count = Math.min(
    Math.max(parseInt(String(formData.get("count") ?? "5"), 10) || 5, 1),
    10
  );

  const concept = briefData.concepts[conceptIdx];
  const brand = await loadBrandContextForBrief(supabase, briefId);

  let variants: ConceptVariant[];
  try {
    variants = await generateConceptVariants({
      concept: {
        name: concept.name,
        rationale: concept.rationale,
        description: concept.description,
        render_style: concept.render_style,
      },
      count,
      brand,
      region,
      productSummary: briefData.product_summary,
    });
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  const newConcepts = briefData.concepts.map((c, i) =>
    i === conceptIdx ? { ...c, concept_variants: variants } : c
  );
  const dbErr = await persistConcepts(
    supabase,
    briefId,
    briefData,
    newConcepts
  );
  if (dbErr) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        dbErr.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Add ONE variant guided by the user's idea (custom prompt).
 * Form fields :
 *   - concept_idx (integer)
 *   - idea        (string, non-empty)
 */
export async function addConceptVariantFromIdea(
  briefId: string,
  formData: FormData
) {
  const { supabase, brief, briefData, region } =
    await loadBriefDataForVariants(briefId);

  const conceptIdx = parseInt(String(formData.get("concept_idx") ?? ""), 10);
  const idea = String(formData.get("idea") ?? "").trim();
  if (
    !Number.isInteger(conceptIdx) ||
    conceptIdx < 0 ||
    conceptIdx >= briefData.concepts.length ||
    !idea
  ) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Idée vide ou concept invalide"
      )}`
    );
  }

  const concept = briefData.concepts[conceptIdx];
  const brand = await loadBrandContextForBrief(supabase, briefId);

  let variant: ConceptVariant;
  try {
    variant = await generateConceptVariantFromIdea({
      concept: {
        name: concept.name,
        rationale: concept.rationale,
        description: concept.description,
        render_style: concept.render_style,
      },
      userIdea: idea,
      brand,
      region,
      productSummary: briefData.product_summary,
    });
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  const existing = concept.concept_variants ?? [];
  const newConcepts = briefData.concepts.map((c, i) =>
    i === conceptIdx
      ? { ...c, concept_variants: [...existing, variant] }
      : c
  );
  const dbErr = await persistConcepts(
    supabase,
    briefId,
    briefData,
    newConcepts
  );
  if (dbErr) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        dbErr.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Update one concept variant (user edited the description / render_style).
 */
export async function updateConceptVariant(
  briefId: string,
  formData: FormData
) {
  const { supabase, brief, briefData } =
    await loadBriefDataForVariants(briefId);

  const conceptIdx = parseInt(String(formData.get("concept_idx") ?? ""), 10);
  const variantId = String(formData.get("variant_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const renderStyleRaw = String(formData.get("render_style") ?? "").trim();
  const RENDER_STYLES: RenderStyle[] = [
    "cinematic",
    "ugc",
    "screenshot_social",
    "editorial",
    "comparison_split",
    "data_viz",
    "meme",
  ];
  const render_style = RENDER_STYLES.includes(renderStyleRaw as RenderStyle)
    ? (renderStyleRaw as RenderStyle)
    : undefined;

  if (
    !Number.isInteger(conceptIdx) ||
    conceptIdx < 0 ||
    conceptIdx >= briefData.concepts.length ||
    !variantId ||
    !name ||
    !description
  ) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Édition variante concept : champs invalides (name + description obligatoires)"
      )}`
    );
  }

  const concept = briefData.concepts[conceptIdx];
  const variants = concept.concept_variants ?? [];
  const exists = variants.some((v) => v.id === variantId);
  if (!exists) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Variante introuvable"
      )}`
    );
  }
  const updatedVariants = variants.map((v) =>
    v.id === variantId ? { ...v, name, description, render_style } : v
  );
  const newConcepts = briefData.concepts.map((c, i) =>
    i === conceptIdx ? { ...c, concept_variants: updatedVariants } : c
  );

  const dbErr = await persistConcepts(
    supabase,
    briefId,
    briefData,
    newConcepts
  );
  if (dbErr) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        dbErr.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

export async function deleteConceptVariant(
  briefId: string,
  formData: FormData
) {
  const { supabase, brief, briefData } =
    await loadBriefDataForVariants(briefId);

  const conceptIdx = parseInt(String(formData.get("concept_idx") ?? ""), 10);
  const variantId = String(formData.get("variant_id") ?? "").trim();

  if (
    !Number.isInteger(conceptIdx) ||
    conceptIdx < 0 ||
    conceptIdx >= briefData.concepts.length ||
    !variantId
  ) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Suppression variante concept : paramètres invalides"
      )}`
    );
  }

  const concept = briefData.concepts[conceptIdx];
  const variants = concept.concept_variants ?? [];
  const updatedVariants = variants.filter((v) => v.id !== variantId);
  const newConcepts = briefData.concepts.map((c, i) =>
    i === conceptIdx ? { ...c, concept_variants: updatedVariants } : c
  );

  const dbErr = await persistConcepts(
    supabase,
    briefId,
    briefData,
    newConcepts
  );
  if (dbErr) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        dbErr.message
      )}`
    );
  }

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Generate concept variants for a NON-PERSISTED concept (preset or custom).
 * Returns the variants directly so the client can store them in form state.
 */
export async function generateEphemeralConceptVariants(
  briefId: string,
  args: {
    name: string;
    rationale: string;
    description: string;
    render_style?: RenderStyle;
    count?: number;
  }
): Promise<ConceptVariant[]> {
  const { supabase, briefData, region } =
    await loadBriefDataForVariants(briefId);

  if (!args.name?.trim() || !args.description?.trim()) {
    throw new Error("Nom et description obligatoires");
  }
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);

  const brand = await loadBrandContextForBrief(supabase, briefId);

  return generateConceptVariants({
    concept: {
      name: args.name.trim(),
      rationale: args.rationale?.trim() || "Concept",
      description: args.description.trim(),
      render_style: args.render_style,
    },
    count,
    brand,
    region,
    productSummary: briefData.product_summary,
  });
}

/**
 * Generate ONE variant from a custom user idea, for a NON-PERSISTED concept.
 */
export async function generateEphemeralConceptVariantFromIdea(
  briefId: string,
  args: {
    name: string;
    rationale: string;
    description: string;
    render_style?: RenderStyle;
    idea: string;
  }
): Promise<ConceptVariant> {
  const { supabase, briefData, region } =
    await loadBriefDataForVariants(briefId);

  if (!args.name?.trim() || !args.description?.trim()) {
    throw new Error("Nom et description obligatoires");
  }
  if (!args.idea?.trim()) {
    throw new Error("Idée vide — précise ce que tu veux modifier");
  }

  const brand = await loadBrandContextForBrief(supabase, briefId);

  return generateConceptVariantFromIdea({
    concept: {
      name: args.name.trim(),
      rationale: args.rationale?.trim() || "Concept",
      description: args.description.trim(),
      render_style: args.render_style,
    },
    userIdea: args.idea,
    brand,
    region,
    productSummary: briefData.product_summary,
  });
}
