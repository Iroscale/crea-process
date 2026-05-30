/**
 * Improve ad copy for conversion (leadgen Meta).
 *
 * Takes the current headline / body / CTA of an ad and rewrites them with
 * Andrometa principles : sharper hook, more specific promise, softer CTA.
 * Respects the brand voice if a brand is associated.
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import type { BrandContext } from "./brand-context";

export type CurrentCopy = {
  headline: string;
  body: string;
  cta: string;
};

export type ImprovedCopy = {
  headline: string;
  body: string;
  cta: string;
  rationale: string;
};

const SYSTEM_PROMPT = `Tu es un copywriter expert en leadgen Meta finance française. On te donne le copy ACTUEL d'une publicité (headline / body / CTA) et tu produis une VERSION OPTIMISÉE POUR LA CONVERSION (CPL).

# OBJECTIF
Maximiser le passage scroll → clic → conversion (lead form complétion). Tu réécris pour faire BAISSER LE CPL, pas pour gagner un concours de créativité.

# PRINCIPES — HEADLINE (4-9 mots)
- SPÉCIFIQUE, pas générique : "Récupérer 3 % d'inflation perdue" > "Investissez mieux"
- HOOK : curiosité (question contre-intuitive) / chiffre concret / contradiction
- TUTOIEMENT si la marque le permet, sinon vouvoiement adulte
- INTERDICTIONS : "révolutionnaire", "incroyable", "100 %", "garanti", "explosif", "magique"

# PRINCIPES — BODY (1 phrase, max 18 mots)
- Précise la promesse, RIEN d'autre
- Concret, factuel, sans marketing speak
- Une seule idée claire — si tu hésites, coupe

# PRINCIPES — CTA (2-4 mots, impératif)
- ACTION CLAIRE : "Découvrir comment", "Tester en 2 min", "Comprendre", "Calculer mon économie", "En savoir plus"
- INTERDICTIONS : "Profitez", "Achetez", "Maintenant", "Vite", "Cliquez ici"
- Doux et invitant — pas pushy

# CONTRAINTES TRANSVERSES
- GARDE L'ANGLE marketing original (sécurité, performance, économie, social proof, etc.) — ne dévie pas vers un autre angle
- GARDE le ton de la marque si fourni (do_say / dont_say)
- Rédige en français parfait, accents corrects
- AUCUN chiffre inventé — utilise des ordres de grandeur plausibles ("près de", "environ", "jusqu'à")
- Évite TOUTES les promesses de rendement chiffré non vérifié (risque légal AMF)

# FORMAT — JSON STRICT, RIEN D'AUTRE
{
  "headline": "...",
  "body": "...",
  "cta": "...",
  "rationale": "Pourquoi cette version convertit mieux (1 phrase, max 25 mots)"
}`;

export async function improveCopyForConversion(args: {
  current: CurrentCopy;
  brand: BrandContext | null;
  angleName: string;
  renderStyle: string;
  productSummary?: string | null;
}): Promise<ImprovedCopy> {
  const client = getAnthropic();

  const lines: string[] = [];
  lines.push("# COPY ACTUEL");
  lines.push(`Headline : "${args.current.headline}"`);
  if (args.current.body) lines.push(`Body : "${args.current.body}"`);
  if (args.current.cta) lines.push(`CTA : "${args.current.cta}"`);
  lines.push("");
  lines.push(`# CONTEXTE`);
  lines.push(`Angle marketing : ${args.angleName || "non précisé"}`);
  lines.push(`Style de rendu visuel : ${args.renderStyle}`);
  if (args.productSummary) lines.push(`Produit : ${args.productSummary}`);
  if (args.brand) {
    lines.push("");
    lines.push("# MARQUE — RESPECTE CE TON");
    lines.push(`Nom : ${args.brand.name}`);
    if (args.brand.brand_voice) lines.push(`Voice : ${args.brand.brand_voice}`);
    if (args.brand.do_say.length > 0)
      lines.push(`À dire (mots-clés bienvenus) : ${args.brand.do_say.join(", ")}`);
    if (args.brand.dont_say.length > 0)
      lines.push(`À NE PAS dire : ${args.brand.dont_say.join(", ")}`);
  }
  lines.push("");
  lines.push(
    "Réécris maintenant le copy en JSON. Garde l'angle, change la formulation pour optimiser la conversion."
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: Partial<ImprovedCopy>;
  try {
    parsed = JSON.parse(cleaned) as Partial<ImprovedCopy>;
  } catch {
    throw new Error("Boost copy : Claude n'a pas renvoyé du JSON valide");
  }
  const headline = (parsed.headline ?? "").trim();
  if (!headline) {
    throw new Error("Boost copy : headline manquant dans la réponse");
  }
  return {
    headline,
    body: (parsed.body ?? "").trim(),
    cta: (parsed.cta ?? "").trim() || "Découvrir",
    rationale: (parsed.rationale ?? "").trim(),
  };
}
