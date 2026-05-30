import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RefineToolbar from "./refine-toolbar";
import RefineCard from "./refine-card";
import type { Brief } from "@/lib/brief-schema";
import { safeDecode } from "@/lib/safe-decode";

export default async function RefineWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; bid: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, bid } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, project_id, title, brief_data, brand_id")
    .eq("id", bid)
    .maybeSingle();
  if (!brief || brief.project_id !== id) notFound();

  const briefData = brief.brief_data as Brief | null;

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .single();

  // 1) Fetch all generations of this brief
  const { data: gens } = await supabase
    .from("generations")
    .select("id, copy_headline, copy_body, copy_cta, created_at")
    .eq("brief_id", bid);

  const genIds = (gens ?? []).map((g) => g.id);
  const genById = new Map((gens ?? []).map((g) => [g.id, g]));

  // 2) Fetch only selected masters (parent_image_id IS NULL, selected = true)
  let masters: {
    id: string;
    generation_id: string;
    model_id: string;
    model_label: string | null;
    storage_path: string | null;
    image_url: string | null;
    status: string;
    error_message: string | null;
    selected: boolean;
    parent_image_id: string | null;
    created_at: string;
    params: {
      mode?: "full" | "composite";
      angle_origin?: "brief" | "custom";
      angle_idx?: number | null;
      angle_name?: string;
      angle_headline?: string;
      angle_body?: string | null;
      angle_cta?: string | null;
      concept_origin?: "brief" | "preset" | "custom";
      concept_idx?: number | null;
      concept_preset_id?: string | null;
      concept_name?: string;
      format?: string;
      slide?: number;
      carousel?: boolean;
      carousel_role?: "hook" | "insight" | "application";
      carousel_headline?: string;
      carousel_body?: string;
      carousel_cta?: string;
      auto_corrected?: boolean;
      legal_applied?: boolean;
      logo_embedded?: boolean;
    } | null;
  }[] = [];

  if (genIds.length > 0) {
    const { data: imgs } = await supabase
      .from("generated_images")
      .select(
        "id, generation_id, model_id, model_label, storage_path, image_url, status, error_message, selected, parent_image_id, created_at, params"
      )
      .in("generation_id", genIds)
      .is("parent_image_id", null)
      .eq("selected", true)
      .order("created_at", { ascending: false });
    masters = imgs ?? [];
  }

  // 3) Fetch all 9:16 variants for these masters
  const masterIds = masters.map((m) => m.id);
  type Variant = {
    id: string;
    parent_image_id: string;
    storage_path: string | null;
    status: string;
    model_label: string | null;
  };
  let variants: Variant[] = [];
  if (masterIds.length > 0) {
    const { data: vRaw } = await supabase
      .from("generated_images")
      .select("id, parent_image_id, storage_path, status, model_label")
      .in("parent_image_id", masterIds)
      .order("created_at", { ascending: false });
    variants = (vRaw ?? []).filter(
      (v): v is Variant => v.parent_image_id !== null
    );
  }
  const variantsByParent = new Map<string, Variant[]>();
  for (const v of variants) {
    const list = variantsByParent.get(v.parent_image_id) ?? [];
    list.push(v);
    variantsByParent.set(v.parent_image_id, list);
  }

  // 4) Sign URLs for masters + variants
  type Resolved = (typeof masters)[number] & {
    signed_url: string | null;
    download_url: string | null;
    variants: (Variant & {
      signed_url: string | null;
      download_url: string | null;
    })[];
  };
  // PERF : one batch sign for every master + variant path, then derive the
  // download URL by appending `&download=<name>` (no second sign call).
  const allRefinePaths = new Set<string>();
  for (const m of masters) {
    if (m.storage_path) allRefinePaths.add(m.storage_path);
    for (const v of variantsByParent.get(m.id) ?? []) {
      if (v.storage_path) allRefinePaths.add(v.storage_path);
    }
  }
  const refineSignedMap = new Map<string, string>();
  if (allRefinePaths.size > 0) {
    const { data: signedList } = await supabase.storage
      .from("generated")
      .createSignedUrls(Array.from(allRefinePaths), 60 * 60);
    for (const s of signedList ?? []) {
      if (s.path && s.signedUrl) refineSignedMap.set(s.path, s.signedUrl);
    }
  }
  const safeFileName = (label: string | null, suffix: string, path: string) =>
    `${(label ?? "ad").replace(/[^a-zA-Z0-9·\-:\s]/g, "").replace(/\s+/g, "_").slice(0, 80)}_${suffix}.${path.toLowerCase().endsWith(".png") ? "png" : "jpg"}`;

  const resolved: Resolved[] = masters.map((m) => {
    const signedUrl = m.storage_path
      ? refineSignedMap.get(m.storage_path) ?? null
      : null;
    const downloadUrl =
      signedUrl && m.storage_path
        ? `${signedUrl}&download=${encodeURIComponent(safeFileName(m.model_label, "1x1", m.storage_path))}`
        : null;
    const resolvedVariants = (variantsByParent.get(m.id) ?? []).map((v) => {
      const su = v.storage_path
        ? refineSignedMap.get(v.storage_path) ?? null
        : null;
      const du =
        su && v.storage_path
          ? `${su}&download=${encodeURIComponent(safeFileName(v.model_label, "9x16", v.storage_path))}`
          : null;
      return { ...v, signed_url: su, download_url: du };
    });
    return {
      ...m,
      signed_url: signedUrl,
      download_url: downloadUrl,
      variants: resolvedVariants,
    };
  });

  const masterCount = resolved.length;
  const corrected = resolved.filter((r) => r.params?.auto_corrected).length;
  const legaled = resolved.filter((r) => r.params?.legal_applied).length;
  const logoed = resolved.filter((r) => r.params?.logo_embedded).length;
  const with916 = resolved.filter((r) => r.variants.length > 0).length;
  const hasBrand = !!brief.brand_id;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <Link
        href={`/projects/${id}/briefs/${bid}`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← {project?.name} / {brief.title || "Brief"} / Phase 1+2
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Phase 3 — Raffinement</h1>
          <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {masterCount} ad{masterCount > 1 ? "s" : ""} sélectionnée
            {masterCount > 1 ? "s" : ""} •{" "}
            <span className="text-[var(--color-foreground)]">
              {corrected}/{masterCount} corrigées
            </span>{" "}
            •{" "}
            <span className="text-[var(--color-foreground)]">
              {legaled}/{masterCount} légales
            </span>{" "}
            •{" "}
            <span className="text-[var(--color-foreground)]">
              {logoed}/{masterCount} logo{logoed > 1 ? "s" : ""}
            </span>{" "}
            •{" "}
            <span className="text-[var(--color-foreground)]">
              {with916}/{masterCount} en 9:16
            </span>
          </div>
        </div>
      </div>

      {sp.error && (
        <div className="mt-6 flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span className="flex-1">{safeDecode(sp.error)}</span>
          <Link
            href={`/projects/${id}/briefs/${bid}/refine`}
            className="shrink-0 rounded border border-red-500/40 px-2 py-0.5 text-xs hover:bg-red-500/20"
          >
            Fermer
          </Link>
        </div>
      )}

      {masterCount === 0 ? (
        <div className="mt-10 rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <div className="text-sm text-[var(--color-muted-foreground)]">
            Aucune image sélectionnée pour le raffinement.
          </div>
          <Link
            href={`/projects/${id}/briefs/${bid}`}
            className="mt-4 inline-block rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            ← Retour à la sélection
          </Link>
        </div>
      ) : (
        <>
          <RefineToolbar
            briefId={bid}
            projectId={id}
            masterCount={masterCount}
            corrected={corrected}
            legaled={legaled}
            with916={with916}
            logoed={logoed}
            hasBrand={hasBrand}
          />

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {resolved.map((m) => {
              const gen = genById.get(m.generation_id);
              const p = m.params;
              const angleIdx = p?.angle_idx;
              const angleFromBrief =
                typeof angleIdx === "number" && briefData?.angles
                  ? briefData.angles[angleIdx]
                  : null;
              // Priority order : carousel slide copy → params angle copy
              // (works for brief AND custom angles) → brief lookup (legacy)
              // → parent generation's copy_* (last resort)
              const headline =
                p?.carousel_headline ??
                p?.angle_headline ??
                angleFromBrief?.headline ??
                gen?.copy_headline ??
                "";
              const body =
                p?.carousel_body ??
                p?.angle_body ??
                angleFromBrief?.body ??
                gen?.copy_body ??
                "";
              const cta =
                p?.carousel_cta ??
                p?.angle_cta ??
                angleFromBrief?.cta ??
                gen?.copy_cta ??
                "";
              return (
                <RefineCard
                  key={m.id}
                  briefId={bid}
                  master={m}
                  defaultHeadline={headline}
                  defaultBody={body}
                  defaultCta={cta}
                />
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

