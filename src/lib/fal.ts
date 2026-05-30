/**
 * Catalogue de modèles d'image (format carré 1:1) avec deux providers :
 *  - "fal"    → fal.ai (Flux, GPT Image, etc)
 *  - "gemini" → Google GenAI direct (Nano Banana / Banana Pro)
 *
 * Chaque modèle expose buildInput / extractUrls (pour fal) ou un model name (pour gemini).
 */
import { fal } from "@fal-ai/client";
import { generateGeminiImage } from "./gemini-image";

let configured = false;
function configureFal() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY manquant dans .env.local");
  fal.config({ credentials: key });
  configured = true;
}

export type Provider = "fal" | "gemini";

export type ImageModel = {
  id: string;
  provider: Provider;
  endpoint: string; // fal: endpoint path / gemini: model name
  label: string;
  description: string;
  /** If true, this model is good at rendering text natively → use full_image_prompt and skip the compositor. */
  prefersFullPrompt?: boolean;
  /** fal-only — build input payload */
  buildInput?: (prompt: string) => Record<string, unknown>;
  /** fal-only — extract URLs from response */
  extractUrls?: (result: unknown) => string[];
};

const baseSquareFlux = {
  image_size: "square_hd",
  num_images: 1,
  enable_safety_checker: false,
};

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "gemini-3-pro-image",
    provider: "gemini",
    endpoint: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image (Banana Pro)",
    description:
      "API Google directe — qualité max, rend texte+visuel ensemble, premium.",
    prefersFullPrompt: true,
  },
  {
    id: "gemini-2.5-flash-image",
    provider: "gemini",
    endpoint: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image (Nano Banana)",
    description:
      "API Google directe — rapide, rend texte+visuel ensemble, idéal itérer.",
    prefersFullPrompt: true,
  },
  {
    id: "gpt-image-1",
    provider: "fal",
    endpoint: "fal-ai/gpt-image-1/text-to-image",
    label: "GPT Image",
    description:
      "OpenAI GPT Image (via fal.ai) — composition intelligente, naturel.",
    buildInput: (prompt) => ({
      prompt,
      image_size: "1024x1024",
      num_images: 1,
      quality: "high",
    }),
    extractUrls: (r) => {
      const obj = r as { images?: { url: string }[] };
      return obj.images?.map((i) => i.url) ?? [];
    },
  },
  {
    id: "flux-pro-1.1",
    provider: "fal",
    endpoint: "fal-ai/flux-pro/v1.1",
    label: "Flux Pro v1.1",
    description: "Baseline photoréaliste, rapide. Témoin / secours.",
    buildInput: (prompt) => ({ prompt, ...baseSquareFlux }),
    extractUrls: (r) => {
      const obj = r as { images?: { url: string }[] };
      return obj.images?.map((i) => i.url) ?? [];
    },
  },
];

export function getModel(id: string): ImageModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

export type RunResult =
  | { ok: true; bytes: Buffer; mimeType: string }
  | { ok: false; error: string };

/**
 * Run an image model and return raw bytes (for upload to our storage).
 * Unifies the fal.ai path and the direct Gemini path.
 */
export async function runModel(
  modelId: string,
  prompt: string
): Promise<RunResult> {
  const model = getModel(modelId);
  if (!model) return { ok: false, error: `Modèle inconnu : ${modelId}` };

  if (model.provider === "gemini") {
    const r = await generateGeminiImage({ model: model.endpoint, prompt });
    if (!r.ok) return r;
    return { ok: true, bytes: r.data, mimeType: r.mimeType };
  }

  // fal.ai path
  configureFal();
  if (!model.buildInput || !model.extractUrls) {
    return { ok: false, error: `Modèle fal mal configuré : ${modelId}` };
  }
  try {
    const result = await fal.subscribe(model.endpoint, {
      input: model.buildInput(prompt),
      logs: false,
    });
    const urls = model.extractUrls(result.data);
    if (urls.length === 0)
      return { ok: false, error: "Aucune URL d'image dans la réponse fal.ai" };
    // Fetch the bytes so the caller has a uniform Buffer interface
    const r = await fetch(urls[0]);
    if (!r.ok) return { ok: false, error: `Fetch image: ${r.status}` };
    const arr = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "image/png";
    return { ok: true, bytes: Buffer.from(arr), mimeType: ct };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
