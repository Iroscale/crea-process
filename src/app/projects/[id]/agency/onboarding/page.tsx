import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgencyActivated, listDocuments } from "@/lib/agency";
import AgencyNav from "../_components/agency-nav";
import {
  saveOnboardingAction,
  ingestOnboardingAction,
} from "./actions";
import { uploadDocumentsAction } from "../documents/actions";
import SubmitButton from "../../briefs/[bid]/submit-button";
import RunPoller from "../_components/run-poller";

// L'ingestion orchestrator (after()) peut durer plusieurs minutes.
export const maxDuration = 300;

interface OnboardingData {
  marche?: string;
  contact_op?: string;
  mission?: {
    business_model?: string;
    objectif_principal?: string;
    cible_precise?: string;
    action_recherchee?: string;
    stade_marche?: string;
  };
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
    docs_ok?: string;
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

  // Dernier run d'ingestion (orchestrator) — pour le poller + les bannières.
  const { data: lastIngestRun } = await supabase
    .from("agent_runs")
    .select("id, status, started_at, error_message")
    .eq("project_id", id)
    .eq("step_key", "onboarding")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ingestRunning = lastIngestRun?.status === "running";
  const save = saveOnboardingAction.bind(null, id);
  const ingest = ingestOnboardingAction.bind(null, id);
  const uploadDocs = uploadDocumentsAction.bind(null, id);

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
      {ingestRunning && (
        <RunPoller
          projectId={id}
          stepKey="onboarding"
          startedAt={lastIngestRun?.started_at ?? null}
        />
      )}
      {!ingestRunning && lastIngestRun?.status === "failed" && (
        <Banner kind="error">
          ❌ L&apos;ingestion a échoué : {lastIngestRun.error_message ?? "erreur inconnue"} — relance-la en bas de page.
        </Banner>
      )}
      {(sp.ingested || (!ingestRunning && lastIngestRun?.status === "done")) && (
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
              href={`/projects/${id}/agency/steps/onboarding/apply`}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              📝 Appliquer à client-profile.md (preview diff)
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
      {sp.docs_ok && (
        <Banner kind="success">{decodeURIComponent(sp.docs_ok)}</Banner>
      )}

      {/* ── 📎 Documents transmis par le client (upload direct) ─────────── */}
      {/* Section AUTONOME (hors du form principal — les forms HTML ne
          peuvent pas s'imbriquer). */}
      <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          📎 Documents transmis par le client
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          PDF / DOCX / TXT — texte extrait automatiquement et injecté dans le
          contexte de tous les agents. Images également conservées (pas
          d&apos;extraction). Coche « cœur » pour les documents fondateurs
          (ICP, brief client) : ils sont injectés EN ENTIER.
        </p>

        {/* Upload direct */}
        <form
          action={uploadDocs}
          className="mt-4 flex flex-col gap-3"
          encType="multipart/form-data"
        >
          <input type="hidden" name="return_to" value="onboarding" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Catégorie
              </span>
              <select
                name="category"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="">— libre —</option>
                <option value="icp">🎯 Document ICP</option>
                <option value="fiche-produit">📄 Fiche produit</option>
                <option value="plaquette">📑 Plaquette commerciale</option>
                <option value="old-ad">🎬 Ancienne ad</option>
                <option value="transcript">🎙️ Transcript / call</option>
                <option value="screenshot-lp">🖼️ Screenshot LP</option>
                <option value="autre">📎 Autre</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Description (contexte)
              </span>
              <input
                name="description"
                placeholder="Ex : ICP V2 reçu du client le 12 juin"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Fichier(s) *
            </span>
            <input
              type="file"
              name="files"
              multiple
              required
              className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-3 py-4 text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--color-primary-foreground)]"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" name="is_core" className="h-4 w-4" />
              <span>
                ⭐ Document <strong>cœur</strong> (ICP, brief client) — injecté
                EN ENTIER chez les agents
              </span>
            </label>
            <SubmitButton pendingLabel="Upload + extraction…">
              📤 Uploader
            </SubmitButton>
          </div>
        </form>

        {/* Documents déjà uploadés */}
        {docs.length > 0 && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-3">
            <div className="flex flex-wrap gap-1.5">
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
                  {d.is_core ? "⭐" : d.is_active ? "🟢" : "🔕"} {d.file_name}{" "}
                  <span className="text-[var(--color-muted-foreground)]">
                    · {d.category ?? "—"}
                  </span>
                </span>
              ))}
              <Link
                href={`/projects/${id}/agency/documents`}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] hover:bg-[var(--color-accent)]"
              >
                gérer (cœur, désactiver, supprimer) →
              </Link>
            </div>
          </div>
        )}
      </section>

      <form action={save} className="mt-8 flex flex-col gap-6">
        <Section
          title="⭐ Mission de l'agence — non négociable"
          subtitle="Ces 5 signaux conditionnent TOUS les livrables en aval (market research, angles, copy, LP, campagnes). Sois explicite. Si tu hésites, mieux vaut laisser vide que mettre une approximation."
          highlight
        >
          <Field label="Type de business *">
            <select
              name="business_model"
              defaultValue={od.mission?.business_model ?? ""}
              required
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="">— choisir —</option>
              <option value="B2C">B2C (particulier final)</option>
              <option value="B2B">B2B (entreprise/professionnel)</option>
              <option value="B2B2C">
                B2B2C (on s&apos;adresse au distributeur ET au consommateur)
              </option>
              <option value="Mixte">
                Mixte (B2B + B2C selon les campagnes)
              </option>
            </select>
          </Field>
          <Field label="Stade marché">
            <select
              name="stade_marche"
              defaultValue={od.mission?.stade_marche ?? ""}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="">— non précisé —</option>
              <option value="émergent">Émergent — peu de concurrents</option>
              <option value="en croissance">
                En croissance — éducation marché
              </option>
              <option value="mature">Mature — bataille des angles</option>
              <option value="saturé">
                Saturé — différenciation forte requise
              </option>
            </select>
          </Field>
          <Field label="Objectif principal *" full>
            <input
              name="objectif_principal"
              defaultValue={od.mission?.objectif_principal ?? ""}
              required
              placeholder="Ex (B2B) : Générer 30 RDV qualifiés/mois auprès de DRH de PME 50-500 personnes pour notre solution de prévoyance collective."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Cible précise (qui exactement ?) *" full>
            <textarea
              name="cible_precise"
              rows={3}
              defaultValue={od.mission?.cible_precise ?? ""}
              required
              placeholder={
                "Ex B2B : Fonction (DRH, dirigeant PME, courtier…) + secteur + taille entreprise + douleur principale.\nEx B2C : Sociodémo + patrimoine + situation de vie + déclencheur d'achat."
              }
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field
            label="Action recherchée (ce que le prospect doit faire) *"
            full
          >
            <input
              name="action_recherchee"
              defaultValue={od.mission?.action_recherchee ?? ""}
              required
              placeholder="Ex : prendre un RDV de 30 min · faire un simulateur en ligne · demander un devis · télécharger un livre blanc + opt-in"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

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
        {ingestRunning ? (
          <p className="mt-3 text-right text-sm text-sky-300">
            🤖 Ingestion en cours — la page s&apos;actualisera automatiquement.
          </p>
        ) : (
          <form action={ingest} className="mt-3 flex justify-end">
            <SubmitButton
              pendingLabel="Lancement…"
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              ▶ Lancer l&apos;ingestion
            </SubmitButton>
          </form>
        )}
      </section>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
  highlight = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight
          ? "border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5"
          : "border-[var(--color-border)] bg-[var(--color-card)]"
      }`}
    >
      <h2
        className={`text-xs font-semibold uppercase tracking-wider ${
          highlight
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-muted-foreground)]"
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
          {subtitle}
        </p>
      )}
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
