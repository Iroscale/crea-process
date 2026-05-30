"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseAdCsv, type Platform } from "@/lib/ad-csv-parser";
import {
  batchExtract,
  computeTiers,
  pullCopyFromRawData,
  synthesizeAnalysis,
  type AdInputForExtraction,
  type SynthesisInput,
} from "@/lib/ad-extractor";
import {
  generateBriefFromLearnings,
  type LearningsInput,
} from "@/lib/brief-from-learnings";

const ACCEPTED_MIMES = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel", // CSVs from Excel sometimes report this
  "application/octet-stream",
]);
const MAX_CSV_SIZE = 20_000_000; // 20 MB

/**
 * Upload a CSV from the user, save it to the 'ad_imports' bucket, then
 * parse it inline (papaparse handles 10k rows in <1s). Inserts ad_imports
 * + ad_rows in one go and redirects to the detail page.
 */
export async function uploadCsvImport(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("file");
  const customName = (String(formData.get("name") ?? "") || "").trim();

  if (!file || !(file instanceof File) || file.size === 0) {
    redirect(`/analyse?error=${encodeURIComponent("Aucun fichier CSV reçu")}`);
  }
  if (file.size > MAX_CSV_SIZE) {
    redirect(
      `/analyse?error=${encodeURIComponent(
        `CSV trop lourd (${Math.round(file.size / 1024)} KB > 20 MB). Filtre les colonnes inutiles avant export.`
      )}`
    );
  }
  // Some browsers send "" mime — accept if extension is .csv
  const mime = file.type || "text/csv";
  const isCsvExt = file.name.toLowerCase().endsWith(".csv");
  if (!ACCEPTED_MIMES.has(mime) && !isCsvExt) {
    redirect(
      `/analyse?error=${encodeURIComponent(
        `Format non supporté : ${mime}. Exporte en CSV depuis Meta Ads / TikTok Ads / Google Ads.`
      )}`
    );
  }

  // Read text — strip BOM if present (Excel often adds it)
  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let parsed;
  try {
    parsed = parseAdCsv(text);
  } catch (e) {
    redirect(
      `/analyse?error=${encodeURIComponent(`Parsing : ${(e as Error).message}`)}`
    );
  }

  const importId = crypto.randomUUID();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const storagePath = `${user.id}/${importId}/${safeFilename}`;

  // Upload original CSV (for audit / re-extraction later)
  const { error: upErr } = await supabase.storage
    .from("ad_imports")
    .upload(storagePath, Buffer.from(text, "utf8"), {
      contentType: "text/csv; charset=utf-8",
      upsert: false,
    });
  if (upErr) {
    redirect(
      `/analyse?error=${encodeURIComponent(`Upload : ${upErr.message}`)}`
    );
  }

  // Insert the import row
  const { error: insImportErr } = await supabase.from("ad_imports").insert({
    id: importId,
    user_id: user.id,
    name: customName || file.name.replace(/\.csv$/i, ""),
    source_platform: parsed.platform as Platform,
    csv_storage_path: storagePath,
    csv_filename: file.name,
    raw_rows: parsed.rawRowCount,
    parsed_rows: parsed.rows.length,
    detected_columns: parsed.detectedColumns,
    status: "parsed",
    parsed_at: new Date().toISOString(),
  });
  if (insImportErr) {
    await supabase.storage.from("ad_imports").remove([storagePath]);
    redirect(
      `/analyse?error=${encodeURIComponent(
        `DB : ${insImportErr.message}`
      )}`
    );
  }

  // Insert all parsed rows in batches (Supabase has a 1000-row limit per insert)
  const ROWS_PER_BATCH = 500;
  for (let i = 0; i < parsed.rows.length; i += ROWS_PER_BATCH) {
    const batch = parsed.rows.slice(i, i + ROWS_PER_BATCH).map((r) => ({
      import_id: importId,
      ad_name: r.ad_name,
      ad_creative_url: r.ad_creative_url,
      campaign: r.campaign,
      ad_set: r.ad_set,
      impressions: r.impressions,
      reach: r.reach,
      clicks: r.clicks,
      spend: r.spend,
      cpm: r.cpm,
      cpc: r.cpc,
      ctr: r.ctr,
      conversions: r.conversions,
      cost_per_conversion: r.cost_per_conversion,
      conversion_rate: r.conversion_rate,
      roas: r.roas,
      currency: r.currency,
      raw_data: r.raw_data,
    }));
    const { error } = await supabase.from("ad_rows").insert(batch);
    if (error) {
      // Best-effort cleanup : delete the import (cascades to any rows already inserted)
      await supabase.from("ad_imports").delete().eq("id", importId);
      await supabase.storage.from("ad_imports").remove([storagePath]);
      redirect(
        `/analyse?error=${encodeURIComponent(`Insert rows : ${error.message}`)}`
      );
    }
  }

  revalidatePath("/analyse");
  redirect(`/analyse/${importId}`);
}

export async function deleteImport(importId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get the storage path before deleting
  const { data: row } = await supabase
    .from("ad_imports")
    .select("csv_storage_path")
    .eq("id", importId)
    .maybeSingle();

  await supabase.from("ad_imports").delete().eq("id", importId);
  if (row?.csv_storage_path) {
    await supabase.storage.from("ad_imports").remove([row.csv_storage_path]);
  }

  revalidatePath("/analyse");
  redirect("/analyse");
}

export async function renameImport(importId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = (String(formData.get("name") ?? "") || "").trim();
  if (!name) return;

  await supabase.from("ad_imports").update({ name }).eq("id", importId);
  revalidatePath(`/analyse/${importId}`);
  revalidatePath("/analyse");
}

/**
 * Run AI extraction on every ad of an import + compute tiers + synthesize
 * the patterns. Andrometa-aware : the form provides campaign structure
 * (testing / scaling / mixed), Meta objective, and an optional analyst note.
 * Claude adapts its recommendations to that context.
 */
export async function runAnalysis(importId: string, formData?: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: imp } = await supabase
    .from("ad_imports")
    .select(
      "id, user_id, name, status, campaign_structure, meta_objective, analyst_note"
    )
    .eq("id", importId)
    .maybeSingle();
  if (!imp || imp.user_id !== user.id) {
    redirect(
      `/analyse?error=${encodeURIComponent("Import introuvable")}`
    );
  }

  // Persist the new analysis context if provided in FormData. Otherwise
  // reuse what was previously stored (allows quick re-runs without re-asking).
  type CampaignStructure = "testing" | "scaling" | "mixed" | "unknown";
  let campaignStructure: CampaignStructure =
    (imp.campaign_structure as CampaignStructure | null) ?? "unknown";
  let metaObjective: string | null = imp.meta_objective;
  let analystNote: string | null = imp.analyst_note;

  if (formData) {
    const cs = String(formData.get("campaign_structure") ?? "").trim();
    if (
      cs === "testing" ||
      cs === "scaling" ||
      cs === "mixed" ||
      cs === "unknown"
    ) {
      campaignStructure = cs;
    }
    const mo = String(formData.get("meta_objective") ?? "").trim();
    metaObjective = mo || null;
    const an = String(formData.get("analyst_note") ?? "").trim();
    analystNote = an || null;
  }

  // Mark in progress + persist context
  await supabase
    .from("ad_imports")
    .update({
      status: "analyzing",
      error_message: null,
      campaign_structure: campaignStructure,
      meta_objective: metaObjective,
      analyst_note: analystNote,
    })
    .eq("id", importId);
  revalidatePath(`/analyse/${importId}`);

  try {
    // 1. Load all rows
    const { data: rows } = await supabase
      .from("ad_rows")
      .select(
        "id, ad_name, ad_creative_url, campaign, ad_set, raw_data, spend, ctr, cpc, conversions, cost_per_conversion, roas, currency"
      )
      .eq("import_id", importId);
    if (!rows || rows.length === 0) {
      await supabase
        .from("ad_imports")
        .update({ status: "parsed", error_message: "Aucune ligne à analyser" })
        .eq("id", importId);
      revalidatePath(`/analyse/${importId}`);
      return;
    }

    // 2. Build extraction inputs (no vision — Meta permalinks aren't direct
    //    images, fetching would burn tokens for nothing)
    const inputs: { id: string; input: AdInputForExtraction }[] = rows.map(
      (r) => {
        const copy = pullCopyFromRawData(
          r.raw_data as Record<string, unknown> | null
        );
        return {
          id: r.id,
          input: {
            ad_name: r.ad_name,
            ad_creative_url: r.ad_creative_url,
            campaign: r.campaign,
            ad_set: r.ad_set,
            body: copy.body,
            headline: copy.headline,
            description: copy.description,
            cta_text: copy.cta_text,
          },
        };
      }
    );

    // 3. Batched extraction — Haiku, 10 ads/call, 3 batches in flight
    const extractions = await batchExtract(inputs, 0);

    // 4. Update each row with its extraction
    for (const e of extractions) {
      if (!e.result) continue;
      await supabase
        .from("ad_rows")
        .update({
          extracted_angle: e.result.angle,
          extracted_promise: e.result.promise,
          extracted_concept: e.result.concept,
          extracted_render_style: e.result.render_style,
        })
        .eq("id", e.id);
    }

    // 5. Compute tiers
    const tieredInputs = rows.map((r) => ({
      id: r.id,
      spend: r.spend,
      ctr: r.ctr,
      cpc: r.cpc,
      conversions: r.conversions,
      cost_per_conversion: r.cost_per_conversion,
      roas: r.roas,
    }));
    const tiered = computeTiers(tieredInputs);
    for (const t of tiered) {
      await supabase
        .from("ad_rows")
        .update({ performance_tier: t.tier })
        .eq("id", t.id);
    }
    const tierMetric = tiered[0]?.tier_metric ?? "ctr";

    // 6. Synthesis — feed extraction + tier + KPIs to Claude
    const extractById = new Map(extractions.map((e) => [e.id, e.result]));
    const tierById = new Map(tiered.map((t) => [t.id, t.tier]));
    const synthesisRows: SynthesisInput["rows"] = rows
      .map((r) => {
        const ex = extractById.get(r.id);
        const tier = tierById.get(r.id) ?? "mid";
        return {
          ad_name: r.ad_name,
          angle: ex?.angle ?? "Inconnu",
          promise: ex?.promise ?? r.ad_name,
          concept: ex?.concept ?? "Inconnu",
          render_style: ex?.render_style ?? "unknown",
          tier,
          spend: r.spend,
          cpa: r.cost_per_conversion,
          roas: r.roas,
          ctr: r.ctr,
          conversions: r.conversions,
        };
      })
      .filter((r) => r.angle !== "Inconnu" || r.tier === "top");

    const currency = rows.find((r) => r.currency)?.currency ?? "EUR";
    const synthesis = await synthesizeAnalysis({
      rows: synthesisRows,
      metric: tierMetric,
      currency,
      context: {
        campaign_structure: campaignStructure,
        meta_objective: metaObjective,
        analyst_note: analystNote,
      },
    });

    // 7. Persist analysis (delete previous if exists, insert fresh)
    await supabase.from("ad_analyses").delete().eq("import_id", importId);
    await supabase.from("ad_analyses").insert({
      import_id: importId,
      user_id: user.id,
      winning_angles: synthesis.winning_angles,
      winning_promises: synthesis.winning_promises,
      winning_concepts: synthesis.winning_concepts,
      losing_patterns: synthesis.losing_patterns,
      recommendations: synthesis.recommendations,
    });

    await supabase
      .from("ad_imports")
      .update({
        status: "analyzed",
        analyzed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", importId);
  } catch (e) {
    await supabase
      .from("ad_imports")
      .update({
        status: "failed",
        error_message: (e as Error).message.slice(0, 500),
      })
      .eq("id", importId);
    revalidatePath(`/analyse/${importId}`);
    redirect(
      `/analyse/${importId}?error=${encodeURIComponent(
        `Analyse : ${(e as Error).message}`
      )}`
    );
  }

  revalidatePath(`/analyse/${importId}`);
  revalidatePath("/analyse");
  // Redirect to the clean URL on success — clears any lingering ?error= from
  // a previous failed run so the user doesn't see a stale error banner.
  redirect(`/analyse/${importId}`);
}

/**
 * Create a NEW brief in the chosen project, pre-populated with `brief_data`
 * derived from this import's analysis (winning angles + promises + varied
 * concepts à la Andrometa). The brief is created in 'ready' status so the
 * user can immediately go to image generation.
 */
export async function seedBriefFromAnalysis(
  importId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const projectId = String(formData.get("project_id") ?? "").trim();
  const brandId = String(formData.get("brand_id") ?? "").trim() || null;
  const briefTitle =
    (String(formData.get("title") ?? "") || "").trim() ||
    `Brief depuis analyse`;

  if (!projectId) {
    redirect(
      `/analyse/${importId}?error=${encodeURIComponent("Choisis un projet de destination")}`
    );
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.user_id !== user.id) {
    redirect(
      `/analyse/${importId}?error=${encodeURIComponent("Projet introuvable")}`
    );
  }

  if (brandId) {
    const { data: brand } = await supabase
      .from("brands")
      .select("id, user_id")
      .eq("id", brandId)
      .maybeSingle();
    if (!brand || brand.user_id !== user.id) {
      redirect(
        `/analyse/${importId}?error=${encodeURIComponent("Marque introuvable")}`
      );
    }
  }

  const { data: imp } = await supabase
    .from("ad_imports")
    .select("name, source_platform")
    .eq("id", importId)
    .maybeSingle();
  if (!imp) {
    redirect(
      `/analyse?error=${encodeURIComponent("Import introuvable")}`
    );
  }
  const { data: analysis } = await supabase
    .from("ad_analyses")
    .select(
      "winning_angles, winning_promises, winning_concepts, losing_patterns, recommendations"
    )
    .eq("import_id", importId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!analysis) {
    redirect(
      `/analyse/${importId}?error=${encodeURIComponent(
        "Lance d'abord l'analyse IA — pas de synthèse à utiliser pour seeder le brief."
      )}`
    );
  }

  let briefData;
  try {
    briefData = await generateBriefFromLearnings({
      importName: imp.name,
      platform: imp.source_platform,
      winning_angles: (analysis.winning_angles ?? []) as LearningsInput["winning_angles"],
      winning_promises: (analysis.winning_promises ?? []) as LearningsInput["winning_promises"],
      winning_concepts: (analysis.winning_concepts ?? []) as LearningsInput["winning_concepts"],
      losing_patterns: (analysis.losing_patterns ?? []) as LearningsInput["losing_patterns"],
      recommendations: (analysis.recommendations ?? []) as LearningsInput["recommendations"],
    });
  } catch (e) {
    redirect(
      `/analyse/${importId}?error=${encodeURIComponent(
        `Génération brief : ${(e as Error).message}`
      )}`
    );
  }

  const { data: newBrief, error: insErr } = await supabase
    .from("briefs")
    .insert({
      project_id: projectId,
      user_id: user.id,
      brand_id: brandId,
      title: briefTitle,
      mode: "chat",
      status: "ready",
      user_input: `Brief seedé depuis l'analyse "${imp.name}" (${imp.source_platform}). Angles + promesses gagnants reconduits ; concepts variés en multi-render-styles façon Andrometa.`,
      brief_data: briefData,
      brand_id_at_finalize: brandId,
    })
    .select("id, project_id")
    .single();
  if (insErr || !newBrief) {
    redirect(
      `/analyse/${importId}?error=${encodeURIComponent(
        `Insert brief : ${insErr?.message ?? "erreur"}`
      )}`
    );
  }

  revalidatePath(`/projects/${projectId}/briefs`);
  redirect(`/projects/${newBrief.project_id}/briefs/${newBrief.id}`);
}
