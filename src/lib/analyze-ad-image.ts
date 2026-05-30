/**
 * Use Claude vision to describe an ad creative.
 * Returns a structured text description that becomes part of the
 * project's system prompt.
 */
import sharp from "sharp";
import { getAnthropic, CLAUDE_LIGHT_MODEL } from "./anthropic";

// Anthropic vision API caps base64 images at 5 MB. We aim for 4.5 MB to keep
// margin for the JSON envelope. We also cap dimensions at 1568 px (their
// recommended max — beyond it the model downsizes internally anyway).
const VISION_MAX_BYTES = 4_500_000;
const VISION_MAX_DIMENSION = 1568;

/**
 * Downscale + recompress an image so Claude vision accepts it. Images already
 * under the limits are returned unchanged. Larger ones get JPEG-compressed
 * (better ratio than PNG, plenty enough for "describe this ad" tasks).
 */
async function compressForVision(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }> {
  // Fast path : already small + reasonably sized → keep as-is
  if (buffer.length <= VISION_MAX_BYTES) {
    try {
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w <= VISION_MAX_DIMENSION && h <= VISION_MAX_DIMENSION) {
        return {
          buffer,
          mimeType: mimeType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
        };
      }
    } catch {
      // metadata failed — fall through to resize as a safety net
    }
  }

  // Slow path : resize to a max bounding box + recompress JPEG q85
  const resized = await sharp(buffer)
    .rotate() // honor EXIF orientation before resizing
    .resize(VISION_MAX_DIMENSION, VISION_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  // If the resize wasn't enough (rare, only for huge JPEGs with no transparency)
  // bump the quality down once more.
  if (resized.length > VISION_MAX_BYTES) {
    const further = await sharp(resized)
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    return { buffer: further, mimeType: "image/jpeg" };
  }

  return { buffer: resized, mimeType: "image/jpeg" };
}

const SYSTEM = `Tu es un directeur artistique et copywriter expert. On te montre une publicité (ad creative).
Décris-la de façon dense et structurée pour qu'un autre agent IA puisse s'inspirer de son ADN visuel et de son copy plus tard.

Format ta réponse en markdown avec ces sections :

## Copy
Tout le texte visible dans l'image, mot pour mot. Sépare hook, body, CTA si identifiables.

## Composition & layout
Structure de l'image (centré, asymétrique, split, full-bleed…), zones occupées, hiérarchie visuelle.

## Style visuel
Palette de couleurs (mentionne les couleurs dominantes), typographie (sans-serif/serif/script, lourde/fine), ambiance générale (clean, brut, premium, fun, dramatique…).

## Sujet & mise en scène
Ce qu'on voit (produit, personne, objet, scène), pose, éclairage, contexte.

## Hooks & angles
Les techniques de copy ou visuelles utilisées pour attirer l'attention (chiffres, contraste, before/after, témoignage, urgence…).

Sois concis mais précis. Pas de prélude, pas de conclusion, pas de \`\`\`.`;

export async function analyzeAdImage(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const supportedMime = (
    ["image/jpeg", "image/png", "image/gif", "image/webp"] as const
  ).find((m) => m === mimeType);
  if (!supportedMime) {
    return "[Image non supportée par l'analyse vision]";
  }

  // Anthropic vision rejects images > 5MB. Resize/recompress big ones first.
  const { buffer: visionBuffer, mimeType: visionMime } = await compressForVision(
    buffer,
    supportedMime
  );

  const client = getAnthropic();
  // Haiku is plenty good for describing ad creatives — 3-4x faster + cheaper
  // than Sonnet, and the structured-markdown output matches what we need.
  const response = await client.messages.create({
    model: CLAUDE_LIGHT_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: visionMime,
              data: visionBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Analyse cette ad selon le format demandé.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text"
    ? textBlock.text.trim()
    : "[Aucune analyse extraite]";
}
