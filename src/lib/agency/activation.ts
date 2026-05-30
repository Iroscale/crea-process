/**
 * Activation Agency OS pour un projet.
 *
 * Crée :
 *   1. La ligne `client_agency_profile` (extension 1:1 du projet).
 *   2. Les 7 lignes `client_memory` pré-remplies avec MEMORY_TEMPLATES.
 *   3. Les 13 lignes `pipeline_steps` en status='todo' avec has_gate selon
 *      la config pipeline.
 *
 * Idempotent : appel répété ne dédouble rien (upsert + ON CONFLICT).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMORY_SLUGS,
  MEMORY_TEMPLATES,
  type MemorySlug,
} from "@/lib/agents";
import { STEPS } from "./pipeline";

export interface AgencyProfileRow {
  project_id: string;
  user_id: string;
  vertical: string | null;
  onboarding_data: Record<string, unknown>;
  activated_at: string;
  updated_at: string;
}

export async function isAgencyActivated(
  supabase: SupabaseClient,
  projectId: string
): Promise<AgencyProfileRow | null> {
  const { data } = await supabase
    .from("client_agency_profile")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as AgencyProfileRow | null) ?? null;
}

export async function activateAgencyOS(args: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  vertical?: string;
}): Promise<{ ok: true } | { error: string }> {
  const { supabase, userId, projectId, vertical } = args;

  // 1. Crée le profil agency (upsert idempotent)
  const { error: profErr } = await supabase
    .from("client_agency_profile")
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        vertical: vertical ?? null,
      },
      { onConflict: "project_id" }
    );
  if (profErr) return { error: `profil : ${profErr.message}` };

  // 2. Init les 7 fichiers mémoire (n'écrase pas s'ils existent déjà)
  for (const slug of MEMORY_SLUGS) {
    const { data: existing } = await supabase
      .from("client_memory")
      .select("id")
      .eq("project_id", projectId)
      .eq("slug", slug)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from("client_memory").insert({
      project_id: projectId,
      user_id: userId,
      slug,
      content_md: MEMORY_TEMPLATES[slug as MemorySlug],
      version: 1,
    });
    if (error) return { error: `memory ${slug} : ${error.message}` };
  }

  // 3. Init les 13 pipeline_steps (upsert idempotent)
  for (const step of STEPS) {
    const { error } = await supabase.from("pipeline_steps").upsert(
      {
        project_id: projectId,
        user_id: userId,
        step_key: step.key,
        status: "todo",
        has_gate: step.gate,
      },
      { onConflict: "project_id,step_key" }
    );
    if (error) return { error: `pipeline_steps ${step.key} : ${error.message}` };
  }

  return { ok: true };
}
