import Link from "next/link";
import Image from "next/image";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uploadInspirations, finalizeBrief } from "./actions";
import { triggerGeneration, deleteGeneration } from "./generate-actions";
import ChatPanel from "./chat-panel";
import DeleteInspirationButton from "./delete-inspiration-button";
import ReanalyzeInspirationButton from "./reanalyze-inspiration-button";
import SubmitButton from "./submit-button";
import ImageActionsPanel from "./image-actions-panel";
import SelectCheckbox from "./select-checkbox";
import SelectionBar from "./selection-bar";
import GenerationForm from "./generation-form";
import BrandPicker, { type BrandOption } from "./brand-picker";
import RegionPicker from "./region-picker";
import { safeDecode } from "@/lib/safe-decode";
import { formatGenError } from "@/lib/format-error";
import { setGenerationSelection } from "./selection-actions";
import { IMAGE_MODELS } from "@/lib/fal";
import type { Brief, RenderStyle } from "@/lib/brief-schema";
import { RENDER_STYLE_LABELS } from "@/lib/brief-schema";

const RENDER_STYLE_BADGE_CLASS: Record<RenderStyle, string> = {
  cinematic: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  ugc: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  screenshot_social: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  editorial: "bg-stone-500/20 text-stone-200 border-stone-500/40",
  comparison_split: "bg-teal-500/20 text-teal-300 border-teal-500/40",
  data_viz: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  meme: "bg-pink-500/20 text-pink-300 border-pink-500/40",
};

function RenderStyleBadge({ style }: { style?: RenderStyle }) {
  const s: RenderStyle = style ?? "cinematic";
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${RENDER_STYLE_BADGE_CLASS[s]}`}
      title={`Style de rendu : ${RENDER_STYLE_LABELS[s]}`}
    >
      {RENDER_STYLE_LABELS[s]}
    </span>
  );
}

/**
 * Renders a one-line distribution of render_style values across the brief's
 * concepts ("2 Cinematic, 1 UGC, 1 Editorial"). Warns the user if the brief
 * is heavily skewed (3+ concepts in the same style) since that hurts diversity
 * on Meta and is exactly what the per-style refactor is meant to prevent.
 */
function ConceptStyleMix({
  concepts,
}: {
  concepts: { render_style?: RenderStyle }[];
}) {
  if (concepts.length === 0) return null;
  const counts = new Map<RenderStyle, number>();
  for (const c of concepts) {
    const s: RenderStyle = c.render_style ?? "cinematic";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;
  const skewed = max >= 3 && entries.length === 1; // all in one style
  const noisy = max >= Math.ceil(concepts.length * 0.7) && entries.length <= 2;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="text-[var(--color-muted-foreground)]">Mix :</span>
      {entries.map(([s, n]) => (
        <span
          key={s}
          className={`rounded-md border px-1.5 py-0.5 font-medium ${RENDER_STYLE_BADGE_CLASS[s]}`}
        >
          {n}× {RENDER_STYLE_LABELS[s]}
        </span>
      ))}
      {(skewed || noisy) && (
        <span
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-300"
          title="Ton brief manque de diversité — re-finalise pour obtenir un mix de styles plus variés (UGC, screenshot, éditorial…) en plus du cinematic. La diversité performe mieux sur Meta."
        >
          ⚠ peu de diversité
        </span>
      )}
    </div>
  );
}

const MODE_LABELS: Record<string, string> = {
  upload: "Upload inspirations",
  chat: "Chat avec l'IA",
  hybrid: "Hybride",
};

export default async function BriefWorkspace({
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
    .select(
      "id, project_id, title, mode, status, user_input, brief_data, brand_id, brand_id_at_finalize, region, updated_at"
    )
    .eq("id", bid)
    .maybeSingle();
  if (!brief || brief.project_id !== id) notFound();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .single();

  // Fetch all of the user's brands + their default logo (for the picker dropdown)
  const { data: brandRows } = await supabase
    .from("brands")
    .select("id, name, description, primary_colors")
    .order("updated_at", { ascending: false });

  const brandIds = (brandRows ?? []).map((b) => b.id);
  let defaultLogos: { brand_id: string; storage_path: string; mime_type: string | null }[] = [];
  if (brandIds.length > 0) {
    const { data: logos } = await supabase
      .from("brand_logos")
      .select("brand_id, storage_path, mime_type")
      .in("brand_id", brandIds)
      .eq("is_default", true);
    defaultLogos = logos ?? [];
  }
  const logoByBrand = new Map(defaultLogos.map((l) => [l.brand_id, l]));

  const brandOptions: BrandOption[] = await Promise.all(
    (brandRows ?? []).map(async (b) => {
      const logo = logoByBrand.get(b.id);
      let signed: string | null = null;
      let isSvg = false;
      if (logo) {
        const { data } = await supabase.storage
          .from("brand_resources")
          .createSignedUrl(logo.storage_path, 60 * 60);
        signed = data?.signedUrl ?? null;
        isSvg = logo.mime_type === "image/svg+xml";
      }
      return {
        id: b.id,
        name: b.name,
        description: b.description,
        primary_colors: (b.primary_colors as string[] | null) ?? [],
        defaultLogoSignedUrl: signed,
        defaultLogoIsSvg: isSvg,
      };
    })
  );

  const showInspirations = brief.mode === "upload" || brief.mode === "hybrid";
  const showChat = brief.mode === "chat" || brief.mode === "hybrid";

  const [messagesRes, inspirationsRes] = await Promise.all([
    showChat
      ? supabase
          .from("brief_messages")
          .select("id, role, content, attachments, created_at")
          .eq("brief_id", bid)
          .order("created_at", { ascending: true })
      : Promise.resolve({
          data: [] as {
            id: string;
            role: string;
            content: string;
            attachments: unknown;
            created_at: string;
          }[],
        }),
    showInspirations
      ? supabase
          .from("brief_inspirations")
          .select("id, storage_path, analysis, created_at")
          .eq("brief_id", bid)
          .order("created_at", { ascending: true })
      : Promise.resolve({
          data: [] as {
            id: string;
            storage_path: string;
            analysis: unknown;
            created_at: string;
          }[],
        }),
  ]);

  // Resolve message attachments to signed URLs so the chat panel can render
  // thumbnails. The DB stores { inspiration_id, storage_path, mime_type }[] ;
  // we add `signed_url` for the client-side <img>.
  type RawMessageAttachment = {
    inspiration_id: string;
    storage_path: string;
    mime_type: string;
  };
  const rawMessages = messagesRes.data ?? [];

  // PERF : batch-sign every `inspirations` bucket path used by BOTH the chat
  // attachments and the inspirations list in a single request.
  const inspBucketPaths = new Set<string>();
  for (const m of rawMessages) {
    const raw = (m.attachments ?? null) as RawMessageAttachment[] | null;
    if (Array.isArray(raw))
      raw.forEach((a) => a.storage_path && inspBucketPaths.add(a.storage_path));
  }
  for (const i of inspirationsRes.data ?? []) {
    if (i.storage_path) inspBucketPaths.add(i.storage_path);
  }
  const inspSignedMap = new Map<string, string>();
  if (inspBucketPaths.size > 0) {
    const { data: signedList } = await supabase.storage
      .from("inspirations")
      .createSignedUrls(Array.from(inspBucketPaths), 60 * 60);
    for (const s of signedList ?? []) {
      if (s.path && s.signedUrl) inspSignedMap.set(s.path, s.signedUrl);
    }
  }

  const messages = rawMessages.map((m) => {
    const raw = (m.attachments ?? null) as RawMessageAttachment[] | null;
    const attachments = Array.isArray(raw)
      ? raw.map((a) => ({
          inspiration_id: a.inspiration_id,
          signed_url: inspSignedMap.get(a.storage_path) ?? null,
          mime_type: a.mime_type,
        }))
      : [];
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      attachments,
      created_at: m.created_at,
    };
  });

  const inspirations: {
    id: string;
    signedUrl: string | null;
    analysis: string | null;
  }[] = (inspirationsRes.data ?? []).map((i) => {
    const a = i.analysis as { description?: string } | null;
    return {
      id: i.id,
      signedUrl: inspSignedMap.get(i.storage_path) ?? null,
      analysis: a?.description ?? null,
    };
  });

  const briefDataRaw = brief.brief_data as Partial<Brief> | null;
  // Detect old-schema briefs (had copy.headline, visual_prompt, no angles[])
  const isNewSchema =
    !!briefDataRaw &&
    Array.isArray((briefDataRaw as { angles?: unknown }).angles) &&
    Array.isArray((briefDataRaw as { concepts?: unknown }).concepts);
  const briefData = isNewSchema ? (briefDataRaw as Brief) : null;
  const uploadAction = uploadInspirations.bind(null, bid);
  const finalizeAction = finalizeBrief.bind(null, bid);
  const generateAction = triggerGeneration.bind(null, bid);

  const { data: generationsRaw } = await supabase
    .from("generations")
    .select(
      "id, status, image_prompt, copy_headline, copy_body, copy_cta, created_at, generated_images(id, model_id, model_label, image_url, storage_path, status, error_message, params, selected, parent_image_id, created_at)"
    )
    .eq("brief_id", bid)
    .order("created_at", { ascending: false });

  type ImgParams = {
    mode?: "full" | "composite";
    angle_name?: string;
    concept_name?: string;
  };

  // PERF : sign ALL generated-image paths in a SINGLE batch request instead
  // of N×2 sequential round-trips. The download URL is derived from the inline
  // signed URL by appending `&download=<name>` (the token signs path+expiry,
  // not the download param) — so zero extra network calls.
  const allImgPaths = (generationsRaw ?? [])
    .flatMap((g) => g.generated_images)
    .map((img) => img.storage_path)
    .filter((p): p is string => Boolean(p));

  const signedMap = new Map<string, string>();
  if (allImgPaths.length > 0) {
    // De-dupe paths to keep the batch minimal
    const uniquePaths = Array.from(new Set(allImgPaths));
    const { data: signedList } = await supabase.storage
      .from("generated")
      .createSignedUrls(uniquePaths, 60 * 60);
    for (const s of signedList ?? []) {
      if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
    }
  }

  const generations: GenerationWithSignedUrls[] = (generationsRaw ?? []).map(
    (g) => ({
      ...g,
      generated_images: g.generated_images.map((img) => {
        const signedUrl = img.storage_path
          ? signedMap.get(img.storage_path) ?? null
          : null;
        let downloadUrl: string | null = null;
        if (signedUrl && img.storage_path) {
          const safe = (img.model_label ?? "image")
            .replace(/[^a-zA-Z0-9·\-:\s]/g, "")
            .replace(/\s+/g, "_")
            .slice(0, 100);
          const ext = img.storage_path.toLowerCase().endsWith(".png")
            ? ".png"
            : ".jpg";
          downloadUrl = `${signedUrl}&download=${encodeURIComponent(`${safe}${ext}`)}`;
        }
        return {
          ...img,
          signed_url: signedUrl,
          download_url: downloadUrl,
          params: img.params as ImgParams | null,
        };
      }),
    })
  );

  // Selection counters — only count 1:1 masters (parent_image_id is null).
  // Variants (9:16) are derived from a master and don't appear in the main grid.
  const masterImages = generations.flatMap((g) =>
    g.generated_images.filter((img) => img.parent_image_id === null)
  );
  const selectedCount = masterImages.filter((img) => img.selected).length;
  const totalMasterCount = masterImages.length;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <SelectionBar
        briefId={bid}
        projectId={id}
        selectedCount={selectedCount}
        totalCount={totalMasterCount}
      />
      <Link
        href={`/projects/${id}/briefs`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← {project?.name} / Briefs
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {brief.title || "Brief sans titre"}
          </h1>
          <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {MODE_LABELS[brief.mode]} • Statut :{" "}
            <span className="text-[var(--color-foreground)]">
              {brief.status}
            </span>
          </div>
        </div>
        <form action={finalizeAction}>
          <SubmitButton pendingLabel="Finalisation… (15-25 s)">
            {briefData ? "Re-finaliser le brief" : "Finaliser le brief"}
          </SubmitButton>
        </form>
      </div>

      {/* Brand association — affects finalization + image generation */}
      <BrandPicker
        briefId={bid}
        brands={brandOptions}
        currentBrandId={brief.brand_id ?? null}
      />

      {/* Geographic targeting — France region or international (default) */}
      <RegionPicker
        briefId={bid}
        currentRegion={(brief as { region?: string | null }).region ?? null}
      />

      {/* Brand sync banner : the brand changed AFTER the last finalize, so
          the angles + concepts + theme colors don't reflect the current brand.
          Image generation still respects the brand (via runtime override of
          theme + brand block at top of prompt) but for FULL alignment the
          user should re-finalize. */}
      {brief.brand_id &&
        briefData &&
        brief.brand_id !== brief.brand_id_at_finalize && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <span>
              ℹ <b>Marque changée depuis la dernière finalisation</b> — la DA
              est appliquée automatiquement aux nouvelles images générées
              (couleurs, typo, voice). Pour que les <b>angles</b> et{" "}
              <b>concepts</b> du brief structuré soient retravaillés à la voix
              de la marque, clique sur <b>Re-finaliser le brief</b> en haut.
            </span>
          </div>
        )}

      {brief.user_input && (
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-sm text-[var(--color-muted-foreground)]">
          <span className="text-xs uppercase tracking-wider">Brief initial</span>
          <p className="mt-1 text-[var(--color-foreground)]">{brief.user_input}</p>
        </div>
      )}

      {sp.error && (
        <div className="mt-6 flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span className="flex-1">{safeDecode(sp.error)}</span>
          <Link
            href={`/projects/${id}/briefs/${bid}`}
            className="shrink-0 rounded border border-red-500/40 px-2 py-0.5 text-xs hover:bg-red-500/20"
          >
            Fermer
          </Link>
        </div>
      )}

      {briefDataRaw && !isNewSchema && (
        <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          <b>Schema obsolète</b> — ce brief a été finalisé avant la mise à jour
          (angles[] + concepts[]). Clique sur <b>Re-finaliser le brief</b> en
          haut pour produire la nouvelle structure.
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {showInspirations && (
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <h2 className="text-base font-semibold">Inspirations</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Upload des créa concurrentes / références. Chaque image est analysée
              par l&apos;IA pour en extraire la DA.
            </p>

            <form action={uploadAction} className="mt-4 flex flex-col gap-3">
              <input
                type="file"
                name="files"
                accept="image/*"
                multiple
                required
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--color-primary-foreground)] hover:file:opacity-90"
              />
              <div className="flex justify-end">
                <SubmitButton
                  pendingLabel="Analyse vision… (10-20 s)"
                  className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  Uploader & analyser
                </SubmitButton>
              </div>
            </form>

            <div className="mt-4 flex flex-col gap-3">
              {inspirations.length === 0 && (
                <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted-foreground)]">
                  Aucune inspiration
                </div>
              )}
              {inspirations.map((i) => (
                <details
                  key={i.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3"
                >
                  <summary className="flex cursor-pointer items-center gap-3 list-none">
                    {i.signedUrl && (
                      <Image
                        src={i.signedUrl}
                        alt="inspiration"
                        width={80}
                        height={80}
                        className="h-20 w-20 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="text-[var(--color-foreground)]">
                        {i.analysis ? "Analyse disponible" : "Analyse vide"}
                      </div>
                      <div className="mt-1 text-[var(--color-muted-foreground)]">
                        Cliquer pour voir
                      </div>
                    </div>
                    {!i.analysis && (
                      <ReanalyzeInspirationButton
                        briefId={bid}
                        inspirationId={i.id}
                      />
                    )}
                    <DeleteInspirationButton briefId={bid} inspirationId={i.id} />
                  </summary>
                  {i.analysis && (
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-muted-foreground)]">
                      {i.analysis}
                    </pre>
                  )}
                </details>
              ))}
            </div>
          </section>
        )}

        {showChat && (
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <h2 className="text-base font-semibold">Chat avec l&apos;agent</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              L&apos;agent connaît ton produit et te guide pour préparer un brief solide.
            </p>
            <ChatPanel briefId={bid} initialMessages={messages} />
          </section>
        )}
      </div>

      {/* Brief structuré : produit_summary + angles + concepts */}
      {briefData && (
        <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <h2 className="text-lg font-semibold">Brief structuré</h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {briefData.product_summary}
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Angles */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Angles marketing — {briefData.angles.length}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {briefData.angles.map((a, i) => (
                  <details
                    key={i}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs text-[var(--color-primary)]">
                          A{i + 1}
                        </span>
                        <span className="font-semibold">{a.name}</span>
                      </div>
                      <div className="mt-1 text-sm">{a.headline}</div>
                    </summary>
                    <div className="mt-3 space-y-1.5 text-xs text-[var(--color-muted-foreground)]">
                      <div>
                        <b className="text-[var(--color-foreground)]">Pourquoi :</b>{" "}
                        {a.rationale}
                      </div>
                      {a.body && (
                        <div>
                          <b className="text-[var(--color-foreground)]">Body :</b>{" "}
                          {a.body}
                        </div>
                      )}
                      {a.cta && (
                        <div>
                          <b className="text-[var(--color-foreground)]">CTA :</b>{" "}
                          {a.cta}
                        </div>
                      )}
                      {a.emphasis_words && a.emphasis_words.length > 0 && (
                        <div>
                          <b className="text-[var(--color-foreground)]">Emphase :</b>{" "}
                          {a.emphasis_words.join(", ")}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {/* Concepts */}
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Concepts visuels — {briefData.concepts.length}
                </div>
              </div>
              <ConceptStyleMix concepts={briefData.concepts} />
              <div className="mt-3 flex flex-col gap-2">
                {briefData.concepts.map((c, i) => (
                  <details
                    key={i}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          C{i + 1}
                        </span>
                        <span className="font-semibold">{c.name}</span>
                        <RenderStyleBadge style={c.render_style} />
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-muted-foreground)] line-clamp-2">
                        {c.rationale}
                      </div>
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-muted-foreground)]">
                      {c.description}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          </div>

          {/* Theme + layout */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4 text-xs">
            <span className="text-[var(--color-muted-foreground)]">Layout :</span>
            <span className="rounded-md bg-[var(--color-background)] px-2 py-1">
              {briefData.text_overlay.layout}
            </span>
            <ColorChip label="texte" color={briefData.text_overlay.theme.text_color} />
            <ColorChip label="accent" color={briefData.text_overlay.theme.accent_color} />
            <span className="text-[var(--color-muted-foreground)]">
              scrim : {briefData.text_overlay.theme.scrim}
            </span>
          </div>
        </section>
      )}

      {/* Step 3 — image generation (Phase 1 : 1:1 only) */}
      {briefData && (
        <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              Phase 1 — Batch initial 1:1
            </h2>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              Carrés bruts uniquement
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-xs text-[var(--color-muted-foreground)]">
            On génère d&apos;abord toutes les pistes en <b>1:1</b>. Tu cocheras
            ensuite tes préférées (Phase 2) pour les corriger, leur ajouter les
            mentions légales et générer la version 9:16 (Phase 3).
          </p>

          <GenerationForm
            briefId={bid}
            briefData={briefData}
            models={IMAGE_MODELS.map((m) => ({
              id: m.id,
              label: m.label,
              description: m.description,
              prefersFullPrompt: m.prefersFullPrompt,
            }))}
            action={generateAction}
          />

          <div className="mt-8 flex flex-col gap-6">
            {(!generations || generations.length === 0) && (
              <div className="rounded-md border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
                Aucune génération pour ce brief
              </div>
            )}
            {generations?.map((g) => (
              <GenerationCard
                key={g.id}
                generation={g}
                briefId={bid}
                projectId={id}
                briefAngles={briefData?.angles}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function ColorChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs">
      <span
        className="h-3 w-3 rounded-full border border-[var(--color-border)]"
        style={{ background: color }}
      />
      {label} {color}
    </span>
  );
}

type GenerationWithSignedUrls = {
  id: string;
  status: string;
  image_prompt: string;
  copy_headline: string | null;
  copy_body: string | null;
  copy_cta: string | null;
  created_at: string;
  generated_images: {
    id: string;
    model_id: string;
    model_label: string | null;
    image_url: string | null;
    storage_path: string | null;
    signed_url: string | null;
    download_url: string | null;
    status: string;
    error_message: string | null;
    selected: boolean;
    parent_image_id: string | null;
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
      render_style?: RenderStyle;
      format?: string;
      slide?: number;
      carousel?: boolean;
      carousel_role?: "hook" | "insight" | "application";
      carousel_headline?: string;
      carousel_body?: string;
      carousel_cta?: string;
    } | null;
  }[];
};

function GenerationCard({
  generation,
  briefId,
  projectId,
  briefAngles,
}: {
  generation: GenerationWithSignedUrls;
  briefId: string;
  projectId: string;
  briefAngles?: Brief["angles"];
}) {
  const deleteAction = deleteGeneration.bind(null, briefId, generation.id);

  // Only the 1:1 masters appear in the main grid. Variants (9:16) are
  // fetched separately by their own UI component once Phase 3 is wired.
  const masters = generation.generated_images.filter(
    (img) => img.parent_image_id === null
  );
  const masterDone = masters.filter((m) => m.status === "done");
  const selectedHere = masters.filter((m) => m.selected).length;
  const allSelected =
    masterDone.length > 0 && selectedHere === masterDone.length;

  const selectAllAction = setGenerationSelection.bind(
    null,
    briefId,
    projectId,
    generation.id,
    !allSelected
  );

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {new Date(generation.created_at).toLocaleString("fr-FR")} •{" "}
            {generation.status} • {masters.length} ad
            {masters.length > 1 ? "s" : ""}
            {selectedHere > 0 && (
              <span className="ml-2 rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[var(--color-primary)]">
                {selectedHere} sélectionnée{selectedHere > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {masterDone.length > 0 && (
            <form action={selectAllAction}>
              <button
                type="submit"
                className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
              >
                {allSelected ? "Aucune" : "Tout sélectionner"}
              </button>
            </form>
          )}
          <form action={deleteAction}>
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
            >
              Supprimer
            </button>
          </form>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {masters.map((img) => {
          // Carousel slides have their OWN copy stored in params (Hook /
          // Insight / Application narratives). Static ads now also store
          // their angle copy directly in params (works for brief and custom
          // angles alike). The edit form pre-fills with that copy.
          const p = img.params;
          const angleIdx = p?.angle_idx;
          const angleFromBrief =
            typeof angleIdx === "number" && briefAngles
              ? briefAngles[angleIdx]
              : null;
          const headline =
            p?.carousel_headline ??
            p?.angle_headline ??
            angleFromBrief?.headline ??
            generation.copy_headline ??
            "";
          const body =
            p?.carousel_body ??
            p?.angle_body ??
            angleFromBrief?.body ??
            generation.copy_body ??
            "";
          const cta =
            p?.carousel_cta ??
            p?.angle_cta ??
            angleFromBrief?.cta ??
            generation.copy_cta ??
            "";
          return (
            <ImageCell
              key={img.id}
              briefId={briefId}
              img={img}
              defaultHeadline={headline}
              defaultBody={body}
              defaultCta={cta}
            />
          );
        })}
      </div>
    </div>
  );
}

function ImageCell({
  briefId,
  img,
  defaultHeadline,
  defaultBody,
  defaultCta,
}: {
  briefId: string;
  img: {
    id: string;
    model_label: string | null;
    image_url: string | null;
    storage_path: string | null;
    signed_url: string | null;
    download_url: string | null;
    status: string;
    error_message: string | null;
    selected: boolean;
    parent_image_id: string | null;
    params: {
      mode?: "full" | "composite";
      angle_name?: string;
      concept_name?: string;
      render_style?: RenderStyle;
      format?: string;
      slide?: number;
      carousel?: boolean;
      carousel_role?: "hook" | "insight" | "application";
    } | null;
  };
  defaultHeadline: string;
  defaultBody: string;
  defaultCta: string;
}) {
  const displayUrl = img.signed_url ?? img.image_url;
  const downloadUrl = img.download_url;
  const angle = img.params?.angle_name;
  const concept = img.params?.concept_name;
  const renderStyle = img.params?.render_style;
  const isVertical = img.params?.format === "9:16";
  const isCarousel = img.params?.carousel === true;
  const slide = img.params?.slide;
  const role = img.params?.carousel_role;
  const roleLabel =
    role === "hook"
      ? "HOOK"
      : role === "insight"
      ? "INSIGHT"
      : role === "application"
      ? "APPLI"
      : null;
  const roleClass =
    role === "hook"
      ? "bg-rose-500/15 text-rose-300"
      : role === "insight"
      ? "bg-cyan-500/15 text-cyan-300"
      : role === "application"
      ? "bg-emerald-500/15 text-emerald-300"
      : "";
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border-2 bg-[var(--color-card)] transition ${
        img.selected
          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
          : "border-[var(--color-border)]"
      }`}
    >
      <div
        className={`relative w-full bg-[var(--color-background)] ${
          isVertical ? "aspect-[9/16]" : "aspect-square"
        }`}
      >
        {img.status === "done" && (
          <SelectCheckbox
            briefId={briefId}
            imageId={img.id}
            initial={img.selected}
          />
        )}
        {img.status === "done" && displayUrl ? (
          <Image
            src={displayUrl}
            alt={img.model_label ?? "generated"}
            width={1024}
            height={isVertical ? 1820 : 1024}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : img.status === "failed" ? (
          <div
            className="flex h-full items-center justify-center p-3 text-center text-xs text-red-400"
            title={img.error_message ?? "Échec"}
          >
            {formatGenError(img.error_message)}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-muted-foreground)]">
            Génération…
          </div>
        )}
      </div>
      <div className="border-t border-[var(--color-border)] p-2 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          {isCarousel && slide && roleLabel && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${roleClass}`}
              title={`Slide ${slide}/3 du carrousel`}
            >
              {slide}/3 · {roleLabel}
            </span>
          )}
          {renderStyle && <RenderStyleBadge style={renderStyle} />}
          {angle && (
            <span className="rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
              {angle}
            </span>
          )}
          {concept && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
              {concept}
            </span>
          )}
          {isVertical && (
            <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-purple-300">
              9:16
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[10px] text-[var(--color-muted-foreground)]">
          {img.model_label}
        </div>
        {img.status === "done" && displayUrl && (
          <div className="flex gap-3">
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              Ouvrir →
            </a>
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
              >
                ↓ Télécharger
              </a>
            )}
          </div>
        )}
      </div>
      {img.status === "done" && (
        <ImageActionsPanel
          imageId={img.id}
          defaultHeadline={defaultHeadline}
          defaultBody={defaultBody}
          defaultCta={defaultCta}
        />
      )}
    </div>
  );
}
