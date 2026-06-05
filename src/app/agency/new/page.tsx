import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClientAction } from "./actions";
import SubmitButton from "../../projects/[id]/briefs/[bid]/submit-button";

export default async function NewClientWizardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <Link
        href="/"
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Base amirale
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">
        🆕 Onboarder un nouveau client
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Un seul formulaire pour : créer le projet, activer Agency OS, et
        amorcer la mémoire à partir de ce que tu as déjà (récap Fathom,
        landing pages, contraintes). Tu pourras tout compléter ensuite — rien
        de bloquant ici.
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form action={createClientAction} className="mt-8 flex flex-col gap-6">
        {/* Identité */}
        <Section
          n={1}
          title="Identité"
          subtitle="Indispensable. Le reste peut être complété ensuite."
        >
          <Field label="Nom du client *">
            <input
              name="name"
              required
              placeholder="Ex : LuxAccess Patrimoine"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Description courte (interne)">
            <input
              name="description"
              placeholder="Ex : Distributeur d'assurance-vie luxembourgeoise pour patrimoine 250k+"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Verticale *">
            <select
              name="vertical"
              defaultValue="assurance-vie-lux"
              required
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="assurance-vie-lux">Assurance-vie luxembourgeoise</option>
              <option value="scpi">SCPI</option>
              <option value="defisc">Défiscalisation</option>
              <option value="banque-privee">Banque privée</option>
              <option value="autre">Autre</option>
            </select>
          </Field>
          <Field label="Marché">
            <select
              name="marche"
              defaultValue="France"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              {["France", "Suisse", "Belgique", "International"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact opérationnel" full>
            <input
              name="contact_op"
              placeholder="Prénom Nom · rôle · email"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* ⭐ Mission de l'agence — non négociable */}
        <Section
          n={2}
          title="⭐ Mission de l'agence (non négociable)"
          subtitle="Ces 5 signaux conditionnent TOUS les agents en aval. Si tu hésites, mieux vaut laisser vide que de mettre une approximation que les agents prendront pour parole d'évangile."
        >
          <Field label="Type de business *">
            <select
              name="business_model"
              required
              defaultValue=""
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="">— choisir —</option>
              <option value="B2C">B2C (particulier final)</option>
              <option value="B2B">B2B (entreprise / pro)</option>
              <option value="B2B2C">B2B2C (distributeur + consommateur)</option>
              <option value="Mixte">Mixte</option>
            </select>
          </Field>
          <Field label="Stade marché">
            <select
              name="stade_marche"
              defaultValue=""
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="">— non précisé —</option>
              <option value="émergent">Émergent</option>
              <option value="en croissance">En croissance</option>
              <option value="mature">Mature</option>
              <option value="saturé">Saturé</option>
            </select>
          </Field>
          <Field label="Objectif principal *" full>
            <input
              name="objectif_principal"
              required
              placeholder="Ex (B2B) : 30 RDV qualifiés/mois auprès de DRH de PME 50-500 personnes"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Cible précise (qui exactement ?) *" full>
            <textarea
              name="cible_precise"
              rows={3}
              required
              placeholder={
                "Ex B2B : fonction + secteur + taille + douleur principale.\nEx B2C : sociodémo + patrimoine + situation de vie + déclencheur."
              }
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Action recherchée (ce que le prospect doit faire) *" full>
            <input
              name="action_recherchee"
              required
              placeholder="Ex : prendre un RDV · faire un simulateur · demander un devis · télécharger un livre blanc"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* Onboarding */}
        <Section
          n={3}
          title="Onboarding initial"
          subtitle="Ce que tu as déjà du client. Le minimum à fournir pour pouvoir lancer l'analyse marché ensuite : un récap Fathom + une URL de LP actuelle."
        >
          <Field label="Récap Fathom (appel d'onboarding)" full>
            <textarea
              name="fathom_recap"
              rows={6}
              placeholder="Colle ici la transcription ou la synthèse de l'appel d'onboarding."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Landing pages actuelles (1 URL par ligne)" full>
            <textarea
              name="lp_urls"
              rows={3}
              placeholder={"https://exemple.com/offre\nhttps://exemple.com/simulateur"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Documents transmis (synthèse rapide)" full>
            <textarea
              name="docs_summary"
              rows={4}
              placeholder="Ex : Fiche produit (PDF) · Plaquette commerciale · Anciennes ads Meta."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* Contraintes */}
        <Section
          n={4}
          title="Contraintes"
          subtitle="Ce qui borne le ton, le copy et les claims dès le départ. Les agents les liront en permanence."
        >
          <Field label="Réglementaires" full>
            <textarea
              name="contraintes_regle"
              rows={3}
              placeholder="Ex : ACPR 2019-R-01 applicable, mention 'risque de perte en capital' obligatoire."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Opérationnelles" full>
            <textarea
              name="contraintes_ops"
              rows={3}
              placeholder="Ex : pas de mention du fonds X sur Meta, fondateur dispo le mardi et le jeudi."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Tonales" full>
            <textarea
              name="contraintes_ton"
              rows={3}
              placeholder="Ex : pas d'urgence artificielle, pas de superlatifs, ton pédagogue posé."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* Option auto-ingest */}
        <Section
          n={5}
          title="Lancer l'ingestion tout de suite ?"
          subtitle="Si tu as bien rempli le récap Fathom, l'orchestrator peut tout de suite produire la synthèse d'onboarding et patcher client-profile.md. Sinon décoche, tu lanceras quand prêt."
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="ingest_now"
              defaultChecked
              className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-background)]"
            />
            <span>
              Oui, dès la création — me redirige sur la page d&apos;onboarding
              prête à ingérer
            </span>
          </label>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-6">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Après création, tu seras dirigé vers la page d&apos;onboarding ou la
            pipeline selon ce que tu as rempli. Tout sera ensuite éditable.
          </p>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              Annuler
            </Link>
            <SubmitButton
              pendingLabel="Création en cours…"
              className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              🚀 Créer & activer Agency OS
            </SubmitButton>
          </div>
        </div>
      </form>

      {/* Aperçu du process à venir */}
      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          📋 Ce qui se passe ensuite
        </h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ["📥", "Onboarding", "L'orchestrator ingère ce que tu as fourni → synthèse d'onboarding + patches mémoire"],
            ["🔍", "01 · Market research", "3 ICP sourcés via web search (Reddit, Meta Ad Library, presse) — gate humain"],
            ["🎯", "02 · Angles & promesses", "Promesse maîtresse + 6-12 angles + hooks prêts"],
            ["🧩", "03 · Broad Mix", "Matrice persona × angle × format × niveau funnel"],
            ["🎬", "04 · Founder ads", "3 scripts + humanisation prompteur + plan de tournage — gate humain"],
            ["🖼️", "05 · Concepts image", "10 concepts publicitaires — gate humain"],
            ["🪜", "06 · Landing page", "LP complète — gate humain"],
            ["❓", "07 · Quiz funnel", "Spec quiz + scoring + intégrations — gate humain"],
            ["✂️", "08 · Brief montage", "EDL + sous-titres + sound design — gate humain"],
            ["📡", "09 · Tracking", "GTM, Meta CAPI, Google Ads, Datablaster"],
            ["🚀", "10 · Campaign setup", "Structure Meta + Google, plan de test"],
            ["♻️", "Rétrospective", "Distille les perfs Datablaster en learnings"],
          ].map(([emoji, title, desc]) => (
            <li
              key={title}
              className="flex gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs"
            >
              <span className="text-lg leading-none">{emoji}</span>
              <div>
                <div className="font-semibold">{title}</div>
                <div className="text-[var(--color-muted-foreground)]">{desc}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
          Tu pourras à tout moment lancer un check ⚖️ conformité, éditer la 🧠
          mémoire à la main, ou exporter 📤 la mémoire en markdown portable.
        </p>
      </section>
    </main>
  );
}

function Section({
  n,
  title,
  subtitle,
  children,
}: {
  n: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-[var(--color-primary)]">
          {String(n).padStart(2, "0")}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        {subtitle}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
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
