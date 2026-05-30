import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { angleToNewBrief, deleteConceptResearch } from "../actions";
import type { ConceptResearch } from "@/lib/concept-research";

const INTENSITY_STYLE: Record<string, string> = {
  high: "bg-red-500/15 text-red-300 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export default async function ConceptResearchResult({
  params,
}: {
  params: Promise<{ id: string; rid: string }>;
}) {
  const { id, rid } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("concept_research")
    .select("id, project_id, niche, status, result, sources, error_message, created_at")
    .eq("id", rid)
    .maybeSingle();
  if (!run || run.project_id !== id) notFound();

  const research = (run.result ?? null) as ConceptResearch | null;
  const sources = (run.sources ?? []) as string[];
  const deleteAction = deleteConceptResearch.bind(null, id, rid);
  const angleAction = angleToNewBrief.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href={`/projects/${id}/concept-research`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Recherches
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">🔭 {run.niche}</h1>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {new Date(run.created_at).toLocaleString("fr-FR")}
          </p>
        </div>
        <form action={deleteAction}>
          <button className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300">
            🗑 Supprimer
          </button>
        </form>
      </div>

      {run.status === "failed" && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          La recherche a échoué : {run.error_message ?? "erreur inconnue"}
        </div>
      )}

      {!research ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          {run.status === "researching"
            ? "Recherche en cours… recharge dans quelques secondes."
            : "Aucun résultat."}
        </div>
      ) : (
        <>
          {/* Synthèse */}
          <section className="mt-8 rounded-2xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Synthèse du marché
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              {research.niche_summary}
            </p>
          </section>

          {/* Angles marketing — la pièce maîtresse */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold">
              🎯 Angles marketing ({research.marketing_angles.length})
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Clique « → Brief » pour transformer un angle en brief prêt à finaliser.
            </p>
            <div className="mt-4 grid gap-3">
              {research.marketing_angles.map((a, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{a.angle}</p>
                      <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
                        {a.rationale}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 font-medium text-[var(--color-primary)]">
                          {a.lever}
                        </span>
                        <span className="text-[var(--color-muted-foreground)]">
                          📍 {a.source_hint}
                        </span>
                      </div>
                    </div>
                    <form action={angleAction} className="shrink-0">
                      <input type="hidden" name="angle" value={a.angle} />
                      <input
                        type="hidden"
                        name="rationale"
                        value={a.rationale}
                      />
                      <button className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                        → Brief
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Pain points */}
          <Block title={`😣 Pain points (${research.pain_points.length})`}>
            <div className="grid gap-2 sm:grid-cols-2">
              {research.pain_points.map((p, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{p.pain}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${INTENSITY_STYLE[p.intensity] ?? ""}`}
                    >
                      {p.intensity}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] italic text-[var(--color-muted-foreground)]">
                    « {p.evidence} »
                  </p>
                </div>
              ))}
            </div>
          </Block>

          {/* Audience questions */}
          <Block
            title={`❓ Questions d'audience (${research.audience_questions.length})`}
          >
            <div className="flex flex-col gap-2">
              {research.audience_questions.map((q, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{q.question}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
                    <span className="rounded bg-white/5 px-1.5 py-0.5">
                      {q.platform}
                    </span>
                    <span>💡 {q.angle_opportunity}</span>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          {/* Content topics + Trends + Competitor angles */}
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <Mini title="📝 Sujets de contenu">
              {research.content_topics.map((t, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{t.topic}</span>
                  <span className="block text-[var(--color-muted-foreground)]">
                    {t.why_it_resonates}
                  </span>
                </li>
              ))}
            </Mini>
            <Mini title="📈 Tendances">
              {research.trends.map((t, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{t.trend}</span>
                  <span className="block text-[var(--color-muted-foreground)]">
                    {t.implication}
                  </span>
                </li>
              ))}
            </Mini>
            <Mini title="🥊 Angles concurrents">
              {research.competitor_angles.map((c, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{c.competitor}</span>
                  <span className="block text-[var(--color-muted-foreground)]">
                    {c.angle}
                  </span>
                </li>
              ))}
            </Mini>
          </div>

          {/* Sources */}
          {sources.length > 0 && (
            <Block title={`🔗 Sources (${sources.length})`}>
              <ul className="flex flex-col gap-1">
                {sources.map((s, i) => (
                  <li key={i} className="truncate text-xs">
                    <a
                      href={s}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </>
      )}
    </main>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Mini({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </div>
  );
}
