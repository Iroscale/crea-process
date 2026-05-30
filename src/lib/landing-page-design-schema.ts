import { z } from "zod";

/**
 * Design directives produced by the Claude "designer" agent. These are
 * applied on top of the existing content_a / content_b at render time to
 * produce a premium, CRO-optimized landing page.
 *
 * Two flavors of decisions live here :
 *   1. AESTHETIC — typo, palette, density, visual personality
 *   2. CRO       — sticky CTAs, urgency markers, trust signal placement,
 *                  form optimization, exit-intent, animations
 *
 * The agent justifies its choices in `rationale` so we can tweak / chat-refine.
 */

const fontFamilySchema = z.enum([
  "inter",
  "geist",
  "manrope",
  "cabinet_grotesk",
  "general_sans",
  "satoshi",
  "neue_haas",
  "tiempos",
  "editorial_new",
  "fraunces",
  "source_serif",
  "playfair",
]);

export type LPFontFamily = z.infer<typeof fontFamilySchema>;

export const designDirectivesSchema = z.object({
  // ── AESTHETIC ──────────────────────────────────────────────────────────
  typography: z.object({
    display: fontFamilySchema.describe(
      "Police pour headlines / hero. Display fonts modernes : cabinet_grotesk, general_sans, editorial_new, fraunces, satoshi."
    ),
    body: fontFamilySchema.describe(
      "Police pour body / paragraphes. Sans-serif lisible : inter, geist, manrope, satoshi."
    ),
    scale: z
      .enum(["compact", "balanced", "generous", "monumental"])
      .describe(
        "Échelle typo. compact = dense, balanced = standard, generous = beaucoup de blanc, monumental = headlines XXL"
      ),
  }),
  palette: z.object({
    primary: z.string().describe("Hex couleur primary (CTAs)"),
    primary_text: z
      .string()
      .describe("Hex texte sur primary (#fff ou #000 selon contraste)"),
    accent: z.string().describe("Hex couleur d'accent (highlights)"),
    bg: z
      .enum(["white", "off_white", "ivory", "dark", "midnight"])
      .describe(
        "Background dominant : white = pur, off_white = légèrement gris, ivory = chaud, dark = #0a0a0a, midnight = bleu très sombre"
      ),
    surface: z
      .enum(["white", "neutral_50", "neutral_100", "warm_50"])
      .describe("Surface des cards (rappelle bg mais nuance)"),
  }),
  density: z
    .enum(["airy", "balanced", "dense"])
    .describe(
      "Densité générale du layout. airy = beaucoup d'espace blanc (premium), balanced = standard, dense = info-rich"
    ),
  visual_personality: z
    .enum([
      "premium_institutional",
      "warm_human",
      "techy_modern",
      "editorial_serious",
      "fintech_crisp",
      "luxe_minimal",
    ])
    .describe(
      "Personnalité visuelle générale. Détermine les arrondis, ombres, accents."
    ),

  // ── CRO ────────────────────────────────────────────────────────────────
  cro: z.object({
    sticky_cta_mobile: z
      .boolean()
      .describe("Barre CTA fixe en bas sur mobile (gros levier)"),
    sticky_header: z
      .boolean()
      .describe("Mini-header fixe avec mini-CTA après scroll"),
    above_fold_priority: z
      .enum(["form", "social_proof", "video"])
      .describe(
        "Élément prioritaire above-the-fold. form = capture immédiate, social_proof = chiffres + logos avant tout, video = hero video"
      ),
    urgency_marker: z
      .object({
        enabled: z.boolean(),
        text: z.string(),
      })
      .optional()
      .describe(
        "Marqueur d'urgence (ex : 'Inscriptions jusqu'au 30 mai', 'Plus que 12 places')"
      ),
    micro_commitment_first: z
      .boolean()
      .describe(
        "Demande petit engagement d'abord (1 clic / 1 question quiz) avant le formulaire complet"
      ),
    form_optimization: z
      .enum(["single_field", "two_step", "progressive", "full"])
      .describe(
        "Stratégie form. single_field = email seul, two_step = email puis détails, progressive = champs un par un, full = tout d'un coup"
      ),
    trust_cluster_near_cta: z
      .boolean()
      .describe(
        "Logo presse / chiffres clés posés JUSTE à côté du CTA (vs. dispersés dans la page)"
      ),
    exit_intent_modal: z
      .object({
        enabled: z.boolean(),
        headline: z.string(),
        cta_label: z.string(),
        offer: z.string(),
      })
      .optional()
      .describe(
        "Modal qui apparaît quand l'utilisateur quitte la page. Offre une lead-magnet alternative (PDF gratuit, calculatrice, audit)"
      ),
    counter_animation: z
      .boolean()
      .describe(
        "Compteurs animés sur les stats (ex : 0 → 3247 clients) pour capter l'attention"
      ),
  }),

  // ── ANIMATIONS ─────────────────────────────────────────────────────────
  animations: z.object({
    reveal_on_scroll: z
      .boolean()
      .describe("Sections fade-in/translate quand visibles dans le viewport"),
    parallax_hero: z.boolean().describe("Léger parallax sur le hero visual"),
    hover_microinteractions: z
      .boolean()
      .describe(
        "Cards qui se soulèvent au hover, CTAs qui pulsent, etc. (desktop uniquement)"
      ),
  }),

  // ── SECTION-LEVEL TWEAKS ───────────────────────────────────────────────
  /**
   * Notes par section (clé = nom de la section comme "hero", "comparator",
   * "features"). L'agent peut suggérer des modifications fines : "pousser le
   * comparateur juste après le hero" — TODO : pas appliqué automatiquement,
   * sert au designer humain pour itérer.
   */
  section_notes: z
    .record(z.string(), z.string())
    .describe(
      "Notes par section (clé = nom section, valeur = recommandation CRO/design). Optionnel."
    ),

  // ── METADATA ───────────────────────────────────────────────────────────
  rationale: z
    .string()
    .describe(
      "Raisonnement de l'agent : pourquoi ces choix, quels gains attendus. 3-5 phrases."
    ),
  expected_lift: z
    .string()
    .describe(
      "Estimation qualitative du gain de conversion attendu vs version standard. Soit en pourcentage estimé soit en éléments du funnel impactés."
    ),
});

export type DesignDirectives = z.infer<typeof designDirectivesSchema>;

// ──────────────────────────────────────────────────────────────────────────
// JSON Schema for Anthropic tool_use
// ──────────────────────────────────────────────────────────────────────────

const fontEnum = [
  "inter",
  "geist",
  "manrope",
  "cabinet_grotesk",
  "general_sans",
  "satoshi",
  "neue_haas",
  "tiempos",
  "editorial_new",
  "fraunces",
  "source_serif",
  "playfair",
];

export const designDirectivesJsonSchema = {
  type: "object",
  properties: {
    typography: {
      type: "object",
      properties: {
        display: { type: "string", enum: fontEnum },
        body: { type: "string", enum: fontEnum },
        scale: {
          type: "string",
          enum: ["compact", "balanced", "generous", "monumental"],
        },
      },
      required: ["display", "body", "scale"],
    },
    palette: {
      type: "object",
      properties: {
        primary: { type: "string" },
        primary_text: { type: "string" },
        accent: { type: "string" },
        bg: {
          type: "string",
          enum: ["white", "off_white", "ivory", "dark", "midnight"],
        },
        surface: {
          type: "string",
          enum: ["white", "neutral_50", "neutral_100", "warm_50"],
        },
      },
      required: ["primary", "primary_text", "accent", "bg", "surface"],
    },
    density: { type: "string", enum: ["airy", "balanced", "dense"] },
    visual_personality: {
      type: "string",
      enum: [
        "premium_institutional",
        "warm_human",
        "techy_modern",
        "editorial_serious",
        "fintech_crisp",
        "luxe_minimal",
      ],
    },
    cro: {
      type: "object",
      properties: {
        sticky_cta_mobile: { type: "boolean" },
        sticky_header: { type: "boolean" },
        above_fold_priority: {
          type: "string",
          enum: ["form", "social_proof", "video"],
        },
        urgency_marker: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            text: { type: "string" },
          },
          required: ["enabled", "text"],
        },
        micro_commitment_first: { type: "boolean" },
        form_optimization: {
          type: "string",
          enum: ["single_field", "two_step", "progressive", "full"],
        },
        trust_cluster_near_cta: { type: "boolean" },
        exit_intent_modal: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            headline: { type: "string" },
            cta_label: { type: "string" },
            offer: { type: "string" },
          },
          required: ["enabled", "headline", "cta_label", "offer"],
        },
        counter_animation: { type: "boolean" },
      },
      required: [
        "sticky_cta_mobile",
        "sticky_header",
        "above_fold_priority",
        "micro_commitment_first",
        "form_optimization",
        "trust_cluster_near_cta",
        "counter_animation",
      ],
    },
    animations: {
      type: "object",
      properties: {
        reveal_on_scroll: { type: "boolean" },
        parallax_hero: { type: "boolean" },
        hover_microinteractions: { type: "boolean" },
      },
      required: [
        "reveal_on_scroll",
        "parallax_hero",
        "hover_microinteractions",
      ],
    },
    section_notes: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    rationale: { type: "string" },
    expected_lift: { type: "string" },
  },
  required: [
    "typography",
    "palette",
    "density",
    "visual_personality",
    "cro",
    "animations",
    "section_notes",
    "rationale",
    "expected_lift",
  ],
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Helpers : map font enum → CSS family + Google Fonts URL
// ──────────────────────────────────────────────────────────────────────────

export const FONT_CSS: Record<
  LPFontFamily,
  { family: string; google?: string }
> = {
  inter: { family: "Inter", google: "Inter:wght@400;500;600;700;800;900" },
  geist: { family: "Geist", google: "Geist:wght@400;500;600;700;800" },
  manrope: { family: "Manrope", google: "Manrope:wght@400;500;600;700;800" },
  satoshi: { family: "Satoshi, Inter", google: "Satoshi:wght@400;500;700;900" },
  cabinet_grotesk: {
    family: "Cabinet Grotesk, Inter",
    // No Google Fonts available — falls back to Inter
  },
  general_sans: {
    family: "General Sans, Inter",
  },
  neue_haas: {
    family: "Neue Haas Grotesk, Inter",
  },
  tiempos: { family: "Tiempos, Source Serif 4, Georgia, serif" },
  editorial_new: { family: "Editorial New, Source Serif 4, Georgia, serif" },
  fraunces: {
    family: "Fraunces, Georgia, serif",
    google: "Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,900",
  },
  source_serif: {
    family: "Source Serif 4, Georgia, serif",
    google: "Source+Serif+4:wght@400;600;700;900",
  },
  playfair: {
    family: "Playfair Display, Georgia, serif",
    google: "Playfair+Display:wght@400;600;700;900",
  },
};

/**
 * Build the Google Fonts <link> URL combining display + body font.
 * Returns null if neither font has a google entry (use system fallback).
 */
export function buildGoogleFontsUrl(
  display: LPFontFamily,
  body: LPFontFamily
): string | null {
  const families: string[] = [];
  if (FONT_CSS[display].google) families.push(FONT_CSS[display].google!);
  if (display !== body && FONT_CSS[body].google)
    families.push(FONT_CSS[body].google!);
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families
    .map((f) => "family=" + f)
    .join("&")}&display=swap`;
}

export const BG_COLORS: Record<DesignDirectives["palette"]["bg"], string> = {
  white: "#FFFFFF",
  off_white: "#FAFAF9",
  ivory: "#FFFBF1",
  dark: "#0A0A0A",
  midnight: "#0B1220",
};

export const SURFACE_COLORS: Record<
  DesignDirectives["palette"]["surface"],
  string
> = {
  white: "#FFFFFF",
  neutral_50: "#FAFAFA",
  neutral_100: "#F5F5F5",
  warm_50: "#FAF7F0",
};
