import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MEMORY_EXPORT_ORDER,
  MEMORY_TITLES,
  concatMemory,
  type MemorySlug,
} from "@/lib/agents";
import { isAgencyActivated } from "@/lib/agency";
import AgencyNav from "../_components/agency-nav";

export default async function ExportPage({
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
  const map: Partial<Record<MemorySlug, string>> = {};
  const versions: Partial<Record<MemorySlug, { v: number; at: string }>> = {};
  for (const r of rows ?? []) {
    map[r.slug as MemorySlug] = (r.content_md as string) ?? "";
    versions[r.slug as MemorySlug] = {
      v: (r.version as number) ?? 1,
      at: r.updated_at as string,
    };
  }
  const totalChars = Object.values(map).reduce((acc, m) => acc + (m?.length ?? 0), 0);
  const preview = concatMemory(map).slice(0, 4000);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/export" />
      <h1 className="text-3xl font-semibold">📤 Export mémoire</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Télécharge les 7 fichiers concaténés en un seul markdown portable.
        Versionnable, copiable, ré-importable plus tard.
      </p>

      <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="text-sm font-semibold">Sommaire</h2>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {MEMORY_EXPORT_ORDER.map((slug) => (
            <li
              key={slug}
              className="flex items-baseline justify-between border-b border-[var(--color-border)] py-1 text-xs"
            >
              <span>
                <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                  {slug}
                </span>{" "}
                · {MEMORY_TITLES[slug]}
              </span>
              <span className="text-[var(--color-muted-foreground)]">
                v{versions[slug]?.v ?? "—"} · {map[slug]?.length ?? 0} c
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-[var(--color-muted-foreground)]">
            Total : <strong>{totalChars}</strong> caractères
          </span>
          <a
            href={`/projects/${id}/agency/export/download`}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            download
          >
            ⬇ Télécharger le markdown
          </a>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Aperçu (4000 premiers caractères)</h2>
        <pre className="mt-2 max-h-[500px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-[12px] leading-relaxed">
          {preview || "(mémoire vide)"}
        </pre>
      </section>
    </main>
  );
}
