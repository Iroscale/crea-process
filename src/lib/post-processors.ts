/**
 * Post-processors run inline after image generation.
 *  - autoCorrectText : OCR the rendered image, compare to expected copy,
 *    and ask Gemini to fix the text only if mistakes are detected.
 *  - autoApplyLegal  : run Claude to produce mentions and composite a footer.
 *  - generate916Variant : redesign the 1:1 into a 9:16 vertical-native version.
 */
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateGeminiImage } from "./gemini-image";
import { getAnthropic, CLAUDE_MODEL, CLAUDE_LIGHT_MODEL } from "./anthropic";

const FONTS = [
  resolve(process.cwd(), "fonts", "Inter-Regular.ttf"),
  resolve(process.cwd(), "fonts", "Inter-SemiBold.ttf"),
  resolve(process.cwd(), "fonts", "Inter-Bold.ttf"),
].filter((p) => {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
});

export function detectImageMime(
  buf: Buffer
): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  if (buf.length < 12) return "image/png";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return "image/gif";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";
  return "image/png";
}

// ---------------------------------------------------------------------------
// 1. autoCorrectText — OCR + edit if mistakes
// ---------------------------------------------------------------------------

type ExpectedCopy = { headline: string; body?: string; cta?: string };

export async function autoCorrectText(
  imageBytes: Buffer,
  expected: ExpectedCopy
): Promise<Buffer> {
  // 1. OCR the image
  const ocr = await ocrImageText(imageBytes);

  // 2. Identify mistakes
  const corrections: string[] = [];
  if (
    ocr.headline &&
    expected.headline &&
    !textsMatch(ocr.headline, expected.headline)
  ) {
    corrections.push(
      `Replace "${ocr.headline}" with "${expected.headline}"`
    );
  }
  if (ocr.body && expected.body && !textsMatch(ocr.body, expected.body)) {
    corrections.push(`Replace "${ocr.body}" with "${expected.body}"`);
  }
  if (ocr.cta && expected.cta && !textsMatch(ocr.cta, expected.cta)) {
    corrections.push(
      `Replace "${ocr.cta}" with "${expected.cta.toUpperCase()}"`
    );
  }

  if (corrections.length === 0) {
    return imageBytes; // text is already correct
  }

  // 3. Ask Gemini to edit only the text
  const editPrompt = `Edit ONLY the text in this image. Keep the visual composition, lighting, palette, materials, layout, and typography style EXACTLY identical. Only fix the text:

${corrections.map((c) => "- " + c).join("\n")}

The corrected text must be perfectly spelled in French, kerning tight, same typography style as the original. Do NOT change anything other than the text.`;

  const result = await generateGeminiImage({
    model: "gemini-3-pro-image-preview",
    prompt: editPrompt,
    inputImage: { mimeType: detectImageMime(imageBytes), data: imageBytes },
    aspectRatio: "1:1",
  });
  if (!result.ok) {
    // If edit fails, return the original — better than blocking
    return imageBytes;
  }
  return result.data;
}

async function ocrImageText(imageBytes: Buffer): Promise<{
  headline: string;
  body: string;
  cta: string;
}> {
  const client = getAnthropic();
  const mime = detectImageMime(imageBytes);
  // OCR is structured classification — Haiku is plenty good and ~3× cheaper
  // than Sonnet on input tokens (which dominate cost when an image is in the
  // prompt). Saves significantly on bulk runs.
  const response = await client.messages.create({
    model: CLAUDE_LIGHT_MODEL,
    max_tokens: 500,
    system: `Tu es un OCR ultra-précis. On te donne une image. Tu listes le texte visible en respectant les fautes (NE corrige RIEN).
Retourne UN JSON (rien d'autre) :
{"headline":"texte du titre principal","body":"texte du sous-titre","cta":"texte du bouton"}
Champs vides "" si absents.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mime, data: imageBytes.toString("base64") },
          },
          { type: "text", text: "Lis le texte de l'image et retourne le JSON." },
        ],
      },
    ],
  });
  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { headline?: string; body?: string; cta?: string };
    return {
      headline: parsed.headline ?? "",
      body: parsed.body ?? "",
      cta: parsed.cta ?? "",
    };
  } catch {
    return { headline: "", body: "", cta: "" };
  }
}

function textsMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[«»"'.,;:!?]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // Allow 1 char per ~10 chars of difference (typo tolerance)
  const dist = levenshtein(na, nb);
  return dist <= Math.max(2, Math.floor(Math.max(na.length, nb.length) * 0.05));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

// ---------------------------------------------------------------------------
// 2. autoApplyLegal — composite a discreet footer with French finance disclaimers
// ---------------------------------------------------------------------------

export async function autoApplyLegal(
  imageBytes: Buffer,
  ctx: { productSummary: string; headline: string; body: string; cta: string }
): Promise<Buffer> {
  const text = await generateLegalDisclaimers(ctx);
  return addLegalFooter(imageBytes, text);
}

async function generateLegalDisclaimers(ctx: {
  productSummary: string;
  headline: string;
  body: string;
  cta: string;
}): Promise<string> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system: `Tu produis les mentions légales courtes à intégrer en bas d'une pub financière française.

CONSIGNES STRICTES :
- Français, factuel, court : 2 à 4 segments max, séparés par " · "
- Maximum ~250 caractères au total
- Termine TOUJOURS chaque phrase par un point.
- N'INVENTE PAS de régulations ou régimes : pas de "Triangle de sécurité luxembourgeois", pas de noms d'organismes, pas de jargon ACPR/AMF.

ÉLÉMENTS OBLIGATOIRES (toujours) :
1. "Communication à caractère promotionnel."
2. "Ceci ne constitue pas un conseil en investissement personnalisé."

ÉLÉMENTS CONDITIONNELS (ajoute si pertinent) :
- Si investissement / placement / patrimoine : "Investir comporte des risques de perte en capital."
- Si performance / rendement chiffré : "Les performances passées ne préjugent pas des performances futures."
- Si "garanti" / "intouchable" / "blindé" / "protégé" : "Les protections dépendent du cadre contractuel et de la solidité du prestataire."

FORMAT : retourne UNIQUEMENT le texte fini, sans guillemets, sans markdown, sans préambule. Concis, sobre.`,
    messages: [
      {
        role: "user",
        content: `Produit : ${ctx.productSummary}
Headline : "${ctx.headline}"
Body : "${ctx.body}"
CTA : "${ctx.cta}"

Produis les mentions légales appropriées.`,
      },
    ],
  });
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text"
    ? block.text.trim().replace(/^["']|["']$/g, "")
    : "Communication à caractère promotionnel. · Ceci ne constitue pas un conseil en investissement personnalisé. · Investir comporte des risques de perte en capital.";
}

async function addLegalFooter(imageBytes: Buffer, text: string): Promise<Buffer> {
  const meta = await sharp(imageBytes).metadata();
  const W = meta.width ?? 1080;
  const H = meta.height ?? 1080;

  const PADDING_X = 40;
  const usableW = W - PADDING_X * 2;
  let fontSize = 18;
  let lines: string[] = [];
  for (const fs of [18, 16, 14, 13]) {
    const avgCharW = fs * 0.52;
    const charsPerLine = Math.floor(usableW / avgCharW);
    const wrapped = wrapText(text, charsPerLine);
    if (wrapped.length <= 3) {
      fontSize = fs;
      lines = wrapped;
      break;
    }
  }
  if (lines.length === 0) {
    const avgCharW = 12 * 0.52;
    const charsPerLine = Math.floor(usableW / avgCharW);
    fontSize = 12;
    lines = wrapText(text, charsPerLine);
  }

  const lineHeight = fontSize * 1.4;
  const VERTICAL_PADDING = 16;
  const FOOTER_HEIGHT = Math.max(60, Math.ceil(lines.length * lineHeight + VERTICAL_PADDING * 2));

  // Preserve the source dimensions (W × H). Resize the visual to fit ABOVE
  // the legal strip so the canvas stays square (or whatever the source
  // aspect ratio was). See post-actions.ts addLegalFooter for the same
  // rationale — Meta ads MUST keep their format.
  const VISUAL_HEIGHT = H - FOOTER_HEIGHT;
  const resizedVisual = await sharp(imageBytes)
    .resize(W, VISUAL_HEIGHT, { fit: "fill" })
    .toBuffer();

  const startY = VERTICAL_PADDING + fontSize;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${FOOTER_HEIGHT}" viewBox="0 0 ${W} ${FOOTER_HEIGHT}">
  <rect x="0" y="0" width="${W}" height="${FOOTER_HEIGHT}" fill="#0A0A0A"/>
  ${lines
    .map(
      (l, i) =>
        `<text x="${W / 2}" y="${startY + i * lineHeight}" text-anchor="middle" font-family="Inter" font-weight="400" font-size="${fontSize}" fill="#888888" letter-spacing="0.2">${escapeXml(l)}</text>`
    )
    .join("\n  ")}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    background: "rgba(0,0,0,0)",
    font: { fontFiles: FONTS, loadSystemFonts: true, defaultFontFamily: "Inter" },
  });
  const footerPng = resvg.render().asPng();

  return await sharp({
    create: {
      width: W,
      height: H, // ← UNCHANGED : preserves the source aspect ratio
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .composite([
      { input: resizedVisual, top: 0, left: 0 },
      { input: footerPng, top: VISUAL_HEIGHT, left: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// 3. generate916FromBytes — natively redesign 1:1 → 9:16
// ---------------------------------------------------------------------------

export async function generate916FromBytes(
  imageBytes: Buffer
): Promise<Buffer | null> {
  const prompt = `Use the attached 1:1 ad creative as a STYLE REFERENCE only — match subject, palette, lighting, materials, rendering quality, typography style, and copy the text word-for-word (perfectly spelled in French).

REDESIGN it natively for a 9:16 vertical format, 1080×1920 pixels, for Instagram Story / Reels / Meta placements.

══ AESTHETIC RULE #1 — ONE UNIFIED SCENE ══
The entire 1080×1920 canvas is ONE cohesive environment shot from a single camera angle. Top, middle and bottom share IDENTICAL background color, gradient, lighting, atmosphere, materials. DO NOT introduce different textures or scenes in any region.

══ AESTHETIC RULE #2 — element placement (Meta safe zones) ══
- Hero subject : roughly pixels 350 to 1080 vertically, horizontally centered
- Headline (largest text) : roughly pixels 1100 to 1280
- Body : roughly pixels 1290 to 1380
- CTA pill : roughly pixels 1390 to 1490 (bottom edge ≤ 1490px)
- Pixels 0 to 350 : visually quiet, same atmosphere, no critical content
- Pixels 1500 to 1920 : visually quiet, same atmosphere, no critical content

The "quiet areas" are the SAME ROOM extended, not different bands.

Output: 1080×1920, 9:16, premium quality, Apple-keynote-tier polish.`;

  const result = await generateGeminiImage({
    model: "gemini-3-pro-image-preview",
    prompt,
    inputImage: { mimeType: detectImageMime(imageBytes), data: imageBytes },
    aspectRatio: "9:16",
  });
  if (!result.ok) return null;
  return result.data;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
