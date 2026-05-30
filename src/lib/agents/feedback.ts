/**
 * Agent feedback — capture du retour humain sur un agent_run.
 *
 * Chaque feedback est lié à un run précis. Tant qu'il n'est pas `ingested`
 * (consommé par refineAgent), il reste dans la file d'attente d'affinage.
 *
 * Conventions tags (libres mais on encourage les courts) :
 *   bon-hook · ton-off · trop-long · trop-court · manque-verbatim · claim-risqué
 *   format-faux · brand-voice-respect · brand-voice-off · ICP-faux
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentKey } from "./model-routing";

export type Rating = -1 | 0 | 1;

export interface AgentFeedbackRow {
  id: string;
  user_id: string;
  run_id: string;
  agent_key: string;
  rating: Rating | null;
  tag: string | null;
  comment: string | null;
  corrected_md: string | null;
  ingested_at: string | null;
  ingested_into_version: number | null;
  created_at: string;
}

// ── CRUD ───────────────────────────────────────────────────────────────────
export async function recordFeedback(
  supabase: SupabaseClient,
  args: {
    userId: string;
    runId: string;
    agentKey: AgentKey;
    rating?: Rating;
    tag?: string;
    comment?: string;
    correctedMd?: string;
  }
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("agent_feedback")
    .insert({
      user_id: args.userId,
      run_id: args.runId,
      agent_key: args.agentKey,
      rating: args.rating ?? null,
      tag: args.tag ?? null,
      comment: args.comment ?? null,
      corrected_md: args.correctedMd ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "insert failed" };
  return { id: data.id as string };
}

export async function listRecentFeedback(
  supabase: SupabaseClient,
  args: {
    userId: string;
    agentKey: AgentKey;
    onlyPending?: boolean;
    limit?: number;
  }
): Promise<AgentFeedbackRow[]> {
  let q = supabase
    .from("agent_feedback")
    .select("*")
    .eq("user_id", args.userId)
    .eq("agent_key", args.agentKey)
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 50);
  if (args.onlyPending) q = q.is("ingested_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentFeedbackRow[];
}

export async function countPendingFeedback(
  supabase: SupabaseClient,
  args: { userId: string; agentKey: AgentKey }
): Promise<number> {
  const { count } = await supabase
    .from("agent_feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("agent_key", args.agentKey)
    .is("ingested_at", null);
  return count ?? 0;
}

export async function deleteFeedback(
  supabase: SupabaseClient,
  args: { userId: string; id: string }
): Promise<void> {
  await supabase
    .from("agent_feedback")
    .delete()
    .eq("id", args.id)
    .eq("user_id", args.userId);
}

/**
 * Marque un lot de feedbacks comme ingérés dans une version donnée
 * d'agent_memory. Appelé par refineAgent() après commit d'une nouvelle
 * version de mémoire.
 */
export async function markFeedbackIngested(
  supabase: SupabaseClient,
  args: { userId: string; feedbackIds: string[]; version: number }
): Promise<void> {
  if (args.feedbackIds.length === 0) return;
  await supabase
    .from("agent_feedback")
    .update({
      ingested_at: new Date().toISOString(),
      ingested_into_version: args.version,
    })
    .in("id", args.feedbackIds)
    .eq("user_id", args.userId);
}

// ── Snapshot du run pour le distillateur ──────────────────────────────────
/**
 * Récupère pour chaque feedback un snapshot du run associé (output text +
 * task initiale). Utile au refineAgent qui doit voir « ce qui a été
 * généré + ce que l'humain en a pensé ».
 */
export async function loadFeedbackWithRunContext(
  supabase: SupabaseClient,
  args: { userId: string; agentKey: AgentKey; onlyPending?: boolean; limit?: number }
): Promise<
  Array<
    AgentFeedbackRow & {
      run_task: string | null;
      run_output_text: string | null;
      run_finished_at: string | null;
    }
  >
> {
  const feedbacks = await listRecentFeedback(supabase, args);
  if (feedbacks.length === 0) return [];
  const runIds = Array.from(new Set(feedbacks.map((f) => f.run_id)));
  const { data: runs } = await supabase
    .from("agent_runs")
    .select("id, input_snapshot, output, finished_at")
    .in("id", runIds);
  const runMap = new Map<
    string,
    { input_snapshot: Record<string, unknown> | null; output: { text?: string } | null; finished_at: string | null }
  >();
  for (const r of runs ?? []) {
    runMap.set(r.id as string, {
      input_snapshot: r.input_snapshot as Record<string, unknown> | null,
      output: r.output as { text?: string } | null,
      finished_at: (r.finished_at as string) ?? null,
    });
  }
  return feedbacks.map((f) => {
    const r = runMap.get(f.run_id);
    return {
      ...f,
      run_task: (r?.input_snapshot?.task as string) ?? null,
      run_output_text: r?.output?.text ?? null,
      run_finished_at: r?.finished_at ?? null,
    };
  });
}
