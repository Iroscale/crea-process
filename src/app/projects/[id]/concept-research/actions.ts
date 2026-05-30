"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { researchConcepts } from "@/lib/concept-research";
import type { ConceptResearch } from "@/lib/concept-research";
import type { StructuredKnowledge } from "@/lib/structured-knowledge-schema";

async function loadProjectAndUser(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    redirect(
      `/projects/${projectId}/concept-research?error=${encodeURIComponent(
        "Projet introuvable"
      )}`
    );
  }
  let knowledge: StructuredKnowledge | null = null;
  {
    const { data, error } = await supabase
      .from("projects")
      .select("structured_knowledge")
      .eq("id", projectId)
      .maybeSingle();
    if (!error)
      knowledge =
        ((data?.structured_knowledge ?? null) as StructuredKnowledge | null) ??
        null;
  }
  return { supabase, user, project, knowledge };
}

/**
 * Launch a new research run. Creates the row, runs the web-search pipeline,
 * persists the structured result. Runs synchronously (the action awaits the
 * full pipeline — ~30-90s with web search), so the UI shows a pending button.
 */
export async function runConceptResearch(
  projectId: string,
  formData: FormData
) {
  const { supabase, user, knowledge } = await loadProjectAndUser(projectId);

  const niche = String(formData.get("niche") ?? "").trim();
  if (!niche) {
    redirect(
      `/projects/${projectId}/concept-research?error=${encodeURIComponent(
        "Décris la niche / le sujet à rechercher"
      )}`
    );
  }
  const region =
    String(formData.get("region") ?? "").trim() || "international";

  const { data: row, error } = await supabase
    .from("concept_research")
    .insert({
      project_id: projectId,
      user_id: user.id,
      niche,
      region,
      status: "researching",
    })
    .select("id")
    .single();
  if (error || !row) {
    redirect(
      `/projects/${projectId}/concept-research?error=${encodeURIComponent(
        error?.message ?? "Erreur création recherche"
      )}`
    );
  }

  let research: ConceptResearch;
  let sources: string[] = [];
  try {
    const out = await researchConcepts({ niche, region, knowledge });
    research = out.research;
    sources = out.sources;
  } catch (e) {
    await supabase
      .from("concept_research")
      .update({ status: "failed", error_message: (e as Error).message })
      .eq("id", row.id);
    redirect(
      `/projects/${projectId}/concept-research?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  await supabase
    .from("concept_research")
    .update({ status: "done", result: research, sources })
    .eq("id", row.id);

  revalidatePath(`/projects/${projectId}/concept-research`);
  redirect(`/projects/${projectId}/concept-research/${row.id}`);
}

export async function deleteConceptResearch(
  projectId: string,
  researchId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase
    .from("concept_research")
    .delete()
    .eq("id", researchId)
    .eq("user_id", user.id);
  revalidatePath(`/projects/${projectId}/concept-research`);
  redirect(`/projects/${projectId}/concept-research`);
}

/**
 * Spin a found angle into a new brief : pre-fills user_input with the angle +
 * rationale so the user lands in the brief flow ready to finalize.
 */
export async function angleToNewBrief(
  projectId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const angle = String(formData.get("angle") ?? "").trim();
  const rationale = String(formData.get("rationale") ?? "").trim();
  if (!angle) return;

  const userInput = rationale
    ? `Angle issu de la recherche de concepts : « ${angle} »\n\nPourquoi ça peut marcher : ${rationale}`
    : `Angle issu de la recherche de concepts : « ${angle} »`;

  const { data: brief, error } = await supabase
    .from("briefs")
    .insert({
      project_id: projectId,
      user_id: user.id,
      title: angle.slice(0, 80),
      mode: "chat",
      user_input: userInput,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !brief) {
    redirect(
      `/projects/${projectId}/concept-research?error=${encodeURIComponent(
        error?.message ?? "Erreur création brief"
      )}`
    );
  }

  // Seed an opening assistant message so the chat brief is immediately usable
  await supabase.from("brief_messages").insert({
    brief_id: brief.id,
    role: "assistant",
    content: `On part sur l'angle « ${angle} ».${rationale ? `\n\nL'insight : ${rationale}` : ""}\n\nPour bâtir un brief solide, dis-moi : à qui on s'adresse précisément, quelle action on veut déclencher, et le ton voulu ?`,
  });

  revalidatePath(`/projects/${projectId}/briefs`);
  redirect(`/projects/${projectId}/briefs/${brief.id}`);
}
