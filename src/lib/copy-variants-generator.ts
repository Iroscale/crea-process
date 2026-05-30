/**
 * Generate N copy variants for a single angle.
 *
 * The user has chosen an angle marketing in their brief (e.g. "Sécurité
 * absolue"). They want to test multiple HOOKS on this same angle without
 * changing the angle itself — different formulations, different attack
 * structures, but the same psychological lever.
 *
 * Called from the brief page when the user clicks "Générer N variantes"
 * under an angle in the Phase 1 generation form. The returned variants
 * are persisted in `brief_data.angles[idx].copy_variants`.
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import type { BrandContext } from "./brand-context";
import { formatRegionForBriefSystemPrompt } from "./regions";
import type { CopyVariant } from "./brief-schema";

export type AngleInput = {
  name: string;
  rationale: string;
  headline: string;
  body?: string;
  cta?: string;
};

const SYSTEM_PROMPT = `Tu es un copywriter expert en leadgen Meta finance française. On te donne UN angle marketing et tu produis N VARIATIONS de copy qui RESTENT sur cet angle mais explorent des formulations radicalement différentes.

# OBJECTIF
Donner à l'utilisateur une palette de hooks crédibles pour le MÊME message stratégique, qu'il pourra A/B-tester en parallèle. Plus les variations sont DIFFÉRENTES dans leur structure, plus le test est riche.

# PRINCIPES — HEADLINE (4-9 mots)
- SPÉCIFIQUE, pas générique : "Récupérer 3 % d'inflation perdue" > "Investissez mieux"
- HOOK : curiosité (question contre-intuitive) / chiffre concret / contradiction / mini-histoire / miroir lecteur
- Tutoiement OU vouvoiement adulte selon la voice de la marque
- INTERDICTIONS : "révolutionnaire", "incroyable", "100 %", "garanti", "explosif", "magique"
- VARIE LES STRUCTURES : question, affirmation, négation, énumération, paradoxe, citation, comparatif, chiffre choc

# PRINCIPES — BODY (1 phrase max 18 mots, optionnel)
- Précise la promesse, sans marketing speak
- Une seule idée claire — si tu hésites, coupe

# PRINCIPES — CTA (2-4 mots impératif, optionnel)
- ACTIONS DOUCES : "Découvrir comment", "Tester en 2 min", "Comprendre", "Calculer mon économie", "En savoir plus", "Voir les chiffres"
- INTERDICTIONS : "Profitez", "Achetez", "Maintenant", "Vite", "Cliquez ici"

# CONTRAINTES TRANSVERSES
- GARDE l'angle marketing original (sécurité / performance / FOMO / social proof / etc.) — ne dévie pas
- Chaque variation doit être DIFFÉRENTE des autres : structure différente, mots différents, hook différent. PAS DE REFORMULATION COSMÉTIQUE.
- Aucun chiffre inventé — ordre de grandeur seulement ("près de", "environ", "jusqu'à")
- Pas de promesse de rendement chiffré non vérifié (risque AMF)
- Français parfait, accents corrects

# FORMAT — JSON STRICT, RIEN D'AUTRE
{
  "variants": [
    {
      "headline": "...",
      "body": "...",
      "cta": "...",
      "emphasis_words": ["..."]
    }
  ]
}

emphasis_words : 1-3 mots du headline à colorer (optionnel, peut être vide).
body / cta : optionnels — laisse une chaîne vide si non pertinent.`;

export async function generateAngleCopyVariants(args: {
  angle: AngleInput;
  count?: number;
  brand?: BrandContext | null;
  region?: string | null;
  productSummary?: string | null;
}): Promise<CopyVariant[]> {
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  const client = getAnthropic();

  const lines: string[] = [];
  lines.push(`# ANGLE À DÉCLINER (produire ${count} variantes)`);
  lines.push(`Nom : ${args.angle.name}`);
  lines.push(`Rationale : ${args.angle.rationale}`);
  lines.push(`Headline original : "${args.angle.headline}"`);
  if (args.angle.body) lines.push(`Body original : "${args.angle.body}"`);
  if (args.angle.cta) lines.push(`CTA original : "${args.angle.cta}"`);

  if (args.productSummary) {
    lines.push("");
    lines.push("# PRODUIT");
    lines.push(args.productSummary);
  }

  if (args.brand) {
    lines.push("");
    lines.push("# MARQUE — RESPECTE CE TON");
    lines.push(`Nom : ${args.brand.name}`);
    if (args.brand.brand_voice) lines.push(`Voice : ${args.brand.brand_voice}`);
    if (args.brand.do_say.length > 0)
      lines.push(`À dire : ${args.brand.do_say.join(", ")}`);
    if (args.brand.dont_say.length > 0)
      lines.push(`À NE PAS dire : ${args.brand.dont_say.join(", ")}`);
  }

  if (args.region && args.region !== "international") {
    const regionBlock = formatRegionForBriefSystemPrompt(args.region);
    if (regionBlock) {
      lines.push("");
      lines.push(regionBlock);
      lines.push("");
      lines.push(
        "1 à 2 variantes peuvent intégrer un démonyme ou une référence locale, sans surcharger toutes les variantes."
      );
    }
  }

  lines.push("");
  lines.push(
    `Produis maintenant exactement ${count} variantes en JSON. RESTE sur le même angle. VARIE les hooks et structures.`
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: { variants?: unknown[] };
  try {
    parsed = JSON.parse(cleaned) as { variants?: unknown[] };
  } catch {
    throw new Error("Variantes copy : Claude n'a pas renvoyé du JSON valide");
  }
  const arr = Array.isArray(parsed.variants) ? parsed.variants : [];
  if (arr.length === 0) {
    throw new Error("Variantes copy : aucune variante générée");
  }

  const variants: CopyVariant[] = arr
    .slice(0, count)
    .map((v, i) => {
      const vv = v as Record<string, unknown>;
      const headline =
        typeof vv.headline === "string" ? vv.headline.trim() : "";
      const body =
        typeof vv.body === "string" && vv.body.trim().length > 0
          ? vv.body.trim()
          : undefined;
      const cta =
        typeof vv.cta === "string" && vv.cta.trim().length > 0
          ? vv.cta.trim()
          : undefined;
      const emphasis_words = Array.isArray(vv.emphasis_words)
        ? (vv.emphasis_words as unknown[]).filter(
            (w): w is string => typeof w === "string" && w.trim().length > 0
          )
        : undefined;
      return {
        id: makeVariantId(i),
        headline,
        body,
        cta,
        emphasis_words:
          emphasis_words && emphasis_words.length > 0
            ? emphasis_words
            : undefined,
      };
    })
    .filter((v) => v.headline.length > 0);

  if (variants.length === 0) {
    throw new Error("Variantes copy : toutes les variantes étaient vides");
  }
  return variants;
}

function makeVariantId(seed: number): string {
  // Lightweight unique-enough id. Used as form input value + selection key.
  const rand = Math.random().toString(36).slice(2, 9);
  const t = Date.now().toString(36);
  return `cv_${t}_${seed}_${rand}`;
}
