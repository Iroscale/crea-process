/**
 * P0.1 — Preview de l'application d'un livrable validé dans la mémoire client.
 *
 * Affiche côte à côte : mémoire actuelle (client_memory[slug]) vs contenu
 * qui sera appliqué (dernier livrable de l'étape, nettoyé de la section
 * « Validation requise »). L'opérateur confirme « Valider & appliquer »
 * ou retombe sur « Valider sans appliquer ».
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STEP_BY_KEY,
  isAgencyActivated,
  cleanDeliverableForMemory,
  getNextStep,
  type StepKey,
} from "@/lib/agency";
import { MEMORY_TITLES } from "@/lib/agents";
import {
  validateApplyAndContinueAction,
  validateGateAction,
} from "../../../actions";
import SubmitButton from "../../../../briefs/[bid]/submit-button";

export default async function ApplyMemoryPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; step: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, step: stepKeyParam } = await params;
  const sp = await searchParams;

  const step = STEP_BY_KEY[stepKeyParam as StepKey];
  if (!step || !step.memorySlug) notFound();
  const slug = step.memorySlug;

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

  // Dernier livrable de l'étape + mémoire actuelle
  const [delivRes, memRes] = await Promise.all([
    supabase
      .from("deliverables")
      .select("id, title, content_md, created_at, applied_to_memory_at")
      .eq("project_id", id)
      .eq("step_key", step.key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("client_memory")
      .select("content_md, version, updated_at")
      .eq("project_id", id)
      .eq("slug", slug)
      .maybeSingle(),
  ]);
  const deliv = delivRes.data;
  if (!deliv) {
    redirect(
      `/projects/${id}/agency/steps/${step.key}?error=${encodeURIComponent(
        "Aucun livrable à appliquer — lance d'abord l'étape"
      )}`
    );
  }

  const currentMd = (memRes.data?.content_md as string) ?? "";
  const currentVersion = (memRes.data?.version as number) ?? 0;
  const newMd = cleanDeliverableForMemory(deliv.content_md as string);
  const next = getNextStep(step.key);

  const applyAction = validateApplyAndContinueAction.bind(
    null,
    id,
    step.key,
    deliv.id as string
  );
  const validateOnly = validateGateAction.bind(null, id, step.key);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <Link
        href={`/projects/${id}/agency/steps/${step.key}`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← {step.emoji} {step.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">
        🧠 Appliquer le livrable à la mémoire ·{" "}
        <span className="font-mono">{slug}</span>
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {MEMORY_TITLES[slug]} — version actuelle v{currentVersion} → v
        {currentVersion + 1}. L&apos;ancienne version est snapshotée dans
        l&apos;historique (rollback possible). Toutes les étapes en aval
        liront cette nouvelle mémoire.
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {deliv.applied_to_memory_at && (
        <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          ⚠ Ce livrable a déjà été appliqué le{" "}
          {new Date(deliv.applied_to_memory_at as string).toLocaleString(
            "fr-FR"
          )}
          . Ré-appliquer créera une nouvelle version.
        </div>
      )}

      {/* Diff côte à côte */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">
            Mémoire actuelle — v{currentVersion}
          </h2>
          <pre className="mt-2 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-[12px] leading-relaxed">
            {currentMd.trim() || "(vide — jamais alimentée)"}
          </pre>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-primary)]">
            Après application — v{currentVersion + 1}
          </h2>
          <pre className="mt-2 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-card)] p-4 text-[12px] leading-relaxed">
            {newMd}
          </pre>
        </div>
      </section>

      {/* Actions */}
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <form action={applyAction} className="flex flex-1 items-center gap-3">
          <input
            name="notes"
            placeholder="Note de validation (optionnel)"
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
          <SubmitButton
            pendingLabel="Application…"
            className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            ✅ Valider &amp; appliquer
            {next ? ` → ${next.title}` : ""}
          </SubmitButton>
        </form>
        <form action={validateOnly}>
          <input type="hidden" name="notes" value="validé sans application mémoire" />
          <SubmitButton
            pendingLabel="Validation…"
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
          >
            Valider sans appliquer
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
