import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runConceptResearch } from "./actions";
import { safeDecode } from "@/lib/safe-decode";
import SubmitButton from "../briefs/[bid]/submit-button";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  researching: "Recherche…",
  done: "Terminé",
  failed: "Échec",
};

export default async function ConceptResearchIndex({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
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

  const { data: runs } = await supabase
    .from("concept_research")
    .select("id, niche, status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const runAction = runConceptResearch.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href={`/projects/${id}`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← {project.name}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">🔭 Recherche de concepts</h1>
      <p className="mt-1 max-w-2xl text-[var(--color-muted-foreground)]">
        Ne manque jamais d&apos;angles marketing. L&apos;IA fait une vraie
        recherche terrain (Reddit, blogs, forums, concurrents, tendances) et te
        sort des angles, pain points et questions d&apos;audience — avec
        sources.
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {safeDecode(sp.error)}
        </div>
      )}

      <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Nouvelle recherche</h2>
        <form action={runAction} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Niche / sujet à creuser
            </label>
            <textarea
              name="niche"
              rows={3}
              required
              placeholder="Ex : assurance-vie luxembourgeoise pour patrimoine 250k€+ · ou : épargne retraite des indépendants français · ou : crowdfunding immobilier suisse"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
              Plus c&apos;est précis, meilleurs sont les angles. L&apos;IA
              utilise aussi ta knowledge base si elle est structurée.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              💡 ~30-90s — l&apos;IA fait 4-8 recherches web réelles
            </p>
            <SubmitButton
              pendingLabel="🔭 Recherche web en cours (30-90s)…"
              className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Lancer la recherche
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {runs && runs.length > 0
            ? `${runs.length} recherche${runs.length > 1 ? "s" : ""}`
            : "Aucune recherche encore"}
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {runs?.map((r) => (
            <Link
              key={r.id}
              href={`/projects/${id}/concept-research/${r.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.niche}</div>
                <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {STATUS_LABELS[r.status] ?? r.status} •{" "}
                  {new Date(r.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <span className="text-[var(--color-muted-foreground)]">→</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
