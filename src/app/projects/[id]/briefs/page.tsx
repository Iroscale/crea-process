import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBrief } from "./actions";
import { safeDecode } from "@/lib/safe-decode";
import DeleteBriefButton from "./delete-brief-button";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  ready: "Prêt à générer",
  generating: "Génération en cours",
  done: "Terminé",
  archived: "Archivé",
};

const MODE_LABELS: Record<string, string> = {
  upload: "Upload inspirations",
  chat: "Chat avec l'IA",
  hybrid: "Hybride (chat + upload)",
};

export default async function BriefsPage({
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

  const { data: briefs } = await supabase
    .from("briefs")
    .select("id, title, mode, status, updated_at")
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  const createAction = createBrief.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href={`/projects/${id}`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← {project.name}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">Briefs</h1>
      <p className="mt-1 text-[var(--color-muted-foreground)]">
        Chaque brief = une demande de création. Choisis la méthode qui te
        correspond.
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {safeDecode(sp.error)}
        </div>
      )}

      <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Nouveau brief</h2>
        <form action={createAction} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Titre (optionnel)
            </label>
            <input
              name="title"
              placeholder="Ex : Lancement été — promo -30%"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Méthode
            </label>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <ModeChoice
                value="upload"
                title="Upload"
                desc="Tu as des créa concurrentes à montrer en référence."
                defaultChecked
              />
              <ModeChoice
                value="chat"
                title="Chat"
                desc="Tu décris ce que tu veux, l'IA te pose des questions."
              />
              <ModeChoice
                value="hybrid"
                title="Hybride"
                desc="Upload + chat pour affiner ensemble."
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Brief court (optionnel — tu pourras enrichir après)
            </label>
            <textarea
              name="user_input"
              rows={3}
              placeholder="Ex : Veux pousser notre nouveau parfum, cible 25-35 femmes urbaines, ton premium et désirable."
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
              Démarrer le brief
            </button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {briefs && briefs.length > 0
            ? `${briefs.length} brief${briefs.length > 1 ? "s" : ""}`
            : "Aucun brief pour l'instant"}
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {briefs?.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)]"
            >
              <Link
                href={`/projects/${id}/briefs/${b.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {b.title || "Brief sans titre"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {MODE_LABELS[b.mode]} • {STATUS_LABELS[b.status]} •{" "}
                    {new Date(b.updated_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span className="text-[var(--color-muted-foreground)]">→</span>
              </Link>
              <DeleteBriefButton
                projectId={id}
                briefId={b.id}
                briefTitle={b.title || "Brief sans titre"}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function ModeChoice({
  value,
  title,
  desc,
  defaultChecked,
}: {
  value: string;
  title: string;
  desc: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 transition has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-card)]">
      <input
        type="radio"
        name="mode"
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
        required
      />
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        {desc}
      </div>
    </label>
  );
}
