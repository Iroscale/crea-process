"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateGeminiImage } from "@/lib/gemini-image";
import { compositeAd } from "@/lib/composite-ad";
import { runModel, getModel } from "@/lib/fal";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { autoCorrectText } from "@/lib/post-processors";
import { improveCopyForConversion } from "@/lib/conversion-copy";
import { loadBrandContextForBrief } from "@/lib/brand-context";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Brief } from "@/lib/brief-schema";

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

async function loadImageRowAndBrief(imageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: img } = await supabase
    .from("generated_images")
    .select("id, generation_id, model_id, model_label, params, storage_path")
    .eq("id", imageId)
    .maybeSingle();
  if (!img) throw new Error("Image introuvable");

  const { data: gen } = await supabase
    .from("generations")
    .select("id, brief_id, user_id, copy_headline, copy_body, copy_cta")
    .eq("id", img.generation_id)
    .single();
  if (!gen) throw new Error("Generation introuvable");

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, project_id, brief_data")
    .eq("id", gen.brief_id)
    .single();
  if (!brief) throw new Error("Brief introuvable");
  const briefData = brief.brief_data as Brief | null;

  return { supabase, user, img, gen, brief, briefData };
}

async function downloadStorageFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  path: string
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Detect image mime type from magic bytes — required because storage may
 *  contain a PNG even if the file extension says .jpg. */
function detectImageMime(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  if (buf.length < 12) return "image/png";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  )
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
  // Default to PNG (Gemini's default output)
  return "image/png";
}

// =============================================================================
// 0. Extract the actual rendered text from an image (vision OCR)
// =============================================================================
export type ExtractedImageText = {
  headline: string;
  body: string;
  cta: string;
  additional_text: string;
};

export async function extractImageText(
  imageId: string
): Promise<ExtractedImageText> {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, img } = ctx;

  if (!img.storage_path) throw new Error("Image introuvable en storage");
  const bytes = await downloadStorageFile(supabase, "generated", img.storage_path);
  const mime = detectImageMime(bytes);

  const client = getAnthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system: `Tu es un OCR ultra-précis pour ad creatives. On te donne une image. Tu dois lister TOUT le texte visible dans l'image, MOT POUR MOT, en respectant exactement les fautes de frappe et erreurs si présentes (NE corrige RIEN).

Retourne EXACTEMENT un JSON (rien d'autre, pas de markdown, pas de \`\`\`) :
{
  "headline": "le headline tel qu'il apparaît, avec ses fautes éventuelles",
  "body": "le body / sous-titre / argument tel qu'il apparaît",
  "cta": "le texte du bouton CTA tel qu'il apparaît",
  "additional_text": "tout autre texte visible (labels, vertices, mentions, kicker, étiquettes…) listé avec - en début de ligne"
}

Si un champ n'existe pas dans l'image, mets une chaîne vide.
Recopie LITTÉRALEMENT, sans paraphraser, sans corriger les fautes.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mime,
              data: bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Lis tout le texte visible dans cette image et retourne le JSON.",
          },
        ],
      },
    ],
  });
  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<ExtractedImageText>;
    return {
      headline: parsed.headline ?? "",
      body: parsed.body ?? "",
      cta: parsed.cta ?? "",
      additional_text: parsed.additional_text ?? "",
    };
  } catch {
    return {
      headline: "",
      body: "",
      cta: "",
      additional_text: cleaned.slice(0, 1000),
    };
  }
}

// =============================================================================
// 1. Edit text on an existing image
// =============================================================================
export async function editImageText(imageId: string, formData: FormData) {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, user, img, gen, brief, briefData } = ctx;

  const headline = String(formData.get("headline") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const cta = String(formData.get("cta") ?? "").trim();
  const additionalCorrections = String(
    formData.get("additional_corrections") ?? ""
  ).trim();
  const visualInstructions = String(
    formData.get("visual_instructions") ?? ""
  ).trim();

  const params = (img.params ?? {}) as {
    mode?: "full" | "composite";
    raw_path?: string;
    angle_idx?: number;
    concept_idx?: number;
    prompt?: string;
  };

  try {
    let outputBytes: Buffer;
    let outputMime = "image/jpeg";

    if (params.mode === "full") {
      // Use Gemini to edit the image with new text + optional visual edits
      const rawPath = params.raw_path ?? img.storage_path;
      if (!rawPath) throw new Error("Image source introuvable");
      const sourceBytes = await downloadStorageFile(
        supabase,
        "generated",
        rawPath
      );

      const editPrompt = buildEditPrompt({
        headline,
        body,
        cta,
        additional: additionalCorrections,
        visualInstructions,
      });

      const result = await generateGeminiImage({
        model: "gemini-3-pro-image-preview",
        prompt: editPrompt,
        inputImage: { mimeType: detectImageMime(sourceBytes), data: sourceBytes },
        aspectRatio: "1:1",
      });
      if (!result.ok) throw new Error(result.error);
      outputBytes = result.data;
      outputMime = result.mimeType;
    } else {
      // Composite mode — text is overlaid by Sharp+SVG, image is from runModel.
      // If the user gave visual instructions, re-run the underlying model with
      // those hints appended to the original prompt; then re-overlay the text.
      // If no visual instructions, just re-run the compositor with new text.
      if (!briefData) throw new Error("Brief non finalisé");

      const angleIdx = params.angle_idx ?? 0;
      const angle = briefData.angles?.[angleIdx];

      let baseImageBytes: Buffer;
      if (visualInstructions && params.prompt) {
        // Re-generate the base image with the user's hints
        const augmentedPrompt = `${params.prompt}\n\nUSER VISUAL ADJUSTMENTS:\n${visualInstructions}\n\nKeep the same brand identity, palette and typography conventions, but apply these visual changes precisely.`;
        const r = await runModel(img.model_id ?? "", augmentedPrompt);
        if (!r.ok) throw new Error(`Régénération base : ${r.error}`);
        baseImageBytes = r.bytes;
      } else {
        const rawPath = params.raw_path;
        if (!rawPath) throw new Error("raw_path manquant");
        baseImageBytes = await downloadStorageFile(
          supabase,
          "generated",
          rawPath
        );
      }

      outputBytes = await compositeAd({
        image: baseImageBytes,
        copy: {
          headline: headline || angle?.headline || "",
          body: body || angle?.body,
          cta: cta || angle?.cta,
        },
        textOverlay: {
          ...briefData.text_overlay,
          emphasis_words: angle?.emphasis_words,
        },
      });
    }

    const newPath = `${user.id}/${brief.project_id}/${gen.id}/${img.id}_edited_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("generated")
      .upload(newPath, outputBytes, {
        contentType: outputMime,
        upsert: false,
      });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    await supabase
      .from("generated_images")
      .update({
        storage_path: newPath,
        status: "done",
        error_message: null,
        params: {
          ...params,
          last_edit_prompt: {
            headline,
            body,
            cta,
            additionalCorrections,
            visualInstructions: visualInstructions || undefined,
          },
        },
      })
      .eq("id", img.id);

    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}?error=${encodeURIComponent(
        `Édition: ${(e as Error).message}`
      )}`
    );
  }
}

function buildEditPrompt(args: {
  headline: string;
  body: string;
  cta: string;
  additional: string;
  visualInstructions: string;
}): string {
  const { headline, body, cta, additional, visualInstructions } = args;
  const hasVisual = !!visualInstructions;

  const lines: string[] = [];

  if (hasVisual) {
    lines.push(
      "Edit this image — apply both VISUAL adjustments AND text corrections below. Preserve the brand identity, palette and overall mood. Stay perfectly spelled in French, kerning tight, premium typography."
    );
  } else {
    lines.push(
      "Edit ONLY the text on this image. Keep the visual composition, lighting, palette, materials, and layout EXACTLY the same. Replace existing text with the corrected versions below, perfectly spelled in French, kerning tight, same typography style as the original."
    );
  }
  lines.push("");

  if (hasVisual) {
    lines.push("══ VISUAL ADJUSTMENTS (apply precisely, while keeping the brand identity) ══");
    lines.push(visualInstructions);
    lines.push("");
    lines.push("After applying these visual changes, render the text below into the new composition with the SAME typography style as the source.");
    lines.push("");
  }

  lines.push("══ TEXT CONTENT (must appear exactly, perfectly spelled in French) ══");
  if (headline) lines.push(`- Headline: "${headline}"`);
  if (body) lines.push(`- Body: "${body}"`);
  if (cta) lines.push(`- CTA button text: "${cta.toUpperCase()}"`);
  if (additional) {
    lines.push("", "Additional text (small lines, labels, etc.):");
    lines.push(additional);
  }

  if (!hasVisual) {
    lines.push(
      "",
      "Do NOT change the image apart from the text. Keep all other typography styles, colors, and positions identical."
    );
  }
  return lines.join("\n");
}

// =============================================================================
// 2. Generate a 9:16 vertical variant (Meta safe zones aware)
// =============================================================================
export async function generate916Variant(imageId: string) {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, user, img, gen, brief, briefData } = ctx;

  try {
    const params = (img.params ?? {}) as {
      mode?: "full" | "composite";
      raw_path?: string;
      angle_idx?: number;
      concept_idx?: number;
    };
    const sourcePath = img.storage_path ?? params.raw_path;
    if (!sourcePath) throw new Error("Image source introuvable");
    const sourceBytes = await downloadStorageFile(
      supabase,
      "generated",
      sourcePath
    );

    const extendPrompt = `Use the attached 1:1 ad creative as a STYLE REFERENCE only — match subject, palette, lighting, materials, rendering quality, typography style, and copy the text word-for-word (perfectly spelled in French).

REDESIGN it natively for a 9:16 vertical format, 1080×1920 pixels, for Instagram Story / Reels / Meta placements.

══ AESTHETIC RULE #1 — ONE UNIFIED SCENE ══
The entire 1920×1080 canvas is ONE cohesive environment shot from a single camera angle. Top, middle and bottom of the canvas share IDENTICAL :
- Background color and gradient (no shift in tone, no different colors, no different patterns)
- Lighting direction and intensity
- Atmospheric particles, bokeh, dust, fog, water reflections — if present, they continue evenly throughout the WHOLE canvas top to bottom
- Material textures (e.g. obsidian floor, water surface, velvet void, etc.)

DO NOT introduce NEW textures, NEW elements or NEW environments in the top or bottom — they must look like the SAME continuous environment as the middle, just without the hero subject. Imagine zooming OUT from the 1:1 reference: you see MORE of the same room, same atmosphere, same light — never a different scene.

FORBIDDEN : a different sky/clouds at the top vs middle, water ripples at the bottom that don't appear elsewhere, a brighter gradient at the top, a different palette in the safe zones, decorative bokeh that only shows top or bottom. The atmosphere must be UNIFORM.

══ AESTHETIC RULE #2 — element placement (Meta safe zones) ══
On a 1080×1920 canvas (1920px tall), place elements within these vertical pixel ranges. The areas OUTSIDE these ranges remain part of the SAME environment but contain no critical content :
- Hero subject : roughly pixels 350 to 1080 (vertically), horizontally centered
- Headline (largest text) : roughly pixels 1100 to 1280
- Body line(s) : roughly pixels 1290 to 1380
- CTA pill : roughly pixels 1390 to 1490 (bottom edge ≤ 1490px)
- Pixels 0 to 350 (top, ~18%) : visually quiet area of the SAME environment, no critical content
- Pixels 1500 to 1920 (bottom, ~22%) : visually quiet area of the SAME environment, no critical content

The "quiet areas" are NOT different bands — they are the SAME ROOM, just with empty space and the same continuous atmosphere.

══ FINAL TOUCH ══
- Apple-keynote-tier polish, intentional, premium
- Single cinematic photograph / single render — NOT a collage, NOT three zones
- Color grading EXACTLY matching the reference

Output: 1080×1920, 9:16, premium quality.`;

    const result = await generateGeminiImage({
      model: "gemini-3-pro-image-preview",
      prompt: extendPrompt,
      inputImage: { mimeType: detectImageMime(sourceBytes), data: sourceBytes },
      aspectRatio: "9:16",
    });
    if (!result.ok) throw new Error(result.error);

    const newPath = `${user.id}/${brief.project_id}/${gen.id}/${img.id}_916.jpg`;
    const { error: upErr } = await supabase.storage
      .from("generated")
      .upload(newPath, result.data, {
        contentType: result.mimeType,
        upsert: true,
      });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    // Insert as a new image row (variant of the original, same generation).
    // parent_image_id links it to its 1:1 master so the brief grid can keep
    // showing only masters while the refine view nests its 9:16 variant.
    const baseLabel = (img.model_label ?? "image").replace(/\s*-\s*9:16$/, "");
    await supabase.from("generated_images").insert({
      generation_id: gen.id,
      model_id: img.model_id,
      model_label: `${baseLabel} - 9:16`,
      storage_path: newPath,
      status: "done",
      parent_image_id: img.id,
      params: {
        ...params,
        format: "9:16",
        derived_from: img.id,
      },
    });

    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}?error=${encodeURIComponent(
        `9:16: ${(e as Error).message}`
      )}`
    );
  }
  void briefData;
}

// =============================================================================
// 2a. Embed brand logo discreetly into a generated image
// =============================================================================
/**
 * Use Gemini image-edit to embed the brand's default logo into the ad
 * creative. The model is instructed to integrate it discreetly in a corner,
 * adapt the contrast/scrim to the underlying area, and never compete with
 * the main subject. The result REPLACES the master's storage_path.
 *
 * No-op if the brief has no brand associated, or if the logo has already
 * been embedded (idempotency via params.logo_embedded).
 */
export async function embedLogo(imageId: string) {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, user, img, gen, brief } = ctx;

  try {
    const params = (img.params ?? {}) as Record<string, unknown>;
    if (params.logo_embedded === true) return; // already done

    if (!img.storage_path) throw new Error("Image source introuvable");

    // Load brief.brand_id then brand_logos.default
    const { data: briefRow } = await supabase
      .from("briefs")
      .select("brand_id")
      .eq("id", gen.brief_id)
      .maybeSingle();
    if (!briefRow?.brand_id) {
      throw new Error(
        "Aucune marque associée à ce brief — associe d'abord une marque dans le panel 'Marque' du brief"
      );
    }

    const { data: logoRow } = await supabase
      .from("brand_logos")
      .select("storage_path, mime_type")
      .eq("brand_id", briefRow.brand_id)
      .eq("is_default", true)
      .maybeSingle();
    if (!logoRow?.storage_path) {
      throw new Error(
        "La marque associée n'a pas de logo défaut. Upload-en un sur la page de la marque."
      );
    }

    // Download both images
    const adBytes = await downloadStorageFile(
      supabase,
      "generated",
      img.storage_path
    );
    const logoBlob = await supabase.storage
      .from("brand_resources")
      .download(logoRow.storage_path);
    if (logoBlob.error || !logoBlob.data) {
      throw new Error(`Logo : ${logoBlob.error?.message ?? "indisponible"}`);
    }
    const logoBytes = Buffer.from(await logoBlob.data.arrayBuffer());
    const logoMime = logoRow.mime_type ?? "image/png";

    const prompt = LOGO_EMBED_PROMPT;

    const result = await generateGeminiImage({
      model: "gemini-3-pro-image-preview",
      prompt,
      inputImage: {
        mimeType: detectImageMime(adBytes),
        data: adBytes,
      },
      extraImages: [{ mimeType: logoMime, data: logoBytes }],
      aspectRatio:
        ((params as { format?: string }).format === "9:16"
          ? "9:16"
          : "1:1") as "1:1" | "9:16",
    });
    if (!result.ok) throw new Error(result.error);

    const ext = result.mimeType === "image/png" ? "png" : "jpg";
    const newPath = `${user.id}/${brief.project_id}/${gen.id}/${img.id}_logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("generated")
      .upload(newPath, result.data, {
        contentType: result.mimeType,
        upsert: true,
      });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    await supabase
      .from("generated_images")
      .update({
        storage_path: newPath,
        params: { ...params, logo_embedded: true },
      })
      .eq("id", img.id);

    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}/refine?error=${encodeURIComponent(
        `Logo : ${(e as Error).message}`
      )}`
    );
  }
}

const LOGO_EMBED_PROMPT = `You are given two images :
  • Image 1 : the ad creative (square or vertical, the canvas to edit)
  • Image 2 : the brand logo (PNG / SVG / etc., possibly with transparency)

TASK : place Image 2 (the logo) discreetly INTO Image 1 (the ad creative). The result is a single edited image — Image 1 with the logo integrated.

POSITIONING :
- Default position : bottom-right corner with a comfortable margin (~4-6 % of canvas width from each edge)
- If the bottom-right area is busy / contains the main subject / would clash with critical content, choose another corner (top-right, top-left, bottom-left in that priority order). Pick the LEAST busy corner.
- Keep the logo away from any existing text overlay (headline, body, CTA, source line) — do NOT cover or overlap text.

SIZE :
- Logo width ≈ 8-12 % of canvas width — small, discreet, secondary visual element
- Maintain logo's aspect ratio EXACTLY as in Image 2 — do not stretch or squash

CONTRAST / VISIBILITY :
- Sample the underlying area where the logo will go.
- If the area is DARK and the logo is also dark → add a subtle soft white scrim (rounded rectangle, 60-80 % opacity, slightly blurred edges) under the logo for legibility. OR if the logo has a light/white version available infer the spirit and lighten it.
- If the area is BRIGHT and the logo is also bright → add a subtle soft dark scrim, OR darken the logo slightly.
- The scrim, if added, must be DISCREET — barely noticeable, just enough that the logo is readable. Never a hard rectangle.
- If the corner is mid-tone with good contrast, NO scrim needed.

INTEGRATION :
- Match the lighting / film grain / chromatic mood of Image 1 — the logo should feel like it was always part of the creative, not stuck on top
- Slight transparency (90-95 %) is acceptable to help blend
- For SVG-style flat logos on photographic ads : a slight desaturation or matte finish helps

DO NOT :
- DO NOT modify ANY other element of Image 1 — same composition, same headline / body / CTA, same colors, same subject, same lighting elsewhere
- DO NOT add anything other than the logo (no extra brand text, no @handle, no copyright line)
- DO NOT make the logo huge or central — discreet is the keyword
- DO NOT redesign the logo — preserve its exact proportions and visual identity

OUTPUT : the edited Image 1 with the logo discreetly integrated. Same dimensions as Image 1, premium quality.`;

// =============================================================================
// 2b. Regenerate a sibling variant — same angle/concept/model, fresh take
// =============================================================================
/**
 * Generates a new image based on the same angle × concept × model × slide
 * as the source image, but with a slightly different artistic interpretation.
 * The resulting image is a SIBLING in the same generation (parent_image_id
 * stays NULL), so it appears next to the source in the main grid.
 *
 * The optional `hint` is a free-form user instruction ("more minimalist",
 * "with a person", "warmer lighting"…) that gets injected into the prompt.
 */
export async function regenerateVariant(imageId: string, hint?: string) {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, user, img, gen, brief, briefData } = ctx;

  try {
    const params = (img.params ?? {}) as {
      mode?: "full" | "composite";
      angle_idx?: number;
      angle_name?: string;
      concept_idx?: number;
      concept_name?: string;
      slide?: number;
      carousel?: boolean;
      carousel_role?: "hook" | "insight" | "application";
      carousel_headline?: string;
      carousel_body?: string;
      carousel_cta?: string;
      prompt?: string;
    };
    if (!params.prompt) {
      throw new Error("Prompt original manquant — image trop ancienne ?");
    }
    if (!img.model_id) throw new Error("model_id manquant sur l'image source");
    const model = getModel(img.model_id);
    if (!model) throw new Error(`Modèle inconnu : ${img.model_id}`);

    // Build the variant prompt — same base + an "alternative interpretation" hint
    const cleanedHint = (hint ?? "").trim();
    const variantSuffix = cleanedHint
      ? `\n\n══ ALTERNATIVE INTERPRETATION ══\nThis is a SIBLING VARIANT of the same concept × angle × slide. Take a fresh artistic interpretation of the scene — different camera angle, different framing, different focal element WITHIN the same visual concept. Same brand identity, same palette, same materials, same mood. NEW user direction for this variant:\n${cleanedHint}`
      : `\n\n══ ALTERNATIVE INTERPRETATION ══\nThis is a SIBLING VARIANT of the same concept × angle × slide. Take a fresh artistic interpretation: different camera angle, different framing, different focal subject placement, different lighting nuance — WITHIN the same visual concept. Same brand identity, same palette, same materials, same overall mood. The viewer should recognise it as the SAME concept but feel it's a new shot from the photoshoot.`;
    const variantPrompt = params.prompt + variantSuffix;

    // Insert the new sibling row first (with status "running"), so it shows
    // up in the grid as a placeholder while we render.
    const slideTag =
      params.carousel && params.slide
        ? ` · Slide ${params.slide}/3${params.carousel_role ? " · " + params.carousel_role : ""}`
        : "";
    const variantLabel = `${model.label} · ${params.concept_name ?? "?"} · ${params.angle_name ?? "?"}${slideTag} · variante`;

    const { data: newRow, error: insErr } = await supabase
      .from("generated_images")
      .insert({
        generation_id: gen.id,
        model_id: img.model_id,
        model_label: variantLabel,
        status: "running",
        // SIBLING: parent_image_id stays NULL so it appears in the main grid
        parent_image_id: null,
        params: {
          ...params,
          variant_kind: "variant",
          derived_from: img.id,
          variant_hint: cleanedHint || undefined,
          prompt: variantPrompt,
        },
      })
      .select("id")
      .single();
    if (insErr || !newRow) throw new Error(insErr?.message ?? "insert failed");

    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);

    // Run the model
    const result = await runModel(img.model_id, variantPrompt);
    if (!result.ok) {
      await supabase
        .from("generated_images")
        .update({ status: "failed", error_message: result.error })
        .eq("id", newRow.id);
      throw new Error(result.error);
    }

    let outputBytes = result.bytes;
    let mimeType = result.mimeType;

    // Composite mode → overlay text after model run
    if (params.mode === "composite" && briefData) {
      const angleIdx = params.angle_idx ?? 0;
      const angle = briefData.angles?.[angleIdx];
      const copy = params.carousel
        ? {
            headline: params.carousel_headline ?? angle?.headline ?? "",
            body: params.carousel_body ?? angle?.body,
            cta: params.carousel_cta ?? angle?.cta,
          }
        : {
            headline: angle?.headline ?? "",
            body: angle?.body,
            cta: angle?.cta,
          };
      outputBytes = await compositeAd({
        image: outputBytes,
        copy,
        textOverlay: {
          ...briefData.text_overlay,
          emphasis_words: params.carousel ? undefined : angle?.emphasis_words,
        },
      });
      mimeType = "image/jpeg";
    }

    const ext = mimeType === "image/png" ? "png" : "jpg";
    const newPath = `${user.id}/${brief.project_id}/${gen.id}/${newRow.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("generated")
      .upload(newPath, outputBytes, {
        contentType: mimeType,
        upsert: true,
      });
    if (upErr) {
      await supabase
        .from("generated_images")
        .update({ status: "failed", error_message: `upload: ${upErr.message}` })
        .eq("id", newRow.id);
      throw new Error(`upload: ${upErr.message}`);
    }

    await supabase
      .from("generated_images")
      .update({
        storage_path: newPath,
        status: "done",
        error_message: null,
      })
      .eq("id", newRow.id);

    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}?error=${encodeURIComponent(
        `Variante: ${(e as Error).message}`
      )}`
    );
  }
}

// =============================================================================
// 2c. Auto-correct text (1-click) — unitary version of bulkAutoCorrect
// =============================================================================
/**
 * Run OCR (Claude vision) on the ad's current image, compare with the
 * expected copy (carousel slide copy if applicable, otherwise angle copy
 * stored in params, fallback to brief lookup), and if mismatches are found,
 * ask Gemini to re-render the image with the corrected text.
 *
 * Idempotent : if the text was already correct or already corrected, the
 * status pill turns green without burning extra Gemini calls.
 */
export async function autoCorrectImage(imageId: string) {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, user, img, gen, brief, briefData } = ctx;

  try {
    const params = (img.params ?? {}) as {
      mode?: "full" | "composite";
      angle_idx?: number | null;
      angle_headline?: string;
      angle_body?: string | null;
      angle_cta?: string | null;
      carousel_headline?: string;
      carousel_body?: string;
      carousel_cta?: string;
      auto_corrected?: boolean;
    };

    if (params.mode !== "full") {
      throw new Error(
        "Auto-correction réservée aux ads en mode 'full' (Gemini-rendered). Pour les composites, l'overlay est déjà parfait."
      );
    }
    if (!img.storage_path) throw new Error("Image source introuvable");

    // Resolve expected copy in priority order :
    //  1. carousel slide copy (per-slide narrative)
    //  2. angle copy persisted in params (works for brief AND custom angles)
    //  3. brief.angles[idx] lookup (legacy fallback)
    let expectedHeadline = "";
    let expectedBody: string | undefined;
    let expectedCta: string | undefined;
    if (params.carousel_headline) {
      expectedHeadline = params.carousel_headline;
      expectedBody = params.carousel_body;
      expectedCta = params.carousel_cta;
    } else if (params.angle_headline) {
      expectedHeadline = params.angle_headline;
      expectedBody = params.angle_body ?? undefined;
      expectedCta = params.angle_cta ?? undefined;
    } else if (briefData) {
      const angleIdx = params.angle_idx ?? 0;
      const angle = briefData.angles?.[angleIdx];
      if (!angle) throw new Error("Copy attendu introuvable");
      expectedHeadline = angle.headline;
      expectedBody = angle.body;
      expectedCta = angle.cta;
    } else {
      throw new Error("Copy attendu introuvable");
    }

    const sourceBytes = await downloadStorageFile(
      supabase,
      "generated",
      img.storage_path
    );

    const corrected = await autoCorrectText(sourceBytes, {
      headline: expectedHeadline,
      body: expectedBody,
      cta: expectedCta,
    });

    // No corrections needed — texte déjà OK. Mark as corrected for UX.
    if (corrected === sourceBytes) {
      await supabase
        .from("generated_images")
        .update({
          params: {
            ...params,
            auto_corrected: true,
            no_corrections_needed: true,
          },
        })
        .eq("id", img.id);
      revalidatePath(
        `/projects/${brief.project_id}/briefs/${gen.brief_id}/refine`
      );
      revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
      return;
    }

    const newPath = `${user.id}/${brief.project_id}/${gen.id}/${img.id}_corrected_${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from("generated")
      .upload(newPath, corrected, {
        contentType: "image/png",
        upsert: false,
      });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    await supabase
      .from("generated_images")
      .update({
        storage_path: newPath,
        params: { ...params, auto_corrected: true },
      })
      .eq("id", img.id);

    revalidatePath(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}/refine`
    );
    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}/refine?error=${encodeURIComponent(
        `Auto-correction : ${(e as Error).message}`
      )}`
    );
  }
}

// =============================================================================
// 2d. Boost copy for conversion — rewrite copy + re-render image
// =============================================================================
/**
 * 1. Read the ad's current copy (carousel slide copy or angle copy)
 * 2. Ask Claude (Sonnet) to rewrite for conversion (sharper hook, specific
 *    promise, soft CTA — Andrometa principles, brand voice respected)
 * 3. Use Gemini to re-render the image with the new copy (full mode) OR
 *    re-run the compositor (composite mode)
 * 4. Persist the new copy + mark copy_boosted=true. Original copy preserved
 *    in original_* fields for traceability.
 */
export async function boostCopyForConversion(imageId: string) {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, user, img, gen, brief, briefData } = ctx;

  try {
    const params = (img.params ?? {}) as {
      mode?: "full" | "composite";
      angle_idx?: number | null;
      angle_name?: string;
      angle_headline?: string;
      angle_body?: string | null;
      angle_cta?: string | null;
      carousel?: boolean;
      carousel_headline?: string;
      carousel_body?: string;
      carousel_cta?: string;
      render_style?: string;
      copy_boosted?: boolean;
      raw_path?: string;
      prompt?: string;
    };

    if (!img.storage_path) throw new Error("Image source introuvable");

    // Resolve current copy
    const isCarousel = !!params.carousel_headline;
    let currentHeadline = "";
    let currentBody = "";
    let currentCta = "";
    if (isCarousel) {
      currentHeadline = params.carousel_headline ?? "";
      currentBody = params.carousel_body ?? "";
      currentCta = params.carousel_cta ?? "";
    } else if (params.angle_headline) {
      currentHeadline = params.angle_headline;
      currentBody = params.angle_body ?? "";
      currentCta = params.angle_cta ?? "";
    } else if (briefData) {
      const angleIdx = params.angle_idx ?? 0;
      const angle = briefData.angles?.[angleIdx];
      if (!angle) throw new Error("Copy actuel introuvable");
      currentHeadline = angle.headline;
      currentBody = angle.body ?? "";
      currentCta = angle.cta ?? "";
    } else {
      throw new Error("Copy actuel introuvable");
    }

    // Brand context for tone alignment
    const brand = await loadBrandContextForBrief(supabase, gen.brief_id);

    // Claude rewrites the copy
    const improved = await improveCopyForConversion({
      current: {
        headline: currentHeadline,
        body: currentBody,
        cta: currentCta,
      },
      brand,
      angleName: params.angle_name ?? "",
      renderStyle: params.render_style ?? "cinematic",
      productSummary: briefData?.product_summary ?? null,
    });

    // Re-render the image with the new copy
    let outputBytes: Buffer;
    let outputMime = "image/jpeg";

    if (params.mode === "full") {
      const sourcePath = params.raw_path ?? img.storage_path;
      const sourceBytes = await downloadStorageFile(
        supabase,
        "generated",
        sourcePath
      );
      const editPrompt = `Edit ONLY the text on this image. Keep the visual composition, lighting, palette, materials, and layout EXACTLY identical. Replace existing text with the new copy below, perfectly spelled in French, kerning tight, same typography style and same positions as the original :

- Headline : "${improved.headline}"
${improved.body ? `- Body : "${improved.body}"` : ""}
${improved.cta ? `- CTA button text : "${improved.cta.toUpperCase()}"` : ""}

Do NOT change anything other than the text.`;

      const result = await generateGeminiImage({
        model: "gemini-3-pro-image-preview",
        prompt: editPrompt,
        inputImage: {
          mimeType: detectImageMime(sourceBytes),
          data: sourceBytes,
        },
        aspectRatio: "1:1",
      });
      if (!result.ok) throw new Error(result.error);
      outputBytes = result.data;
      outputMime = result.mimeType;
    } else {
      // Composite mode — re-run the compositor with new copy on the raw base
      if (!briefData) throw new Error("Brief non finalisé");
      const rawPath = params.raw_path;
      if (!rawPath)
        throw new Error("raw_path manquant — impossible de re-composer");
      const sourceBytes = await downloadStorageFile(
        supabase,
        "generated",
        rawPath
      );
      const angleIdx = params.angle_idx ?? 0;
      const angle = briefData.angles?.[angleIdx];
      outputBytes = await compositeAd({
        image: sourceBytes,
        copy: {
          headline: improved.headline,
          body: improved.body,
          cta: improved.cta,
        },
        textOverlay: {
          ...briefData.text_overlay,
          emphasis_words: angle?.emphasis_words,
        },
      });
    }

    // Upload the boosted image
    const newPath = `${user.id}/${brief.project_id}/${gen.id}/${img.id}_boosted_${Date.now()}.${
      outputMime === "image/png" ? "png" : "jpg"
    }`;
    const { error: upErr } = await supabase.storage
      .from("generated")
      .upload(newPath, outputBytes, {
        contentType: outputMime,
        upsert: false,
      });
    if (upErr) throw new Error(`upload : ${upErr.message}`);

    // Persist new copy + mark boosted, keep original_* for traceability
    const newParams = isCarousel
      ? {
          ...params,
          carousel_headline: improved.headline,
          carousel_body: improved.body,
          carousel_cta: improved.cta,
          original_carousel_headline:
            params.carousel_headline ?? currentHeadline,
          original_carousel_body: params.carousel_body ?? currentBody,
          original_carousel_cta: params.carousel_cta ?? currentCta,
          copy_boosted: true,
          copy_boost_rationale: improved.rationale,
        }
      : {
          ...params,
          angle_headline: improved.headline,
          angle_body: improved.body,
          angle_cta: improved.cta,
          original_angle_headline: params.angle_headline ?? currentHeadline,
          original_angle_body: params.angle_body ?? currentBody,
          original_angle_cta: params.angle_cta ?? currentCta,
          copy_boosted: true,
          copy_boost_rationale: improved.rationale,
        };

    await supabase
      .from("generated_images")
      .update({
        storage_path: newPath,
        params: newParams,
      })
      .eq("id", img.id);

    revalidatePath(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}/refine`
    );
    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}/refine?error=${encodeURIComponent(
        `Boost copy : ${(e as Error).message}`
      )}`
    );
  }
}

// =============================================================================
// 3. Apply legal mentions footer (French finance compliance)
// =============================================================================
export async function applyLegalMentions(imageId: string) {
  const ctx = await loadImageRowAndBrief(imageId);
  const { supabase, user, img, gen, brief, briefData } = ctx;

  try {
    if (!img.storage_path) throw new Error("Image introuvable en storage");
    const baseBytes = await downloadStorageFile(
      supabase,
      "generated",
      img.storage_path
    );

    // Use Claude to generate context-appropriate disclaimers
    const disclaimers = await generateLegalDisclaimers({
      productSummary: briefData?.product_summary ?? "",
      headline: gen.copy_headline ?? "",
      body: gen.copy_body ?? "",
      cta: gen.copy_cta ?? "",
    });

    const finalBytes = await addLegalFooter(baseBytes, disclaimers);

    const newPath = `${user.id}/${brief.project_id}/${gen.id}/${img.id}_legal.jpg`;
    const { error: upErr } = await supabase.storage
      .from("generated")
      .upload(newPath, finalBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    const params = (img.params ?? {}) as Record<string, unknown>;
    await supabase
      .from("generated_images")
      .update({
        storage_path: newPath,
        params: { ...params, legal_applied: true, legal_text: disclaimers },
      })
      .eq("id", img.id);

    revalidatePath(`/projects/${brief.project_id}/briefs/${gen.brief_id}`);
  } catch (e) {
    redirect(
      `/projects/${brief.project_id}/briefs/${gen.brief_id}?error=${encodeURIComponent(
        `Mentions: ${(e as Error).message}`
      )}`
    );
  }
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
- Maximum ~250 caractères au total (doit tenir en 2-3 lignes max sous le visuel)
- Termine TOUJOURS chaque phrase par un point.
- N'INVENTE PAS de régulations ou régimes : pas de "Triangle de sécurité luxembourgeois", pas de noms d'organismes, pas de jargon ACPR/AMF.
- Reste générique et juste.

ÉLÉMENTS OBLIGATOIRES (toujours, sauf incompatibilité évidente) :
1. "Communication à caractère promotionnel."
2. "Ceci ne constitue pas un conseil en investissement personnalisé."

ÉLÉMENTS CONDITIONNELS (ajoute si pertinent au contexte) :
- Si investissement / placement / patrimoine : "Investir comporte des risques de perte en capital."
- Si performance / rendement / chiffre de résultat : "Les performances passées ne préjugent pas des performances futures."
- Si "garanti" / "intouchable" / "blindé" / "protégé" : "Les protections dépendent du cadre contractuel et de la solidité du prestataire."

FORMAT : retourne UNIQUEMENT le texte fini, sans guillemets, sans markdown, sans préambule. Concis, sobre, juste. Privilégie 3 segments courts plutôt que 1 long.`,
    messages: [
      {
        role: "user",
        content: `Produit : ${ctx.productSummary}
Headline : "${ctx.headline}"
Body : "${ctx.body}"
CTA : "${ctx.cta}"

Produis les mentions légales appropriées (court, factuel, sans rien inventer).`,
      },
    ],
  });
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text"
    ? block.text.trim().replace(/^["']|["']$/g, "")
    : "Communication à caractère promotionnel. · Investir comporte des risques de perte en capital.";
}

async function addLegalFooter(
  imageBytes: Buffer,
  text: string
): Promise<Buffer> {
  const meta = await sharp(imageBytes).metadata();
  const W = meta.width ?? 1080;
  const H = meta.height ?? 1080;

  // Choose font size + wrap that fits in <= 2 lines without cutting the last word.
  // Try 18, 16, 14, 13 in turn — each tries the widest wrap first.
  const PADDING_X = 40;
  const usableW = W - PADDING_X * 2;
  let fontSize = 18;
  let lines: string[] = [];
  for (const fs of [18, 16, 14, 13]) {
    // Approximate average char width at this size for Inter Regular
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
    // Last resort — force 4 lines at smallest size, won't truncate
    const avgCharW = 12 * 0.52;
    const charsPerLine = Math.floor(usableW / avgCharW);
    fontSize = 12;
    lines = wrapText(text, charsPerLine);
  }

  const lineHeight = fontSize * 1.4;
  const VERTICAL_PADDING = 16;
  const FOOTER_HEIGHT = Math.max(
    60,
    Math.ceil(lines.length * lineHeight + VERTICAL_PADDING * 2)
  );

  // ── Preserve the original canvas dimensions (W × H). Critical for Meta ads :
  // a 1:1 input must stay 1:1. We resize the visual to fit the area ABOVE the
  // legal strip, then composite both into a canvas of the ORIGINAL size.
  // The visual is squished vertically by FOOTER_HEIGHT/H (~5-8 %) but ALL
  // content is preserved (no cropping of the headline/CTA) and the format
  // stays usable on Meta.
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

  const final = await sharp({
    create: {
      width: W,
      height: H, // ← UNCHANGED : preserves the source aspect ratio (1:1, 9:16, etc.)
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

  return final;
}

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
