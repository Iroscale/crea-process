import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgencyActivated, STEP_BY_KEY, type StepKey } from "@/lib/agency";
import AgencyNav from "../../_components/agency-nav";
import {
  saveDeliverableAction,
  deleteDeliverableAction,
} from "./actions";
import SubmitButton from "../../../briefs/[bid]/submit-button";

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
      "id, kind, title, content_md, step_key, agent_key, created_at, run_id"
    )
    .eq("id", did)
    .eq("project_id", id)
    .maybeSingle();
  if (!deliv) notFound();

  const stepCfg = STEP_BY_KEY[deliv.step_key as StepKey];
  const save = saveDeliverableAction.bind(null, id, did);
  const del = deleteDeliverableAction.bind(null, id, did);

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

      <h1 className="mt-3 text-2xl font-semibold">
        ✏️ Éditer le livrable
      </h1>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        <span className="font-mono">{deliv.kind as string}</span> · produit le{" "}
        {new Date(deliv.created_at as string).toLocaleString("fr-FR")} · agent{" "}
        <span className="font-mono">{deliv.agent_key as string}</span>
      </p>
      <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
        ⚠ L&apos;édition manuelle écrase la sortie originale de l&apos;agent.
        Les agents en aval liront ta version éditée.
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
