/**
 * Direct Google GenAI image generation — bypasses fal.ai for Gemini models
 * to use the official endpoint at full quality.
 */
import { GoogleGenAI } from "@google/genai";
import {
  callGeminiWithThrottleAndRetry,
  isRateLimitMessage,
} from "./gemini-throttle";

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY manquant dans .env.local");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export type GeminiImageOptions = {
  /** model id, e.g. 'gemini-3-pro-image-preview' or 'gemini-2.5-flash-image' */
  model: string;
  prompt: string;
  /** optional aspect ratio override (defaults to 1:1) */
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  /** optional input image — switches Gemini into image-edit mode */
  inputImage?: { mimeType: string; data: Buffer };
  /**
   * Additional reference images (e.g. brand logo, style reference).
   * Sent IN ORDER after `inputImage`. The prompt should refer to them as
   * "Image 1", "Image 2", etc. — `inputImage` is Image 1, `extraImages[0]`
   * is Image 2, and so on.
   */
  extraImages?: { mimeType: string; data: Buffer }[];
};

export type GeminiImageResult =
  | { ok: true; mimeType: string; data: Buffer }
  | { ok: false; error: string };

/**
 * Generate an image with a Gemini image model and return raw bytes.
 * Returns the buffer directly so we can upload to Supabase Storage without
 * going through a public URL.
 *
 * If `inputImage` is provided, Gemini operates in image-edit mode: it modifies
 * the input image according to the prompt instead of generating from scratch.
 */
export async function generateGeminiImage(
  opts: GeminiImageOptions
): Promise<GeminiImageResult> {
  const client = getClient();
  try {
    type InlinePart = {
      inlineData: { mimeType: string; data: string };
    };
    type TextPart = { text: string };

    const allImages: { mimeType: string; data: Buffer }[] = [];
    if (opts.inputImage) allImages.push(opts.inputImage);
    if (opts.extraImages) allImages.push(...opts.extraImages);

    const contents: unknown =
      allImages.length > 0
        ? ([
            ...allImages.map<InlinePart>((img) => ({
              inlineData: {
                mimeType: img.mimeType,
                data: img.data.toString("base64"),
              },
            })),
            { text: opts.prompt } satisfies TextPart,
          ] as (InlinePart | TextPart)[])
        : opts.prompt;

    // Throttled + auto-retry on 429. Spreads bursty calls under Google's
    // 20 RPM cap and honours their `retryDelay` directive when we get one.
    const response = await callGeminiWithThrottleAndRetry(() =>
      client.models.generateContent({
        model: opts.model,
        contents: contents as Parameters<typeof client.models.generateContent>[0]["contents"],
        config: {
          imageConfig: {
            aspectRatio: opts.aspectRatio ?? "1:1",
          },
        } as Record<string, unknown>,
      })
    );

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const data = Buffer.from(part.inlineData.data, "base64");
        return {
          ok: true,
          mimeType: part.inlineData.mimeType ?? "image/png",
          data,
        };
      }
    }
    // No image in response
    const textParts = parts
      .map((p) => p.text)
      .filter(Boolean)
      .join(" ");
    return {
      ok: false,
      error: textParts
        ? `Aucune image, réponse texte : ${textParts.slice(0, 200)}`
        : "Aucune image dans la réponse Gemini",
    };
  } catch (e) {
    const raw = (e as Error).message;
    // Friendly message when we end up here despite throttle+retry (rare —
    // usually means the user blew through MAX_RETRIES of the rate-limit
    // dance, or hit a daily quota rather than per-minute).
    const friendly = isRateLimitMessage(raw)
      ? "Quota Gemini atteint — limite atteinte malgré 4 tentatives. Réessaie dans 1-2 min, ou demande un quota plus élevé sur https://ai.google.dev/gemini-api/docs/rate-limits"
      : raw;
    return { ok: false, error: friendly };
  }
}
