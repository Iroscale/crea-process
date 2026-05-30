import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AGENT_KEYS, MODEL_BY_AGENT, type AgentKey } from "@/lib/agents";

interface AgentStats {
  key: AgentKey;
  model: string;
  knowledgeCount: number;
  pendingFeedback: number;
  memoryVersion: number | null;
  runsCount: number;
}

const AGENT_LABELS: Record<AgentKey, { title: string; tagline: string }> = {
  orchestrator: {
    title: "Orchestrator",
    tagline: "Ingère l'onboarding, route, gère les gates",
  },
  "market-research": {
    title: "Market research",
    tagline: "3 ICP sourcés + verbatims via web search",
  },
  "creative-strategist": {
    title: "Creative strategist",
    tagline: "Promesse maîtresse + angles + Broad Mix",
  },
  copywriter: {
    title: "Copywriter",
    tagline: "Vidéo founder · concepts image · LP · quiz",
  },
  "production-assistant": {
    title: "Production assistant",
    tagline: "Humanisation · prompteur · plan de tournage",
  },
  "funnel-builder": {
    title: "Funnel builder",
    tagline: "Spec quiz funnel + scoring + intégrations",
  },
  "video-editor": {
    title: "Video editor",
    tagline: "EDL + sous-titres + sound design",
  },
  tracking: {
    title: "Tracking",
    tagline: "GTM · Meta CAPI · Google · UTM · Datablaster",
  },
  "media-buyer": {
    title: "Media buyer",
    tagline: "Structure de lancement Meta + Google",
  },
  "legal-compliance": {
    title: "Legal compliance",
    tagline: "Verdict ACPR/AMF/ARPP à la demande",
  },
  "learning-curator": {
    title: "Learning curator",
    tagline: "Rétrospective + patches mémoire",
  },
};

export default async function AgentsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Stats agrégées en parallèle (1 requête par compteur, parallélisé).
  const [knowledgeAgg, feedbackAgg, memoryAgg, runsAgg] = await Promise.all([
    supabase
      .from("agent_knowledge")
      .select("agent_key", { count: "exact" })
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("agent_feedback")
      .select("agent_key")
      .eq("user_id", user.id)
      .is("ingested_at", null),
    supabase
      .from("agent_memory")
      .select("agent_key, version")
      .eq("user_id", user.id),
    supabase
      .from("agent_runs")
      .select("agent_key")
      .eq("user_id", user.id),
  ]);

  const knowledgeByAgent = new Map<string, number>();
  for (const r of (knowledgeAgg.data ?? []) as { agent_key: string }[]) {
    knowledgeByAgent.set(r.agent_key, (knowledgeByAgent.get(r.agent_key) ?? 0) + 1);
  }
  const feedbackByAgent = new Map<string, number>();
  for (const r of (feedbackAgg.data ?? []) as { agent_key: string }[]) {
    feedbackByAgent.set(r.agent_key, (feedbackByAgent.get(r.agent_key) ?? 0) + 1);
  }
  const memoryByAgent = new Map<string, number>();
  for (const r of (memoryAgg.data ?? []) as { agent_key: string; version: number }[]) {
    memoryByAgent.set(r.agent_key, r.version);
  }
  const runsByAgent = new Map<string, number>();
  for (const r of (runsAgg.data ?? []) as { agent_key: string }[]) {
    runsByAgent.set(r.agent_key, (runsByAgent.get(r.agent_key) ?? 0) + 1);
  }

  const stats: AgentStats[] = AGENT_KEYS.map((k) => ({
    key: k,
    model: MODEL_BY_AGENT[k],
    knowledgeCount: knowledgeByAgent.get(k) ?? 0,
    pendingFeedback: feedbackByAgent.get(k) ?? 0,
    memoryVersion: memoryByAgent.get(k) ?? null,
    runsCount: runsByAgent.get(k) ?? 0,
  }));

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <Link
        href="/projects"
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Projets
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">🧠 Agents Agency OS</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Tes 11 agents spécialisés. Enrichis-les avec du contexte, donne du
        feedback sur leurs livrables, et affine leur mémoire long terme à
        partir des retours accumulés.
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const label = AGENT_LABELS[s.key];
          return (
            <Link
              key={s.key}
              href={`/agency/agents/${s.key}`}
              className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition hover:border-[var(--color-primary)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {s.key}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold">{label.title}</h2>
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {label.tagline}
                  </p>
                </div>
                {s.pendingFeedback > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                    {s.pendingFeedback} feedback
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <Stat label="Mémoire" value={s.memoryVersion ? `v${s.memoryVersion}` : "—"} />
                <Stat label="Knowledge" value={s.knowledgeCount} />
                <Stat label="Runs" value={s.runsCount} />
              </div>

              <div className="mt-3 text-[10px] text-[var(--color-muted-foreground)]">
                modèle : <span className="font-mono">{s.model}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
