import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAgencyActivated,
  STEP_BY_KEY,
  listDeliverableVersions,
  type StepKey,
} from "@/lib/agency";
import AgencyNav from "../../_components/agency-nav";
import {
  saveDeliverableAction,
  deleteDeliverableAction,
  restoreVersionAction,
} from "./actions";
import SubmitButton from "../../../briefs/[bid]/submit-button";

const DELIV_STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-300",
  validated: "bg-emerald-500/15 text-emerald-300",
  delivered: "bg-sky-500/15 text-sky-300",
  archived: "bg-zinc-500/15 text-zinc-400",
};

export default async function DeliverableEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; did: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id, did } = await params;
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

  const { data: deliv } = await supabase
    .from("deliverables")
    .select(
      "id, kind, title, content_md, step_key, agent_key, created_at, run_id, version, status"
    )
    .eq("id", did)
    .eq("project_id", id)
    .maybeSingle();
  if (!deliv) notFound();

  const versions = await listDeliverableVersions(supabase, did);

  const stepCfg = STEP_BY_KEY[deliv.step_key as StepKey];
  const save = saveDeliverableAction.bind(null, id, did);
  const del = deleteDeliverableAction.bind(null, id, did);
  const delivStatus = (deliv.status as string) ?? "draft";
  const delivVersion = (deliv.version as number) ?? 1;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="" />

      <div className="flex flex-wrap items-baseline gap-2 text-xs text-[var(--color-muted-foreground)]">
        <Link
          href={
            stepCfg
              ? `/projects/${id}/agency/steps/${stepCfg.key}`
              : `/projects/${id}/agency`
          }
          className="uppercase tracking-wider hover:text-[var(--color-foreground)]"
        >
          ← {stepCfg?.emoji} {stepCfg?.title ?? deliv.step_key}
        </Link>
      </div>

      <h1 className="mt-3 flex flex-wrap items-center gap-2 text-2xl font-semibold">
        ✏️ Éditer le livrable
        <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-bold text-[var(--color-primary)]">
          v{delivVersion}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            DELIV_STATUS_BADGE[delivStatus] ?? DELIV_STATUS_BADGE.draft
          }`}
        >
          {delivStatus}
        </span>
      </h1>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        <span className="font-mono">{deliv.kind as string}</span> · produit le{" "}
        {new Date(deliv.created_at as string).toLocaleString("fr-FR")} · agent{" "}
        <span className="font-mono">{deliv.agent_key as string}</span>
      </p>
      <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
        Chaque sauvegarde snapshot l&apos;ancienne version (restaurable
        ci-dessous). Les agents en aval liront ta version éditée.
      </p>

      {sp.saved && (
        <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          ✅ Livrable sauvegardé.
        </div>
      )}
      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form action={save} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Titre
          </span>
          <input
            name="title"
            defaultValue={deliv.title as string}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Contenu markdown
          </span>
          <textarea
            name="content_md"
            defaultValue={deliv.content_md as string}
            rows={28}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-[13px] leading-relaxed"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Au save, le texte remplace celui produit par l&apos;agent. Les
            agents en aval verront ta version.
          </p>
          <SubmitButton pendingLabel="Enregistrement…">
            💾 Enregistrer
          </SubmitButton>
        </div>
      </form>

      {/* P0.4 — Historique des versions */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          🕘 Versions précédentes ({versions.length})
        </h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Aucune version archivée — le livrable n&apos;a pas encore été
            modifié depuis sa génération.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-semibold">v{v.version}</span>
                    <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                      {v.source === "agent"
                        ? "🤖 agent"
                        : v.source === "chat"
                          ? "💬 chat"
                          : "✏️ manuel"}
                    </span>
                    <span className="ml-2 text-[var(--color-muted-foreground)]">
                      {new Date(v.created_at).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <form action={restoreVersionAction.bind(null, id, did, v.id)}>
                    <SubmitButton
                      pendingLabel="Restauration…"
                      className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] hover:bg-[var(--color-accent)]"
                    >
                      ↩ Restaurer (crée v{delivVersion + 1})
                    </SubmitButton>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--color-muted-foreground)]">
                    Voir le contenu ({v.content_md.length} chars)
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px]">
                    {v.content_md}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 flex justify-end border-t border-[var(--color-border)] pt-6">
        <form action={del}>
          <SubmitButton
            pendingLabel="Suppression…"
            className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          >
            🗑 Supprimer ce livrable
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
