"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateGeminiImage } from "@/lib/gemini-image";
import { autoCorrectText } from "@/lib/post-processors";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/anthropic";
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

// =============================================================================
// Helpers — DB context
// =============================================================================

async function loadBriefForRefine(briefId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, project_id, brief_data, user_id")
    .eq("id", briefId)
    .maybeSingle();
  if (!brief) throw new Error("Brief introuvable");
  if (brief.user_id !== user.id) throw new Error("Brief inaccessible");

  return {
    supabase,
    user,
    brief,
    briefData: brief.brief_data as Brief | null,
  };
}

async function loadSelectedMasterIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  briefId: string
): Promise<string[]> {
  const { data: gens } = await supabase
    .from("generations")
    .select("id")
    .eq("brief_id", briefId);
  const genIds = (gens ?? []).map((g) => g.id);
  if (genIds.length === 0) return [];

  const { data: imgs } = await supabase
    .from("generated_images")
    .select("id")
    .in("generation_id", genIds)
    .is("parent_image_id", null)
    .eq("selected", true)
    .eq("status", "done");

  return (imgs ?? []).map((i) => i.id);
}

function detectImageMime(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  if (buf.length < 12) return "image/png";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
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

// =============================================================================
// Bulk action 1 — auto-correct text on every selected master
// =============================================================================

export async function bulkAutoCorrect(briefId: string) {
  const ctx = await loadBriefForRefine(briefId);
  const { supabase, user, brief, briefData } = ctx;

  const ids = await loadSelectedMasterIds(supabase, briefId);
  if (ids.length === 0 || !briefData) {
    revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
    return;
  }

  // Parallelized worker pool. Concurrency 4 — each worker does an OCR
  // (Haiku) + maybe a Gemini edit. The Gemini throttle (15 RPM cap with
  // auto-retry on 429) handles the rate-limit dance transparently.
  await runWithConcurrency(ids, 4, async (imageId) => {
    try {
      const { data: img } = await supabase
        .from("generated_images")
        .select("id, generation_id, model_label, storage_path, params")
        .eq("id", imageId)
        .single();
      if (!img?.storage_path) return;

      const params = (img.params ?? {}) as {
        mode?: "full" | "composite";
        angle_idx?: number | null;
        angle_headline?: string;
        angle_body?: string | null;
        angle_cta?: string | null;
        carousel_headline?: string;
        carousel_body?: string;
        carousel_cta?: string;
      };
      if (params.mode !== "full") return;

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
      } else {
        const angleIdx = params.angle_idx ?? 0;
        const angle = briefData.angles?.[angleIdx];
        if (!angle) return;
        expectedHeadline = angle.headline;
        expectedBody = angle.body;
        expectedCta = angle.cta;
      }

      const { data: dl, error } = await supabase.storage
        .from("generated")
        .download(img.storage_path);
      if (error || !dl) return;
      const sourceBytes = Buffer.from(await dl.arrayBuffer());

      const corrected = await autoCorrectText(sourceBytes, {
        headline: expectedHeadline,
        body: expectedBody,
        cta: expectedCta,
      });
      // No-op : either text already correct, or autoCorrectText returned
      // the source on Gemini failure. Mark as corrected for UX.
      if (!corrected || corrected === sourceBytes) {
        await supabase
          .from("generated_images")
          .update({
            params: {
              ...params,
              auto_corrected: true,
              no_corrections_needed: true,
            },
          })
          .eq("id", imageId);
        return;
      }

      const newPath = `${user.id}/${brief.project_id}/${img.generation_id}/${imageId}_corrected_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("generated")
        .upload(newPath, corrected, {
          contentType: "image/png",
          upsert: false,
        });
      if (upErr) return;

      await supabase
        .from("generated_images")
        .update({
          storage_path: newPath,
          params: { ...params, auto_corrected: true },
        })
        .eq("id", imageId);
    } catch {
      // Best-effort — keep going on the next image
    }
  });

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

/**
 * Concurrency-controlled worker pool. Same as Promise.all but with a max
 * of `concurrency` tasks in flight at once. Used for bulk operations that
 * could otherwise blow past Gemini RPM caps or saturate the DB.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  async function loop() {
    while (cursor < items.length) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => loop())
  );
}

// =============================================================================
// Bulk action 2 — apply legal mentions footer on every selected master
// =============================================================================

export async function bulkApplyLegal(briefId: string) {
  const ctx = await loadBriefForRefine(briefId);
  const { supabase, user, brief, briefData } = ctx;

  const ids = await loadSelectedMasterIds(supabase, briefId);
  if (ids.length === 0) {
    revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
    return;
  }

  // Generate disclaimers ONCE for the whole batch — they only depend on the
  // brief context (product summary + headline/body/cta from any angle).
  const headAngle = briefData?.angles?.[0];
  const disclaimers = await generateLegalDisclaimers({
    productSummary: briefData?.product_summary ?? "",
    headline: headAngle?.headline ?? "",
    body: headAngle?.body ?? "",
    cta: headAngle?.cta ?? "",
  });

  // Sharp+Resvg is local CPU work — no rate limit. Concurrency 8 is fine
  // (any higher saturates Sharp's libvips threadpool with diminishing returns).
  await runWithConcurrency(ids, 8, async (imageId) => {
    try {
      const { data: img } = await supabase
        .from("generated_images")
        .select("id, generation_id, storage_path, params")
        .eq("id", imageId)
        .single();
      if (!img?.storage_path) return;

      const params = (img.params ?? {}) as Record<string, unknown>;
      if (params.legal_applied) return;

      const { data: dl, error } = await supabase.storage
        .from("generated")
        .download(img.storage_path);
      if (error || !dl) return;
      const baseBytes = Buffer.from(await dl.arrayBuffer());

      const finalBytes = await addLegalFooter(baseBytes, disclaimers);

      const newPath = `${user.id}/${brief.project_id}/${img.generation_id}/${imageId}_legal.jpg`;
      const { error: upErr } = await supabase.storage
        .from("generated")
        .upload(newPath, finalBytes, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) return;

      await supabase
        .from("generated_images")
        .update({
          storage_path: newPath,
          params: { ...params, legal_applied: true, legal_text: disclaimers },
        })
        .eq("id", imageId);
    } catch {
      // continue
    }
  });

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

// =============================================================================
// Bulk action — embed brand logo on every selected master that doesn't have it
// =============================================================================

const LOGO_EMBED_PROMPT = `You are given two images :
  • Image 1 : the ad creative (square or vertical, the canvas to edit)
  • Image 2 : the brand logo (possibly with transparency)

TASK : place Image 2 (the logo) discreetly INTO Image 1. The result is Image 1 with the logo integrated.

POSITIONING : default bottom-right with ~4-6 % margin. If the bottom-right is busy or has critical content / text, pick the least busy corner (top-right, top-left, bottom-left). Never overlap headline / body / CTA / source line.

SIZE : logo width ≈ 8-12 % of canvas width — small, discreet. Maintain the exact aspect ratio of Image 2.

CONTRAST / VISIBILITY : sample the underlying area. If it clashes with the logo's tone, add a SUBTLE soft scrim (white if dark area, dark if bright area) at 60-80 % opacity with blurred edges, OR slightly tint the logo. Mid-tone with good contrast → no scrim. The scrim must be barely noticeable.

INTEGRATION : match the lighting / grain / mood of Image 1 — the logo must feel native, not pasted. Slight transparency (90-95 %) acceptable.

FORBIDDEN : modifying ANY other element of Image 1 (composition, headline, body, CTA, colors, subject, lighting elsewhere). Adding any extra brand text, handle, or copyright line. Making the logo large or central.

OUTPUT : Image 1 with the logo discreetly integrated, same dimensions, premium quality.`;

export async function bulkEmbedLogo(briefId: string) {
  const ctx = await loadBriefForRefine(briefId);
  const { supabase, user, brief } = ctx;

  const ids = await loadSelectedMasterIds(supabase, briefId);
  if (ids.length === 0) {
    revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
    return;
  }

  // Resolve the brand's default logo ONCE for this batch
  const { data: briefRow } = await supabase
    .from("briefs")
    .select("brand_id")
    .eq("id", briefId)
    .maybeSingle();
  if (!briefRow?.brand_id) {
    revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}/refine?error=${encodeURIComponent(
        "Aucune marque associée — sélectionne une marque sur la page du brief avant d'embed le logo."
      )}`
    );
  }
  const { data: logoRow } = await supabase
    .from("brand_logos")
    .select("storage_path, mime_type")
    .eq("brand_id", briefRow.brand_id)
    .eq("is_default", true)
    .maybeSingle();
  if (!logoRow?.storage_path) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}/refine?error=${encodeURIComponent(
        "La marque n'a pas de logo défaut. Upload-en un sur la page de la marque."
      )}`
    );
  }
  const logoBlob = await supabase.storage
    .from("brand_resources")
    .download(logoRow.storage_path);
  if (logoBlob.error || !logoBlob.data) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}/refine?error=${encodeURIComponent(
        `Logo : ${logoBlob.error?.message ?? "indisponible"}`
      )}`
    );
  }
  const logoBytes = Buffer.from(await logoBlob.data.arrayBuffer());
  const logoMime = logoRow.mime_type ?? "image/png";

  // Process in parallel — each Gemini call is independent
  await Promise.all(
    ids.map(async (imageId) => {
      try {
        const { data: img } = await supabase
          .from("generated_images")
          .select("id, generation_id, storage_path, params")
          .eq("id", imageId)
          .single();
        if (!img?.storage_path) return;

        const params = (img.params ?? {}) as Record<string, unknown>;
        if (params.logo_embedded === true) return; // skip already-done

        const { data: dl, error } = await supabase.storage
          .from("generated")
          .download(img.storage_path);
        if (error || !dl) return;
        const adBytes = Buffer.from(await dl.arrayBuffer());

        const result = await generateGeminiImage({
          model: "gemini-3-pro-image-preview",
          prompt: LOGO_EMBED_PROMPT,
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
        if (!result.ok) return;

        const ext = result.mimeType === "image/png" ? "png" : "jpg";
        const newPath = `${user.id}/${brief.project_id}/${img.generation_id}/${imageId}_logo.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("generated")
          .upload(newPath, result.data, {
            contentType: result.mimeType,
            upsert: true,
          });
        if (upErr) return;

        await supabase
          .from("generated_images")
          .update({
            storage_path: newPath,
            params: { ...params, logo_embedded: true },
          })
          .eq("id", imageId);
      } catch {
        // continue on error
      }
    })
  );

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

// =============================================================================
// Bulk action 3 — generate 9:16 variant for every selected master
// =============================================================================

export async function bulkGenerate916(briefId: string) {
  const ctx = await loadBriefForRefine(briefId);
  const { supabase, user, brief } = ctx;

  const ids = await loadSelectedMasterIds(supabase, briefId);
  if (ids.length === 0) {
    revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
    return;
  }

  // Only generate a 9:16 variant for masters that don't already have one.
  const { data: existing } = await supabase
    .from("generated_images")
    .select("parent_image_id")
    .in("parent_image_id", ids);
  const alreadyHas = new Set(
    (existing ?? []).map((r) => r.parent_image_id as string)
  );

  // Run in parallel — each one is independent
  await Promise.all(
    ids
      .filter((id) => !alreadyHas.has(id))
      .map(async (imageId) => {
        try {
          const { data: img } = await supabase
            .from("generated_images")
            .select("id, generation_id, model_id, model_label, storage_path, params")
            .eq("id", imageId)
            .single();
          if (!img?.storage_path) return;

          const { data: dl, error } = await supabase.storage
            .from("generated")
            .download(img.storage_path);
          if (error || !dl) return;
          const sourceBytes = Buffer.from(await dl.arrayBuffer());

          const result = await generateGeminiImage({
            model: "gemini-3-pro-image-preview",
            prompt: BUILD_916_PROMPT,
            inputImage: {
              mimeType: detectImageMime(sourceBytes),
              data: sourceBytes,
            },
            aspectRatio: "9:16",
          });
          if (!result.ok) return;

          const newPath = `${user.id}/${brief.project_id}/${img.generation_id}/${imageId}_916.jpg`;
          const { error: upErr } = await supabase.storage
            .from("generated")
            .upload(newPath, result.data, {
              contentType: result.mimeType,
              upsert: true,
            });
          if (upErr) return;

          const baseLabel = (img.model_label ?? "image").replace(
            /\s*-\s*9:16$/,
            ""
          );
          await supabase.from("generated_images").insert({
            generation_id: img.generation_id,
            model_id: img.model_id,
            model_label: `${baseLabel} - 9:16`,
            storage_path: newPath,
            status: "done",
            parent_image_id: imageId,
            params: {
              ...((img.params ?? {}) as Record<string, unknown>),
              format: "9:16",
              derived_from: imageId,
            },
          });
        } catch {
          // continue
        }
      })
  );

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}/refine`);
  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

// =============================================================================
// Internal helpers — duplicated from post-actions.ts so refine works standalone
// =============================================================================

const BUILD_916_PROMPT = `Use the attached 1:1 ad creative as a STYLE REFERENCE only — match subject, palette, lighting, materials, rendering quality, typography style, and copy the text word-for-word (perfectly spelled in French).

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
  const FOOTER_HEIGHT = Math.max(
    60,
    Math.ceil(lines.length * lineHeight + VERTICAL_PADDING * 2)
  );
  const newH = H + FOOTER_HEIGHT;
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
      height: newH,
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .composite([
      { input: imageBytes, top: 0, left: 0 },
      { input: footerPng, top: H, left: 0 },
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
