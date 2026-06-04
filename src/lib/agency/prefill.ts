/**
 * Pré-remplissage intelligent des champs de formulaire d'une étape.
 *
 * Architecture : pour chaque step_key, on retourne un Map<field_name, value>
 * calculé à partir de :
 *   - client_agency_profile (vertical, onboarding_data)
 *   - client_memory[client-profile] (synthèse orchestrator)
 *   - client_memory[icp] (3 ICP validés — pour les étapes en aval)
 *   - client_memory[angles-promesses] (angles validés — pour étapes 04+)
 *
 * Les champs non calculés restent vides, l'utilisateur les remplit comme
 * avant. Le pré-remplissage est une proposition ajustable, pas une
 * contrainte.
 *
 * Pour ajouter le pré-remplissage à une nouvelle étape : ajouter une
 * fonction `prefill<XX>()` et la wirer dans `getStepPrefills`.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StepKey } from "./pipeline";

/** Labels lisibles pour les verticales (utilisé dans la suggestion de niche). */
const VERTICAL_LABELS: Record<string, string> = {
  "assurance-vie-lux": "Assurance-vie luxembourgeoise",
  scpi: "SCPI",
  defisc: "Défiscalisation",
  "banque-privee": "Banque privée",
  autre: "Produits financiers",
};

interface ProfileRow {
  vertical: string | null;
  onboarding_data: Record<string, unknown> | null;
}

interface OnboardingData {
  marche?: string;
  contact_op?: string;
  lp_urls?: string[];
  fathom_recap?: string;
  docs_summary?: string;
  contraintes?: {
    reglementaires?: string;
    operationnelles?: string;
    tonales?: string;
  };
}

/**
 * Entrée principale : appelée par la step page. Retourne les valeurs
 * suggérées pour les form fields de l'étape demandée.
 */
export async function getStepPrefills(
  supabase: SupabaseClient,
  args: { projectId: string; stepKey: StepKey }
): Promise<Record<string, string>> {
  switch (args.stepKey) {
    case "01-market-research":
      return prefillMarketResearch(supabase, args.projectId);
    // Hook : ajouter d'autres étapes ici
    default:
      return {};
  }
}

// ── 01-market-research ────────────────────────────────────────────────────
async function prefillMarketResearch(
  supabase: SupabaseClient,
  projectId: string
): Promise<Record<string, string>> {
  const [profileRes, memoryRes] = await Promise.all([
    supabase
      .from("client_agency_profile")
      .select("vertical, onboarding_data")
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("client_memory")
      .select("content_md")
      .eq("project_id", projectId)
      .eq("slug", "client-profile")
      .maybeSingle(),
  ]);

  const profile = (profileRes.data as ProfileRow | null) ?? null;
  const clientProfileMd = (memoryRes.data?.content_md as string) ?? "";

  const out: Record<string, string> = {};
  out.niche = buildNicheSuggestion(profile, clientProfileMd);
  out.region = mapMarcheToRegionOption(
    (profile?.onboarding_data as OnboardingData | null)?.marche
  );
  return out;
}

/**
 * Construit une suggestion de niche en combinant verticale + cible + marché.
 *
 * Priorité :
 *   1. Si client-profile.md contient une "Promesse principale" ou une cible
 *      sociodémo explicite, on s'en sert.
 *   2. Sinon, on combine VERTICAL_LABELS + cible inférée (cherche un montant
 *      patrimoine dans onboarding) + marché.
 *   3. Fallback générique.
 */
function buildNicheSuggestion(
  profile: ProfileRow | null,
  clientProfileMd: string
): string {
  const vertical = profile?.vertical ?? "autre";
  const verticalLabel = VERTICAL_LABELS[vertical] ?? "Produits financiers";
  const od = (profile?.onboarding_data as OnboardingData | null) ?? {};
  const marche = od.marche || "France";

  // 1. Cherche une cible patrimoniale explicite dans le profile.md
  const patrimoineMatch =
    clientProfileMd.match(
      /patrimoine[^.\n]{0,40}?(\d{1,4}\s?(?:k|K|000)\s?€?|\d+\s?m€?)/i
    ) ||
    JSON.stringify(od).match(
      /patrimoine[^.\n]{0,40}?(\d{1,4}\s?(?:k|K|000)\s?€?|\d+\s?m€?)/i
    );
  const patrimoineTarget = patrimoineMatch
    ? `patrimoine ${patrimoineMatch[1]}+`
    : null;

  // 2. Cherche une cible sociodémo (cadres, indépendants, …) dans le profile
  const targetGroupMatch = clientProfileMd.match(
    /(?:cible|audience|persona|clients)[^.\n]{0,80}?(cadres? sup[ée]rieurs?|dirigeants? de PME|ind[ée]pendants?|chefs? d['']entreprise|professions? lib[ée]rales|retrait[ée]s? aisés|professions? r[ée]glementées)/i
  );
  const target = patrimoineTarget || targetGroupMatch?.[1] || "patrimoine 250 k€+";

  return `${verticalLabel} pour ${target} en ${marche}`;
}

/** Mappe le marché de l'onboarding sur les options du select region. */
function mapMarcheToRegionOption(marche: string | undefined): string {
  switch ((marche ?? "").toLowerCase()) {
    case "france":
      return "France";
    case "suisse":
      return "Suisse";
    case "belgique":
    case "international":
      return "International";
    default:
      return "France";
  }
}
