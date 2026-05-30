import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAgencyActivated,
  STEPS,
  PIPELINE_STEPS,
  ONBOARDING_STEP,
  EXTRA_STEPS,
  getActionableStep,
  type StepConfig,
  type StepKey,
} from "@/lib/agency";
import { activateAction } from "./actions";
import AgencyNav from "./_components/agency-nav";
import SubmitButton from "../briefs/[bid]/submit-button";

const STATUS_STYLE: Record<string, string> = {
  todo: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  in_progress: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  gate_pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  validated: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  skipped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};
const STATUS_LABEL: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  gate_pending: "Gate à valider",
  validated: "Validée",
  failed: "Échec",
  skipped: "Sautée",
};

interface PipelineStepRow {
  step_key: string;
  status: string;
  has_gate: boolean;
  validated_at: string | null;
  current_run_id: string | null;
  updated_at: string;
}

function hrefForStep(projectId: string, step: StepConfig): string {
  if (step.key === "export-memory") return `/projects/${projectId}/agency/export`;
  if (step.key === "retrospective") return `/projects/${projectId}/agency/retrospective`;
  if (step.key === "onboarding") return `/projects/${projectId}/agency/onboarding`;
  return `/projects/${projectId}/agency/steps/${step.key}`;
}

export default async function AgencyHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; welcome?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const profile = await isAgencyActivated(supabase, id);

  // ─── Vue activation (pas encore activé) ────────────────────────────────
  if (!profile) {
    const action = activateAction.bind(null, id);
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
        <AgencyNav projectId={id} projectName={project.name} active="" />
        <h1 className="text-3xl font-semibold">🚀 Activer Agency OS</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          On crée le profil agency du client, on initialise les 7 fichiers de
          mémoire avec leur squelette, et on met en place les 13 étapes du
          pipeline. Idempotent — tu peux relancer sans risque.
        </p>

        {sp.error && (
          <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {decodeURIComponent(sp.error)}
          </div>
        )}

        <form
          action={action}
          className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Verticale du client
            </span>
            <select
              name="vertical"
              defaultValue="assurance-vie-lux"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="assurance-vie-lux">Assurance-vie lux</option>
              <option value="scpi">SCPI</option>
              <option value="defisc">Défiscalisation</option>
              <option value="banque-privee">Banque privée</option>
              <option value="autre">Autre</option>
            </select>
          </label>
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            Tu pourras éditer la mémoire et l&apos;onboarding ensuite. La
            verticale conditionne juste les rappels conformité.
          </p>
          <div className="mt-4 flex justify-end">
            <SubmitButton pendingLabel="Activation…">
              Activer Agency OS
            </SubmitButton>
          </div>
        </form>
      </main>
    );
  }

  // ─── Vue pipeline (activé) ─────────────────────────────────────────────
  const { data: stepsRaw } = await supabase
    .from("pipeline_steps")
    .select(
      "step_key, status, has_gate, validated_at, current_run_id, updated_at"
    )
    .eq("project_id", id);
  const stepsBy = new Map<string, PipelineStepRow>();
  const statusByStep = new Map<string, string>();
  for (const s of (stepsRaw ?? []) as PipelineStepRow[]) {
    stepsBy.set(s.step_key, s);
    statusByStep.set(s.step_key, s.status);
  }

  // Dernier livrable par step pour preview
  const { data: latestDeliverables } = await supabase
    .from("deliverables")
    .select("step_key, title, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  const lastDelivBy = new Map<string, { title: string; created_at: string }>();
  for (const d of latestDeliverables ?? []) {
    if (!lastDelivBy.has(d.step_key as string)) {
      lastDelivBy.set(d.step_key as string, {
        title: d.title as string,
        created_at: d.created_at as string,
      });
    }
  }

  const validatedSet = new Set(
    Array.from(stepsBy.values())
      .filter((s) => s.status === "validated")
      .map((s) => s.step_key)
  );

  // Compteurs sur les étapes pipeline principales (01-10)
  const pipelineDone = PIPELINE_STEPS.filter(
    (s) => validatedSet.has(s.key) || stepsBy.get(s.key)?.status === "skipped"
  ).length;
  const pipelineTotal = PIPELINE_STEPS.length;
  const pct = Math.round((pipelineDone / pipelineTotal) * 100);

  const counts = {
    gate: Array.from(stepsBy.values()).filter((s) => s.status === "gate_pending").length,
    progress: Array.from(stepsBy.values()).filter((s) => s.status === "in_progress").length,
    failed: Array.from(stepsBy.values()).filter((s) => s.status === "failed").length,
  };

  const actionable = getActionableStep(statusByStep);

  // Activité récente (7 derniers livrables tous steps confondus)
  const recentDeliverables = (latestDeliverables ?? []).slice(0, 7);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">🗺️ Pipeline</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Verticale :{" "}
            <span className="font-mono">{profile.vertical ?? "—"}</span> · Activé
            le {new Date(profile.activated_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-xs">
          <Stat label="Validées" value={`${pipelineDone}/${pipelineTotal}`} />
          <Stat label="Gates ouverts" value={counts.gate} />
          <Stat label="En cours" value={counts.progress} />
          {counts.failed > 0 && (
            <Stat label="Échecs" value={counts.failed} />
          )}
        </div>
      </div>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}
      {sp.ok && (
        <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {decodeURIComponent(sp.ok)}
        </div>
      )}

      {/* Welcome banner pour un projet fraîchement créé via le wizard */}
      {sp.welcome && pipelineDone === 0 && (
        <section className="mt-6 rounded-xl border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-5">
          <h2 className="text-base font-semibold">
            🎉 Bienvenue sur l&apos;Agency OS de <span className="text-[var(--color-primary)]">{project.name}</span>
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Tout est en place : profil agency créé, 7 fichiers mémoire
            initialisés, pipeline des 13 étapes prêt. Voici la suite recommandée :
          </p>
          <ol className="mt-3 flex flex-col gap-2">
            <li className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm">
              <span className="rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary-foreground)]">
                1
              </span>
              <div className="flex-1">
                <Link
                  href={`/projects/${id}/agency/onboarding`}
                  className="font-medium hover:text-[var(--color-primary)]"
                >
                  📥 Complète l&apos;onboarding
                </Link>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  Vérifie le récap Fathom, ajoute les accès BM/Google Ads,
                  puis fais ingérer par l&apos;orchestrator.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm">
              <span className="rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary-foreground)]">
                2
              </span>
              <div className="flex-1">
                <Link
                  href={`/projects/${id}/agency/memory/client-profile`}
                  className="font-medium hover:text-[var(--color-primary)]"
                >
                  📝 Patche client-profile.md
                </Link>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  Applique la synthèse produite par l&apos;orchestrator dans la
                  mémoire client (lue par tous les agents en aval).
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm">
              <span className="rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary-foreground)]">
                3
              </span>
              <div className="flex-1">
                <Link
                  href={`/projects/${id}/agency/steps/01-market-research`}
                  className="font-medium hover:text-[var(--color-primary)]"
                >
                  🔍 Lance le market research (web search)
                </Link>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  3 ICP sourcés via Reddit / Meta Ad Library / presse. ~60s.
                  Gate humain en sortie.
                </p>
              </div>
            </li>
          </ol>
          <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
            Le stepper sticky en haut des pages d&apos;étape te permettra de
            sauter à n&apos;importe quelle étape en 1 clic.
          </p>
        </section>
      )}

      {/* Progress bar visuelle */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
          <span>Avancement pipeline principal (01-10)</span>
          <span className="font-mono">{pct}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-card)]">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-primary)] to-emerald-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {/* CTA "Continuer où on en est" */}
      {actionable && (
        <section className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-[var(--color-primary)]">
              ▶ Reprendre le travail
            </p>
            <p className="mt-1 text-lg font-semibold">
              {actionable.emoji} {actionable.title}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              {actionable.tagline} ·{" "}
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  STATUS_STYLE[statusByStep.get(actionable.key) ?? "todo"]
                }`}
              >
                {STATUS_LABEL[statusByStep.get(actionable.key) ?? "todo"]}
              </span>
            </p>
          </div>
          <Link
            href={hrefForStep(id, actionable)}
            className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            Ouvrir l&apos;étape →
          </Link>
        </section>
      )}

      {!actionable && (
        <section className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="text-sm font-semibold text-emerald-300">
            🎉 Toutes les étapes du pipeline sont validées
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Pense à lancer une rétrospective et un export quand tu en auras
            besoin.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href={`/projects/${id}/agency/retrospective`}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent)]"
            >
              ♻️ Rétrospective
            </Link>
            <Link
              href={`/projects/${id}/agency/export`}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent)]"
            >
              📤 Export mémoire
            </Link>
          </div>
        </section>
      )}

      {/* Onboarding card en haut, mise en avant */}
      <StepCard
        projectId={id}
        step={ONBOARDING_STEP}
        state={stepsBy.get(ONBOARDING_STEP.key)}
        lastDeliv={lastDelivBy.get(ONBOARDING_STEP.key)}
        validatedSet={validatedSet}
        highlighted
      />

      {/* Pipeline 01-10 */}
      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        Étapes du process (10)
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PIPELINE_STEPS.map((s) => (
          <StepCard
            key={s.key}
            projectId={id}
            step={s}
            state={stepsBy.get(s.key)}
            lastDeliv={lastDelivBy.get(s.key)}
            validatedSet={validatedSet}
          />
        ))}
      </div>

      {/* Étapes extra */}
      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        Étapes transverses
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {EXTRA_STEPS.map((s) => (
          <StepCard
            key={s.key}
            projectId={id}
            step={s}
            state={stepsBy.get(s.key)}
            lastDeliv={lastDelivBy.get(s.key)}
            validatedSet={validatedSet}
          />
        ))}
      </div>

      {/* Activité récente */}
      {recentDeliverables.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Derniers livrables
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recentDeliverables.map((d, i) => {
              const stepCfg = STEPS.find((s) => s.key === d.step_key);
              const href = stepCfg
                ? hrefForStep(id, stepCfg)
                : `/projects/${id}/agency`;
              return (
                <Link
                  key={`${d.step_key as string}-${i}`}
                  href={href}
                  className="block rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs hover:bg-[var(--color-accent)]"
                >
                  <div className="truncate font-medium">{d.title as string}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                    {stepCfg?.emoji} {stepCfg?.title ?? d.step_key} ·{" "}
                    {new Date(d.created_at as string).toLocaleString("fr-FR")}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StepCard({
  projectId,
  step,
  state,
  lastDeliv,
  validatedSet,
  highlighted = false,
}: {
  projectId: string;
  step: StepConfig;
  state: PipelineStepRow | undefined;
  lastDeliv: { title: string; created_at: string } | undefined;
  validatedSet: Set<string>;
  highlighted?: boolean;
}) {
  const status = state?.status ?? "todo";
  const href = hrefForStep(projectId, step);

  const blockedBy = (step.expectsBefore ?? []).filter(
    (k) => !validatedSet.has(k)
  );
  const isReady = blockedBy.length === 0;

  return (
    <Link
      href={href}
      className={`block rounded-xl border bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)] ${
        highlighted
          ? "mt-6 border-[var(--color-primary)]/40"
          : "border-[var(--color-border)]"
      } ${!isReady ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{step.emoji}</span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {step.key}
              </div>
              <h3 className="text-sm font-semibold truncate">{step.title}</h3>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)] line-clamp-2">
            {step.tagline}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
            STATUS_STYLE[status] ?? STATUS_STYLE.todo
          }`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--color-muted-foreground)]">
        <div>
          {step.gate && <span className="mr-2">🛑 gate</span>}
          {step.agentKey ? (
            <span className="font-mono">{step.agentKey}</span>
          ) : (
            <span>aucun agent</span>
          )}
        </div>
        {lastDeliv && (
          <span>
            dernier :{" "}
            {new Date(lastDeliv.created_at).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
      </div>
      {!isReady && (
        <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
          En attente : {blockedBy.map((k) => stepKeyToShort(k)).join(", ")}
        </div>
      )}
    </Link>
  );
}

function stepKeyToShort(k: StepKey): string {
  return k.replace(/^\d+-/, "");
}
