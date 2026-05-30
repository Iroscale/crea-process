import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgencyActivated } from "@/lib/agency";
import AgencyNav from "../_components/agency-nav";
import { importRetroAction, runRetroAction } from "./actions";
import SubmitButton from "../../briefs/[bid]/submit-button";

export default async function RetrospectivePage({
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

  const { data: imports } = await supabase
    .from("retro_imports")
    .select("id, source, period_start, period_end, status, parsed, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const { data: reports } = await supabase
    .from("deliverables")
    .select("id, title, content_md, created_at")
    .eq("project_id", id)
    .eq("kind", "retro-report")
    .order("created_at", { ascending: false })
    .limit(5);

  const importAct = importRetroAction.bind(null, id);
  const runAct = runRetroAction.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/retrospective" />
      <h1 className="text-3xl font-semibold">♻️ Rétrospective</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Importe les exports Datablaster (CSV) puis lance learning-curator pour
        identifier winners/losers, patterns et patches mémoire.
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

      {/* Import */}
      <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-sm font-semibold">📥 Importer un export CSV</h2>
        <form action={importAct} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Source">
              <input
                name="source"
                defaultValue="datablaster"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Début (YYYY-MM-DD)">
              <input
                name="period_start"
                placeholder="2026-05-01"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Fin (YYYY-MM-DD)">
              <input
                name="period_end"
                placeholder="2026-05-31"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <Field label="Coller le CSV (header en première ligne)">
            <textarea
              name="raw_csv"
              rows={10}
              placeholder="ad_name,impressions,ctr,hook_rate,cpl,roas..."
              required
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-[12px]"
            />
          </Field>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Import…">📥 Importer</SubmitButton>
          </div>
        </form>
      </section>

      {/* Lancement rétro */}
      <section className="mt-8 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-6">
        <h2 className="text-sm font-semibold text-[var(--color-primary)]">
          🧪 Lancer la rétrospective
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Aggrège les imports parsed sur la période et passe le tout à
          learning-curator.
        </p>
        <form action={runAct} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Début">
              <input
                name="period_start"
                placeholder="2026-05-01"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Fin">
              <input
                name="period_end"
                placeholder="2026-05-31"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Critère">
              <select
                name="metric"
                defaultValue="CPL"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                {["CPL", "ROAS", "Hook rate", "CTR"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end">
            <SubmitButton
              pendingLabel="Analyse en cours…"
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              ▶ Lancer
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* Imports */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          📦 Imports ({imports?.length ?? 0})
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {(!imports || imports.length === 0) && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Aucun import.
            </p>
          )}
          {(imports ?? []).map((i) => {
            const rows =
              ((i.parsed as { rows?: unknown[] } | null)?.rows ?? []).length;
            return (
              <div
                key={i.id as string}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-mono">{i.source as string}</span> ·{" "}
                  {i.period_start ?? "?"} → {i.period_end ?? "?"} ·{" "}
                  {rows} lignes
                </div>
                <div>
                  <span
                    className={
                      i.status === "analysed"
                        ? "text-emerald-300"
                        : i.status === "parsed"
                          ? "text-sky-300"
                          : "text-amber-300"
                    }
                  >
                    {i.status as string}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Rapports */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          🧠 Rapports ({reports?.length ?? 0})
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {(reports ?? []).map((r) => (
            <div
              key={r.id as string}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{r.title}</h3>
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  {new Date(r.created_at as string).toLocaleString("fr-FR")}
                </span>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
                  Voir le rapport
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px]">
                  {r.content_md as string}
                </pre>
              </details>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}
