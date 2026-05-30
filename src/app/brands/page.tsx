import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { createBrand } from "./actions";
import { safeDecode } from "@/lib/safe-decode";

export default async function BrandsPage({
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

  const { data: brands } = await supabase
    .from("brands")
    .select(
      "id, name, description, primary_colors, system_prompt, updated_at"
    )
    .order("updated_at", { ascending: false });

  // Count resources per brand for a quick stat
  const brandIds = (brands ?? []).map((b) => b.id);
  let resourceCounts = new Map<string, number>();
  if (brandIds.length > 0) {
    const { data: rs } = await supabase
      .from("brand_resources")
      .select("brand_id")
      .in("brand_id", brandIds);
    if (rs) {
      resourceCounts = rs.reduce((acc, r) => {
        acc.set(r.brand_id, (acc.get(r.brand_id) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/projects"
            className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            ← Crea Process · Projets
          </Link>
          <h1 className="mt-1 text-3xl font-semibold">Marques</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Une marque = la DA réutilisable. Tu y centralises couleurs, typo,
            ton, mission, ressources (logos, brand book, landing pages…). Au
            moment de créer un brief, tu choisis la marque et tous les visuels
            respectent sa DA.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Nouvelle marque</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Crée la marque avec son nom, puis enrichis sa DA et ses ressources sur
          la page d&apos;édition.
        </p>

        {params.error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {safeDecode(params.error)}
          </div>
        )}

        <form
          action={createBrand}
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
        >
          <input
            name="name"
            required
            placeholder="Nom de la marque (ex: Crea Factory, Acme, Boursin)"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <button className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Créer la marque
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {brands && brands.length > 0
            ? `${brands.length} marque${brands.length > 1 ? "s" : ""}`
            : "Aucune marque"}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands?.map((b) => {
            const count = resourceCounts.get(b.id) ?? 0;
            const colors = (b.primary_colors as string[] | null) ?? [];
            const compiled = !!b.system_prompt;
            return (
              <Link
                key={b.id}
                href={`/brands/${b.id}`}
                className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition hover:border-[var(--color-primary)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold">{b.name}</div>
                  {colors.length > 0 && (
                    <div className="flex shrink-0 items-center -space-x-1">
                      {colors.slice(0, 4).map((c, i) => (
                        <span
                          key={i}
                          className="h-4 w-4 rounded-full border border-[var(--color-border)]"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {b.description && (
                  <div className="mt-1 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                    {b.description}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                  <span
                    className={`rounded-md px-1.5 py-0.5 ${
                      count > 0
                        ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                        : "bg-[var(--color-background)] text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    {count} ressource{count > 1 ? "s" : ""}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 ${
                      compiled
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                    title={
                      compiled
                        ? "Le system prompt de la marque a été compilé"
                        : "Pas encore compilé — clique pour terminer"
                    }
                  >
                    {compiled ? "✓ compilé" : "à compiler"}
                  </span>
                  <span className="ml-auto text-[var(--color-muted-foreground)]">
                    {new Date(b.updated_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
