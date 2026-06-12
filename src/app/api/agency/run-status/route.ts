/**
 * P0.6 — Statut d'un run d'agent (pollé par l'UI toutes les 3 s).
 *
 * GET /api/agency/run-status?projectId=…&stepKey=…
 * → { status: 'running'|'done'|'failed'|'cancelled'|'none',
 *     runId, startedAt, errorMessage }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const stepKey = url.searchParams.get("stepKey");
  if (!projectId || !stepKey) {
    return NextResponse.json({ error: "params manquants" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, status, started_at, finished_at, error_message")
    .eq("project_id", projectId)
    .eq("step_key", stepKey)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ status: "none" });
  }
  return NextResponse.json({
    status: run.status,
    runId: run.id,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    errorMessage: run.error_message,
  });
}
