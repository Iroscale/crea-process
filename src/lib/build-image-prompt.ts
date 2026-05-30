/**
 * Assemble un prompt final pour un modèle d'image, à partir d'un (angle, concept, mode, theme).
 *
 *  - mode "full"      → texte intégré dans l'image par l'IA (Gemini 3 Pro Image)
 *  - mode "composite" → image sans texte, le copy est ajouté en code après par le compositor
 */
import type { Angle, Concept, Brief, RenderStyle } from "./brief-schema";
import {
  formatBrandForImagePrompt,
  deriveThemeFromBrand,
  type BrandContext,
} from "./brand-context";
import { formatRegionForImagePrompt } from "./regions";

function applyBrandTheme(
  theme: Brief["text_overlay"]["theme"],
  brand: BrandContext | null | undefined
): Brief["text_overlay"]["theme"] {
  if (!brand) return theme;
  const overrides = deriveThemeFromBrand(brand);
  if (!overrides) return theme;
  return {
    ...theme,
    text_color: overrides.text_color,
    accent_color: overrides.accent_color,
    accent_text_color: overrides.accent_text_color,
  };
}

// =============================================================================
// Per-style headers + footers — replace the all-cinematic prompts so each
// concept is rendered in its declared aesthetic (UGC, screenshot, editorial…).
// =============================================================================

type StylePromptBlock = { header: string; footer: string };

const STYLE_PROMPTS: Record<RenderStyle, StylePromptBlock> = {
  cinematic: {
    header:
      "Cinematic square 1:1 ad creative, in the visual language of an Apple keynote reveal — premium, intentional, every pixel art-directed.",
    footer: `Lighting and rendering: dramatic but tasteful, cinematic film grain, soft chromatic aberration on highlights. Rendered like Octane + Redshift, 8K product photography meets motion-graphics still.

Editorial, intentional, premium. Every pixel art-directed. No clip art, no watermarks, no stock-photo feel.`,
  },

  ugc: {
    header: `Authentic phone-shot square 1:1 ad creative — looks like a real customer recorded this in 30 seconds on iPhone 15 Pro. Natural daylight from a window, slight digital grain, hand-held framing, NOT centered, slightly off-axis. NO studio lighting, NO Apple-keynote polish, NO commercial gloss, NO 3D render. The subject is a real-looking 25-45 year old French person in a casual environment (kitchen, living room, café, home office). Skin tones natural, no retouching, real pores. Casual outfit (knit sweater, t-shirt, hoodie — not blazer). The viewer should feel they're watching a real person's iPhone selfie video frame.`,
    footer: `Look: candid, lo-fi-on-purpose, raw — like a TikTok or Instagram Reel still grab. Faint vignetting from phone lens, slight motion blur on hands. Subtitle bar style at the bottom IS allowed (TikTok-style yellow caption on dark band) when the layout calls for it. Avoid : DSLR bokeh, ring-light glow, perfect framing, magazine retouch. The "imperfection" IS the format.`,
  },

  screenshot_social: {
    header: `This square 1:1 image IS a phone screenshot — NOT a photograph, NOT a 3D render. Render the EXACT pixel-perfect mobile UI: status bar at top (carrier, time 14:23, battery), correct app chrome (Messages / Twitter-X / Instagram comment / WhatsApp depending on the concept). All UI metrics realistic: bubble shapes, paddings, font (SF Pro on iOS, Roboto on Android), timestamps, send arrow, keyboard at bottom if relevant. The TEXT CONTENT is the message of the ad. NO photographic background, NO product close-up, NO cinematic lighting — pure flat phone-screen rendering. Optionally show the phone screenshot slightly tilted on a soft neutral solid-color background, or full-bleed phone-screen aspect-fit.`,
    footer: `The viewer must think "someone shared a real conversation / tweet / DM with me". Total UI authenticity. NO ad-pill, NO sponsored badge, NO logo overlay. If a contact name appears, use plausible French first names. If a tweet, use a verified-look-alike but generic handle (no real-brand impersonation). Text rendered crisp at native phone resolution.`,
  },

  editorial: {
    header: `Square 1:1 ad creative rendered as CREDIBLE EDITORIAL CONTENT in French. Pick the format that best fits the concept and the brand voice. CRITICAL : invent a FICTIONAL but plausible publication / outlet name (e.g. "L'Économie Hebdo", "Finance Mag", "Investir Quotidien", "Le Patrimoine", "Décryptage Finance", "Argent & Vous"). NEVER use the names of real existing media brands — risk of passing-off / impersonation.

▸ FORMAT 1 — PRINT MAGAZINE LAYOUT (generic premium French financial press)
  Paper-white background (#F8F5EE), tight grid, hairline rules. Top-left header with the FICTIONAL publication name in tracked small caps. Kicker in small caps next line ("FINANCE — DOSSIER ÉPARGNE", "ANALYSE — RETRAITE"). Serif headline (Tiempos Headline, Domaine Display, Source Serif Pro, Canela Deck). Sans-serif body (Söhne, Inter, GT America). Italic byline ("Par [Prénom Nom]") + date. Optional editorial photo with italic small-caps caption.

▸ FORMAT 2 — ONLINE ARTICLE / BLOG POST (independent author or generic finance blog)
  Clean web typography (Söhne, Inter, Charter, Tiempos for headlines). Centered narrow column, soft off-white or pure white background. Author byline at top with small profile pic + "Auteur depuis…" / publication date / reading time. Web-style hierarchy : headline, subhead, body paragraphs, optional pull quote. Subtle subscribe-button or "S'abonner" link in author area. Use a FICTIONAL blog name in the header bar.

▸ FORMAT 3 — SOCIAL COMMENT REPLY (verified expert on a generic feed)
  Light social-feed comment block — just the comment, not the full feed. Verified-looking expert (financial advisor, journalist, consultant) with avatar circle and a verified-style checkmark next to name. Realistic name and credentials line ("Conseiller en gestion de patrimoine · 12 ans d'expérience"). Multi-paragraph thoughtful reply text. Generic social UI conventions ("Like · Reply · 1 j" actions, engagement count) WITHOUT explicit Facebook / Instagram / Twitter branding — keep the chrome generic enough to read as social-platform-style without identifying any specific platform.

▸ FORMAT 4 — WEBPAGE SCREENSHOT (fictional French finance news site)
  Looks like a screenshot of an article from a FICTIONAL finance news website (invent a plausible URL like "leconomie-hebdo.fr", "finance-mag.fr", "decryptage-finance.fr"). Browser address bar visible at top with the fictional URL. Article headline + lead, body in 2 columns or 1 narrow column, related-articles sidebar, footer with "Mots-clés" and "Partager". Thin grey frame chrome around the article body. NEVER reproduce the layout / logo / typography of an actual real website (capital.fr, lesechos.fr, etc.) — keep the visual generic enough to read as "a French financial news site" without impersonating any specific real one.

══ MANDATORY — LEGAL COMPLIANCE & SOURCING ══
Whatever format you pick, INCLUDE A SMALL VISIBLE SOURCE LINE at the bottom citing a plausible French / European OFFICIAL DATA SOURCE (statistical agency, central bank, regulator, governmental body — these are facts, fair use to attribute) :
- "Source : INSEE 2024"
- "D'après la Banque de France 2023"
- "Données ACPR"
- "Étude OCDE 2024"
- "Source : AMF"
- "Eurostat 2024"
- "Source : France Stratégie · 2024"
- "Données Banque Centrale Européenne"
- "Source : DREES" (Direction de la recherche du ministère)
- "Source : INED" (démographie)

DO NOT cite real media brands (Les Echos, Capital, Bloomberg, BFM, etc.) as sources — only OFFICIAL data providers above.

The information shown MUST be plausible and grounded in reality — DO NOT invent precise statistics or fictional percentages. Use safe formulations :
- "selon les données de [source]"
- "d'après [organisme]"
- "environ X %" or "près de Y millions" (vague enough to be defensible)
- Real well-known orders of magnitude (inflation ~3 %/an, livret A ~3 %, livret épargne populaire ~5 %, etc.)
- Generic ranges, not fake precision (avoid "78,3 %" — write "près de 80 %" or "environ 8 ménages sur 10")

This source citation is mandatory for legal compliance and credibility.`,
    footer: `Vibe : sober, intelligent, intellectually credible — the reader sees this and trusts it. The typography hierarchy is deliberate, the layout is print/web professional, the source citation is visible and legible at the bottom. Color palette : ink black, paper white, ONE secondary brand accent. Whatever the medium, NO ad-pill, NO sponsored badge, NO promotional CTA imposed on the layout. If a CTA is needed, weave it naturally into the editorial conventions ("En savoir plus →" link at the bottom, "Lire la suite", "Découvrir l'analyse"). The ad must look indistinguishable from a real piece of editorial content at first glance — but the publication / website / outlet itself must be FICTIONAL (invented plausible name) to avoid passing off any real existing media brand.`,
  },

  comparison_split: {
    header: `Square 1:1 ad creative built as a SPLIT-SCREEN comparison. The 1080×1080 frame is divided in two halves (vertical 50/50, OR horizontal 50/50, choose what fits the comparison). Each half has its OWN labelled subject, its own visual treatment, contrasting strongly in color, lighting and mood from the other. Clear visual axis (a thin line, a hard edge, or a slight gap) separating the two halves. Each half labelled at top with a short bold uppercase tag (e.g. "AVANT" / "APRÈS", "EUX" / "NOUS", "BANQUE TRADITIONNELLE" / "[PRODUIT]", "0,5 %" / "+ X %").`,
    footer: `The comparison must be INSTANTLY readable in 0.5s of scroll. Visual grammar: dim/cool/cluttered on the "before" side; bright/warm/clear on the "after" side — or whatever contrast best dramatizes the gap. Typography matched between the two halves so the reader compares apples to apples. Premium but legible — no 3D pyrotechnics, no decorative noise. The frontier between the halves IS a design element, not an accident.`,
  },

  data_viz: {
    header: `Square 1:1 sober infographic / data visualization — the chart IS the hero. ONE clear data graphic dominates the frame: bar chart, line graph, area chart, dot plot, or comparison columns. Axes labelled cleanly with small sans-serif (Inter / IBM Plex Sans), grid in faint hairlines, ONE highlighted data point or column in accent color. Typography hierarchy: short kicker / category label, big number or chart title, supporting body, source line at bottom in small italic. Style reference: Financial Times graphics desk, Bloomberg Opinion data, Le Monde data desk, Pew Research, Statista at its best.`,
    footer: `The viewer should LEARN something from the chart even before reading the headline. Sober palette: off-white or near-black background, max 3 colors total including the accent. NO photographic decorations, NO 3D blob behind the chart, NO confetti — just data + minimal supporting layout. The chart must be plausible and well-crafted (correct units, sensible scale, no broken-axis tricks unless explicitly editorial). Aim for "this could appear in a serious newspaper".`,
  },

  meme: {
    header: `Square 1:1 ad creative in MEME format. Use a recognizable meme template (Drake Hotline Bling, Distracted Boyfriend, Two Buttons sweating guy, This Is Fine dog, Galaxy Brain, Anakin/Padmé, Spider-Man pointing — or invent one in the same spirit if none of those fits) and adapt it to a French finance topic. Top text and bottom text in the meme's classic typography (Impact white-with-black-stroke for old-school Imgur memes, OR modern Inter / Helvetica Bold for cleaner contemporary style). Solid color background or the original meme image as base. The image humor is CULTURALLY ON-TARGET for French 25-40 year olds.`,
    footer: `Tone: relatable, slightly self-deprecating, never cringe, never preachy. Avoid dead/over-used memes (Doge from 2014, Pepe, anything cancellable). The HEADLINE becomes the punchline. Background: clean enough that the joke lands in 0.3s. NO gradient overlays, NO Octane render, NO Apple keynote — embrace the medium. The meme should make a finance Twitter user smile, then think "actually that's true".`,
  },
};

// Backward-compat default
const FALLBACK_STYLE: RenderStyle = "cinematic";

function getStyleBlock(style: RenderStyle | undefined): StylePromptBlock {
  return STYLE_PROMPTS[style ?? FALLBACK_STYLE];
}

export function buildImagePrompt(
  concept: Concept,
  angle: Angle,
  mode: "full" | "composite",
  theme: Brief["text_overlay"]["theme"],
  layout: Brief["text_overlay"]["layout"],
  brand?: BrandContext | null,
  region?: string | null
): string {
  const style = concept.render_style ?? FALLBACK_STYLE;
  const { header, footer } = getStyleBlock(style);
  // When a brand is set, override the brief's theme colors with the brand
  // palette so the typography block uses brand colors even if the brief
  // was finalized before the brand was associated.
  const effectiveTheme = applyBrandTheme(theme, brand);

  const lines: string[] = [];
  // Brand + region blocks FIRST — must dominate the prompt
  if (brand) {
    lines.push(formatBrandForImagePrompt(brand));
    lines.push("");
  }
  if (region && region !== "international") {
    lines.push(formatRegionForImagePrompt(region));
    lines.push("");
  }
  lines.push(header);
  lines.push("");
  lines.push(`Visual concept — ${concept.name} (style: ${style}):`);
  lines.push(concept.description);
  lines.push("");

  if (mode === "full") {
    lines.push(buildTypographyBlock(angle, effectiveTheme, layout, style));
    lines.push("");
  } else {
    lines.push(safeZoneInstruction(layout, style));
    lines.push("");
  }

  lines.push(footer);

  // Repeat brand palette at the very end (sandwich technique) to ensure
  // the model doesn't drift on colors during long generations.
  if (brand && brand.primary_colors.length > 0) {
    lines.push("");
    lines.push(
      `REMINDER — final visual MUST use only colors from the brand palette : ${brand.primary_colors.join(", ")}. Any other color is forbidden.`
    );
  }

  return lines.join("\n");
}

function buildTypographyBlock(
  angle: Angle,
  theme: Brief["text_overlay"]["theme"],
  layout: Brief["text_overlay"]["layout"],
  style: RenderStyle
): string {
  // Style-specific typography directive — overrides the generic one when relevant.
  const typoLead = typoDirectiveForStyle(style, layout);

  const lines: string[] = [];
  lines.push(typoLead);

  // Headline with optional emphasis on certain words
  if (angle.emphasis_words && angle.emphasis_words.length > 0) {
    const emp = angle.emphasis_words.map((w) => `"${w}"`).join(", ");
    lines.push(
      `- Headline (${theme.text_color} bold, with the words ${emp} emphasized in ${theme.accent_color}): "${angle.headline}"`
    );
  } else {
    lines.push(
      `- Headline (${theme.text_color} bold): "${angle.headline}"`
    );
  }
  if (angle.body) {
    lines.push(
      `- Body (${theme.text_color} regular, opacity 0.85): "${angle.body}"`
    );
  }
  if (angle.cta) {
    if (style === "ugc" || style === "screenshot_social") {
      // No "premium pill CTA" — the CTA blends as a small inline label or comment
      lines.push(
        `- CTA (subtle, integrated naturally into the medium — caption, comment, or inline link rather than a designed pill): "${angle.cta}"`
      );
    } else if (style === "meme") {
      // Memes don't have CTAs — drop it
      lines.push(
        `- CTA: omit (memes don't carry CTA pills — the punchline IS the message)`
      );
    } else {
      lines.push(
        `- CTA (rounded pill, ${theme.accent_color} background, ${theme.accent_text_color} uppercase bold tight kerning): "${angle.cta.toUpperCase()}"`
      );
    }
  }
  lines.push(
    "Text rendered in PERFECT French spelling, kerning tight, sharp pixels."
  );

  return lines.join("\n");
}

function typoDirectiveForStyle(
  style: RenderStyle,
  layout: Brief["text_overlay"]["layout"]
): string {
  const layoutDesc =
    layout === "bottom"
      ? "Bottom 30% of the frame"
      : layout === "top"
      ? "Top 30% of the frame"
      : layout === "center"
      ? "Centered band of the frame"
      : layout === "split-bottom"
      ? "Bottom 40% — split-screen color block"
      : layout === "side-strip-left"
      ? "Left 38% — vertical accent strip with stacked text"
      : layout === "side-strip-right"
      ? "Right 38% — vertical accent strip with stacked text"
      : layout === "sticker-burst"
      ? "Top-right corner — large rotated sticker / badge"
      : layout === "magazine-cover"
      ? "Top kicker + huge serif headline filling upper half"
      : layout === "floating-card"
      ? "Centered glass-effect card containing all the copy"
      : layout === "marquee-band"
      ? "Horizontal accent band across vertical center, headline only"
      : layout === "corner-tag"
      ? "Diagonal accent ribbon top-left + headline at bottom"
      : layout === "comparison-bottom"
      ? "Two A/B labels at top + unified copy block at bottom"
      : "Bottom 40% — split-screen color block";

  switch (style) {
    case "cinematic":
      return `${layoutDesc}, premium sans-serif typography (Inter / SF Pro Display / Söhne), tight kerning, generous negative space:`;
    case "ugc":
      return `Subtitle bar at the bottom of the frame (TikTok-style yellow caption on dark translucent band) OR caption-style typography integrated as if added by the social platform. Rendered like an iPhone subtitle, NOT like premium ad typography:`;
    case "screenshot_social":
      return `The text below IS the content of the screenshot (SMS bubbles, tweet body, comment text — not an overlay on top of an image). Render it inside the appropriate UI element (chat bubble, tweet body, comment block) using the platform's native font (SF Pro on iOS messages, system on Twitter-X, etc.):`;
    case "editorial":
      return `Editorial magazine typography stack — Headline in serif (Tiempos Headline / Domaine Display / Source Serif), body in sans-serif (Söhne / Inter), kicker in tracked-out small caps. Print-style hierarchy, hairline rules, tasteful pull-quote allowed:`;
    case "comparison_split":
      return `Per-half labels at top in bold uppercase sans-serif (Inter / Helvetica Bold), main copy under the halves in clean sans-serif. Both halves typographically symmetrical for fair comparison:`;
    case "data_viz":
      return `Sober infographic typography (Inter / IBM Plex Sans / GT America). Big number or chart title above, supporting headline below, source line at bottom in italic small. Hierarchy is FT-Bloomberg-style, deliberate:`;
    case "meme":
      return `Meme typography — top text and bottom text in classic Impact white-with-black-stroke OR modern Inter Bold depending on meme template. Headline is the punchline at the bottom or top, NO premium typesetting:`;
  }
}

function safeZoneInstruction(
  layout: Brief["text_overlay"]["layout"],
  style: RenderStyle
): string {
  // For screenshot_social, the text IS the rendered UI — there's no concept of
  // "leave space for a code overlay". For meme, top/bottom text is part of the
  // model output. So composite mode doesn't really apply for those styles, but
  // we keep a sensible fallback hint.
  if (style === "screenshot_social") {
    return "The text content of the screenshot is part of the model output. Frame the screenshot tilted on a soft neutral background.";
  }
  if (style === "meme") {
    return "Top and bottom text of the meme are part of the model output. Render with appropriate meme typography.";
  }
  if (style === "ugc") {
    return "Reserve a clean horizontal band at the bottom of the frame for a TikTok-style subtitle bar to be added later. Keep that band visually quiet.";
  }
  if (style === "editorial") {
    return "Reserve a calm rectangular zone in the layout (typically right-side or bottom) for editorial typography to be added later — keep that zone uniform paper-white or soft.";
  }
  if (style === "data_viz") {
    return "Reserve a quiet zone above or below the chart for the main headline to be added later. Keep that zone uniform.";
  }
  if (style === "comparison_split") {
    return "Reserve a slim header band above the split for labels to be added later. Keep that band uniform.";
  }
  // cinematic — original behavior
  switch (layout) {
    case "bottom":
      return "The lower third of the frame should be a clean uniform area — soft gradient or out-of-focus background — to leave space for a text overlay added later. No text in the image.";
    case "top":
      return "The upper third of the frame should be calm and unobstructed for a text overlay added later. No text in the image.";
    case "center":
      return "Frame the subject away from the center, leaving a centered band of soft tone. No text in the image.";
    case "split-bottom":
      return "The lower 40% should recede into a solid muted color block — clean breathing room for a text overlay added later. No text in the image.";
    case "side-strip-left":
      return "The LEFT 38% of the frame will be covered by a solid vertical accent strip — frame the hero subject in the right two-thirds and keep the left third visually unobtrusive (it will be hidden). No text in the image.";
    case "side-strip-right":
      return "The RIGHT 38% of the frame will be covered by a solid vertical accent strip — frame the hero subject in the left two-thirds and keep the right third visually unobtrusive (it will be hidden). No text in the image.";
    case "sticker-burst":
      return "Top-right area (~40% × 40%) will be covered by a rotated bright sticker — keep the hero subject toward bottom-left or center-left so the sticker doesn't crash into it. No text in the image.";
    case "magazine-cover":
      return "Top half will carry a large editorial headline — frame the hero subject in the LOWER half with a clean dark area at the top and at the bottom for the kicker + body. No text in the image.";
    case "floating-card":
      return "A centered card occupying ~70% × 50% of the frame will hold all the copy — frame the hero subject so it BORDERS the card without being centered (the card will sit on top). Keep the periphery visible. No text in the image.";
    case "marquee-band":
      return "A horizontal accent band ~25% tall will cover the vertical center — frame the hero subject either at the top or the bottom, NEVER centered. The center band will be hidden. No text in the image.";
    case "corner-tag":
      return "Top-left corner will carry a diagonal ribbon, bottom area will carry the headline + CTA — keep the hero subject in the central-right area so neither overlay covers it. No text in the image.";
    case "comparison-bottom":
      return "The image is a 50/50 split-screen comparison (left = pain / before, right = solution / after). The COMPOSITOR will overlay : (a) two short uppercase labels at the TOP of each half, (b) a unified dark strip at the BOTTOM 40% with a single headline + body + CTA. Frame each half so its TOP-LEFT or TOP-RIGHT corner is visually quiet (label tag will sit there, ~120 px tall) and the BOTTOM 40% recedes into a darker tone. NO text in the image.";
  }
}

// =============================================================================
// CAROUSEL — value-first 3-slide narrative
// =============================================================================

export type CarouselSlideRole = "hook" | "insight" | "application";

export type CarouselSlide = {
  role: CarouselSlideRole;
  headline: string;
  body: string;
  cta?: string;
};

/**
 * Build a slide-specific image prompt for a value-first carousel.
 * Each slide has its OWN visual narrative, copy, and mood — yet they share the
 * concept's visual language (palette, materials, brand element) so the carousel
 * feels like ONE coherent series when seen side-by-side.
 */
export function buildCarouselSlidePrompt(args: {
  concept: Concept;
  angle: Angle;
  mode: "full" | "composite";
  theme: Brief["text_overlay"]["theme"];
  layout: Brief["text_overlay"]["layout"];
  slide: CarouselSlide;
  slideIndex: number; // 1, 2, or 3
  brand?: BrandContext | null;
  region?: string | null;
}): string {
  const { concept, mode, theme, layout, slide, slideIndex, brand, region } = args;
  const style = concept.render_style ?? FALLBACK_STYLE;
  const { header, footer } = getStyleBlock(style);
  const effectiveTheme = applyBrandTheme(theme, brand);

  const lines: string[] = [];

  // Brand + region blocks FIRST — dominate the prompt
  if (brand) {
    lines.push(formatBrandForImagePrompt(brand));
    lines.push("");
  }
  if (region && region !== "international") {
    lines.push(formatRegionForImagePrompt(region));
    lines.push("");
  }
  lines.push(
    `Square 1:1 SLIDE ${slideIndex} of 3 in a value-first social media CAROUSEL (style: ${style}). The viewer is mid-scroll on Instagram and will judge this slide in 0.5s.`
  );
  lines.push("");
  lines.push(header);
  lines.push("");
  lines.push(`Visual language (shared across the carousel) — ${concept.name}:`);
  lines.push(concept.description);
  lines.push("");

  // Per-slide narrative + visual cues
  lines.push(slideNarrative(slide.role, slideIndex));
  lines.push("");

  if (mode === "full") {
    lines.push(buildCarouselTypographyBlock(slide, effectiveTheme, layout, slideIndex, style));
    lines.push("");
  } else {
    lines.push(safeZoneInstruction(layout, style));
    lines.push("");
  }

  lines.push(
    "Color grading and material vocabulary STRICTLY consistent with the other slides of this carousel — same palette, same lighting style, same brand atmosphere. The 3 slides must FEEL like a series."
  );
  lines.push("");
  lines.push(footer);

  if (brand && brand.primary_colors.length > 0) {
    lines.push("");
    lines.push(
      `REMINDER — final visual MUST use only colors from the brand palette : ${brand.primary_colors.join(", ")}. Any other color is forbidden.`
    );
  }

  return lines.join("\n");
}

function slideNarrative(role: CarouselSlideRole, idx: number): string {
  switch (role) {
    case "hook":
      return `▸ SLIDE ${idx} — HOOK (purpose: stop the scroll, ignite curiosity)
- Mood: intriguing, slightly mysterious, evocative — suggests a question rather than answers it
- Composition: ONE strong focal subject, generous negative space, minimalist
- Lighting: dramatic, with darkness or shadow that hints at the unknown
- Visual metaphors that fit (pick one or invent in the same spirit): a magnifying glass on parchment, a single illuminated point in darkness, a closed door slightly ajar with light leaking out, a coin balanced on edge, a question mark formed by environmental elements
- The viewer should think "interesting — tell me more" without yet knowing the answer
- AVOID: salesy lighting, smiling faces, money close-ups, anything that screams "ad"`;

    case "insight":
      return `▸ SLIDE ${idx} — INSIGHT (purpose: deliver the value, the "aha" moment)
- Mood: clarifying, illuminating, the curtain lifts
- Composition: ONE clear element being understood — a key data point isolated, a side-by-side comparison, a concept made visible through a clean diagram-like arrangement
- Lighting: even, controlled, almost laboratory-like — clarity over drama. The viewer's eye lands instantly on the insight
- Visual metaphors that fit: a sleek chart with one revealed data point, a before/after comparison in identical staging, a hourglass with two distinct grain colors, a single illuminated path among many dim ones
- The viewer should feel "I just learned something useful — even if I never click"
- AVOID: vague abstract art that doesn't communicate, generic stock-photo-like imagery, the same composition as slide 1`;

    case "application":
      return `▸ SLIDE ${idx} — APPLICATION (purpose: link the insight to the product, soft CTA)
- Mood: grounded, settled, calm trust — the application of the lesson, not the lesson itself
- Composition: a peaceful end-state where the lesson is being lived. Subtle, not triumphant
- Lighting: warm-cool balance, soft golden-hour or polished-interior energy. The CTA pill is integrated naturally — never imposed or screaming
- Visual metaphors that fit: a hand reaching toward something polished and considered, a single object placed precisely on a surface, a settled scene of quiet confidence (a desk, a window view, a still-life that says "in control")
- The viewer should feel invited, not sold — the CTA is a door, not a push
- AVOID: dollar signs, trophies, victory poses, fireworks, "Limited offer" energy`;
  }
}

function buildCarouselTypographyBlock(
  slide: CarouselSlide,
  theme: Brief["text_overlay"]["theme"],
  layout: Brief["text_overlay"]["layout"],
  slideIndex: number,
  style: RenderStyle
): string {
  const lines: string[] = [];
  lines.push(typoDirectiveForStyle(style, layout));

  lines.push(
    `- Headline (${theme.text_color} bold): "${slide.headline}"`
  );
  if (slide.body) {
    lines.push(
      `- Body (${theme.text_color} regular, opacity 0.85): "${slide.body}"`
    );
  }
  if (slide.cta && slide.role === "application") {
    if (style === "ugc" || style === "screenshot_social") {
      lines.push(
        `- CTA (subtle, integrated naturally — caption / inline link, NOT a designed pill): "${slide.cta}"`
      );
    } else if (style === "meme") {
      lines.push(`- CTA: omit (memes don't carry CTA pills)`);
    } else {
      lines.push(
        `- CTA (rounded pill, ${theme.accent_color} background, ${theme.accent_text_color} uppercase bold tight kerning): "${slide.cta.toUpperCase()}"`
      );
    }
  }
  if (slideIndex < 3) {
    lines.push(
      "NO call-to-action button on this slide. The implicit CTA is 'swipe for more'. Do NOT render a CTA pill — only the headline + body. Keep the bottom of the frame quiet."
    );
  }
  lines.push(
    "Text floats elegantly, integrated into the composition rather than slapped on top. Sharp, perfectly spelled in French, kerning tight."
  );

  // Subtle pagination cue at the bottom-right corner — helps the viewer feel
  // the series momentum.
  lines.push(
    `Add a small subtle pagination indicator in the bottom-right corner: 3 small dots, the ${slideIndex}${
      slideIndex === 1 ? "st" : slideIndex === 2 ? "nd" : "rd"
    } one filled in ${theme.accent_color}, the other two as faint outlines. Tiny, discreet, premium — like the bottom of an Apple keynote slide.`
  );

  return lines.join("\n");
}
