import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MEMORY_SLUGS,
  MEMORY_TITLES,
  MEMORY_TEMPLATES,
  MEMORY_EXPORT_ORDER,
  type MemorySlug,
} from "@/lib/agents";
import { isAgencyActivated } from "@/lib/agency";
import AgencyNav from "../../_components/agency-nav";
import { saveMemoryAction } from "../actions";
import SubmitButton from "../../../briefs/[bid]/submit-button";

export default async function MemoryEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id, slug } = await params;
  const sp = await searchParams;
  if (!(MEMORY_SLUGS as readonly string[]).includes(slug)) notFound();

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

  const { data: row } = await supabase
    .from("client_memory")
    .select("content_md, version, updated_at, updated_by")
    .eq("project_id", id)
    .eq("slug", slug)
    .maybeSingle();

  const content =
    (row?.content_md as string) ?? MEMORY_TEMPLATES[slug as MemorySlug];
  const version = (row?.version as number) ?? 0;
  const updated = (row?.updated_at as string) ?? null;

  const save = saveMemoryAction.bind(null, id, slug);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/memory" />
      <Link
        href={`/projects/${id}/agency/memory`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Mémoire
      </Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {slug}
          </div>
          <h1 className="mt-1 text-3xl font-semibold">
            🧠 {MEMORY_TITLES[slug as MemorySlug]}
          </h1>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            v{version} · {updated ? new Date(updated).toLocaleString("fr-FR") : "—"}
          </p>
        </div>
      </div>

      {sp.saved && (
        <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          Enregistré · nouvelle version v{version}.
        </div>
      )}
      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form action={save} className="mt-6 flex flex-col gap-3">
        <textarea
          name="content_md"
          defaultValue={content}
          rows={28}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-[13px] leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Le format doit respecter le schéma documenté dans{" "}
            <span className="font-mono">.claude/memory-schema.md</span>.
            Toute édition bump la version.
          </p>
          <SubmitButton pendingLabel="Enregistrement…">
            💾 Enregistrer (v{version + 1})
          </SubmitButton>
        </div>
      </form>

      {/* Navigation prev/next entre fichiers */}
      <MemoryNav projectId={id} currentSlug={slug as MemorySlug} />
    </main>
  );
}

function MemoryNav({
  projectId,
  currentSlug,
}: {
  projectId: string;
  currentSlug: MemorySlug;
}) {
  const idx = MEMORY_EXPORT_ORDER.findIndex((s) => s === currentSlug);
  const prev = idx > 0 ? MEMORY_EXPORT_ORDER[idx - 1] : null;
  const next =
    idx >= 0 && idx < MEMORY_EXPORT_ORDER.length - 1
      ? MEMORY_EXPORT_ORDER[idx + 1]
      : null;
  return (
    <section className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-6">
      <div>
        {prev ? (
          <Link
            href={`/projects/${projectId}/agency/memory/${prev}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm hover:bg-[var(--color-accent)]"
          >
            ◀ {MEMORY_TITLES[prev]}
          </Link>
        ) : (
          <Link
            href={`/projects/${projectId}/agency/memory`}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            ← Liste mémoire
          </Link>
        )}
      </div>
      <Link
        href={`/projects/${projectId}/agency`}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent)]"
      >
        🗺️ Pipeline
      </Link>
      <div>
        {next && (
          <Link
            href={`/projects/${projectId}/agency/memory/${next}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            {MEMORY_TITLES[next]} ▶
          </Link>
        )}
      </div>
    </section>
  );
}
