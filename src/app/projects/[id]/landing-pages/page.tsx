import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createLandingPage } from "./actions";
import { safeDecode } from "@/lib/safe-decode";
import { TEMPLATES, type TemplateId } from "@/lib/landing-page-schema";
import DeleteLandingPageButton from "./delete-landing-page-button";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  generating: "Génération…",
  ready: "Prêt",
  published: "Publié",
  archived: "Archivé",
};

export default async function LandingPagesIndex({
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

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .order("name");

  const { data: lps } = await supabase
    .from("landing_pages")
    .select("id, title, template_id, status, updated_at")
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  const createAction = createLandingPage.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href={`/projects/${id}`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← {project.name}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">Landing pages</h1>
      <p className="mt-1 text-[var(--color-muted-foreground)]">
        Brief LP + 2 versions A/B (style 80/20 marketing agency) + chat refine.
        Publication Unbounce à venir.
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {safeDecode(sp.error)}
        </div>
      )}

      {/* Create new LP */}
      <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Nouvelle landing page</h2>
        <form action={createAction} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Titre (optionnel)
            </label>
            <input
              name="title"
              placeholder="Ex : LP assurance-vie Lux — Q3 2026"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Structure (template)
            </label>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {(Object.keys(TEMPLATES) as TemplateId[]).map((tid) => (
                <TemplateChoice
                  key={tid}
                  value={tid}
                  label={TEMPLATES[tid].label}
                  desc={TEMPLATES[tid].short}
                  best_for={TEMPLATES[tid].best_for}
                  defaultChecked={tid === "trust-funnel"}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Marque (optionnel)
              </label>
              <select
                name="brand_id"
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">— Aucune —</option>
                {(brands ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Région
              </label>
              <input
                name="region"
                defaultValue="international"
                placeholder="international, ile_de_france, paca…"
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Brief court (objectif, audience, offre — l&apos;IA s&apos;appuie aussi sur ta knowledge base)
            </label>
            <textarea
              name="user_input"
              rows={4}
              placeholder="Ex : Capturer leads pour assurance-vie luxembourgeoise. Cible patrimoine 250k+ €. Hook sécurité. CTA → form qualifié."
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
              Créer le brouillon
            </button>
          </div>
        </form>
      </section>

      {/* Existing LPs */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {lps && lps.length > 0
            ? `${lps.length} landing page${lps.length > 1 ? "s" : ""}`
            : "Aucune landing page pour l'instant"}
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {lps?.map((lp) => (
            <div
              key={lp.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)]"
            >
              <Link
                href={`/projects/${id}/landing-pages/${lp.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {lp.title || "LP sans titre"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {TEMPLATES[lp.template_id as TemplateId]?.label ??
                      lp.template_id}
                    {" • "}
                    {STATUS_LABELS[lp.status] ?? lp.status}
                    {" • "}
                    {new Date(lp.updated_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span className="text-[var(--color-muted-foreground)]">→</span>
              </Link>
              <DeleteLandingPageButton
                projectId={id}
                lpId={lp.id}
                title={lp.title || "LP sans titre"}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function TemplateChoice({
  value,
  label,
  desc,
  best_for,
  defaultChecked,
}: {
  value: string;
  label: string;
  desc: string;
  best_for: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 transition has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-card)]">
      <input
        type="radio"
        name="template_id"
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
        required
      />
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        {desc}
      </div>
      <div className="mt-2 text-[10px] italic text-[var(--color-muted-foreground)]">
        {best_for}
      </div>
    </label>
  );
}
