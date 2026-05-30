import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgencyActivated } from "@/lib/agency";
import AgencyNav from "../_components/agency-nav";
import { runComplianceCheckAction } from "./actions";
import SubmitButton from "../../briefs/[bid]/submit-button";

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  ok: { label: "✅ ok", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  partial: { label: "⚠️ partial", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  nok: { label: "❌ nok", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
};

const ASSET_KINDS = [
  "copy-video",
  "copy-image",
  "landing-page",
  "quiz",
  "script",
  "email",
];

export default async function ComplianceIndex({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
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
  if (!profile) redirect(`/projects/${id}/agency`);

  const { data: checks } = await supabase
    .from("compliance_checks")
    .select(
      "id, asset_kind, asset_ref, verdict, asset_content_md, corrections_md, corrected_version_md, references_used, created_at"
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const launch = runComplianceCheckAction.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/compliance" />
      <h1 className="text-3xl font-semibold">⚖️ Conformité</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Verdict ACPR / AMF / ARPP / Code des assurances à la demande. L&apos;agent
        rend ✅ / ⚠️ / ❌, liste les issues, et propose une version corrigée
        prête à utiliser. Aucun blocage automatique : tu décides quoi appliquer.
      </p>

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

      {/* Nouveau check */}
      <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-sm font-semibold">Nouveau check</h2>
        <form action={launch} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Type d&apos;asset *
              </span>
              <select
                name="asset_kind"
                required
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Référence (id brief / lp / version)
              </span>
              <input
                name="asset_ref"
                placeholder="optionnel"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Contenu à vérifier *
            </span>
            <textarea
              name="content"
              rows={8}
              required
              placeholder="Colle ici le copy / script / texte complet de la LP / question du quiz à vérifier."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              ⏱ ~10-30s · modèle Opus
            </p>
            <SubmitButton pendingLabel="Vérification en cours…">
              ⚖️ Lancer le check
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* Historique */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          📜 Historique ({checks?.length ?? 0})
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {(!checks || checks.length === 0) && (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Aucun check encore.
            </p>
          )}
          {(checks ?? []).map((c) => {
            const v = VERDICT_STYLE[c.verdict as string] ?? VERDICT_STYLE.partial;
            return (
              <div
                key={c.id as string}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${v.cls}`}
                    >
                      {v.label}
                    </span>
                    <span className="ml-2 text-sm font-semibold">
                      {c.asset_kind as string}
                    </span>
                    {c.asset_ref && (
                      <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                        · ref {c.asset_ref as string}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--color-muted-foreground)]">
                    {new Date(c.created_at as string).toLocaleString("fr-FR")}
                  </span>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
                    Asset original
                  </summary>
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px]">
                    {c.asset_content_md as string}
                  </pre>
                </details>
                {c.corrections_md && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-amber-300">
                      Issues + corrections
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px]">
                      {c.corrections_md as string}
                    </pre>
                  </details>
                )}
                {c.corrected_version_md && (
                  <details className="mt-2" open>
                    <summary className="cursor-pointer text-xs text-emerald-300">
                      ✅ Version corrigée prête à utiliser
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-emerald-500/5 p-3 text-[12px]">
                      {c.corrected_version_md as string}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
