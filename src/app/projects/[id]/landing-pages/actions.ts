"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  generateLandingPage,
  applyChatTurnToLP,
} from "@/lib/generate-landing-page";
import { designLandingPage } from "@/lib/landing-page-designer";
import {
  type LandingPageContent,
  type LandingPageBrief,
  type TemplateId,
  TEMPLATES,
} from "@/lib/landing-page-schema";
import type { DesignDirectives } from "@/lib/landing-page-design-schema";
import type { BrandContext } from "@/lib/brand-context";
import { loadBrandContext } from "@/lib/brand-context";
import type { StructuredKnowledge } from "@/lib/structured-knowledge-schema";

const ALLOWED_TEMPLATES = Object.keys(TEMPLATES) as TemplateId[];

async function loadProjectAndUser(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand_voice")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    redirect(
      `/projects/${projectId}/landing-pages?error=${encodeURIComponent(
        "Projet introuvable"
      )}`
    );
  }

  // Optional structured_knowledge — degrade gracefully if migration 010 missing
  let knowledge: StructuredKnowledge | null = null;
  {
    const { data, error } = await supabase
      .from("projects")
      .select("structured_knowledge")
      .eq("id", projectId)
      .maybeSingle();
    if (!error) {
      knowledge =
        ((data?.structured_knowledge ?? null) as StructuredKnowledge | null) ??
        null;
    }
  }

  return { supabase, user, project, knowledge };
}

async function loadLandingPage(supabase: Awaited<ReturnType<typeof createClient>>, lpId: string) {
  const { data: lp } = await supabase
    .from("landing_pages")
    .select(
      "id, project_id, user_id, brand_id, region, title, user_input, template_id, status, brief, content_a, content_b"
    )
    .eq("id", lpId)
    .maybeSingle();
  return lp;
}

/**
 * Create a new landing page record (draft). The actual content is generated
 * via `generateLandingPageContent` once the user confirms the template + input.
 */
export async function createLandingPage(
  projectId: string,
  formData: FormData
) {
  const { supabase, user, project } = await loadProjectAndUser(projectId);

  const title = String(formData.get("title") ?? "").trim();
  const userInput = String(formData.get("user_input") ?? "").trim();
  const templateRaw = String(formData.get("template_id") ?? "trust-funnel");
  const templateId: TemplateId = ALLOWED_TEMPLATES.includes(
    templateRaw as TemplateId
  )
    ? (templateRaw as TemplateId)
    : "trust-funnel";
  const brandIdRaw = String(formData.get("brand_id") ?? "").trim();
  const regionRaw = String(formData.get("region") ?? "international").trim();

  const { data: lp, error } = await supabase
    .from("landing_pages")
    .insert({
      project_id: project.id,
      user_id: user.id,
      brand_id: brandIdRaw || null,
      region: regionRaw || "international",
      title: title || null,
      user_input: userInput || null,
      template_id: templateId,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !lp) {
    redirect(
      `/projects/${projectId}/landing-pages?error=${encodeURIComponent(
        error?.message ?? "Erreur création LP"
      )}`
    );
  }

  revalidatePath(`/projects/${projectId}/landing-pages`);
  redirect(`/projects/${projectId}/landing-pages/${lp.id}`);
}

/**
 * Generate (or re-generate) the brief + content_a + content_b for a LP.
 * Replaces any previous content. Status flips to "ready" on success.
 */
export async function generateLandingPageContent(
  projectId: string,
  lpId: string
) {
  const { supabase, knowledge } = await loadProjectAndUser(projectId);
  const lp = await loadLandingPage(supabase, lpId);
  if (!lp || lp.project_id !== projectId) {
    redirect(
      `/projects/${projectId}/landing-pages?error=${encodeURIComponent(
        "LP introuvable"
      )}`
    );
  }

  // Mark generating
  await supabase
    .from("landing_pages")
    .update({ status: "generating" })
    .eq("id", lpId);

  let brand: BrandContext | null = null;
  if (lp.brand_id) {
    brand = await loadBrandContext(supabase, lp.brand_id);
  }

  try {
    const result = await generateLandingPage({
      templateId: lp.template_id as TemplateId,
      userInput: lp.user_input,
      brand,
      region: lp.region,
      knowledge,
    });

    await supabase
      .from("landing_pages")
      .update({
        brief: result.brief,
        content_a: result.content_a,
        content_b: result.content_b,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lpId);
  } catch (e) {
    await supabase
      .from("landing_pages")
      .update({ status: "draft" })
      .eq("id", lpId);
    redirect(
      `/projects/${projectId}/landing-pages/${lpId}?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  revalidatePath(`/projects/${projectId}/landing-pages/${lpId}`);
}

/**
 * Chat refinement turn. Persists user + assistant messages AND mutates
 * brief / content_a / content_b based on Claude's response.
 */
export async function sendLandingPageChatMessage(
  projectId: string,
  lpId: string,
  formData: FormData
) {
  const { supabase, knowledge } = await loadProjectAndUser(projectId);
  const lp = await loadLandingPage(supabase, lpId);
  if (!lp || lp.project_id !== projectId) return;

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  // Persist user message immediately so it appears even on agent failure.
  await supabase.from("landing_page_messages").insert({
    landing_page_id: lpId,
    role: "user",
    content,
  });
  revalidatePath(`/projects/${projectId}/landing-pages/${lpId}`);

  if (!lp.brief || !lp.content_a || !lp.content_b) {
    await supabase.from("landing_page_messages").insert({
      landing_page_id: lpId,
      role: "assistant",
      content:
        "Clique d'abord sur « ✨ Générer la LP » pour produire le brief + 2 versions. Je pourrai ensuite intégrer tes corrections.",
    });
    revalidatePath(`/projects/${projectId}/landing-pages/${lpId}`);
    return;
  }

  let brand: BrandContext | null = null;
  if (lp.brand_id) {
    brand = await loadBrandContext(supabase, lp.brand_id);
  }

  const { data: history } = await supabase
    .from("landing_page_messages")
    .select("role, content")
    .eq("landing_page_id", lpId)
    .order("created_at", { ascending: true });
  const trimmed = (history ?? []).slice(0, -1) as {
    role: "user" | "assistant";
    content: string;
  }[];

  let reply = "";
  let updatedBrief = lp.brief as LandingPageBrief;
  let updatedA = lp.content_a as LandingPageContent;
  let updatedB = lp.content_b as LandingPageContent;
  try {
    const r = await applyChatTurnToLP({
      templateId: lp.template_id as TemplateId,
      current: {
        brief: lp.brief as LandingPageBrief,
        content_a: lp.content_a as LandingPageContent,
        content_b: lp.content_b as LandingPageContent,
      },
      history: trimmed,
      userMessage: content,
      brand,
      region: lp.region,
      knowledge,
    });
    reply = r.reply;
    updatedBrief = r.brief;
    updatedA = r.content_a;
    updatedB = r.content_b;
  } catch (e) {
    reply = `[Erreur agent : ${(e as Error).message}]`;
  }

  await supabase
    .from("landing_pages")
    .update({
      brief: updatedBrief,
      content_a: updatedA,
      content_b: updatedB,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lpId);

  await supabase.from("landing_page_messages").insert({
    landing_page_id: lpId,
    role: "assistant",
    content: reply,
  });

  revalidatePath(`/projects/${projectId}/landing-pages/${lpId}`);
}

export async function resetLandingPageChat(projectId: string, lpId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase
    .from("landing_page_messages")
    .delete()
    .eq("landing_page_id", lpId);
  revalidatePath(`/projects/${projectId}/landing-pages/${lpId}`);
}

export async function updateLandingPageMeta(
  projectId: string,
  lpId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const userInput = String(formData.get("user_input") ?? "").trim();

  await supabase
    .from("landing_pages")
    .update({
      title: title || null,
      user_input: userInput || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lpId);

  revalidatePath(`/projects/${projectId}/landing-pages/${lpId}`);
}

/**
 * Premium design + CRO pass. Calls the Claude "designer" agent to produce
 * design_directives ; persists them on the LP. The renderer reads them at
 * preview/export time to produce the polished version.
 */
export async function enhanceLandingPageDesign(
  projectId: string,
  lpId: string
) {
  const { supabase, knowledge } = await loadProjectAndUser(projectId);
  const lp = await loadLandingPage(supabase, lpId);
  if (!lp || lp.project_id !== projectId) {
    redirect(
      `/projects/${projectId}/landing-pages?error=${encodeURIComponent(
        "LP introuvable"
      )}`
    );
  }
  if (!lp.brief || !lp.content_a || !lp.content_b) {
    redirect(
      `/projects/${projectId}/landing-pages/${lpId}?error=${encodeURIComponent(
        "Génère d'abord la LP avant d'optimiser le design / CRO."
      )}`
    );
  }

  let brand: BrandContext | null = null;
  if (lp.brand_id) {
    brand = await loadBrandContext(supabase, lp.brand_id);
  }

  let directives: DesignDirectives;
  try {
    directives = await designLandingPage({
      brief: lp.brief as LandingPageBrief,
      content_a: lp.content_a as LandingPageContent,
      content_b: lp.content_b as LandingPageContent,
      brand,
      knowledge,
    });
  } catch (e) {
    redirect(
      `/projects/${projectId}/landing-pages/${lpId}?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  await supabase
    .from("landing_pages")
    .update({
      design_directives: directives,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lpId);

  revalidatePath(`/projects/${projectId}/landing-pages/${lpId}`);
}

export async function deleteLandingPage(projectId: string, lpId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lp } = await supabase
    .from("landing_pages")
    .select("id, user_id, project_id")
    .eq("id", lpId)
    .maybeSingle();
  if (!lp || lp.user_id !== user.id || lp.project_id !== projectId) {
    redirect(
      `/projects/${projectId}/landing-pages?error=${encodeURIComponent(
        "LP introuvable ou accès refusé"
      )}`
    );
  }

  const { error } = await supabase
    .from("landing_pages")
    .delete()
    .eq("id", lpId);
  if (error) {
    redirect(
      `/projects/${projectId}/landing-pages?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidatePath(`/projects/${projectId}/landing-pages`);
  redirect(`/projects/${projectId}/landing-pages`);
}
