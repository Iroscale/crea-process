/**
 * Vue "Dossier client" — vue exhaustive et archivable d'un client Agency OS.
 *
 * Vocation :
 *  - Avoir d'un coup d'œil TOUT ce qui a été produit pour ce client.
 *  - Pouvoir relancer une étape pour générer de nouveaux assets sans
 *    repasser par la pipeline (utile 6 mois plus tard quand on a besoin
 *    de nouvelles créas / scripts).
 *  - Servir de base pour l'archive (lien direct vers export).
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAgencyActivated,
  listDocuments,
  STEPS,
  STEP_BY_KEY,
  PIPELINE_STEPS,
  type StepConfig,
  type StepKey,
} from "@/lib/agency";
import { MEMORY_EXPORT_ORDER, MEMORY_TITLES, type MemorySlug } from "@/lib/agents";
import AgencyNav from "../_components/agency-nav";

const STATUS_STYLE: Record<string, string> = {
  todo: "bg-slate-500/15 text-slate-300",
  in_progress: "bg-sky-500/15 text-sky-300",
  gate_pending: "bg-amber-500/15 text-amber-300",
  validated: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-red-500/15 text-red-300",
  skipped: "bg-zinc-500/15 text-zinc-400",
};

function hrefForStep(projectId: string, step: StepConfig): string {
  if (step.key === "export-memory") return `/projects/${projectId}/agency/export`;
  if (step.key === "retrospective") return `/projects/${projectId}/agency/retrospective`;
  if (step.key === "onboarding") return `/projects/${projectId}/agency/onboarding`;
  return `/projects/${projectId}/agency/steps/${step.key}`;
}

export default async function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const profile = await isAgencyActivated(supabase, id);
  if (!profile) redirect(`/projects/${id}/agency`);

  const [
    docsRes,
    memoryRes,
    pipelineRes,
    deliverablesRes,
    runsRes,
    complianceRes,
    retroRes,
  ] = await Promise.all([
    listDocuments(supabase, { userId: user.id, projectId: id, onlyActive: false }),
    supabase
      .from("client_memory")
      .select("slug, content_md, version, updated_at")
      .eq("project_id", id),
    supabase
      .from("pipeline_steps")
      .select("step_key, status, has_gate, validated_at, updated_at")
      .eq("project_id", id),
    supabase
      .from("deliverables")
      .select("id, kind, title, content_md, step_key, agent_key, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_runs")
      .select(
        "id, agent_key, step_key, status, model, started_at, finished_at, cost_estimate_usd"
      )
      .eq("project_id", id)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("compliance_checks")
      .select("id, asset_kind, verdict, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("retro_imports")
      .select("id, source, status, period_start, period_end, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const docs = docsRes;
  const memoryRows = memoryRes.data ?? [];
  const memoryBy = new Map<string, { content_md: string; version: number; updated_at: string }>();
  for (const r of memoryRows) {
    memoryBy.set(r.slug as string, {
      content_md: (r.content_md as string) ?? "",
      version: (r.version as number) ?? 1,
      updated_at: r.updated_at as string,
    });
  }
  const pipelineRows = pipelineRes.data ?? [];
  const statusBy = new Map<string, string>();
  for (const r of pipelineRows) {
    statusBy.set(r.step_key as string, r.status as string);
  }
  const deliverables = deliverablesRes.data ?? [];
  const deliverablesByStep = new Map<string, typeof deliverables>();
  for (const d of deliverables) {
    const k = d.step_key as string;
    if (!deliverablesByStep.has(k)) deliverablesByStep.set(k, []);
    deliverablesByStep.get(k)!.push(d);
  }
  const runs = runsRes.data ?? [];
  const compliance = complianceRes.data ?? [];
  const retros = retroRes.data ?? [];

  const totalDocs = docs.length;
  const totalDeliverables = deliverables.length;
  const totalRuns = runs.length;
  const totalCost = runs.reduce(
    (acc, r) => acc + ((r.cost_estimate_usd as number | null) ?? 0),
    0
  );
  const pipelineDone = PIPELINE_STEPS.filter(
    (s) => statusBy.get(s.key) === "validated" || statusBy.get(s.key) === "skipped"
  ).length;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/folder" />

      <header>
        <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Dossier client
        </div>
        <h1 className="mt-1 text-3xl font-bold">📁 {project.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {profile.vertical ?? "—"} · Activé le{" "}
          {new Date(profile.activated_at).toLocaleDateString("fr-FR")}
          {project.description && (
            <>
              <br />
              {project.description}
            </>
          )}
        </p>
      </header>

      {/* Compteurs */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Étapes validées" value={`${pipelineDone}/${PIPELINE_STEPS.length}`} />
        <Stat label="Livrables produits" value={totalDeliverables} />
        <Stat label="Documents" value={totalDocs} />
        <Stat
          label="Coût total agents"
          value={`~$${totalCost.toFixed(2)}`}
        />
      </section>

      {/* Actions globales */}
      <section className="mt-6 flex flex-wrap gap-2">
        <Link
          href={`/projects/${id}/agency/export`}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          📤 Export mémoire markdown
        </Link>
        <Link
          href={`/projects/${id}/agency`}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
        >
          🗺️ Pipeline
        </Link>
        <Link
          href={`/projects/${id}/agency/documents`}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
        >
          📎 Gérer les documents
        </Link>
      </section>

      {/* Relance "j'ai besoin de nouveaux assets" */}
      <section className="mt-10 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-5">
        <h2 className="text-sm font-semibold text-[var(--color-primary)]">
          🔁 Relancer une étape (nouveaux assets)
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          6 mois plus tard, le client demande de nouveaux concepts image ou un
          nouveau script founder ? Tu n&apos;as rien à refaire — la mémoire et
          les documents sont toujours là. Choisis simplement l&apos;étape à
          relancer.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.filter((s) => s.agentKey).map((s) => (
            <Link
              key={s.key}
              href={hrefForStep(id, s)}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs hover:bg-[var(--color-accent)]"
            >
              <span>
                {s.emoji} {s.title}
              </span>
              <span className="text-[var(--color-primary)]">▶</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Mémoire */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          🧠 Mémoire (7 fichiers)
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {MEMORY_EXPORT_ORDER.map((slug) => {
            const row = memoryBy.get(slug);
            const chars = row?.content_md.length ?? 0;
            return (
              <Link
                key={slug}
                href={`/projects/${id}/agency/memory/${slug}`}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs hover:bg-[var(--color-accent)]"
              >
                <div className="min-w-0 truncate">
                  <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    {slug}
                  </span>{" "}
                  <span className="font-medium">
                    {MEMORY_TITLES[slug as MemorySlug]}
                  </span>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                  v{row?.version ?? "—"} · {chars} c
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Documents */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          📎 Documents ({totalDocs})
        </h2>
        {docs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Aucun document.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className={`rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs ${
                  d.is_active ? "" : "opacity-60"
                }`}
              >
                <div className="truncate font-medium">{d.file_name}</div>
                <div className="text-[10px] text-[var(--color-muted-foreground)]">
                  {d.category ?? "—"} · {d.parse_status} ·{" "}
                  {new Date(d.uploaded_at).toLocaleDateString("fr-FR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pipeline + livrables par étape */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          🗺️ Pipeline & livrables
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {STEPS.map((s) => {
            const status = statusBy.get(s.key) ?? "todo";
            const stepDelivs = deliverablesByStep.get(s.key) ?? [];
            return (
              <div
                key={s.key}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={hrefForStep(id, s)}
                    className="text-sm font-semibold hover:text-[var(--color-primary)]"
                  >
                    {s.emoji} {s.title}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      STATUS_STYLE[status] ?? STATUS_STYLE.todo
                    }`}
                  >
                    {status}
                  </span>
                </div>
                {stepDelivs.length === 0 ? (
                  <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">
                    Aucun livrable.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1">
                    {stepDelivs.map((d) => (
                      <li
                        key={d.id as string}
                        className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[11px]"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-medium">
                            {d.title as string}
                          </span>{" "}
                          <span className="text-[var(--color-muted-foreground)]">
                            · {d.kind as string} ·{" "}
                            {(d.content_md as string).length} c
                          </span>
                        </div>
                        <Link
                          href={`/projects/${id}/agency/deliverables/${d.id as string}`}
                          className="shrink-0 rounded border border-[var(--color-primary)]/40 px-2 py-0.5 text-[10px] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                        >
                          ✏️ Éditer
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Runs */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          ⚡ Runs ({totalRuns})
        </h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Aucun run.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1">
            {runs.map((r) => {
              const stepCfg = STEP_BY_KEY[(r.step_key as StepKey) || ""];
              return (
                <div
                  key={r.id as string}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[11px]"
                >
                  <div>
                    <span className="font-mono">{r.agent_key as string}</span>
                    {stepCfg && (
                      <span className="ml-2 text-[var(--color-muted-foreground)]">
                        {stepCfg.emoji} {stepCfg.title}
                      </span>
                    )}
                  </div>
                  <div className="text-[var(--color-muted-foreground)]">
                    {new Date(r.started_at as string).toLocaleString("fr-FR")} ·{" "}
                    <span
                      className={
                        r.status === "done"
                          ? "text-emerald-300"
                          : r.status === "failed"
                            ? "text-red-300"
                            : "text-sky-300"
                      }
                    >
                      {r.status as string}
                    </span>
                    {typeof r.cost_estimate_usd === "number" && (
                      <> · ~${r.cost_estimate_usd}</>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Conformité */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          ⚖️ Checks de conformité ({compliance.length})
        </h2>
        {compliance.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Aucun check.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1">
            {compliance.map((c) => (
              <div
                key={c.id as string}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[11px]"
              >
                <span>
                  <span className="font-mono">{c.asset_kind as string}</span>
                </span>
                <span
                  className={
                    c.verdict === "ok"
                      ? "text-emerald-300"
                      : c.verdict === "nok"
                        ? "text-red-300"
                        : "text-amber-300"
                  }
                >
                  {c.verdict as string}
                </span>
                <span className="text-[var(--color-muted-foreground)]">
                  {new Date(c.created_at as string).toLocaleString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rétrospectives */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          ♻️ Imports rétrospective ({retros.length})
        </h2>
        {retros.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Aucun import.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1">
            {retros.map((r) => (
              <div
                key={r.id as string}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[11px]"
              >
                <span>
                  <span className="font-mono">{r.source as string}</span> ·{" "}
                  {(r.period_start as string) ?? "?"} →{" "}
                  {(r.period_end as string) ?? "?"}
                </span>
                <span
                  className={
                    r.status === "analysed"
                      ? "text-emerald-300"
                      : r.status === "parsed"
                        ? "text-sky-300"
                        : "text-amber-300"
                  }
                >
                  {r.status as string}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
