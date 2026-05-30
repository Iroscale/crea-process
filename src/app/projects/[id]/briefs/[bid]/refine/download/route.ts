import { NextRequest } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /projects/[id]/briefs/[bid]/refine/download
 *
 * Streams a ZIP of every SELECTED master (1:1) plus its 9:16 variant if any.
 * Filename convention (constant 5-field structure for Meta BM ingestion):
 *
 *   {Brief}_{Angle}_{Concept}_{Type}_{Format}.{ext}
 *
 *     Brief   : slug of brief.title (PascalCase, no separators)
 *     Angle   : slug of params.angle_name
 *     Concept : slug of params.concept_name
 *     Type    : "STATIC" or "S1HOOK" / "S2INSIGHT" / "S3APPLI" for carousel slides
 *     Format  : "1x1" or "9x16"
 *
 * If multiple ads collide on the same key (e.g. several models tested or
 * regenerated variants), a "_v2", "_v3" suffix is appended — model is NOT
 * encoded in the name to keep the structure constant.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; bid: string }> }
) {
  const { id, bid } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, title, project_id, user_id")
    .eq("id", bid)
    .maybeSingle();
  if (!brief || brief.project_id !== id || brief.user_id !== user.id) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Fetch generations of this brief
  const { data: gens } = await supabase
    .from("generations")
    .select("id")
    .eq("brief_id", bid);
  const genIds = (gens ?? []).map((g) => g.id);
  if (genIds.length === 0) {
    return new Response("Aucune génération", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Fetch selected 1:1 masters (parent_image_id IS NULL, selected = true, status = done)
  type ImgParams = {
    angle_name?: string;
    concept_name?: string;
    slide?: number;
    carousel?: boolean;
    carousel_role?: "hook" | "insight" | "application";
  };
  type Master = {
    id: string;
    storage_path: string | null;
    created_at: string;
    params: ImgParams | null;
  };
  const { data: mastersRaw } = await supabase
    .from("generated_images")
    .select("id, storage_path, created_at, params")
    .in("generation_id", genIds)
    .is("parent_image_id", null)
    .eq("selected", true)
    .eq("status", "done")
    .order("created_at", { ascending: true });
  const masters = (mastersRaw ?? []) as Master[];

  if (masters.length === 0) {
    return new Response("Aucune image sélectionnée à exporter", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Fetch all 9:16 variants for these masters
  const masterIds = masters.map((m) => m.id);
  type Variant = {
    id: string;
    parent_image_id: string | null;
    storage_path: string | null;
    params: ImgParams | null;
  };
  const { data: variantsRaw } = await supabase
    .from("generated_images")
    .select("id, parent_image_id, storage_path, params")
    .in("parent_image_id", masterIds)
    .eq("status", "done");
  const variants = (variantsRaw ?? []) as Variant[];
  const variantsByParent = new Map<string, Variant[]>();
  for (const v of variants) {
    if (!v.parent_image_id) continue;
    const list = variantsByParent.get(v.parent_image_id) ?? [];
    list.push(v);
    variantsByParent.set(v.parent_image_id, list);
  }

  // Build ZIP with deterministic filenames
  const zip = new JSZip();
  const briefSlug = slugify(brief.title || "brief");
  const counters = new Map<string, number>(); // base filename → version counter
  const manifest: string[] = [
    "Filename,Type,Format,Angle,Concept,SourceImageId",
  ];

  // Download every asset in parallel for speed
  type Asset = {
    bytes: Buffer;
    filename: string;
    manifestRow: string;
  };

  const downloads: Promise<Asset | null>[] = [];

  for (const m of masters) {
    if (!m.storage_path) continue;
    downloads.push(
      buildAsset(supabase, briefSlug, m, "1x1", counters, manifest)
    );

    const myVariants = variantsByParent.get(m.id) ?? [];
    for (const v of myVariants) {
      if (!v.storage_path) continue;
      downloads.push(
        buildAsset(supabase, briefSlug, v, "9x16", counters, manifest)
      );
    }
  }

  const assets = (await Promise.all(downloads)).filter(
    (a): a is Asset => a !== null
  );

  if (assets.length === 0) {
    return new Response("Aucun fichier disponible en storage", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  for (const a of assets) {
    zip.file(a.filename, a.bytes);
  }

  // Add a manifest CSV — handy when bulk-importing into a spreadsheet later
  zip.file("manifest.csv", manifest.join("\n") + "\n");

  const zipBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const today = new Date().toISOString().slice(0, 10);
  const zipName = `${briefSlug}_${today}.zip`;

  return new Response(new Uint8Array(zipBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Content-Length": String(zipBuf.length),
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

async function buildAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  briefSlug: string,
  row: {
    id: string;
    storage_path: string | null;
    params: {
      angle_name?: string;
      concept_name?: string;
      slide?: number;
      carousel?: boolean;
      carousel_role?: "hook" | "insight" | "application";
    } | null;
  },
  format: "1x1" | "9x16",
  counters: Map<string, number>,
  manifest: string[]
): Promise<{ bytes: Buffer; filename: string; manifestRow: string } | null> {
  if (!row.storage_path) return null;
  const p = row.params ?? {};
  const angleSlug = slugify(p.angle_name || "angle");
  const conceptSlug = slugify(p.concept_name || "concept");
  const typeTag = buildTypeTag(p);
  const ext = row.storage_path.toLowerCase().endsWith(".png") ? "png" : "jpg";

  // Stable base filename — collisions get _v2, _v3 etc.
  const base = `${briefSlug}_${angleSlug}_${conceptSlug}_${typeTag}_${format}`;
  const counterKey = base;
  const next = (counters.get(counterKey) ?? 0) + 1;
  counters.set(counterKey, next);
  const suffix = next === 1 ? "" : `_v${next}`;
  const filename = `${base}${suffix}.${ext}`;

  const { data: dl, error } = await supabase.storage
    .from("generated")
    .download(row.storage_path);
  if (error || !dl) return null;
  const bytes = Buffer.from(await dl.arrayBuffer());

  const manifestRow = [
    csv(filename),
    csv(typeTag),
    csv(format),
    csv(p.angle_name ?? ""),
    csv(p.concept_name ?? ""),
    csv(row.id),
  ].join(",");
  manifest.push(manifestRow);

  return { bytes, filename, manifestRow };
}

function buildTypeTag(p: {
  carousel?: boolean;
  slide?: number;
  carousel_role?: "hook" | "insight" | "application";
}): string {
  if (!p.carousel || !p.slide) return "STATIC";
  const role = p.carousel_role;
  const roleTag =
    role === "hook"
      ? "HOOK"
      : role === "insight"
      ? "INSIGHT"
      : role === "application"
      ? "APPLI"
      : "";
  return roleTag ? `S${p.slide}${roleTag}` : `S${p.slide}`;
}

/**
 * Slugify : strip accents, keep only [A-Za-z0-9], PascalCase-ish from spaces.
 * Capped at 28 chars to keep filenames manageable in BM.
 */
function slugify(s: string): string {
  const stripped = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .trim();
  // Split on non-alphanumeric and PascalCase the segments
  const parts = stripped
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1));
  const joined = parts.join("");
  return (joined || "x").slice(0, 28);
}

function csv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
