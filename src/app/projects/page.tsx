import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { createProject } from "./actions";
import { safeDecode } from "@/lib/safe-decode";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            Crea Process
          </Link>
          <h1 className="mt-1 text-3xl font-semibold">Mes projets</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Connecté en tant que {user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/brands"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
          >
            Marques
          </Link>
          <Link
            href="/analyse"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
          >
            Analyses
          </Link>
          <form action={logout}>
            <button className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]">
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-5">
        <div>
          <h2 className="text-base font-semibold">🆕 Nouveau client Agency OS</h2>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Wizard complet : création projet + activation pipeline 10 étapes +
            ingestion onboarding. Pour un onboarding flash, c&apos;est l&apos;entrée.
          </p>
        </div>
        <Link
          href="/agency/new"
          className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          Démarrer le wizard →
        </Link>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Nouveau projet (rapide, créa-only)</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Un projet = un produit ou une marque. Tu uploaderas dedans la
          knowledge base (docs produit, scripts, ads existantes).
        </p>

        {params.error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {safeDecode(params.error)}
          </div>
        )}

        <form action={createProject} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input
            name="name"
            required
            placeholder="Nom du projet"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <input
            name="description"
            placeholder="Description courte (optionnel)"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <button className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Créer
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {projects && projects.length > 0
            ? `${projects.length} projet${projects.length > 1 ? "s" : ""}`
            : "Aucun projet"}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition hover:border-[var(--color-primary)]"
            >
              <div className="text-base font-semibold">{p.name}</div>
              {p.description && (
                <div className="mt-1 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                  {p.description}
                </div>
              )}
              <div className="mt-3 text-xs text-[var(--color-muted-foreground)]">
                Mis à jour {new Date(p.updated_at).toLocaleDateString("fr-FR")}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
