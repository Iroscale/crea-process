/**
 * Composite an AI-generated visual + structured text overlay into a finished
 * ad creative (1080×1080).
 *
 * Pipeline :
 *   1. Fetch the AI image, resize/cover to 1080×1080
 *   2. Apply scrim (legibility gradient over the image)
 *   3. Render the text block as SVG → PNG via Resvg with embedded Inter font
 *   4. Composite SVG onto the image
 *   5. Return final PNG buffer
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import type { Brief } from "./brief-schema";

const SIZE = 1080;
const PADDING = 96; // 8.9% horizontal padding

/**
 * The full creative palette, ordered to maximize VISUAL CONTRAST between
 * adjacent items so a small batch (4-6 images) reading the palette in order
 * gets maximum diversity. Mix bold blocks, vertical strips, stickers,
 * editorial typography, glass cards.
 */
const CREATIVE_LAYOUTS: Brief["text_overlay"]["layout"][] = [
  "split-bottom",
  "side-strip-left",
  "sticker-burst",
  "magazine-cover",
  "marquee-band",
  "side-strip-right",
  "floating-card",
  "corner-tag",
  "bottom",
  "top",
  "center",
];

/**
 * Deterministic layout pick — given an integer seed (e.g. concept index +
 * angle index + slide), returns a different layout per seed value. Used by
 * the matrix builder so adjacent images in the same batch get distinct
 * compositions automatically. The brief's preferred layout becomes a hint
 * that's only honored when no rotation is desired.
 */
export function pickCreativeLayout(
  seed: number
): Brief["text_overlay"]["layout"] {
  const i = ((seed % CREATIVE_LAYOUTS.length) + CREATIVE_LAYOUTS.length) %
    CREATIVE_LAYOUTS.length;
  return CREATIVE_LAYOUTS[i];
}

const FONTS_DIR = resolve(process.cwd(), "fonts");
let fontFiles: string[] | null = null;
function getFontFiles() {
  if (fontFiles) return fontFiles;
  fontFiles = [
    resolve(FONTS_DIR, "Inter-Bold.ttf"),
    resolve(FONTS_DIR, "Inter-SemiBold.ttf"),
    resolve(FONTS_DIR, "Inter-Regular.ttf"),
  ].filter((p) => {
    try {
      readFileSync(p);
      return true;
    } catch {
      return false;
    }
  });
  return fontFiles;
}

export type CompositeInput = {
  /** Raw image bytes OR a URL to fetch */
  image: Buffer | string;
  copy: { headline: string; body?: string; cta?: string };
  textOverlay: Brief["text_overlay"] & { emphasis_words?: string[] };
};

export async function compositeAd({
  image,
  copy,
  textOverlay,
}: CompositeInput): Promise<Buffer> {
  // 1. Resolve to bytes + resize base image
  let baseBuf: Buffer;
  if (typeof image === "string") {
    const r = await fetch(image);
    if (!r.ok) throw new Error(`Image fetch failed: ${r.status}`);
    baseBuf = Buffer.from(await r.arrayBuffer());
  } else {
    baseBuf = image;
  }
  const base = await sharp(baseBuf)
    .resize(SIZE, SIZE, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  // 2. Build the SVG (scrim + text block)
  const svg = buildSvg(copy, textOverlay);

  // 3. SVG → PNG via Resvg with font files
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: SIZE },
    background: "rgba(0,0,0,0)",
    font: {
      fontFiles: getFontFiles(),
      loadSystemFonts: true,
      defaultFontFamily: "Inter",
    },
  });
  const overlayPng = resvg.render().asPng();

  // 4. Composite
  const final = await sharp(base)
    .composite([{ input: overlayPng, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();

  return final;
}

// ---------------------------------------------------------------------------
// SVG builder
// ---------------------------------------------------------------------------

function buildSvg(
  copy: { headline: string; body?: string; cta?: string },
  overlay: Brief["text_overlay"] & { emphasis_words?: string[] }
): string {
  const { headline, body, cta } = copy;
  const { layout, theme, emphasis_words } = overlay;

  const scrimDef = scrimGradient(layout, theme.scrim);

  // Layout-specific positioning. Returns y baseline from top.
  const block = buildTextBlock(
    {
      headline,
      body,
      cta,
      emphasis: emphasis_words ?? [],
      textColor: theme.text_color,
      accentColor: theme.accent_color,
      accentTextColor: theme.accent_text_color,
    },
    layout
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${scrimDef.defs}
  ${scrimDef.rect}
  ${block}
</svg>`;
}

function scrimGradient(
  layout: Brief["text_overlay"]["layout"],
  scrim: Brief["text_overlay"]["theme"]["scrim"]
) {
  // These layouts manage their own background / scrim treatment, so the
  // global scrim setting from the brief is ignored for them.
  const SELF_MANAGED: Brief["text_overlay"]["layout"][] = [
    "side-strip-left",
    "side-strip-right",
    "sticker-burst",
    "magazine-cover",
    "floating-card",
    "marquee-band",
    "corner-tag",
    "comparison-bottom",
  ];
  if (SELF_MANAGED.includes(layout)) return { defs: "", rect: "" };

  if (scrim === "none") return { defs: "", rect: "" };

  let def = "";
  if (scrim === "bottom-fade") {
    def = `<defs><linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
    </linearGradient></defs>`;
  } else if (scrim === "top-fade") {
    def = `<defs><linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.78"/>
      <stop offset="45%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient></defs>`;
  } else if (scrim === "full-dark") {
    def = `<defs><linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
    </linearGradient></defs>`;
  } else if (scrim === "full-light") {
    def = `<defs><linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFF" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#FFF" stop-opacity="0.55"/>
    </linearGradient></defs>`;
  }
  // Note: split-bottom is handled in buildTextBlock with a colored background block
  void layout;
  return {
    defs: def,
    rect: def
      ? `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#scrim)"/>`
      : "",
  };
}

type BlockOpts = {
  headline: string;
  body?: string;
  cta?: string;
  emphasis: string[];
  textColor: string;
  accentColor: string;
  accentTextColor: string;
};

function buildTextBlock(
  o: BlockOpts,
  layout: Brief["text_overlay"]["layout"]
): string {
  // Dispatch to the layout-specific renderer. Each one handles its own
  // typography hierarchy, positioning, and accent treatment.
  switch (layout) {
    case "side-strip-left":
      return buildSideStrip(o, "left");
    case "side-strip-right":
      return buildSideStrip(o, "right");
    case "sticker-burst":
      return buildStickerBurst(o);
    case "magazine-cover":
      return buildMagazineCover(o);
    case "floating-card":
      return buildFloatingCard(o);
    case "marquee-band":
      return buildMarqueeBand(o);
    case "corner-tag":
      return buildCornerTag(o);
    case "comparison-bottom":
      return buildComparisonBottom(o);
    default:
      return buildClassicBlock(o, layout);
  }
}

// ===========================================================================
// COMPARISON BOTTOM — labels A / B at the top of each half + UNIFIED block
// at the bottom (headline + body + CTA across the full width).
//
// Used exclusively when render_style="comparison_split" — the visual itself
// is a left/right diptyque generated by the image model, this layout adds
// the structural overlay that makes the comparison instantly readable.
// ===========================================================================

function buildComparisonBottom(o: BlockOpts): string {
  // Labels : pulled from comparison_labels first 2 emphasis words, fallback
  // to "AVANT" / "APRÈS". The matrix builder injects the concept's
  // comparison_labels into emphasis_words for this layout, so we read them
  // here in a single channel.
  const leftLabel = (o.emphasis[0] ?? "AVANT").toUpperCase();
  const rightLabel = (o.emphasis[1] ?? "APRÈS").toUpperCase();
  const LABEL_PAD_X = 36;
  const LABEL_PAD_Y = 36;
  const LABEL_FONT = 22;

  // Top vertical separator — thin accent line between the two halves
  const separator = `<line x1="${SIZE / 2}" y1="0" x2="${SIZE / 2}" y2="${SIZE * 0.55}" stroke="${o.accentColor}" stroke-width="2" stroke-opacity="0.9"/>`;

  // Two label tags : pill-shaped, anchored top-left and top-right
  function tag(text: string, side: "left" | "right"): string {
    const w = text.length * (LABEL_FONT * 0.62) + 36;
    const h = LABEL_FONT * 1.9;
    const x = side === "left" ? LABEL_PAD_X : SIZE - LABEL_PAD_X - w;
    const y = LABEL_PAD_Y;
    const fill = side === "left" ? "#0A0A0A" : o.accentColor;
    const txt = side === "left" ? o.textColor : o.accentTextColor;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" fill-opacity="${side === "left" ? "0.85" : "1"}"/>
            <text x="${x + w / 2}" y="${y + h / 2 + 7}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${LABEL_FONT}" fill="${txt}" letter-spacing="3">${escapeXml(text)}</text>`;
  }

  // ----- Bottom unified block (split-bottom style, accent line on top) ----
  const headlineLines = wrapText(o.headline, 22);
  const bodyLines = o.body ? wrapText(o.body, 50) : [];

  const HEADLINE_SIZE =
    headlineLines.length >= 3 ? 56 : headlineLines.length === 2 ? 64 : 76;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.05;
  const BODY_SIZE = 26;
  const BODY_LINE_HEIGHT = BODY_SIZE * 1.4;
  const CTA_HEIGHT = o.cta ? 84 : 0;
  const CTA_GAP = o.cta ? 32 : 0;
  const BODY_GAP = bodyLines.length > 0 ? 22 : 0;

  const headlineHeight = headlineLines.length * HEADLINE_LINE_HEIGHT;
  const bodyHeight = bodyLines.length * BODY_LINE_HEIGHT;
  const innerH = headlineHeight + BODY_GAP + bodyHeight + CTA_GAP + CTA_HEIGHT;
  const blockH = Math.max(innerH + PADDING * 1.1, SIZE * 0.40);
  const blockY = SIZE - blockH;

  const bgRect = `<rect x="0" y="${blockY}" width="${SIZE}" height="${blockH}" fill="#0A0A0A" fill-opacity="0.94"/>
                  <rect x="0" y="${blockY}" width="${SIZE}" height="3" fill="${o.accentColor}"/>`;

  const headlineStartY = blockY + PADDING * 0.55 + HEADLINE_SIZE * 0.85;

  // Headline CENTERED across the full width — single block, not duplicated
  const headlineSvg = headlineLines
    .map((line, i) => {
      const y = headlineStartY + i * HEADLINE_LINE_HEIGHT;
      const segs = highlightWordsForCenter(line, o.emphasis, o.accentColor);
      return `<text x="${SIZE / 2}" y="${y}" text-anchor="middle" font-family="Inter" font-weight="800" font-size="${HEADLINE_SIZE}" fill="${o.textColor}" letter-spacing="-1.5">${segs}</text>`;
    })
    .join("\n  ");

  const bodyStartY = headlineStartY + headlineHeight + BODY_GAP;
  const bodySvg = bodyLines
    .map((line, i) => {
      const y = bodyStartY + i * BODY_LINE_HEIGHT;
      return `<text x="${SIZE / 2}" y="${y}" text-anchor="middle" font-family="Inter" font-weight="500" font-size="${BODY_SIZE}" fill="${o.textColor}" fill-opacity="0.85">${escapeXml(line)}</text>`;
    })
    .join("\n  ");

  let ctaSvg = "";
  if (o.cta) {
    const ctaY = bodyStartY + bodyHeight + CTA_GAP;
    const ctaText = o.cta.toUpperCase();
    const ctaW = Math.min(Math.max(ctaText.length * 17 + 100, 320), 640);
    const ctaX = SIZE / 2 - ctaW / 2;
    ctaSvg = `
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${CTA_HEIGHT}" rx="${CTA_HEIGHT / 2}" fill="${o.accentColor}"/>
  <text x="${ctaX + ctaW / 2}" y="${ctaY + CTA_HEIGHT / 2 + 11}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="${o.accentTextColor}" letter-spacing="2">${escapeXml(ctaText)}</text>`;
  }

  return `${separator}
  ${tag(leftLabel, "left")}
  ${tag(rightLabel, "right")}
  ${bgRect}
  ${headlineSvg}
  ${bodySvg}
  ${ctaSvg}`;
}

/** Helper for centered highlight (emphasis words) — same logic as
 * highlightWords but suitable for text-anchor="middle" since tspans inherit. */
function highlightWordsForCenter(
  line: string,
  emphasis: string[],
  accent: string
): string {
  if (emphasis.length === 0) return escapeXml(line);
  return highlightWords(line, emphasis, accent);
}

// ===========================================================================
// CLASSIC LAYOUTS — bottom / top / center / split-bottom
// (the original 4, kept verbatim for compatibility)
// ===========================================================================

function buildClassicBlock(
  o: BlockOpts,
  layout: "bottom" | "top" | "center" | "split-bottom"
): string {
  const headlineLines = wrapText(o.headline, 14);
  const bodyLines = o.body ? wrapText(o.body, 38) : [];

  const HEADLINE_SIZE = headlineLines.length > 2 ? 64 : 78;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.05;
  const BODY_SIZE = 28;
  const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
  const CTA_HEIGHT = o.cta ? 88 : 0;
  const CTA_GAP = o.cta ? 36 : 0;
  const BODY_GAP = bodyLines.length > 0 ? 28 : 0;

  const headlineHeight = headlineLines.length * HEADLINE_LINE_HEIGHT;
  const bodyHeight = bodyLines.length * BODY_LINE_HEIGHT;
  const totalH = headlineHeight + BODY_GAP + bodyHeight + CTA_GAP + CTA_HEIGHT;

  let originY: number;
  let bgRect = "";

  if (layout === "top") {
    originY = PADDING + HEADLINE_SIZE * 0.9;
  } else if (layout === "center") {
    originY = SIZE / 2 - totalH / 2 + HEADLINE_SIZE * 0.9;
  } else if (layout === "split-bottom") {
    const blockH = Math.max(totalH + PADDING * 1.2, SIZE * 0.38);
    const blockY = SIZE - blockH;
    bgRect = `<rect x="0" y="${blockY}" width="${SIZE}" height="${blockH}" fill="${o.textColor}" fill-opacity="0.04"/>
              <rect x="0" y="${blockY}" width="${SIZE}" height="2" fill="${o.accentColor}"/>`;
    originY = blockY + PADDING * 0.6 + HEADLINE_SIZE * 0.9;
  } else {
    originY =
      SIZE -
      PADDING -
      CTA_HEIGHT -
      CTA_GAP -
      bodyHeight -
      BODY_GAP -
      headlineHeight +
      HEADLINE_SIZE * 0.9;
  }

  const headlineSvg = headlineLines
    .map((line, i) => {
      const y = originY + i * HEADLINE_LINE_HEIGHT;
      const segs = highlightWords(line, o.emphasis, o.accentColor);
      return `<text x="${PADDING}" y="${y}" font-family="Inter" font-weight="800" font-size="${HEADLINE_SIZE}" fill="${o.textColor}" letter-spacing="-1.5">${segs}</text>`;
    })
    .join("\n  ");

  const bodyY =
    originY + headlineHeight + BODY_GAP - HEADLINE_SIZE * 0.9 + BODY_SIZE;
  const bodySvg = bodyLines
    .map((line, i) => {
      const y = bodyY + i * BODY_LINE_HEIGHT;
      return `<text x="${PADDING}" y="${y}" font-family="Inter" font-weight="500" font-size="${BODY_SIZE}" fill="${o.textColor}" fill-opacity="0.92">${escapeXml(line)}</text>`;
    })
    .join("\n  ");

  let ctaSvg = "";
  if (o.cta) {
    const ctaY =
      bodyY +
      Math.max(bodyLines.length, 0) * BODY_LINE_HEIGHT -
      BODY_SIZE +
      CTA_GAP;
    const ctaText = o.cta.toUpperCase();
    const approxTextWidth = ctaText.length * 17 + 80;
    const ctaWidth = Math.min(
      Math.max(approxTextWidth, 280),
      SIZE - PADDING * 2
    );
    ctaSvg = `
  <rect x="${PADDING}" y="${ctaY}" width="${ctaWidth}" height="${CTA_HEIGHT}" rx="${CTA_HEIGHT / 2}" fill="${o.accentColor}"/>
  <text x="${PADDING + ctaWidth / 2}" y="${ctaY + CTA_HEIGHT / 2 + 11}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="${o.accentTextColor}" letter-spacing="2">${escapeXml(ctaText)}</text>`;
  }

  return `${bgRect}
  ${headlineSvg}
  ${bodySvg}
  ${ctaSvg}`;
}

// ===========================================================================
// SIDE STRIP — vertical 38% strip on left or right with all the copy stacked
// ===========================================================================

function buildSideStrip(o: BlockOpts, side: "left" | "right"): string {
  const STRIP_W = Math.round(SIZE * 0.38);
  const stripX = side === "left" ? 0 : SIZE - STRIP_W;
  const STRIP_PAD = 56;
  const innerW = STRIP_W - STRIP_PAD * 2;

  // Tighter wrap because the strip is narrower
  const headlineLines = wrapText(o.headline, 12);
  const bodyLines = o.body ? wrapText(o.body, 26) : [];

  const HEADLINE_SIZE =
    headlineLines.length >= 4 ? 46 : headlineLines.length === 3 ? 54 : 62;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.05;
  const BODY_SIZE = 24;
  const BODY_LINE_HEIGHT = BODY_SIZE * 1.4;

  const accentBar = `<rect x="${stripX}" y="0" width="${STRIP_W}" height="${SIZE}" fill="#0A0A0A" fill-opacity="0.92"/>
                     <rect x="${side === "left" ? STRIP_W - 4 : stripX}" y="0" width="4" height="${SIZE}" fill="${o.accentColor}"/>`;

  const headlineHeight = headlineLines.length * HEADLINE_LINE_HEIGHT;
  const bodyHeight = bodyLines.length * BODY_LINE_HEIGHT;
  const ctaH = o.cta ? 80 : 0;
  const totalH = headlineHeight + (bodyLines.length ? 32 + bodyHeight : 0) +
    (o.cta ? 40 + ctaH : 0);
  const startY = SIZE / 2 - totalH / 2 + HEADLINE_SIZE * 0.85;

  const textX = stripX + STRIP_PAD;

  const headlineSvg = headlineLines
    .map((line, i) => {
      const y = startY + i * HEADLINE_LINE_HEIGHT;
      const segs = highlightWords(line, o.emphasis, o.accentColor);
      return `<text x="${textX}" y="${y}" font-family="Inter" font-weight="800" font-size="${HEADLINE_SIZE}" fill="${o.textColor}" letter-spacing="-1.2">${segs}</text>`;
    })
    .join("\n  ");

  const bodyStartY = startY + headlineHeight + 32;
  const bodySvg = bodyLines
    .map((line, i) => {
      const y = bodyStartY + i * BODY_LINE_HEIGHT;
      return `<text x="${textX}" y="${y}" font-family="Inter" font-weight="500" font-size="${BODY_SIZE}" fill="${o.textColor}" fill-opacity="0.85">${escapeXml(line)}</text>`;
    })
    .join("\n  ");

  let ctaSvg = "";
  if (o.cta) {
    const ctaY = bodyStartY + bodyHeight + 40;
    const ctaText = o.cta.toUpperCase();
    const ctaWidth = innerW;
    ctaSvg = `
  <rect x="${textX}" y="${ctaY}" width="${ctaWidth}" height="${ctaH}" rx="${ctaH / 2}" fill="${o.accentColor}"/>
  <text x="${textX + ctaWidth / 2}" y="${ctaY + ctaH / 2 + 9}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="${o.accentTextColor}" letter-spacing="1.8">${escapeXml(ctaText)}</text>`;
  }

  return `${accentBar}
  ${headlineSvg}
  ${bodySvg}
  ${ctaSvg}`;
}

// ===========================================================================
// STICKER BURST — rotated bright sticker in a corner with headline + small CTA
// ===========================================================================

function buildStickerBurst(o: BlockOpts): string {
  const STICKER_SIZE = 460;
  const STICKER_X = SIZE - STICKER_SIZE - 60; // top-right corner
  const STICKER_Y = 60;
  const STICKER_CX = STICKER_X + STICKER_SIZE / 2;
  const STICKER_CY = STICKER_Y + STICKER_SIZE / 2;
  const ROT = -8;

  // Headline tightly wrapped — sticker fits 12-13 chars per line
  const headlineLines = wrapText(o.headline, 13);
  const HEADLINE_SIZE =
    headlineLines.length >= 4 ? 36 : headlineLines.length === 3 ? 44 : 56;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.0;
  const totalLineH = headlineLines.length * HEADLINE_LINE_HEIGHT;
  const startY = STICKER_CY - totalLineH / 2 + HEADLINE_SIZE * 0.85;

  // Burst-style edge — using a circle for simplicity (clean + readable)
  const sticker = `<g transform="rotate(${ROT} ${STICKER_CX} ${STICKER_CY})">
    <circle cx="${STICKER_CX}" cy="${STICKER_CY}" r="${STICKER_SIZE / 2}" fill="${o.accentColor}"/>
    <circle cx="${STICKER_CX}" cy="${STICKER_CY}" r="${STICKER_SIZE / 2 - 14}" fill="none" stroke="${o.accentTextColor}" stroke-opacity="0.4" stroke-width="2"/>
    ${headlineLines
      .map((line, i) => {
        const y = startY + i * HEADLINE_LINE_HEIGHT;
        return `<text x="${STICKER_CX}" y="${y}" text-anchor="middle" font-family="Inter" font-weight="800" font-size="${HEADLINE_SIZE}" fill="${o.accentTextColor}" letter-spacing="-1">${escapeXml(line)}</text>`;
      })
      .join("\n    ")}
  </g>`;

  // Optional small CTA pill at bottom-center
  let ctaSvg = "";
  if (o.cta) {
    const ctaText = o.cta.toUpperCase();
    const ctaW = Math.min(Math.max(ctaText.length * 16 + 100, 280), 600);
    const ctaH = 84;
    const ctaX = SIZE / 2 - ctaW / 2;
    const ctaY = SIZE - PADDING - ctaH;
    ctaSvg = `
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="${ctaH / 2}" fill="${o.textColor}" fill-opacity="0.92"/>
  <text x="${SIZE / 2}" y="${ctaY + ctaH / 2 + 10}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="24" fill="#0A0A0A" letter-spacing="2">${escapeXml(ctaText)}</text>`;
  }

  // Optional small body text below sticker
  let bodySvg = "";
  if (o.body) {
    const bodyLines = wrapText(o.body, 40);
    const BODY_SIZE = 26;
    const BODY_LINE_HEIGHT = BODY_SIZE * 1.4;
    const bodyStartY = STICKER_Y + STICKER_SIZE + 40 + BODY_SIZE;
    bodySvg = bodyLines
      .map((line, i) => {
        const y = bodyStartY + i * BODY_LINE_HEIGHT;
        return `<text x="${PADDING}" y="${y}" font-family="Inter" font-weight="500" font-size="${BODY_SIZE}" fill="${o.textColor}" fill-opacity="0.92">${escapeXml(line)}</text>`;
      })
      .join("\n  ");
  }

  return `${sticker}
  ${bodySvg}
  ${ctaSvg}`;
}

// ===========================================================================
// MAGAZINE COVER — kicker line + huge serif headline + bottom-left body/CTA
// ===========================================================================

function buildMagazineCover(o: BlockOpts): string {
  // Kicker derived from emphasis or fallback to "FINANCE"
  const kicker = (o.emphasis[0] ?? "ANALYSE").toUpperCase();

  const headlineLines = wrapText(o.headline, 16);
  const HEADLINE_SIZE = headlineLines.length >= 3 ? 96 : 116;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.0;
  const KICKER_SIZE = 22;

  // Top-fade scrim baked into the layer for legibility
  const scrim = `<defs><linearGradient id="magScrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.65"/>
      <stop offset="50%" stop-color="#000" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.65"/>
    </linearGradient></defs>
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#magScrim)"/>`;

  const kickerY = PADDING + KICKER_SIZE;
  const kickerLine = `<text x="${PADDING}" y="${kickerY}" font-family="Inter" font-weight="700" font-size="${KICKER_SIZE}" fill="${o.accentColor}" letter-spacing="6">${escapeXml(kicker)} — DOSSIER</text>
  <line x1="${PADDING}" y1="${kickerY + 14}" x2="${PADDING + 80}" y2="${kickerY + 14}" stroke="${o.accentColor}" stroke-width="3"/>`;

  const headlineStartY = kickerY + 90;
  const headlineSvg = headlineLines
    .map((line, i) => {
      const y = headlineStartY + i * HEADLINE_LINE_HEIGHT;
      const segs = highlightWords(line, o.emphasis, o.accentColor);
      return `<text x="${PADDING}" y="${y}" font-family="Times New Roman, Inter" font-weight="700" font-size="${HEADLINE_SIZE}" fill="${o.textColor}" letter-spacing="-3">${segs}</text>`;
    })
    .join("\n  ");

  // Body + CTA at bottom-left
  let bodySvg = "";
  let ctaSvg = "";
  const BODY_SIZE = 26;
  const bodyLines = o.body ? wrapText(o.body, 42) : [];
  const ctaH = o.cta ? 78 : 0;
  const bodyHeight = bodyLines.length * BODY_SIZE * 1.4;
  const bottomTotalH = bodyHeight + (o.cta ? 32 + ctaH : 0);
  const bodyStartY =
    SIZE - PADDING - bottomTotalH + BODY_SIZE;

  if (bodyLines.length > 0) {
    bodySvg = bodyLines
      .map((line, i) => {
        const y = bodyStartY + i * BODY_SIZE * 1.4;
        return `<text x="${PADDING}" y="${y}" font-family="Inter" font-weight="500" font-size="${BODY_SIZE}" fill="${o.textColor}" fill-opacity="0.92">${escapeXml(line)}</text>`;
      })
      .join("\n  ");
  }
  if (o.cta) {
    const ctaText = o.cta.toUpperCase();
    const ctaW = Math.min(Math.max(ctaText.length * 16 + 80, 260), 540);
    const ctaY = SIZE - PADDING - ctaH;
    ctaSvg = `
  <rect x="${PADDING}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="${ctaH / 2}" fill="${o.accentColor}"/>
  <text x="${PADDING + ctaW / 2}" y="${ctaY + ctaH / 2 + 9}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="${o.accentTextColor}" letter-spacing="2">${escapeXml(ctaText)}</text>`;
  }

  return `${scrim}
  ${kickerLine}
  ${headlineSvg}
  ${bodySvg}
  ${ctaSvg}`;
}

// ===========================================================================
// FLOATING CARD — centered glass-effect card with all the copy
// ===========================================================================

function buildFloatingCard(o: BlockOpts): string {
  const CARD_W = 780;
  const CARD_PAD = 56;
  const innerW = CARD_W - CARD_PAD * 2;

  const headlineLines = wrapText(o.headline, 18);
  const bodyLines = o.body ? wrapText(o.body, 36) : [];

  const HEADLINE_SIZE = headlineLines.length >= 3 ? 52 : 64;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.05;
  const BODY_SIZE = 26;
  const BODY_LINE_HEIGHT = BODY_SIZE * 1.4;
  const CTA_H = o.cta ? 76 : 0;

  const headlineHeight = headlineLines.length * HEADLINE_LINE_HEIGHT;
  const bodyHeight = bodyLines.length * BODY_LINE_HEIGHT;
  const innerH =
    headlineHeight +
    (bodyLines.length ? 28 + bodyHeight : 0) +
    (o.cta ? 36 + CTA_H : 0);
  const CARD_H = innerH + CARD_PAD * 2;

  const cardX = SIZE / 2 - CARD_W / 2;
  const cardY = SIZE / 2 - CARD_H / 2;

  // Glass card : darkish translucent + 1px border + subtle inner highlight
  const card = `<rect x="${cardX}" y="${cardY}" width="${CARD_W}" height="${CARD_H}" rx="28" fill="#0A0A0A" fill-opacity="0.78"/>
                <rect x="${cardX}" y="${cardY}" width="${CARD_W}" height="${CARD_H}" rx="28" fill="none" stroke="${o.accentColor}" stroke-opacity="0.6" stroke-width="1.5"/>
                <rect x="${cardX + 2}" y="${cardY + 2}" width="${CARD_W - 4}" height="${CARD_H - 4}" rx="26" fill="none" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="1"/>`;

  const innerX = cardX + CARD_PAD;
  const startY = cardY + CARD_PAD + HEADLINE_SIZE * 0.85;

  const headlineSvg = headlineLines
    .map((line, i) => {
      const y = startY + i * HEADLINE_LINE_HEIGHT;
      const segs = highlightWords(line, o.emphasis, o.accentColor);
      return `<text x="${innerX}" y="${y}" font-family="Inter" font-weight="800" font-size="${HEADLINE_SIZE}" fill="${o.textColor}" letter-spacing="-1.5">${segs}</text>`;
    })
    .join("\n  ");

  let bodySvg = "";
  const bodyStartY = startY + headlineHeight + 28;
  if (bodyLines.length > 0) {
    bodySvg = bodyLines
      .map((line, i) => {
        const y = bodyStartY + i * BODY_LINE_HEIGHT;
        return `<text x="${innerX}" y="${y}" font-family="Inter" font-weight="500" font-size="${BODY_SIZE}" fill="${o.textColor}" fill-opacity="0.88">${escapeXml(line)}</text>`;
      })
      .join("\n  ");
  }

  let ctaSvg = "";
  if (o.cta) {
    const ctaY = bodyStartY + bodyHeight + 36;
    const ctaText = o.cta.toUpperCase();
    ctaSvg = `
  <rect x="${innerX}" y="${ctaY}" width="${innerW}" height="${CTA_H}" rx="${CTA_H / 2}" fill="${o.accentColor}"/>
  <text x="${innerX + innerW / 2}" y="${ctaY + CTA_H / 2 + 9}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="${o.accentTextColor}" letter-spacing="2">${escapeXml(ctaText)}</text>`;
  }

  return `${card}
  ${headlineSvg}
  ${bodySvg}
  ${ctaSvg}`;
}

// ===========================================================================
// MARQUEE BAND — horizontal accent band centered with headline + CTA inline
// ===========================================================================

function buildMarqueeBand(o: BlockOpts): string {
  const BAND_H = 280;
  const BAND_Y = SIZE / 2 - BAND_H / 2;
  const BAND_PAD_X = 64;

  const headlineLines = wrapText(o.headline, 22);
  const HEADLINE_SIZE = headlineLines.length >= 3 ? 56 : headlineLines.length === 2 ? 70 : 88;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.0;
  const totalH = headlineLines.length * HEADLINE_LINE_HEIGHT;
  const headlineStartY = BAND_Y + BAND_H / 2 - totalH / 2 + HEADLINE_SIZE * 0.85;

  const band = `<rect x="0" y="${BAND_Y}" width="${SIZE}" height="${BAND_H}" fill="${o.accentColor}"/>
                <rect x="0" y="${BAND_Y - 4}" width="${SIZE}" height="2" fill="${o.textColor}" fill-opacity="0.25"/>
                <rect x="0" y="${BAND_Y + BAND_H + 2}" width="${SIZE}" height="2" fill="${o.textColor}" fill-opacity="0.25"/>`;

  const headlineSvg = headlineLines
    .map((line, i) => {
      const y = headlineStartY + i * HEADLINE_LINE_HEIGHT;
      // Use the accent_text_color for legibility on the accent band
      return `<text x="${BAND_PAD_X}" y="${y}" font-family="Inter" font-weight="800" font-size="${HEADLINE_SIZE}" fill="${o.accentTextColor}" letter-spacing="-1.5">${escapeXml(line)}</text>`;
    })
    .join("\n  ");

  // CTA pill below the band, inverted color so it pops on the visual
  let ctaSvg = "";
  if (o.cta) {
    const ctaText = o.cta.toUpperCase();
    const ctaW = Math.min(Math.max(ctaText.length * 17 + 100, 320), 640);
    const ctaH = 84;
    const ctaX = SIZE / 2 - ctaW / 2;
    const ctaY = SIZE - PADDING - ctaH;
    ctaSvg = `
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="${ctaH / 2}" fill="${o.textColor}"/>
  <text x="${SIZE / 2}" y="${ctaY + ctaH / 2 + 10}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="24" fill="#0A0A0A" letter-spacing="2">${escapeXml(ctaText)}</text>`;
  }

  return `${band}
  ${headlineSvg}
  ${ctaSvg}`;
}

// ===========================================================================
// CORNER TAG — diagonal accent ribbon top-left + headline middle + CTA corner
// ===========================================================================

function buildCornerTag(o: BlockOpts): string {
  // Diagonal ribbon in top-left
  const RIBBON_LEN = 360;
  const ribbonText = (o.emphasis[0] ?? "EXCLUSIF").toUpperCase();
  const ribbon = `<g transform="rotate(-45 100 100)">
    <rect x="-100" y="80" width="${RIBBON_LEN}" height="46" fill="${o.accentColor}"/>
    <text x="${RIBBON_LEN / 2 - 100}" y="111" text-anchor="middle" font-family="Inter" font-weight="800" font-size="22" fill="${o.accentTextColor}" letter-spacing="4">${escapeXml(ribbonText)}</text>
  </g>`;

  // Bottom-fade scrim for headline legibility
  const scrim = `<defs><linearGradient id="cornerScrim" x1="0%" y1="40%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
    </linearGradient></defs>
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#cornerScrim)"/>`;

  const headlineLines = wrapText(o.headline, 14);
  const HEADLINE_SIZE = headlineLines.length >= 3 ? 64 : 78;
  const HEADLINE_LINE_HEIGHT = HEADLINE_SIZE * 1.05;
  const headlineHeight = headlineLines.length * HEADLINE_LINE_HEIGHT;

  const bodyLines = o.body ? wrapText(o.body, 40) : [];
  const BODY_SIZE = 26;
  const BODY_LINE_HEIGHT = BODY_SIZE * 1.4;
  const bodyHeight = bodyLines.length * BODY_LINE_HEIGHT;

  const ctaH = o.cta ? 78 : 0;
  const bottomBlockH =
    headlineHeight + (bodyLines.length ? 24 + bodyHeight : 0) + (o.cta ? 32 + ctaH : 0);
  const startY = SIZE - PADDING - bottomBlockH + HEADLINE_SIZE * 0.85;

  const headlineSvg = headlineLines
    .map((line, i) => {
      const y = startY + i * HEADLINE_LINE_HEIGHT;
      const segs = highlightWords(line, o.emphasis, o.accentColor);
      return `<text x="${PADDING}" y="${y}" font-family="Inter" font-weight="800" font-size="${HEADLINE_SIZE}" fill="${o.textColor}" letter-spacing="-1.5">${segs}</text>`;
    })
    .join("\n  ");

  let bodySvg = "";
  const bodyStartY = startY + headlineHeight + 24;
  if (bodyLines.length > 0) {
    bodySvg = bodyLines
      .map((line, i) => {
        const y = bodyStartY + i * BODY_LINE_HEIGHT;
        return `<text x="${PADDING}" y="${y}" font-family="Inter" font-weight="500" font-size="${BODY_SIZE}" fill="${o.textColor}" fill-opacity="0.92">${escapeXml(line)}</text>`;
      })
      .join("\n  ");
  }

  let ctaSvg = "";
  if (o.cta) {
    const ctaY = bodyStartY + bodyHeight + 32;
    const ctaText = o.cta.toUpperCase();
    const ctaW = Math.min(Math.max(ctaText.length * 16 + 80, 260), 540);
    const ctaX = SIZE - PADDING - ctaW;
    ctaSvg = `
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="${ctaH / 2}" fill="${o.accentColor}"/>
  <text x="${ctaX + ctaW / 2}" y="${ctaY + ctaH / 2 + 9}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="${o.accentTextColor}" letter-spacing="2">${escapeXml(ctaText)}</text>`;
  }

  return `${scrim}
  ${ribbon}
  ${headlineSvg}
  ${bodySvg}
  ${ctaSvg}`;
}

function highlightWords(line: string, emphasis: string[], accent: string) {
  if (emphasis.length === 0) return escapeXml(line);
  const lower = line.toLowerCase();
  const tokens: { text: string; emph: boolean }[] = [];
  let i = 0;
  while (i < line.length) {
    let matched = false;
    for (const w of emphasis) {
      const lw = w.toLowerCase();
      if (lower.startsWith(lw, i)) {
        tokens.push({ text: line.slice(i, i + w.length), emph: true });
        i += w.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ text: line[i], emph: false });
      i++;
    }
  }
  // Merge consecutive same-type tokens
  const merged: { text: string; emph: boolean }[] = [];
  for (const t of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.emph === t.emph) last.text += t.text;
    else merged.push({ ...t });
  }
  return merged
    .map((t) =>
      t.emph
        ? `<tspan fill="${accent}">${escapeXml(t.text)}</tspan>`
        : escapeXml(t.text)
    )
    .join("");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? current + " " + w : w;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
