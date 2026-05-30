import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  STEPS,
  PIPELINE_STEPS,
  getActionableStep,
  type StepConfig,
} from "@/lib/agency";
import { AGENT_KEYS } from "@/lib/agents";

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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ─── Mode déconnecté : landing positionnée Agency OS ────────────────────
  if (!user) return <Landing />;

  // ─── Mode connecté : cockpit ────────────────────────────────────────────
  const [
    projectsRes,
    profilesRes,
    pipelineRes,
    runsRes,
    deliverablesRes,
    feedbackRes,
    complianceRes,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("client_agency_profile")
      .select("project_id, vertical, activated_at, updated_at")
      .eq("user_id", user.id),
    supabase
      .from("pipeline_steps")
      .select("project_id, step_key, status, updated_at")
      .eq("user_id", user.id),
    supabase
      .from("agent_runs")
      .select(
        "id, project_id, step_key, agent_key, status, model, started_at, finished_at, cost_estimate_usd"
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(8),
    supabase
      .from("deliverables")
      .select("id, project_id, step_key, kind, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("agent_feedback")
      .select("agent_key")
      .eq("user_id", user.id)
      .is("ingested_at", null),
    supabase
      .from("compliance_checks")
      .select("id, project_id, asset_kind, verdict, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const projects = projectsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const pipelineRows = pipelineRes.data ?? [];
  const runs = runsRes.data ?? [];
  const deliverables = deliverablesRes.data ?? [];
  const feedback = feedbackRes.data ?? [];
  const compliance = complianceRes.data ?? [];

  const projectName = new Map<string, string>();
  for (const p of projects) projectName.set(p.id as string, p.name as string);

  // Statuts pipeline groupés par projet
  const pipelineByProject = new Map<string, Map<string, string>>();
  for (const row of pipelineRows) {
    const pid = row.project_id as string;
    if (!pipelineByProject.has(pid)) pipelineByProject.set(pid, new Map());
    pipelineByProject.get(pid)!.set(row.step_key as string, row.status as string);
  }

  // Pour chaque profil agency, calcule progress + étape actionnable
  const agencyClients = profiles.map((p) => {
    const pid = p.project_id as string;
    const status = pipelineByProject.get(pid) ?? new Map();
    const done = PIPELINE_STEPS.filter(
      (s) => status.get(s.key) === "validated" || status.get(s.key) === "skipped"
    ).length;
    const pct = Math.round((done / PIPELINE_STEPS.length) * 100);
    const next = getActionableStep(status);
    const gates = Array.from(status.values()).filter(
      (s) => s === "gate_pending"
    ).length;
    return {
      projectId: pid,
      name: projectName.get(pid) ?? "(sans nom)",
      vertical: (p.vertical as string) ?? "—",
      activatedAt: p.activated_at as string,
      updatedAt: p.updated_at as string,
      done,
      total: PIPELINE_STEPS.length,
      pct,
      actionable: next,
      gates,
    };
  });
  agencyClients.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));

  const notYetAgency = projects.filter(
    (p) => !profiles.some((pr) => pr.project_id === p.id)
  );

  // Compteurs globaux
  const gatesGlobal = pipelineRows.filter(
    (r) => r.status === "gate_pending"
  ).length;
  const inProgressGlobal = pipelineRows.filter(
    (r) => r.status === "in_progress"
  ).length;
  const failedGlobal = pipelineRows.filter((r) => r.status === "failed").length;

  // Feedback en attente par agent
  const fbByAgent = new Map<string, number>();
  for (const f of feedback as { agent_key: string }[]) {
    fbByAgent.set(f.agent_key, (fbByAgent.get(f.agent_key) ?? 0) + 1);
  }
  const agentsNeedingFeedback = AGENT_KEYS.map((k) => ({
    key: k,
    pending: fbByAgent.get(k) ?? 0,
  }))
    .filter((a) => a.pending > 0)
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 6);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            MBScaling · Agency OS
          </div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            🛰️ Base amirale
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            État des clients, activité des agents, gates à valider — tout en un
            coup d&apos;œil.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/agency/new"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            🆕 Nouveau client
          </Link>
          <Link
            href="/projects"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 hover:bg-[var(--color-accent)]"
          >
            📁 Projets
          </Link>
          <Link
            href="/agency/agents"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 hover:bg-[var(--color-accent)]"
          >
            🧠 Agents
          </Link>
        </nav>
      </header>

      {/* Compteurs globaux */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          big
          label="Clients agency actifs"
          value={agencyClients.length}
          accent="primary"
        />
        <Stat
          big
          label="Gates à valider"
          value={gatesGlobal}
          accent={gatesGlobal > 0 ? "amber" : "muted"}
        />
        <Stat
          big
          label="Étapes en cours"
          value={inProgressGlobal}
          accent="sky"
        />
        <Stat
          big
          label="Feedbacks en attente"
          value={feedback.length}
          accent={feedback.length > 0 ? "primary" : "muted"}
        />
      </section>

      {failedGlobal > 0 && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          ⚠️ {failedGlobal} étape{failedGlobal > 1 ? "s" : ""} en échec — à
          investiguer
        </div>
      )}

      {/* Reprendre */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            📌 Reprendre où on en est
          </h2>
          <Link
            href="/projects"
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            tous les projets →
          </Link>
        </div>
        {agencyClients.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-8 text-center">
            <p className="text-sm font-medium">
              Aucun client Agency OS activé pour l&apos;instant.
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Démarre en 1 formulaire : identité, verticale, récap de l&apos;appel
              d&apos;onboarding, et c&apos;est parti.
            </p>
            <Link
              href="/agency/new"
              className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              🆕 Onboarder un nouveau client
            </Link>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agencyClients.slice(0, 6).map((c) => (
              <ClientCard key={c.projectId} client={c} />
            ))}
          </div>
        )}
      </section>

      {/* Projets pas encore agency (créa only) */}
      {notYetAgency.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            🆕 Projets non encore activés Agency
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Ces projets ont uniquement la partie créa. Active Agency OS pour
            débloquer le pipeline complet.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {notYetAgency.slice(0, 6).map((p) => (
              <Link
                key={p.id as string}
                href={`/projects/${p.id}/agency`}
                className="block rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-4 hover:border-[var(--color-primary)]"
              >
                <div className="text-sm font-semibold truncate">
                  {p.name as string}
                </div>
                <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                  Créé le{" "}
                  {new Date(p.created_at as string).toLocaleDateString("fr-FR")}
                </div>
                <div className="mt-3 text-[11px] text-[var(--color-primary)]">
                  🚀 Activer Agency OS →
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Activité agents */}
      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            ⚡ Runs récents
          </h2>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              Aucun run pour l&apos;instant.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {runs.map((r) => {
                const step = STEPS.find((s) => s.key === r.step_key);
                const pid = r.project_id as string;
                const href = step
                  ? hrefForStep(pid, step)
                  : `/projects/${pid}/agency`;
                return (
                  <Link
                    key={r.id as string}
                    href={href}
                    className="block rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs hover:bg-[var(--color-accent)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">
                        <span className="font-mono">{r.agent_key as string}</span>{" "}
                        · {projectName.get(pid) ?? pid.slice(0, 6)}
                      </div>
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
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                      {step?.emoji} {step?.title ?? r.step_key} ·{" "}
                      {new Date(r.started_at as string).toLocaleString("fr-FR")}
                      {typeof r.cost_estimate_usd === "number" && (
                        <> · ~${r.cost_estimate_usd}</>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            📦 Derniers livrables
          </h2>
          {deliverables.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              Pas encore de livrables.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {deliverables.map((d) => {
                const step = STEPS.find((s) => s.key === d.step_key);
                const pid = d.project_id as string;
                const href = step
                  ? hrefForStep(pid, step)
                  : `/projects/${pid}/agency`;
                return (
                  <Link
                    key={d.id as string}
                    href={href}
                    className="block rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs hover:bg-[var(--color-accent)]"
                  >
                    <div className="truncate font-medium">
                      {d.title as string}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                      {step?.emoji} {step?.title ?? d.step_key} ·{" "}
                      {projectName.get(pid) ?? pid.slice(0, 6)} ·{" "}
                      {new Date(d.created_at as string).toLocaleString("fr-FR")}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Apprentissage agents + conformité */}
      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            🧠 Agents à affiner
          </h2>
          {agentsNeedingFeedback.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              Aucun agent avec des feedbacks en attente.{" "}
              <Link
                href="/agency/agents"
                className="text-[var(--color-primary)] hover:underline"
              >
                Aller à la gestion des agents
              </Link>
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              {agentsNeedingFeedback.map((a) => (
                <Link
                  key={a.key}
                  href={`/agency/agents/${a.key}`}
                  className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm hover:border-[var(--color-primary)]"
                >
                  <span className="font-mono text-xs">{a.key}</span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                    {a.pending} feedback{a.pending > 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            ⚖️ Derniers checks de conformité
          </h2>
          {compliance.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              Aucun check à ce jour.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {compliance.map((c) => {
                const verdictCls =
                  c.verdict === "ok"
                    ? "text-emerald-300"
                    : c.verdict === "nok"
                      ? "text-red-300"
                      : "text-amber-300";
                const pid = c.project_id as string;
                return (
                  <Link
                    key={c.id as string}
                    href={`/projects/${pid}/agency/compliance`}
                    className="block rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs hover:bg-[var(--color-accent)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-mono">
                          {c.asset_kind as string}
                        </span>{" "}
                        · {projectName.get(pid) ?? pid.slice(0, 6)}
                      </span>
                      <span className={`uppercase ${verdictCls}`}>
                        {c.verdict as string}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                      {new Date(c.created_at as string).toLocaleString("fr-FR")}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Navigation rapide */}
      <section className="mt-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          🚀 Navigation rapide
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/projects" emoji="📁" label="Projets" desc="Tous les clients" />
          <QuickLink href="/agency/agents" emoji="🧠" label="Agents" desc="Knowledge · feedback · affinage" />
          <QuickLink href="/brands" emoji="🎨" label="Marques" desc="Identité visuelle" />
          <QuickLink href="/profile" emoji="👤" label="Profil" desc="Compte" />
        </div>
      </section>
    </main>
  );
}

function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
      <div className="max-w-4xl text-center">
        <span className="inline-block rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-1 text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          MBScaling Agency OS
        </span>
        <h1 className="mt-6 text-5xl font-bold tracking-tight">
          🛰️ La base amirale de votre agence
          <br />
          <span className="text-[var(--color-primary)]">
            de lead generation finance
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--color-muted-foreground)]">
          11 agents spécialisés, pipeline de 10 étapes, mémoire client
          versionnée, conformité ACPR/AMF à la demande, learnings continus.
          Toute l&apos;équipe pilote depuis un même endroit.
        </p>

        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            Se connecter
          </Link>
          <Link
            href="/agency/agents"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-3 text-sm font-medium hover:bg-[var(--color-accent)]"
          >
            Voir les 11 agents
          </Link>
        </div>

        <div className="mt-20 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          <Pillar
            emoji="🧠"
            title="Mémoire vivante"
            desc="7 fichiers par client + apprentissage par agent qui s'affine au fil des feedbacks."
          />
          <Pillar
            emoji="🗺️"
            title="Pipeline guidé"
            desc="13 étapes avec gates humains, navigation 1-clic entre étapes."
          />
          <Pillar
            emoji="⚖️"
            title="Conformité"
            desc="Verdict ACPR / AMF / ARPP à la demande avec version corrigée."
          />
          <Pillar
            emoji="♻️"
            title="Learnings continus"
            desc="Rétrospective sur les perfs Datablaster, distillation en règles durables."
          />
        </div>
      </div>
    </main>
  );
}

function Pillar({
  emoji,
  title,
  desc,
}: {
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-2 text-base font-semibold">{title}</div>
      <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {desc}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  accent,
}: {
  label: string;
  value: string | number;
  big?: boolean;
  accent?: "primary" | "amber" | "sky" | "muted";
}) {
  const accentCls =
    accent === "amber"
      ? "border-amber-500/30 bg-amber-500/5"
      : accent === "sky"
        ? "border-sky-500/30 bg-sky-500/5"
        : accent === "primary"
          ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5"
          : "border-[var(--color-border)] bg-[var(--color-card)]";
  return (
    <div className={`rounded-xl border p-4 ${accentCls}`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className={`mt-1 ${big ? "text-3xl" : "text-xl"} font-bold`}>
        {value}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  emoji,
  label,
  desc,
}: {
  href: string;
  emoji: string;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm hover:border-[var(--color-primary)]"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{emoji}</span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
        {desc}
      </div>
    </Link>
  );
}

function ClientCard({
  client,
}: {
  client: {
    projectId: string;
    name: string;
    vertical: string;
    pct: number;
    done: number;
    total: number;
    actionable: StepConfig | null;
    gates: number;
    updatedAt: string;
  };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/projects/${client.projectId}/agency`}
            className="block text-sm font-semibold hover:text-[var(--color-primary)] truncate"
          >
            {client.name}
          </Link>
          <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
            <span className="font-mono">{client.vertical}</span>
            {client.gates > 0 && (
              <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-bold uppercase text-amber-300">
                {client.gates} gate
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-[var(--color-background)] px-2 py-1 text-[10px] font-mono">
          {client.done}/{client.total}
        </span>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-[10px] text-[var(--color-muted-foreground)]">
          <span>Avancement</span>
          <span className="font-mono">{client.pct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-background)]">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-primary)] to-emerald-400 transition-all"
            style={{ width: `${client.pct}%` }}
          />
        </div>
      </div>

      {client.actionable ? (
        <Link
          href={hrefForStepInline(client.projectId, client.actionable)}
          className="mt-1 flex items-center justify-between gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-xs font-medium hover:bg-[var(--color-primary)]/15"
        >
          <span className="min-w-0 truncate">
            {client.actionable.emoji} {client.actionable.title}
            <span
              className={`ml-2 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                STATUS_STYLE[
                  client.actionable.key === "onboarding" ? "todo" : "todo"
                ] ?? STATUS_STYLE.todo
              }`}
            >
              à faire
            </span>
          </span>
          <span className="shrink-0 text-[var(--color-primary)]">→</span>
        </Link>
      ) : (
        <Link
          href={`/projects/${client.projectId}/agency`}
          className="mt-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-center text-xs font-medium text-emerald-300"
        >
          🎉 Pipeline terminé · ouvrir
        </Link>
      )}
    </div>
  );
}

function hrefForStepInline(projectId: string, step: StepConfig): string {
  return hrefForStep(projectId, step);
}
