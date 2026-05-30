import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MEMORY_SLUGS,
  MEMORY_TITLES,
  type MemorySlug,
} from "@/lib/agents";
import { isAgencyActivated } from "@/lib/agency";
import AgencyNav from "../_components/agency-nav";

export default async function MemoryIndex({
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
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const profile = await isAgencyActivated(supabase, id);
  if (!profile) redirect(`/projects/${id}/agency`);

  const { data: rows } = await supabase
    .from("client_memory")
    .select("slug, content_md, version, updated_at")
    .eq("project_id", id);

  const byId = new Map<string, { content_md: string; version: number; updated_at: string }>();
  for (const r of rows ?? []) {
    byId.set(r.slug as string, {
      content_md: (r.content_md as string) ?? "",
      version: (r.version as number) ?? 1,
      updated_at: r.updated_at as string,
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/memory" />
      <h1 className="text-3xl font-semibold">🧠 Mémoire client</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Les 7 fichiers que tous les agents lisent à chaque appel. Éditable à la
        main — chaque enregistrement bump la version.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {MEMORY_SLUGS.map((slug) => {
          const row = byId.get(slug);
          const chars = row?.content_md.length ?? 0;
          const preview = row
            ? (row.content_md.split("\n").slice(1, 5).join(" ").slice(0, 180) ||
              "(vide)")
            : "(non initialisée)";
          return (
            <Link
              key={slug}
              href={`/projects/${id}/agency/memory/${slug}`}
              className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {slug}
                  </div>
                  <h2 className="mt-1 text-sm font-semibold">
                    {MEMORY_TITLES[slug as MemorySlug]}
                  </h2>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                  v{row?.version ?? "-"} · {chars} c
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-[var(--color-muted-foreground)]">
                {preview}
              </p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
