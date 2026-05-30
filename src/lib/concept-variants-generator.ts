/**
 * Generate visual variants for a concept.
 *
 * Two modes:
 *  1. AUTO — produce N alternative visual realizations of the same theme.
 *     Ex: "triangle de sécurité luxembourgeois" → coffre-fort suisse, cadenas
 *     dans un coffre marbré, voûte de banque, sceau de cire sur parchemin…
 *     Toutes illustrent LA SÉCURITÉ mais avec des objets / scènes différents.
 *
 *  2. CUSTOM — the user provides an idea ("remplace le triangle par un
 *     coffre-fort dans une bibliothèque parisienne") and Claude rewrites the
 *     concept description to match the idea while keeping the original
 *     theme/intent intact.
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import type { BrandContext } from "./brand-context";
import { formatRegionForBriefSystemPrompt } from "./regions";
import type {
  ConceptVariant,
  RenderStyle,
} from "./brief-schema";

export type ConceptInput = {
  name: string;
  rationale: string;
  description: string;
  render_style?: RenderStyle;
};

const RENDER_STYLE_KEYS: RenderStyle[] = [
  "cinematic",
  "ugc",
  "screenshot_social",
  "editorial",
  "comparison_split",
  "data_viz",
  "meme",
];

const AUTO_SYSTEM_PROMPT = `Tu es un directeur artistique senior expert en publicité Meta finance française. On te donne UN concept visuel et tu produis N VARIATIONS — même thème de fond, traitements visuels DIFFÉRENTS.

# OBJECTIF
Donner à l'utilisateur une palette de réalisations distinctes du MÊME message visuel. Si le concept = "triangle de sécurité", les variantes peuvent être un coffre-fort, un cadenas dans un coffre, une voûte de banque, un sceau de cire — tout ce qui illustre la sécurité de manière visuellement contrastée.

# RÈGLES
1. **Garde le thème de fond** — sécurité, performance, simplicité, social proof, etc. Identifie-le depuis le concept et ne dévie pas.
2. **Varie les objets, lieux, mises en scène, métaphores** — chaque variante doit être visuellement distincte des autres ET du concept original.
3. **render_style** — par défaut, garde celui du concept. Tu peux le changer pour 1-2 variantes si ça sert le test (ex: ajouter un ugc à des concepts cinematic).
4. **Description** — 200+ mots, EN ANGLAIS, dense, prête à injecter dans un prompt d'image. Inclut matières, lumière, palette, profondeur, composition. Aucun texte intégré (le copy est ajouté plus tard).
5. **Cohérence avec render_style** — si la variante est cinematic, décrire matières et lighting Octane. Si ugc, décrire la scène phone-shot. Si screenshot_social, décrire l'UI et le contenu. Si editorial, le layout magazine. Etc.
6. **Aucun copyright ni nom de marque** dans la description sauf marques génériques de matériel photo / 3D (Hasselblad, Octane, Redshift autorisés).
7. **Nom de variante** : 3-6 mots, mémorable, descriptif (ex : "Coffre-fort suisse marbré", "Cadenas brushed gold").

# FORMAT — JSON STRICT
{
  "variants": [
    {
      "name": "...",
      "description": "...",
      "render_style": "cinematic" | "ugc" | "screenshot_social" | "editorial" | "comparison_split" | "data_viz" | "meme"
    }
  ]
}`;

const CUSTOM_SYSTEM_PROMPT = `Tu es un directeur artistique senior expert en publicité Meta finance française. On te donne UN concept visuel ACTUEL + UNE IDÉE DE L'UTILISATEUR pour le modifier. Tu réécris le concept en intégrant l'idée tout en gardant le thème et la qualité d'origine.

# RÈGLES
1. **Respecte l'idée utilisateur** — c'est elle qui dirige la modification. Ne la réinterprète pas.
2. **Garde le thème de fond** — si le concept original visait la sécurité, la variante reste sur la sécurité.
3. **Réécris la description visuelle ENTIÈRE** — 200+ mots, EN ANGLAIS, dense, prête pour un prompt d'image.
4. **render_style** — garde celui du concept actuel sauf si l'idée force un changement (ex: utilisateur demande "version UGC" → render_style devient ugc, description adaptée).
5. **Pas de copy intégré dans la description** — le headline sera ajouté plus tard.
6. **Nom de variante** — 3-6 mots reflétant la modification (ex : "Coffre-fort parisien", "Triangle gold UGC").

# FORMAT — JSON STRICT
{
  "name": "...",
  "description": "...",
  "render_style": "cinematic" | "ugc" | "screenshot_social" | "editorial" | "comparison_split" | "data_viz" | "meme"
}`;

function makeVariantId(seed: number): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const t = Date.now().toString(36);
  return `cv_${t}_${seed}_${rand}`;
}

function buildContextLines(args: {
  brand?: BrandContext | null;
  region?: string | null;
  productSummary?: string | null;
}): string[] {
  const lines: string[] = [];
  if (args.productSummary) {
    lines.push("");
    lines.push("# PRODUIT");
    lines.push(args.productSummary);
  }
  if (args.brand) {
    lines.push("");
    lines.push("# MARQUE");
    lines.push(`Nom : ${args.brand.name}`);
    if (args.brand.visual_principles)
      lines.push(`Principes visuels : ${args.brand.visual_principles}`);
    if (args.brand.primary_colors.length > 0)
      lines.push(`Couleurs : ${args.brand.primary_colors.join(", ")}`);
    if (args.brand.typography)
      lines.push(`Typo : ${args.brand.typography}`);
  }
  if (args.region && args.region !== "international") {
    const regionBlock = formatRegionForBriefSystemPrompt(args.region);
    if (regionBlock) {
      lines.push("");
      lines.push(regionBlock);
      lines.push("");
      lines.push(
        "Au moins 1-2 variantes peuvent intégrer un landmark / décor régional, sans surcharger toutes les variantes."
      );
    }
  }
  return lines;
}

function isRenderStyle(value: unknown): value is RenderStyle {
  return (
    typeof value === "string" && RENDER_STYLE_KEYS.includes(value as RenderStyle)
  );
}

function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export async function generateConceptVariants(args: {
  concept: ConceptInput;
  count?: number;
  brand?: BrandContext | null;
  region?: string | null;
  productSummary?: string | null;
}): Promise<ConceptVariant[]> {
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  const client = getAnthropic();

  const lines: string[] = [];
  lines.push(`# CONCEPT À DÉCLINER (produire ${count} variantes)`);
  lines.push(`Nom : ${args.concept.name}`);
  lines.push(`Rationale : ${args.concept.rationale}`);
  if (args.concept.render_style) {
    lines.push(`Render style actuel : ${args.concept.render_style}`);
  }
  lines.push("");
  lines.push(`Description actuelle :`);
  lines.push(args.concept.description);
  lines.push(...buildContextLines(args));
  lines.push("");
  lines.push(
    `Produis maintenant exactement ${count} variantes en JSON. Garde le thème de fond, varie radicalement les objets / scènes / métaphores.`
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    system: AUTO_SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = stripCodeFences(raw);

  let parsed: { variants?: unknown[] };
  try {
    parsed = JSON.parse(cleaned) as { variants?: unknown[] };
  } catch {
    throw new Error(
      "Variantes concept : Claude n'a pas renvoyé du JSON valide"
    );
  }
  const arr = Array.isArray(parsed.variants) ? parsed.variants : [];
  if (arr.length === 0) {
    throw new Error("Variantes concept : aucune variante générée");
  }

  const variants: ConceptVariant[] = arr
    .slice(0, count)
    .map((v, i) => {
      const vv = v as Record<string, unknown>;
      const name = typeof vv.name === "string" ? vv.name.trim() : "";
      const description =
        typeof vv.description === "string" ? vv.description.trim() : "";
      const render_style = isRenderStyle(vv.render_style)
        ? (vv.render_style as RenderStyle)
        : undefined;
      return {
        id: makeVariantId(i),
        name,
        description,
        render_style,
      };
    })
    .filter((v) => v.name.length > 0 && v.description.length > 0);

  if (variants.length === 0) {
    throw new Error("Variantes concept : toutes les variantes étaient vides");
  }
  return variants;
}

export async function generateConceptVariantFromIdea(args: {
  concept: ConceptInput;
  userIdea: string;
  brand?: BrandContext | null;
  region?: string | null;
  productSummary?: string | null;
}): Promise<ConceptVariant> {
  const idea = args.userIdea.trim();
  if (!idea) throw new Error("Idée vide — précise ce que tu veux modifier");

  const client = getAnthropic();

  const lines: string[] = [];
  lines.push(`# CONCEPT ACTUEL`);
  lines.push(`Nom : ${args.concept.name}`);
  lines.push(`Rationale : ${args.concept.rationale}`);
  if (args.concept.render_style) {
    lines.push(`Render style : ${args.concept.render_style}`);
  }
  lines.push("");
  lines.push(`Description actuelle :`);
  lines.push(args.concept.description);
  lines.push("");
  lines.push("# IDÉE DE MODIFICATION (DE L'UTILISATEUR)");
  lines.push(idea);
  lines.push(...buildContextLines(args));
  lines.push("");
  lines.push(
    "Réécris maintenant le concept en intégrant l'idée. Réponds en JSON unique (pas de tableau)."
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2500,
    system: CUSTOM_SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = stripCodeFences(raw);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Variante concept : Claude n'a pas renvoyé du JSON valide");
  }
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const description =
    typeof parsed.description === "string" ? parsed.description.trim() : "";
  const render_style = isRenderStyle(parsed.render_style)
    ? (parsed.render_style as RenderStyle)
    : args.concept.render_style;

  if (!name || !description) {
    throw new Error(
      "Variante concept : nom ou description manquants dans la réponse"
    );
  }
  return {
    id: makeVariantId(0),
    name,
    description,
    render_style,
  };
}
