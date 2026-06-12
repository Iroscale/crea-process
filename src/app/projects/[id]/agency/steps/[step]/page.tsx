import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STEP_BY_KEY,
  isAgencyActivated,
  getNextStep,
  getPreviousStep,
  getStepPrefills,
  listItemsForDeliverable,
  listValidatedItems,
  type StepKey,
  type StepConfig,
  type DeliverableItemRow,
  type ItemKind,
} from "@/lib/agency";
import {
  launchStepAction,
  productionPassAction,
  itemStatusAction,
  regenerateItemAction,
  addMoreItemsAction,
} from "./actions";
import {
  validateGateAction,
  validateAndContinueAction,
  resetStepAction,
  skipStepAction,
} from "../../actions";
import AgencyNav from "../../_components/agency-nav";
import StepStepper from "../../_components/step-stepper";
import RunPoller from "../../_components/run-poller";
import SubmitButton from "../../../briefs/[bid]/submit-button";

// P0.6 : les server actions de cette page déclenchent des runs LLM longs
// via after() — la lambda doit pouvoir vivre jusqu'à 5 min (Vercel Fluid).
export const maxDuration = 300;

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

function hrefForStep(projectId: string, step: StepConfig): string {
  if (step.key === "export-memory") return `/projects/${projectId}/agency/export`;
  if (step.key === "retrospective") return `/projects/${projectId}/agency/retrospective`;
  if (step.key === "onboarding") return `/projects/${projectId}/agency/onboarding`;
  return `/projects/${projectId}/agency/steps/${step.key}`;
}

export default async function StepPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; step: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, step: stepKeyParam } = await params;
  const sp = await searchParams;

  const step = STEP_BY_KEY[stepKeyParam as StepKey];
  if (!step) notFound();

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
  if (!profile) redirect(`/projects/${id}/agency`);

  // Pré-remplissage intelligent des champs (depuis onboarding + mémoire)
  const prefills = await getStepPrefills(supabase, {
    projectId: id,
    stepKey: step.key,
  });

  // Charge l'état + les derniers livrables + les runs + statuts pour le stepper
  const [stepRes, delivRes, runRes, allStepsRes] = await Promise.all([
    supabase
      .from("pipeline_steps")
      .select("status, has_gate, validated_at, current_run_id, notes")
      .eq("project_id", id)
      .eq("step_key", step.key)
      .maybeSingle(),
    supabase
      .from("deliverables")
      .select("id, kind, title, content_md, created_at")
      .eq("project_id", id)
      .eq("step_key", step.key)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("agent_runs")
      .select("id, status, model, started_at, finished_at, error_message, cost_estimate_usd")
      .eq("project_id", id)
      .eq("step_key", step.key)
      .order("started_at", { ascending: false })
      .limit(5),
    supabase
      .from("pipeline_steps")
      .select("step_key, status")
      .eq("project_id", id),
  ]);
  const status = (stepRes.data?.status as string) ?? "todo";
  const deliverables = delivRes.data ?? [];
  const runs = runRes.data ?? [];
  const statusByStep = new Map<string, string>();
  for (const r of allStepsRes.data ?? []) {
    statusByStep.set(r.step_key as string, r.status as string);
  }

  // P0.6 : run en cours sur cette étape ? → poller + bouton désactivé
  const runningRun = runs.find((r) => r.status === "running");

  // P0.3 : items structurés du dernier livrable + options des items-select
  const latestDeliverable = deliverables[0];
  let stepItems: DeliverableItemRow[] = [];
  if (step.structuredKind && latestDeliverable) {
    stepItems = await listItemsForDeliverable(
      supabase,
      latestDeliverable.id as string
    );
  }
  const itemsSelectOptions: Partial<
    Record<ItemKind, DeliverableItemRow[]>
  > = {};
  for (const f of step.formFields ?? []) {
    if (f.type === "items-select" && f.itemKind && !itemsSelectOptions[f.itemKind]) {
      itemsSelectOptions[f.itemKind] = await listValidatedItems(supabase, {
        projectId: id,
        kind: f.itemKind,
      });
    }
  }

  // P0.3 / F8 : verrou soft — étapes amont attendues non validées
  const blockedBy = (step.expectsBefore ?? []).filter((k) => {
    const s = statusByStep.get(k);
    return s !== "validated" && s !== "skipped";
  });

  const nextStep = getNextStep(step.key);
  const prevStep = getPreviousStep(step.key);

  const launch = launchStepAction.bind(null, id, step.key);
  const validate = validateGateAction.bind(null, id, step.key);
  const validateContinue = validateAndContinueAction.bind(null, id, step.key);
  const reset = resetStepAction.bind(null, id, step.key);
  const skip = skipStepAction.bind(null, id, step.key);
  const prodPass = productionPassAction.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="" />
      <StepStepper projectId={id} currentKey={step.key} statusByStep={statusByStep} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Étape {step.order} · {step.key}
          </div>
          <h1 className="mt-1 text-3xl font-semibold">
            {step.emoji} {step.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {step.tagline}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold uppercase ${
            STATUS_STYLE[status] ?? STATUS_STYLE.todo
          }`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        Agent :{" "}
        <Link
          href={step.agentKey ? `/agency/agents/${step.agentKey}` : "#"}
          className="font-mono text-[var(--color-primary)] hover:underline"
        >
          {step.agentKey ?? "—"}
        </Link>
        {step.gate && (
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
            🛑 gate humain
          </span>
        )}
      </div>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* P0.6 : run en cours → polling + mise à jour auto */}
      {runningRun && (
        <RunPoller
          projectId={id}
          stepKey={step.key}
          startedAt={(runningRun.started_at as string) ?? null}
        />
      )}

      {/* ─── CTA contextuel principal selon le statut ───────────────────── */}
      {status === "validated" && nextStep && (
        <ContinueBanner
          variant="success"
          projectId={id}
          nextStep={nextStep}
          message="Étape validée. Tu peux enchaîner."
        />
      )}
      {status === "gate_pending" && (
        <section className="mt-6 rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="text-sm font-semibold text-amber-300">
            🛑 Gate à valider
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            L&apos;agent a livré. Pour débloquer la suite : valide les points avec
            le client (Loom envoyé), ajoute une note, puis clique le bouton de
            ton choix.
          </p>
          {step.memorySlug ? (
            <>
              {/* Étape qui alimente la mémoire : on passe par le preview diff */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={`/projects/${id}/agency/steps/${step.key}/apply`}
                  className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  ✅ Valider &amp; appliquer à la mémoire{" "}
                  <span className="font-mono">{step.memorySlug}</span> →
                </Link>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  Preview diff avant application — les étapes aval liront
                  cette mémoire.
                </p>
              </div>
              <form action={validateContinue} className="mt-3 flex justify-end gap-2">
                <input type="hidden" name="notes" value="validé sans application mémoire" />
                <SubmitButton
                  pendingLabel="Validation…"
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                >
                  Valider sans appliquer
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <form action={validateContinue} className="mt-4 flex flex-wrap gap-2">
                <input
                  name="notes"
                  placeholder="Note de validation (optionnel — points OK, Loom envoyé, etc.)"
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                <SubmitButton
                  pendingLabel="Validation…"
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  ✅ Valider & continuer{nextStep ? ` → ${nextStep.title}` : ""}
                </SubmitButton>
              </form>
              <form action={validate} className="mt-2 flex justify-end">
                <input type="hidden" name="notes" value="" />
                <SubmitButton
                  pendingLabel="Validation…"
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                >
                  Valider sans changer de page
                </SubmitButton>
              </form>
            </>
          )}
        </section>
      )}

      {/* Formulaire de lancement */}
      <LaunchForm
        step={step}
        action={launch}
        disabled={status === "in_progress" || Boolean(runningRun)}
        prefills={prefills}
        itemsSelectOptions={itemsSelectOptions}
        blockedBy={blockedBy}
      />

      {/* ─── P0.3 : items structurés validables un par un ──────────────── */}
      {step.structuredKind && stepItems.length > 0 && latestDeliverable && (
        <section id="items" className="mt-10 scroll-mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              🧩 Items proposés ({stepItems.length})
            </h2>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              ✅{" "}
              {stepItems.filter((i) => i.status === "validated").length}{" "}
              validés · ❌{" "}
              {stepItems.filter((i) => i.status === "rejected").length} rejetés
              · ⏳{" "}
              {stepItems.filter((i) => i.status === "proposed").length} en
              attente
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Valide, rejette, régénère ou édite chaque item individuellement.
            Les étapes en aval ne consomment QUE les items validés.
          </p>

          <div className="mt-4 grid gap-3">
            {stepItems.map((it) => {
              const itemStatusStyle =
                it.status === "validated"
                  ? "border-emerald-500/40"
                  : it.status === "rejected"
                    ? "border-red-500/30 opacity-60"
                    : "border-[var(--color-border)]";
              return (
                <div
                  key={it.id}
                  className={`rounded-xl border bg-[var(--color-card)] p-4 ${itemStatusStyle}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{it.title}</h3>
                        <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                          {it.item_key}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            it.status === "validated"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : it.status === "rejected"
                                ? "bg-red-500/15 text-red-300"
                                : "bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          {it.status === "validated"
                            ? "validé"
                            : it.status === "rejected"
                              ? "rejeté"
                              : "proposé"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {it.status !== "validated" && (
                        <form
                          action={itemStatusAction.bind(
                            null,
                            id,
                            step.key,
                            it.id,
                            latestDeliverable.id as string,
                            step.structuredKind!,
                            "validated"
                          )}
                        >
                          <SubmitButton
                            pendingLabel="…"
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
                          >
                            ✅ Valider
                          </SubmitButton>
                        </form>
                      )}
                      {it.status !== "rejected" && (
                        <form
                          action={itemStatusAction.bind(
                            null,
                            id,
                            step.key,
                            it.id,
                            latestDeliverable.id as string,
                            step.structuredKind!,
                            "rejected"
                          )}
                        >
                          <SubmitButton
                            pendingLabel="…"
                            className="rounded-md border border-red-500/30 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                          >
                            ❌ Rejeter
                          </SubmitButton>
                        </form>
                      )}
                      {it.status !== "proposed" && (
                        <form
                          action={itemStatusAction.bind(
                            null,
                            id,
                            step.key,
                            it.id,
                            latestDeliverable.id as string,
                            step.structuredKind!,
                            "proposed"
                          )}
                        >
                          <SubmitButton
                            pendingLabel="…"
                            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] hover:bg-[var(--color-accent)]"
                          >
                            ↺
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>

                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px] leading-relaxed">
                    {it.content_md}
                  </pre>

                  {/* Régénération ciblée */}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-[var(--color-muted-foreground)]">
                      🔄 Régénérer cet item (avec consigne)
                    </summary>
                    <form
                      action={regenerateItemAction.bind(
                        null,
                        id,
                        step.key,
                        it.id
                      )}
                      className="mt-2 flex flex-wrap gap-2"
                    >
                      <input
                        name="instruction"
                        placeholder="Consigne (optionnel) — ex : plus pédagogue, moins de chiffres"
                        className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-xs"
                      />
                      <SubmitButton
                        pendingLabel="Régénération…"
                        className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent)]"
                      >
                        🔄 Régénérer
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>

          {/* Ajouter des items */}
          <details className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-4">
            <summary className="cursor-pointer text-sm font-medium">
              ➕ Proposer des items supplémentaires
            </summary>
            <form
              action={addMoreItemsAction.bind(
                null,
                id,
                step.key,
                latestDeliverable.id as string
              )}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <select
                name="count"
                defaultValue="3"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="5">5</option>
              </select>
              <input
                name="instruction"
                placeholder="Orientation (optionnel) — ex : axe social proof"
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              <SubmitButton
                pendingLabel="Génération…"
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                ➕ Générer
              </SubmitButton>
            </form>
          </details>
        </section>
      )}

      {/* Bonus pour étape 04 : pass production-assistant */}
      {step.key === "04-video-founder-ads" && deliverables.length > 0 && (
        <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <h2 className="text-sm font-semibold">
            🎬 Humaniser pour le tournage
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Lance production-assistant sur le dernier script founder pour
            produire la version prompteur + plan de tournage du jour J.
          </p>
          <form action={prodPass} className="mt-3 flex flex-wrap gap-2">
            <input
              name="note"
              placeholder="Note particulière (lieu, fondateur, prompteur, etc.)"
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <SubmitButton
              pendingLabel="Pack tournage en cours…"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
            >
              ▶ Humaniser & plan de tournage
            </SubmitButton>
          </form>
        </section>
      )}

      {/* Livrables récents */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          📦 Livrables ({deliverables.length})
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {deliverables.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Aucun livrable encore. Lance l&apos;étape ci-dessus.
            </p>
          )}
          {deliverables.map((d) => (
            <div
              key={d.id as string}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{d.title}</h3>
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  {new Date(d.created_at as string).toLocaleString("fr-FR")} ·{" "}
                  <span className="font-mono">{d.kind as string}</span>
                </span>
              </div>
              <details className="mt-2" open={deliverables.indexOf(d) === 0}>
                <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
                  Voir le markdown ({(d.content_md as string).length} chars)
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px] leading-relaxed">
                  {d.content_md as string}
                </pre>
              </details>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Link
                  href={`/projects/${id}/agency/deliverables/${d.id as string}`}
                  className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-2 py-1 hover:bg-[var(--color-primary)]/15"
                >
                  ✏️ Éditer ce livrable
                </Link>
                <Link
                  href={`/projects/${id}/agency/memory`}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 hover:bg-[var(--color-accent)]"
                >
                  → Éditer mémoire
                </Link>
                {step.agentKey && (
                  <Link
                    href={`/agency/agents/${step.agentKey}`}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 hover:bg-[var(--color-accent)]"
                  >
                    💬 Feedback sur l&apos;agent
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Runs */}
      {runs.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">⚡ Runs ({runs.length})</h2>
          <div className="mt-3 flex flex-col gap-2">
            {runs.map((r) => (
              <div
                key={r.id as string}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs"
              >
                <div>
                  {new Date(r.started_at as string).toLocaleString("fr-FR")} ·{" "}
                  <span className="font-mono">{r.model as string}</span> ·{" "}
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
                    <span className="ml-2 text-[var(--color-muted-foreground)]">
                      ~${r.cost_estimate_usd}
                    </span>
                  )}
                  {r.error_message && (
                    <span className="ml-2 text-red-300">
                      · {(r.error_message as string).slice(0, 80)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Navigation prev/next + actions secondaires ────────────────── */}
      <section className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-6">
        <div>
          {prevStep ? (
            <Link
              href={hrefForStep(id, prevStep)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm hover:bg-[var(--color-accent)]"
            >
              ◀ {prevStep.emoji} {prevStep.title}
            </Link>
          ) : (
            <Link
              href={`/projects/${id}/agency`}
              className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              ← Pipeline
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status !== "todo" && status !== "validated" && (
            <form action={reset}>
              <SubmitButton
                pendingLabel="Reset…"
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:border-red-500/40 hover:text-red-300"
              >
                ↺ Réinitialiser
              </SubmitButton>
            </form>
          )}
          {status !== "validated" && status !== "skipped" && (
            <form action={skip}>
              <SubmitButton
                pendingLabel="Skip…"
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              >
                Sauter cette étape
              </SubmitButton>
            </form>
          )}
        </div>
        <div>
          {nextStep && (
            <Link
              href={hrefForStep(id, nextStep)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              {nextStep.emoji} {nextStep.title} ▶
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

function ContinueBanner({
  projectId,
  nextStep,
  message,
  variant,
}: {
  projectId: string;
  nextStep: StepConfig;
  message: string;
  variant: "success" | "info";
}) {
  const cls =
    variant === "success"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : "border-sky-500/40 bg-sky-500/10";
  return (
    <section
      className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 p-4 ${cls}`}
    >
      <div>
        <p className="text-sm font-medium">{message}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
          Prochaine étape : {nextStep.emoji} {nextStep.title} —{" "}
          <span className="text-[var(--color-muted-foreground)]">
            {nextStep.tagline}
          </span>
        </p>
      </div>
      <Link
        href={hrefForStep(projectId, nextStep)}
        className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
      >
        ▶ Continuer vers {nextStep.title}
      </Link>
    </section>
  );
}

function LaunchForm({
  step,
  action,
  disabled,
  prefills,
  itemsSelectOptions,
  blockedBy,
}: {
  step: StepConfig;
  action: (formData: FormData) => void | Promise<void>;
  disabled: boolean;
  prefills: Record<string, string>;
  itemsSelectOptions: Partial<Record<ItemKind, DeliverableItemRow[]>>;
  blockedBy: StepKey[];
}) {
  if (!step.agentKey) return null;
  const hasPrefills = Object.values(prefills).some((v) => v && v.length > 0);
  const isBlocked = blockedBy.length > 0;
  return (
    <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <h2 className="text-sm font-semibold">▶ Lancer l&apos;étape</h2>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        L&apos;agent <span className="font-mono">{step.agentKey}</span> charge la
        mémoire client + sa mémoire long terme + son knowledge enrichi, et
        produit un livrable horodaté.
      </p>
      {isBlocked && (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          ⚠ Étape(s) amont non validée(s) :{" "}
          <span className="font-mono">{blockedBy.join(", ")}</span>. L&apos;agent
          risque de travailler sur une mémoire incomplète. Tu peux quand même
          lancer (le bouton le précise).
        </div>
      )}
      {hasPrefills && (
        <p className="mt-2 rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-3 py-1.5 text-[11px] text-[var(--color-primary)]">
          ✨ Champs pré-remplis à partir de l&apos;onboarding et de la mémoire
          client. Ajuste puis lance — ou clique « Lancer » direct.
        </p>
      )}
      <form action={action} className="mt-4 flex flex-col gap-3">
        {(step.formFields ?? []).map((f) => {
          const prefill = prefills[f.name] ?? "";
          if (f.type === "items-select") {
            const options = (f.itemKind && itemsSelectOptions[f.itemKind]) || [];
            return (
              <div key={f.name} className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {f.label}
                  {f.required && <span className="ml-1 text-red-300">*</span>}
                  <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                    items validés uniquement
                  </span>
                </span>
                {options.length === 0 ? (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                    Aucun item «&nbsp;{f.itemKind}&nbsp;» validé pour
                    l&apos;instant. Valide d&apos;abord des items à l&apos;étape
                    amont.
                  </p>
                ) : (
                  <div className="grid gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 sm:grid-cols-2">
                    {options.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-[var(--color-accent)]"
                      >
                        <input
                          type="checkbox"
                          name={f.name}
                          value={opt.id}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {opt.title}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-[var(--color-muted-foreground)]">
                            {opt.item_key}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <label key={f.name} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {f.label}
                {f.required && <span className="ml-1 text-red-300">*</span>}
                {prefill && (
                  <span className="ml-2 rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--color-primary)]">
                    suggéré
                  </span>
                )}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  name={f.name}
                  placeholder={f.placeholder}
                  required={f.required}
                  rows={4}
                  defaultValue={prefill}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              ) : f.type === "select" ? (
                <select
                  name={f.name}
                  required={f.required}
                  defaultValue={prefill || undefined}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                >
                  {(f.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={f.name}
                  placeholder={f.placeholder}
                  required={f.required}
                  defaultValue={prefill}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              )}
            </label>
          );
        })}
        <details>
          <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
            Avancé · surcharger le prompt complet (override)
          </summary>
          <textarea
            name="prompt_override"
            rows={6}
            placeholder="Laisse vide pour utiliser le template par défaut avec les champs ci-dessus."
            className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs"
          />
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
            Si renseigné, ce texte remplace intégralement le prompt généré.
            Utile pour des cas spéciaux ou des reprises.
          </p>
        </details>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {step.agentKey === "market-research"
              ? "💡 Recherche web réelle, ~30-90s"
              : "⏱ ~10-30s"}
          </p>
          <SubmitButton
            disabled={disabled}
            pendingLabel="Agent en cours…"
            className={`rounded-md px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
              isBlocked
                ? "border border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            }`}
          >
            {isBlocked ? "⚠ Lancer quand même" : "▶ Lancer"}
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
