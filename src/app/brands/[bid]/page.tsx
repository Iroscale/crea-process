import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteBrand } from "../actions";
import {
  updateBrand,
  addManualResource,
  extractFromUrl,
} from "./actions";
import DeleteResourceButton from "./delete-resource-button";
import ScanLandingPanel from "./scan-landing-panel";
import LogoManager, { type LogoEntry } from "./logo-manager";
import BrandPreviewCard from "./brand-preview-card";
import { safeDecode } from "@/lib/safe-decode";

export default async function BrandEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ bid: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { bid } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, name, description, brand_voice, mission, target_audience, primary_colors, typography, visual_principles, do_say, dont_say, system_prompt, landing_page_url, updated_at"
    )
    .eq("id", bid)
    .maybeSingle();
  if (!brand) notFound();

  // Logos — fetch all variants + sign URLs in parallel
  const { data: logoRows } = await supabase
    .from("brand_logos")
    .select("id, label, storage_path, mime_type, is_default, created_at")
    .eq("brand_id", bid)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  const logos: LogoEntry[] = await Promise.all(
    (logoRows ?? []).map(async (l) => {
      const { data: signed } = await supabase.storage
        .from("brand_resources")
        .createSignedUrl(l.storage_path, 60 * 60);
      return {
        id: l.id,
        label: l.label,
        storage_path: l.storage_path,
        mime_type: l.mime_type,
        is_default: l.is_default,
        signed_url: signed?.signedUrl ?? null,
      };
    })
  );

  const defaultLogo = logos.find((l) => l.is_default) ?? logos[0] ?? null;

  const { data: resources } = await supabase
    .from("brand_resources")
    .select(
      "id, kind, label, source_url, source_filename, manual_text, scraped_text, extracted_text, ai_summary, created_at"
    )
    .eq("brand_id", bid)
    .order("created_at", { ascending: false });

  const updateAction = updateBrand.bind(null, bid);
  const addManualAction = addManualResource.bind(null, bid);
  const deleteBrandAction = deleteBrand.bind(null, bid);
  const extractAction = extractFromUrl.bind(null, bid);

  const colors = (brand.primary_colors as string[] | null) ?? [];
  const doSay = (brand.do_say as string[] | null) ?? [];
  const dontSay = (brand.dont_say as string[] | null) ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href="/brands"
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Marques
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{brand.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>
              Mis à jour {new Date(brand.updated_at).toLocaleDateString("fr-FR")}
            </span>
            {brand.system_prompt ? (
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                ✓ system prompt compilé
              </span>
            ) : (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-300">
                ⚠ à compiler (itération 2)
              </span>
            )}
          </div>
        </div>
        <form action={deleteBrandAction}>
          <button
            type="submit"
            className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          >
            Supprimer la marque
          </button>
        </form>
      </div>

      {sp.error && (
        <div className="mt-6 flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span className="flex-1">{safeDecode(sp.error)}</span>
          <Link
            href={`/brands/${bid}`}
            className="shrink-0 rounded border border-red-500/40 px-2 py-0.5 text-xs hover:bg-red-500/20"
          >
            Fermer
          </Link>
        </div>
      )}

      {/* Scan landing page — auto-fill DA */}
      <section className="mt-8 rounded-2xl border-2 border-[var(--color-primary)]/40 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent p-6">
        <div>
          <h2 className="text-lg font-semibold">
            ⚡ Définir la DA depuis une landing page
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--color-muted-foreground)]">
            Colle l&apos;URL d&apos;une page existante du client (homepage,
            landing produit, etc.). On scrape les couleurs, typographies, copy,
            headings ; Claude synthétise la DA structurée et on télécharge le
            logo automatiquement.
          </p>
        </div>

        <ScanLandingPanel
          action={extractAction}
          existingUrl={brand.landing_page_url ?? null}
        />
      </section>

      {/* Aperçu du brand design — visual recap */}
      <BrandPreviewCard
        name={brand.name}
        description={brand.description}
        mission={brand.mission}
        target_audience={brand.target_audience}
        brand_voice={brand.brand_voice}
        visual_principles={brand.visual_principles}
        typography={brand.typography}
        primary_colors={colors}
        do_say={doSay}
        dont_say={dontSay}
        landing_page_url={brand.landing_page_url}
        logoSignedUrl={defaultLogo?.signed_url ?? null}
        logoIsSvg={defaultLogo?.mime_type === "image/svg+xml"}
        logoLabel={defaultLogo?.label ?? null}
      />

      {/* Logos — multi-variants management */}
      <LogoManager brandId={bid} logos={logos} />

      {/* DA + identité */}
      <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Direction artistique & identité</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Ces champs sont structurés et passent directement dans les prompts
          d&apos;image (couleurs hex, typo, principes). Plus c&apos;est précis,
          mieux la DA est respectée.
        </p>

        <form action={updateAction} className="mt-5 grid gap-4 lg:grid-cols-2">
          <Field label="Nom *" name="name" defaultValue={brand.name} required />
          <Field
            label="Description courte"
            name="description"
            defaultValue={brand.description ?? ""}
            placeholder="Ex : Plateforme française de placements responsables"
          />

          <TextareaField
            label="Mission"
            name="mission"
            defaultValue={brand.mission ?? ""}
            placeholder="Ex : Démocratiser l'investissement responsable pour les jeunes actifs."
            rows={2}
          />
          <TextareaField
            label="Audience cible"
            name="target_audience"
            defaultValue={brand.target_audience ?? ""}
            placeholder="Ex : 28-45 ans, urbains, CSP+, investis dans la transition écologique."
            rows={2}
          />

          <TextareaField
            label="Tone of voice"
            name="brand_voice"
            defaultValue={brand.brand_voice ?? ""}
            placeholder="Ex : confiant, calme, expert. Tutoiement OK. Pas d'urgence factice, pas de hype."
            rows={2}
          />
          <TextareaField
            label="Principes visuels"
            name="visual_principles"
            defaultValue={brand.visual_principles ?? ""}
            placeholder="Ex : minimal, dark mode, materials premium (obsidian, gold accents), generous negative space."
            rows={2}
          />

          <Field
            label="Couleurs primaires (hex, séparées par virgule ou retour ligne)"
            name="primary_colors"
            defaultValue={colors.join(", ")}
            placeholder="#1a1a1a, #FFD700, #F8F5EE"
          />
          <Field
            label="Typographie"
            name="typography"
            defaultValue={brand.typography ?? ""}
            placeholder="Ex : Tiempos Headline (titres) + Inter (body)"
          />

          <TextareaField
            label="À DIRE (un par ligne ou séparés par virgule)"
            name="do_say"
            defaultValue={doSay.join("\n")}
            placeholder={`construire un patrimoine\nresponsable\ntransparent\nsécurisé`}
            rows={3}
          />
          <TextareaField
            label="À NE PAS DIRE"
            name="dont_say"
            defaultValue={dontSay.join("\n")}
            placeholder={`profitez maintenant\nrendement garanti\nincroyable\nrévolutionnaire`}
            rows={3}
          />

          {/* Live preview of color chips */}
          <div className="lg:col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Aperçu palette actuelle
            </div>
            {colors.length === 0 ? (
              <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                Aucune couleur définie
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {colors.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs"
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-[var(--color-border)]"
                      style={{ background: c }}
                    />
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 flex items-center justify-end gap-3 border-t border-[var(--color-border)] pt-4">
            <p className="text-[10px] text-[var(--color-muted-foreground)]">
              💡 Sauvegarder invalide la compilation du system prompt — il sera
              recompilé à la prochaine utilisation (itération 2).
            </p>
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              Enregistrer la DA
            </button>
          </div>
        </form>
      </section>

      {/* Resources */}
      <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Ressources de la marque</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Chaque ressource alimente le contexte que Claude utilisera pour
          compiler le system prompt de la marque. Texte manuel pour l&apos;instant
          — l&apos;upload de fichiers et le scraping d&apos;URLs arrivent en
          itération 2.
        </p>

        {/* Add manual resource form */}
        <form
          action={addManualAction}
          className="mt-5 rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-4"
        >
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            + Ajouter une ressource (texte manuel)
          </div>
          <input
            name="label"
            placeholder="Titre court (optionnel) — ex : 'Histoire de la marque'"
            className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <textarea
            name="manual_text"
            required
            rows={4}
            placeholder="Texte libre — toute info utile pour la marque (background, exemples de copy qui ont marché, anti-exemples, contraintes légales spécifiques, etc.)"
            className="mt-2 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              Ajouter cette note
            </button>
          </div>
        </form>

        {/* Resources list */}
        <div className="mt-5 flex flex-col gap-2">
          {(!resources || resources.length === 0) && (
            <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted-foreground)]">
              Aucune ressource pour l&apos;instant
            </div>
          )}
          {resources?.map((r) => {
            const previewText =
              r.manual_text ?? r.scraped_text ?? r.extracted_text ?? "";
            return (
              <details
                key={r.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3"
              >
                <summary className="flex cursor-pointer items-center gap-2 list-none">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      r.kind === "manual"
                        ? "bg-sky-500/15 text-sky-300"
                        : r.kind === "url"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-violet-500/15 text-violet-300"
                    }`}
                  >
                    {r.kind === "manual"
                      ? "TEXTE"
                      : r.kind === "url"
                      ? "URL"
                      : "FICHIER"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {r.label ??
                      r.source_url ??
                      r.source_filename ??
                      previewText.slice(0, 60)}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <DeleteResourceButton brandId={bid} resourceId={r.id} />
                </summary>
                {previewText && (
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-muted-foreground)]">
                    {previewText}
                  </pre>
                )}
                {r.ai_summary && (
                  <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-200">
                    <b>Résumé Claude :</b> {r.ai_summary}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </section>
    </main>
  );
}

// =============================================================================
// Field helpers — kept inline to minimise file count
// =============================================================================

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
      />
    </div>
  );
}

function TextareaField({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
      />
    </div>
  );
}
