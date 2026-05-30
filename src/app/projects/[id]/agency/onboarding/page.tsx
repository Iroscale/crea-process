import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgencyActivated, listDocuments } from "@/lib/agency";
import AgencyNav from "../_components/agency-nav";
import {
  saveOnboardingAction,
  ingestOnboardingAction,
} from "./actions";
import SubmitButton from "../../briefs/[bid]/submit-button";

interface OnboardingData {
  marche?: string;
  contact_op?: string;
  lp_urls?: string[];
  access?: { bm?: string; google_ads?: string; page_fb?: string; pixel?: string };
  contraintes?: { reglementaires?: string; operationnelles?: string; tonales?: string };
  fathom_recap?: string;
  docs_summary?: string;
}

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    ingested?: string;
    error?: string;
    just_created?: string;
    ready_to_ingest?: string;
  }>;
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

  const profile = await isAgencyActivated(supabase, id);
  if (!profile) redirect(`/projects/${id}/agency`);

  const od = (profile.onboarding_data as OnboardingData) ?? {};
  const docs = await listDocuments(supabase, {
    userId: user.id,
    projectId: id,
    onlyActive: false,
  });
  const save = saveOnboardingAction.bind(null, id);
  const ingest = ingestOnboardingAction.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/onboarding" />
      <h1 className="text-3xl font-semibold">📥 Onboarding</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Centralise tout ce que le client a transmis. Quand c&apos;est rempli,
        clique « Faire ingérer » pour que l&apos;orchestrator produise la
        synthèse et patche la mémoire.
      </p>

      {sp.just_created && (
        <section className="mt-6 rounded-xl border-2 border-sky-500/40 bg-sky-500/5 p-5">
          <p className="text-sm font-semibold text-sky-300">
            ✅ Client créé. Tu peux compléter l&apos;onboarding ci-dessous,
            puis cliquer « Faire ingérer » en bas pour lancer l&apos;orchestrator.
          </p>
        </section>
      )}
      {sp.ready_to_ingest && (
        <section className="mt-6 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
          <p className="text-sm font-semibold text-emerald-300">
            🚀 Tout est prêt — descends en bas et clique « Lancer
            l&apos;ingestion » pour que l&apos;orchestrator produise la synthèse.
          </p>
        </section>
      )}
      {sp.saved && (
        <Banner kind="success">Données d&apos;onboarding sauvegardées.</Banner>
      )}
      {sp.ingested && (
        <section className="mt-6 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-5">
          <p className="text-sm font-semibold text-emerald-300">
            ✅ Synthèse produite par l&apos;orchestrator
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Va appliquer le patch sur <span className="font-mono">client-profile.md</span> avant
            de lancer l&apos;étape suivante.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/projects/${id}/agency/memory/client-profile`}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              📝 Appliquer à client-profile.md
            </Link>
            <Link
              href={`/projects/${id}/agency/steps/01-market-research`}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
            >
              ▶ Aller à l&apos;étape 01 — Market research
            </Link>
            <Link
              href={`/projects/${id}/agency`}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
            >
              🗺️ Pipeline
            </Link>
          </div>
        </section>
      )}
      {sp.error && <Banner kind="error">{decodeURIComponent(sp.error)}</Banner>}

      <form action={save} className="mt-8 flex flex-col gap-6">
        <Section title="Cadre">
          <Field label="Verticale">
            <select
              name="vertical"
              defaultValue={profile.vertical ?? "assurance-vie-lux"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              {["assurance-vie-lux", "scpi", "defisc", "banque-privee", "autre"].map(
                (v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                )
              )}
            </select>
          </Field>
          <Field label="Marché">
            <select
              name="marche"
              defaultValue={od.marche ?? "France"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              {["France", "Suisse", "Belgique", "International"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact opérationnel">
            <input
              name="contact_op"
              defaultValue={od.contact_op ?? ""}
              placeholder="Prénom Nom · rôle · email"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        <Section title="Landing pages actuelles">
          <Field label="URLs (une par ligne)">
            <textarea
              name="lp_urls"
              rows={3}
              defaultValue={(od.lp_urls ?? []).join("\n")}
              placeholder={"https://exemple.com/offre\nhttps://exemple.com/simulateur"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        <Section title="Accès">
          <Field label="BM Meta">
            <input
              name="access_bm"
              defaultValue={od.access?.bm ?? ""}
              placeholder="ID + statut accès"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Google Ads">
            <input
              name="access_google"
              defaultValue={od.access?.google_ads ?? ""}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Page Facebook">
            <input
              name="access_page"
              defaultValue={od.access?.page_fb ?? ""}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Pixel / Mesure">
            <input
              name="access_pixel"
              defaultValue={od.access?.pixel ?? ""}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        <Section title="Contraintes">
          <Field label="Réglementaires" full>
            <textarea
              name="contraintes_regle"
              rows={3}
              defaultValue={od.contraintes?.reglementaires ?? ""}
              placeholder="Ex : ACPR 2019-R-01 applicable, mention 'risque de perte en capital' obligatoire."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Opérationnelles" full>
            <textarea
              name="contraintes_ops"
              rows={3}
              defaultValue={od.contraintes?.operationnelles ?? ""}
              placeholder="Ex : pas de mention du fonds X sur Meta, fondateur pas dispo le mercredi."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Tonales" full>
            <textarea
              name="contraintes_ton"
              rows={3}
              defaultValue={od.contraintes?.tonales ?? ""}
              placeholder="Ex : pas d'urgence artificielle, pas de superlatifs, pas de tutoiement."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        <Section title="📎 Documents transmis par le client">
          <div className="sm:col-span-2 -mt-1 mb-3 text-xs text-[var(--color-muted-foreground)]">
            PDF / DOCX / TXT — texte extrait automatiquement et injecté dans
            le contexte de tous les agents. Images également conservées (pas
            d&apos;extraction).
          </div>
          {docs.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap gap-1.5">
              {docs.map((d) => (
                <span
                  key={d.id}
                  className={`rounded-md border px-2 py-1 text-[11px] ${
                    d.is_active
                      ? "border-[var(--color-border)] bg-[var(--color-background)]"
                      : "border-[var(--color-border)] bg-[var(--color-background)] opacity-50"
                  }`}
                  title={d.description ?? ""}
                >
                  {d.is_active ? "🟢" : "🔕"} {d.file_name}{" "}
                  <span className="text-[var(--color-muted-foreground)]">
                    · {d.category ?? "—"}
                  </span>
                </span>
              ))}
              <Link
                href={`/projects/${id}/agency/documents`}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] hover:bg-[var(--color-accent)]"
              >
                gérer →
              </Link>
            </div>
          )}
        </Section>

        <Section title="Sources d'ingestion">
          <Field label="Récap Fathom (appel d'onboarding)" full>
            <textarea
              name="fathom_recap"
              rows={6}
              defaultValue={od.fathom_recap ?? ""}
              placeholder="Colle ici la transcription / le résumé Fathom."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Documents transmis (synthèse)" full>
            <textarea
              name="docs_summary"
              rows={6}
              defaultValue={od.docs_summary ?? ""}
              placeholder="Liste les documents reçus (fiche produit, plaquette, scripts existants…) avec une ligne de résumé chacun."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        <div className="flex justify-end">
          <SubmitButton pendingLabel="Enregistrement…">
            💾 Enregistrer l&apos;onboarding
          </SubmitButton>
        </div>
      </form>

      {/* Ingestion par orchestrator */}
      <section className="mt-12 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-primary)]">
          ⚙️ Faire ingérer par l&apos;orchestrator
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          L&apos;orchestrator lit tout ce que tu as rempli, produit la synthèse
          structurée et propose les patches à appliquer à client-profile.md +
          brand-voice.md + decisions-log.md.
        </p>
        <form action={ingest} className="mt-3 flex justify-end">
          <SubmitButton
            pendingLabel="Ingestion en cours (15-30s)…"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            ▶ Lancer l&apos;ingestion
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {title}
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const cls =
    kind === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : kind === "success"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : "border-sky-500/30 bg-sky-500/10 text-sky-300";
  return (
    <div className={`mt-6 rounded-md border p-3 text-sm ${cls}`}>{children}</div>
  );
}
