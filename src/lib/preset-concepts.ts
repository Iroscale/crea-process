/**
 * Concepts visuels "preset" — toujours disponibles dans le form de génération.
 *
 * Architecture : chaque preset porte une INTENTION (faux article, anti-design,
 * native) qui peut être rendue dans n'importe quel render_style. La forme
 * exacte (magazine print / blog / SMS / meme / etc.) vient du render_style
 * choisi à la génération. Le preset porte un default suggéré.
 *
 * Importable côté server (generate-actions) et côté client (generation-form).
 */
import type { Concept, RenderStyle } from "./brief-schema";

export type PresetConceptId =
  | "faux_article"
  | "ugly_ads"
  | "native_ads"
  | "podcast"
  | "blog_article"
  | "image_classique";

export type PresetConcept = Concept & {
  id: PresetConceptId;
};

export const PRESET_CONCEPTS: Record<PresetConceptId, PresetConcept> = {
  faux_article: {
    id: "faux_article",
    name: "Faux article",
    rationale:
      "Mimique d'un contenu éditorial / journalistique — défait l'ad-blindness en jouant la carte de la crédibilité.",
    render_style: "editorial" satisfies RenderStyle,
    description: `Render this ad as a CREDIBLE EDITORIAL CONTENT PIECE — the audience must think they're reading a real journalist's article, blog post, expert commentary, or social comment from an authority — NOT an ad.

CRITICAL — NEVER use the names of real existing media brands (Les Echos, Capital, Investir, Le Monde, BFM, La Tribune, Bloomberg, etc.) as the publication / website. INVENT a plausible fictional outlet name for each visual : "L'Économie Hebdo", "Finance Mag", "Investir Quotidien", "Le Patrimoine", "Décryptage Finance", "Argent & Vous", "La Lettre Financière", etc. Risk of passing-off otherwise.

The marketing message is wrapped in journalistic codes :
- A small kicker / category line at the top in tracked-out small caps ("FINANCE — DOSSIER ÉPARGNE", "ANALYSE — RETRAITE", "ENQUÊTE — PATRIMOINE")
- A serious factual headline (no salesy language, no superlatives)
- A body that explains a fact or principle, written like a journalist or financial expert
- A byline ("Par [Prénom Nom]") with realistic French name and date
- MANDATORY at the bottom : a small SOURCE LINE citing an OFFICIAL DATA AUTHORITY (statistical agency, central bank, regulator, governmental body — fair use to attribute facts) — "Source : INSEE 2024", "D'après la Banque de France 2023", "Données ACPR", "Étude OCDE", "Eurostat 2024", "Source : AMF", "Données BCE", "Source : DREES", "INED 2024"

══ CRITICAL — LEGAL COMPLIANCE ══
Information presented MUST be plausible and grounded. NEVER invent precise statistics or fictional percentages. Use safe formulations :
- "selon les données de [source]"
- "d'après [organisme]"
- "environ X %" or "près de Y millions" (vague enough to be defensible)
- Real, well-known orders of magnitude (e.g., inflation ~3 %/an, livret A ~3 %, etc.)
- Generic ranges rather than fake precision (avoid "78,3 %" — use "près de 80 %")

The exact medium (magazine print page, online blog post, social comment reply, screenshot of a generic-looking finance webpage, etc.) is driven by the render_style chosen — adapt the editorial codes to that medium while keeping the credibility cues and the source citation. Always invent a fictional publication name — never reproduce the visual identity (logo, typography, layout signature) of an existing real outlet.`,
  },

  ugly_ads: {
    id: "ugly_ads",
    name: "Ugly ads",
    rationale:
      "Anti-design assumé qui défait l'ad-blindness par contraste. Sur Meta, le 'mal fait exprès' performe souvent mieux que la pub léchée.",
    render_style: "ugc" satisfies RenderStyle,
    description: `Render this ad with an INTENTIONALLY LO-FI / AMATEUR-LOOKING aesthetic — the OPPOSITE of polished. The viewer must think an amateur made this in 2 minutes (PowerPoint, Word, basic Photoshop, default app). The "ugly" IS the point — it stops the scroll because it doesn't look like an ad.

Visual conventions to draw from (mix and match — pick what fits the medium suggested by render_style) :
- Default system fonts used wrong : Arial Bold, Times New Roman, Comic Sans, Impact, Calibri at default sizes
- Crappy red circles or yellow highlight rectangles drawn around key elements (numbers, faces, products)
- MS-Paint-style hand-drawn arrows pointing at things, with hand-shaky lines
- Slightly off-center elements, mismatched stroke weights, drop shadows from 2008
- Compressed JPEG-style banding, oversaturated colors, occasional small misalignments
- Phone screenshot with red circles drawn over the interesting numbers
- Before/after diptych with hand-drawn scribbles and "WOW" or "INCROYABLE" text in Impact
- Cheap stock-photo-style image with bad caption typography pasted over it
- Default WordPress theme look if the medium is a blog
- Default Facebook UI screenshot if the medium is a comment

WHATEVER medium the render_style suggests (UGC / screenshot / editorial / etc.), apply the AMATEUR treatment to that medium. An editorial article that looks like a self-published blog with default WordPress theme is just as "ugly" as a meme with stretched fonts. The lo-fi imperfection is intentionally art-directed — it must still be LEGIBLE in 1 second.

NO Apple-keynote polish, NO Octane render, NO professional lighting, NO designer-tier typography.`,
  },

  native_ads: {
    id: "native_ads",
    name: "Native ads",
    rationale:
      "Visuel qui ne ressemble PAS à une pub — fond dans le feed organique. Le lecteur s'arrête parce qu'il croit voir du contenu, pas une publicité.",
    render_style: "ugc" satisfies RenderStyle,
    description: `Render this ad to be visually INDISTINGUISHABLE from organic content the user would see in their Instagram, Facebook, or TikTok feed. NO premium polish, NO 3D, NO Apple-keynote tier, NO product close-up drama. Looks like content, not advertising.

The viewer's first reaction should be "oh, what's this person/article saying ?" — never "this is an ad". The visual must be authentically of-the-platform, indistinguishable from organic posts.

Whatever medium the render_style suggests (phone-shot talking head, SMS conversation, fake tweet, comment reply, blog screenshot, etc.), prioritize AUTHENTICITY over polish :
- Real-looking 30-something French faces, casual environments, plausible context
- Organic-feeling typography (system fonts, default app chrome)
- No designer-tier color palette — natural, lived-in colors
- Slight imperfections welcome (a stray hair, a slightly bad framing)
- Subject feels like a real human, not a model
- Captions / text feel like natural speech, not ad copy

The CONCEPT is "this is content, not an ad" — and the render_style decides which form of organic content (talking head, screenshot conversation, comment, blog post, etc.).`,
  },

  podcast: {
    id: "podcast",
    name: "Podcast / interview",
    rationale:
      "Format podcast — invité expert, micro-cravate ou micro Shure SM7B, citation punchy en bas. Joue la carte de l'autorité conversationnelle.",
    render_style: "editorial" satisfies RenderStyle,
    description: `Render this ad as a PODCAST / INTERVIEW SCENE — a credible audio show or filmed conversation that frames the marketing message as expert commentary, not advertising.

The viewer must feel they're seeing a snippet from a real, currently-running French finance podcast or YouTube interview show — never a staged ad.

Visual conventions :
- A 35-50 yo French expert in casual-smart attire (open shirt, blazer optional), seated at a sober desk or in a warm-lit recording studio
- Professional broadcasting microphone visible — Shure SM7B, Rode PodMic, or similar — pointed at the speaker
- Headphones around neck or worn (closed-back over-ears, dark color), or visible on table
- Soft directional lighting, slight shallow depth of field, warm tone (3500K-4500K)
- Background : sound-absorbing panels (wooden slats, fabric tiles) OR a tasteful blurred bookshelf with finance / philosophy books, OR a modern studio with subtle accent lighting
- INVENT a plausible fictional podcast name displayed somewhere subtle (lower-third banner, a small logo on the desk, an episode card overlay) — never use real podcast names
- Optional : small "REC" indicator, episode number "#47", or waveform graphic at the bottom
- Lower-third caption with the speaker's invented name + role (ex: "Mathieu Aubert / Conseiller en gestion de patrimoine")
- A pull-quote in serif italic occupies the bottom third of the frame — that's where the marketing message lives, framed as an in-conversation insight

Adapt to the render_style if it differs from editorial : for ugc, drop the studio polish, use a phone-recorded vlog vibe with a casual desk mic and natural window light ; for screenshot_social, render as a YouTube / Spotify thumbnail with the standard player UI.

Everything in French. Authentic over polished.`,
  },

  blog_article: {
    id: "blog_article",
    name: "Article de blog",
    rationale:
      "Format article de blog finance avec sommaire, intertitres, encart 'à retenir', visuel d'illustration. Crédibilité éducative.",
    render_style: "editorial" satisfies RenderStyle,
    description: `Render this ad as a SCREENSHOT OF A FINANCE BLOG ARTICLE — the kind of long-form content the audience reads on a Monday morning to "comprendre vraiment" un sujet patrimonial. Looks educational, not promotional.

CRITICAL — NEVER use real blog or media names. INVENT a plausible fictional blog brand for each visual : "Le Carnet Patrimoine", "Décrypter Demain", "Finance Lucide", "Le Journal de l'Épargnant", "Patrimoine.blog", "Comprendre l'Argent", etc. Risk of passing-off otherwise.

Visual conventions of the blog template :
- Top header bar with the invented blog name + a generic navigation menu ("Épargne · Retraite · Immobilier · Fiscalité · Bourse")
- A breadcrumb line ("Accueil > Épargne > [topic]") in muted gray
- A serious factual headline in large serif (Tiempos / Domaine / Fraunces / Source Serif), no salesy language
- An author byline ("Par [Prénom Nom] · [date]") with a tiny round avatar and reading time ("⏱ 7 min de lecture")
- Wide hero illustration occupying the upper third — could be a hero photograph, a vector illustration, or a chart, depending on topic
- A "📌 À retenir" yellow / mint-green callout box near the top with 3 bullet points summarizing the article — THIS is where the main marketing message sits, framed as key takeaways
- A table-of-contents block ("Sommaire") with anchor links to invented section titles
- Body paragraphs in a clean serif or sans-serif (Inter, Source Sans, Mulish), with proper line-height (1.6-1.7), 65-character measure
- One inline pull-quote in larger italic, styled with a left vertical accent bar
- An inline data chart or comparison table OR a relevant illustration breaks up the text
- Bottom : "Sources" section with realistic citations to authorities (INSEE, AMF, Banque de France, OCDE) — generic enough to be defensible

══ LEGAL COMPLIANCE ══
Never invent precise statistics. Use vague but plausible orders of magnitude ("environ 3 %", "près de 8 millions"). Cite real authorities for facts but never reproduce their visual identity.

If render_style differs from editorial, adapt : for ugc, render as a slightly amateur self-published Wordpress blog ; for screenshot_social, frame inside a phone browser with the URL bar visible. The blog feel must remain.

Everything in French.`,
  },

  image_classique: {
    id: "image_classique",
    name: "Image classique",
    rationale:
      "Composition publicitaire classique propre — sujet centré, lumière maîtrisée, typo soignée. Le baseline de référence du test.",
    render_style: "cinematic" satisfies RenderStyle,
    description: `Render this ad as a CLASSIC, POLISHED ADVERTISING COMPOSITION — clean layout, a single hero subject (object, scene, or person), confident typography. The kind of visual you'd see on a bus shelter, a magazine back-cover, or a Google Discover card. This is the BASELINE concept — the reference point against which the more risky variants in the test get measured.

Visual principles :
- A single dominant subject in clear focus — could be a 3D rendered object, a human portrait, a stylized scene, an architectural element, depending on the brief's theme
- Composition follows rule of thirds OR centered geometric balance — choose the one that flatters the subject
- Lighting is INTENTIONAL : a directional key light + soft fill + a touch of rim light to separate subject from background. Color temperature consistent with the brand mood (warm 3200K for premium / human, cool 5500K for fintech / tech, neutral 4500K for institutional)
- Background is contextual but NOT noisy — gradient, soft texture, or a tastefully blurred environment. The subject must read in 0.5 seconds
- Color palette respects the brand's primary colors (or stays in a sober gold/black/cream/anthracite range if no brand specified)
- Negative space available for a 1:1 layout safe zone where the headline copy will be added later
- Material quality : if 3D, expect Octane / Redshift / Cycles tier rendering with PBR materials, accurate shadows, subtle imperfections (micro-scratches, wear, dust). If photo, expect Hasselblad / Phase One quality with proper depth of field and color grading
- Typography (when present) : tasteful serif (Tiempos, Domaine, Editorial New) or modern grotesk (Inter, Söhne, GT America). Generous tracking, hierarchy clear at thumbnail size

NO clutter, NO over-design, NO meme codes, NO UGC roughness. This is the polished benchmark.

If render_style differs from cinematic (override forced), adapt while keeping the "clean classical advertising" intent — but the cinematic baseline should be the default expression of this preset.`,
  },
};

export const PRESET_CONCEPT_LIST: PresetConcept[] = [
  PRESET_CONCEPTS.image_classique,
  PRESET_CONCEPTS.podcast,
  PRESET_CONCEPTS.blog_article,
  PRESET_CONCEPTS.faux_article,
  PRESET_CONCEPTS.native_ads,
  PRESET_CONCEPTS.ugly_ads,
];

// =============================================================================
// Custom angle / concept builders — used when the user types their own
// =============================================================================

export type CustomAngleInput = {
  name: string;
  headline: string;
  body?: string;
  cta?: string;
  /**
   * UI-only flag : true once the user has clicked "Valider" so the variants
   * panel unlocks. Drafts (validated:false) only contribute their base copy.
   */
  validated?: boolean;
  /**
   * Variants generated for this custom angle. Ephemeral — the helper
   * `generateAngleCopyVariants` is called via a server action that returns
   * the list back to the client without DB persistence (custom angles are
   * not part of brief_data.angles[]).
   */
  copy_variants?: import("./brief-schema").CopyVariant[];
};

export type CustomConceptInput = {
  name: string;
  description: string;
  render_style: RenderStyle;
  /** UI-only flag : true once the user has clicked "Valider". */
  validated?: boolean;
  /** Variants generated client-side via the ephemeral server action. */
  concept_variants?: import("./brief-schema").ConceptVariant[];
};

export function buildCustomAngle(input: CustomAngleInput) {
  const headline = input.headline.trim();
  const name = (input.name.trim() || autoName(headline)) || "Angle perso";
  const body = input.body?.trim();
  const cta = input.cta?.trim();
  return {
    name,
    rationale: "Angle personnalisé écrit par l'utilisateur",
    headline,
    body: body && body.length > 0 ? body : undefined,
    cta: cta && cta.length > 0 ? cta : undefined,
    copy_variants: input.copy_variants,
  };
}

export function buildCustomConcept(input: CustomConceptInput) {
  const description = input.description.trim();
  const name = (input.name.trim() || autoName(description)) || "Concept perso";
  return {
    name,
    rationale: "Concept personnalisé écrit par l'utilisateur",
    render_style: input.render_style,
    description,
    concept_variants: input.concept_variants,
  };
}

function autoName(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 30) return trimmed;
  return trimmed.slice(0, 27) + "…";
}

// =============================================================================
// Preset selection input — id + style override
// =============================================================================

export type PresetSelectionInput = {
  id: PresetConceptId;
  render_style: RenderStyle;
  /** Variants generated client-side via the ephemeral server action. */
  concept_variants?: import("./brief-schema").ConceptVariant[];
};

/**
 * Build the effective Concept for a selected preset, applying the user's
 * style override on top of the preset's intent-focused description.
 */
export function buildPresetConcept(input: PresetSelectionInput): Concept {
  const preset = PRESET_CONCEPTS[input.id];
  return {
    name: preset.name,
    rationale: preset.rationale,
    render_style: input.render_style,
    description: preset.description,
    concept_variants: input.concept_variants,
  };
}
