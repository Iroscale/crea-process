"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  scrapeLandingPage,
  extractBrandDA,
  downloadLogo,
} from "@/lib/brand-extractor";

function parseList(raw: string): string[] {
  // Comma-separated input, also accepts newlines
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseColors(raw: string): string[] {
  // Accepts "#1a1a1a, #FFD700" or one per line. Validates hex format loosely.
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^#?[0-9a-fA-F]{3,8}$/.test(s))
    .map((s) => (s.startsWith("#") ? s : "#" + s));
}

/**
 * Save the brand's metadata (name, DA fields). Resources are managed
 * through their own actions below.
 */
export async function updateBrand(brandId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const description = (String(formData.get("description") ?? "") || "").trim();
  const brand_voice = (String(formData.get("brand_voice") ?? "") || "").trim();
  const mission = (String(formData.get("mission") ?? "") || "").trim();
  const target_audience = (
    String(formData.get("target_audience") ?? "") || ""
  ).trim();
  const typography = (String(formData.get("typography") ?? "") || "").trim();
  const visual_principles = (
    String(formData.get("visual_principles") ?? "") || ""
  ).trim();

  const primary_colors = parseColors(
    String(formData.get("primary_colors") ?? "")
  );
  const do_say = parseList(String(formData.get("do_say") ?? ""));
  const dont_say = parseList(String(formData.get("dont_say") ?? ""));

  if (!name) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent("Nom de marque obligatoire")}`
    );
  }

  const { error } = await supabase
    .from("brands")
    .update({
      name,
      description: description || null,
      brand_voice: brand_voice || null,
      mission: mission || null,
      target_audience: target_audience || null,
      typography: typography || null,
      visual_principles: visual_principles || null,
      primary_colors,
      do_say,
      dont_say,
      // Invalidate the compiled system_prompt — needs recompile after edits
      system_prompt: null,
    })
    .eq("id", brandId);

  if (error) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/brands/${brandId}`);
  revalidatePath("/brands");
}

/**
 * Add a free-text resource (a note from the user about the brand).
 */
export async function addManualResource(brandId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const label = (String(formData.get("label") ?? "") || "").trim();
  const manual_text = String(formData.get("manual_text") ?? "").trim();

  if (!manual_text) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent("Texte vide — rien à enregistrer")}`
    );
  }

  const { error } = await supabase.from("brand_resources").insert({
    brand_id: brandId,
    kind: "manual",
    label: label || manual_text.slice(0, 60),
    manual_text,
  });

  if (error) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(error.message)}`
    );
  }

  // Invalidate compiled prompt
  await supabase
    .from("brands")
    .update({ system_prompt: null })
    .eq("id", brandId);

  revalidatePath(`/brands/${brandId}`);
}

/**
 * Scan a landing page and auto-fill the brand's DA fields.
 *  1. Scrape HTML (cheerio) → title, text, fonts, colors, logo candidates
 *  2. Claude synthesizes structured DA from scraped data
 *  3. Download the most likely logo and store it in the bucket
 *  4. Update the brand row + create a "url" resource for traceability
 */
export async function extractFromUrl(brandId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent("URL obligatoire")}`
    );
  }

  // Verify brand exists + ownership
  const { data: brand } = await supabase
    .from("brands")
    .select("id, user_id, name, primary_colors, do_say, dont_say")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand || brand.user_id !== user.id) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent("Marque introuvable")}`
    );
  }

  let scraped;
  try {
    scraped = await scrapeLandingPage(url);
  } catch (e) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(
        `Scraping : ${(e as Error).message}`
      )}`
    );
  }

  let da;
  try {
    da = await extractBrandDA(scraped);
  } catch (e) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(
        `Synthèse Claude : ${(e as Error).message}`
      )}`
    );
  }

  // Download logo (best-effort, never blocks). Stored in brand_logos with
  // is_default=true if no other default logo exists for this brand.
  for (const candidate of scraped.logoCandidates) {
    const dl = await downloadLogo(candidate);
    if (!dl) continue;

    // Check if there's already a default logo on this brand
    const { data: existingDefault } = await supabase
      .from("brand_logos")
      .select("id")
      .eq("brand_id", brandId)
      .eq("is_default", true)
      .maybeSingle();

    const logoId = crypto.randomUUID();
    const path = `${user.id}/${brandId}/logo_${logoId}.${dl.ext}`;
    const { error: upErr } = await supabase.storage
      .from("brand_resources")
      .upload(path, dl.bytes, {
        contentType: dl.mime,
        upsert: false,
      });
    if (upErr) break;

    await supabase.from("brand_logos").insert({
      id: logoId,
      brand_id: brandId,
      label: "Logo scrapé",
      storage_path: path,
      mime_type: dl.mime,
      size_bytes: dl.bytes.byteLength,
      is_default: !existingDefault, // become default only if none yet
    });
    break;
  }

  // Merge colors : extracted DA + previously saved (preserve user-curated ones,
  // dedup, cap at 8). The DA's first take goes first.
  const existingColors = (brand.primary_colors as string[] | null) ?? [];
  const colorsMerged = Array.from(
    new Set([...(da.primary_colors ?? []), ...existingColors])
  ).slice(0, 8);

  const existingDoSay = (brand.do_say as string[] | null) ?? [];
  const existingDontSay = (brand.dont_say as string[] | null) ?? [];

  const updatePayload: Record<string, unknown> = {
    description: da.description ?? null,
    mission: da.mission ?? null,
    target_audience: da.target_audience ?? null,
    brand_voice: da.brand_voice ?? null,
    typography: da.typography ?? null,
    visual_principles: da.visual_principles ?? null,
    primary_colors: colorsMerged,
    do_say: dedupAndCap(
      [...(da.do_say ?? []), ...existingDoSay],
      12
    ),
    dont_say: dedupAndCap(
      [...(da.dont_say ?? []), ...existingDontSay],
      12
    ),
    landing_page_url: scraped.finalUrl,
    system_prompt: null, // invalidate compile
  };

  const { error: updErr } = await supabase
    .from("brands")
    .update(updatePayload)
    .eq("id", brandId);
  if (updErr) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(
        `Mise à jour DA : ${updErr.message}`
      )}`
    );
  }

  // Save the scraped landing as a brand resource for traceability
  await supabase.from("brand_resources").insert({
    brand_id: brandId,
    kind: "url",
    label: `Scan : ${scraped.title || scraped.finalUrl}`.slice(0, 80),
    source_url: scraped.finalUrl,
    scraped_text: scraped.textBody.slice(0, 6_000),
    scraped_at: new Date().toISOString(),
  });

  revalidatePath(`/brands/${brandId}`);
  revalidatePath("/brands");
}

function dedupAndCap(arr: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.trim());
    if (out.length >= cap) break;
  }
  return out;
}

// =============================================================================
// Logo management — manual upload + set-default + delete
// =============================================================================

const ACCEPTED_LOGO_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

const MAX_LOGO_SIZE = 5_000_000; // 5 MB

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/**
 * Upload a new logo variant for the brand. The first uploaded logo for a
 * brand becomes the default; subsequent ones don't override it unless the
 * user explicitly sets them as default.
 */
export async function addLogo(brandId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("file");
  const label = (String(formData.get("label") ?? "") || "").trim() || "Logo";

  if (!file || !(file instanceof File) || file.size === 0) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent("Aucun fichier sélectionné")}`
    );
  }
  if (file.size > MAX_LOGO_SIZE) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(
        `Logo trop lourd (${Math.round(file.size / 1000)} KB > 5 MB)`
      )}`
    );
  }
  // Trust file.type but still allow SVG explicitly
  const mime = file.type || "image/png";
  if (!ACCEPTED_LOGO_MIMES.has(mime)) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(
        `Format non supporté : ${mime}. Utilise PNG / JPEG / WebP / SVG / GIF.`
      )}`
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Verify brand ownership
  const { data: brand } = await supabase
    .from("brands")
    .select("id, user_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand || brand.user_id !== user.id) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent("Marque introuvable")}`
    );
  }

  const { data: existingDefault } = await supabase
    .from("brand_logos")
    .select("id")
    .eq("brand_id", brandId)
    .eq("is_default", true)
    .maybeSingle();

  const logoId = crypto.randomUUID();
  const ext = mimeToExt(mime);
  const path = `${user.id}/${brandId}/logo_${logoId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("brand_resources")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(
        `Upload : ${upErr.message}`
      )}`
    );
  }

  const { error: insErr } = await supabase.from("brand_logos").insert({
    id: logoId,
    brand_id: brandId,
    label,
    storage_path: path,
    mime_type: mime,
    size_bytes: bytes.byteLength,
    is_default: !existingDefault,
  });
  if (insErr) {
    // best-effort cleanup
    await supabase.storage.from("brand_resources").remove([path]);
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(
        `Insert : ${insErr.message}`
      )}`
    );
  }

  revalidatePath(`/brands/${brandId}`);
}

/**
 * Promote a logo to the default for this brand. Demotes the previous default
 * automatically because of the unique partial index `is_default=true`.
 */
export async function setDefaultLogo(brandId: string, logoId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Demote current default first to avoid the partial unique index conflict
  await supabase
    .from("brand_logos")
    .update({ is_default: false })
    .eq("brand_id", brandId)
    .eq("is_default", true);

  const { error } = await supabase
    .from("brand_logos")
    .update({ is_default: true })
    .eq("id", logoId)
    .eq("brand_id", brandId);
  if (error) {
    redirect(
      `/brands/${brandId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/brands/${brandId}`);
}

export async function deleteLogo(brandId: string, logoId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("brand_logos")
    .select("storage_path, is_default")
    .eq("id", logoId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!row) {
    revalidatePath(`/brands/${brandId}`);
    return;
  }

  await supabase.storage.from("brand_resources").remove([row.storage_path]);
  await supabase.from("brand_logos").delete().eq("id", logoId);

  // If we deleted the default, promote any remaining logo as new default
  if (row.is_default) {
    const { data: next } = await supabase
      .from("brand_logos")
      .select("id")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase
        .from("brand_logos")
        .update({ is_default: true })
        .eq("id", next.id);
    }
  }

  revalidatePath(`/brands/${brandId}`);
}

export async function updateLogoLabel(
  brandId: string,
  logoId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const label = (String(formData.get("label") ?? "") || "").trim();
  if (!label) return;

  await supabase
    .from("brand_logos")
    .update({ label })
    .eq("id", logoId)
    .eq("brand_id", brandId);

  revalidatePath(`/brands/${brandId}`);
}

export async function deleteResource(brandId: string, resourceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read storage_path before deleting (to also remove the file)
  const { data: row } = await supabase
    .from("brand_resources")
    .select("storage_path")
    .eq("id", resourceId)
    .maybeSingle();

  if (row?.storage_path) {
    await supabase.storage.from("brand_resources").remove([row.storage_path]);
  }

  await supabase.from("brand_resources").delete().eq("id", resourceId);

  // Invalidate compiled prompt
  await supabase
    .from("brands")
    .update({ system_prompt: null })
    .eq("id", brandId);

  revalidatePath(`/brands/${brandId}`);
}
