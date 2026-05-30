"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runModel, IMAGE_MODELS, getModel } from "@/lib/fal";
import { compositeAd, pickCreativeLayout } from "@/lib/composite-ad";
import {
  buildImagePrompt,
  buildCarouselSlidePrompt,
  type CarouselSlide,
} from "@/lib/build-image-prompt";
import {
  generateCarouselCopy,
  type CarouselSlideCopy,
} from "@/lib/carousel-copy";
import {
  PRESET_CONCEPTS,
  buildCustomAngle,
  buildCustomConcept,
  buildPresetConcept,
  type CustomAngleInput,
  type CustomConceptInput,
  type PresetSelectionInput,
} from "@/lib/preset-concepts";
import { loadBrandContextForBrief } from "@/lib/brand-context";
import type { Angle, Brief, Concept, RenderStyle } from "@/lib/brief-schema";

type CreativeType = "static" | "carousel";
type AngleOrigin = "brief" | "custom";
type ConceptOrigin = "brief" | "preset" | "custom";

/**
 * One copy slot the user selected for the matrix. The form's hidden
 * `selected_copies_json` is a list of these — each becomes one creative slot.
 *
 *   angle_key : "brief_<idx>" or "custom_<idx>"
 *   copy_key  : "base" (the angle's original copy) or a variant.id
 */
type SelectedCopy = {
  angle_key: string;
  copy_key: string;
};

/**
 * One concept slot the user selected for the matrix (parallel to SelectedCopy
 * but for the visual axis). Each becomes one entry in effectiveConcepts.
 *
 *   concept_key : "brief_<idx>" / "preset_<presetId>" / "custom_<idx>"
 *   variant_key : "base" or a concept_variant.id
 */
type SelectedConcept = {
  concept_key: string;
  variant_key: string;
};

const SLIDE_LABEL: Record<number, string> = {
  1: "Slide 1/3 — Hook",
  2: "Slide 2/3 — Insight",
  3: "Slide 3/3 — Application",
};

function safeJsonArray<T>(raw: unknown): T[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * PHASE 1 — Generate the initial 1:1 batch.
 * No 9:16, no auto-correct, no legal mentions. Those are Phase 3 actions
 * applied per-image (or in bulk on selected images) AFTER the user has picked
 * their winners from this batch.
 */
export async function triggerGeneration(briefId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, project_id, user_id, brief_data, brand_id, region")
    .eq("id", briefId)
    .maybeSingle();
  if (!brief) throw new Error("Brief introuvable");
  const briefData = brief.brief_data as Brief | null;
  if (!briefData) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        "Finalise le brief avant de générer"
      )}`
    );
  }

  // Brand context (optional) — injected into image prompts to enforce DA
  const brandContext = await loadBrandContextForBrief(supabase, briefId);
  // Region targeting (default 'international') — injected into image prompts
  const region = (brief.region as string | null) ?? "international";

  const selectedModels = formData
    .getAll("models")
    .map((v) => String(v))
    .filter((id) => IMAGE_MODELS.some((m) => m.id === id));

  const conceptIndices = formData
    .getAll("concepts")
    .map((v) => parseInt(String(v), 10))
    .filter(
      (n) => Number.isInteger(n) && n >= 0 && n < briefData.concepts.length
    );

  // Presets + customs — merged into the effective lists
  const presetSelections = safeJsonArray<PresetSelectionInput>(
    formData.get("preset_concepts_json")
  ).filter(
    (s) =>
      s &&
      typeof s.id === "string" &&
      Object.prototype.hasOwnProperty.call(PRESET_CONCEPTS, s.id)
  );

  const customAngleInputs = safeJsonArray<CustomAngleInput>(
    formData.get("custom_angles_json")
  ).filter((c) => c.headline?.trim().length > 0);
  const customConceptInputs = safeJsonArray<CustomConceptInput>(
    formData.get("custom_concepts_json")
  ).filter((c) => c.description?.trim().length > 0);

  // Brief concept style overrides — user can swap any brief concept's
  // render_style at generation time without re-finalizing the brief.
  const briefOverrideEntries = safeJsonArray<{
    idx: number;
    render_style: RenderStyle;
  }>(formData.get("brief_concept_overrides_json"));
  const briefOverrides = new Map<number, RenderStyle>(
    briefOverrideEntries
      .filter(
        (o) => Number.isInteger(o?.idx) && typeof o?.render_style === "string"
      )
      .map((o) => [o.idx, o.render_style])
  );

  // -------------------------------------------------------------------------
  // SELECTED COPIES — the matrix is built FROM these. Each selected copy =
  // one entry in `effectiveAngles`. So 2 copy variants on the same brief
  // angle ⇒ 2 rows in the matrix (sharing the angle name + rationale but
  // different headline/body/cta). Allows multi-copy A/B per angle.
  //
  // Backward-compat : if the form did not send `selected_copies_json` (e.g.
  // an old client), reconstruct it from the legacy `angles[]` + custom angle
  // inputs, treating each as a single "base" copy slot.
  // -------------------------------------------------------------------------
  const customAngles: Angle[] = customAngleInputs.map(buildCustomAngle);
  const customConcepts: Concept[] = customConceptInputs.map(buildCustomConcept);
  const presetConcepts: Concept[] = presetSelections.map(buildPresetConcept);
  const presetIds = presetSelections.map((s) => s.id);

  let selectedCopies = safeJsonArray<SelectedCopy>(
    formData.get("selected_copies_json")
  ).filter(
    (s) =>
      s &&
      typeof s.angle_key === "string" &&
      typeof s.copy_key === "string"
  );

  if (selectedCopies.length === 0) {
    // Legacy fallback : build from the old `angles` field + custom angles.
    const legacyAngleIndices = formData
      .getAll("angles")
      .map((v) => parseInt(String(v), 10))
      .filter(
        (n) => Number.isInteger(n) && n >= 0 && n < briefData.angles.length
      );
    selectedCopies = [
      ...legacyAngleIndices.map((i) => ({
        angle_key: `brief_${i}`,
        copy_key: "base",
      })),
      ...customAngles.map((_, i) => ({
        angle_key: `custom_${i}`,
        copy_key: "base",
      })),
    ];
  }

  // Resolve each (angle_key, copy_key) into a concrete Angle with its copy
  // applied. We also keep traceability fields for the params snapshot.
  type ResolvedAngle = {
    angle: Angle;
    origin: AngleOrigin;
    briefIdx: number | null;
    copyVariantId: string; // "base" or variant.id
  };
  const resolvedAngles: ResolvedAngle[] = [];
  for (const sel of selectedCopies) {
    const briefMatch = sel.angle_key.match(/^brief_(\d+)$/);
    const customMatch = sel.angle_key.match(/^custom_(\d+)$/);
    if (briefMatch) {
      const idx = parseInt(briefMatch[1], 10);
      if (idx < 0 || idx >= briefData.angles.length) continue;
      const baseAngle = briefData.angles[idx];
      if (sel.copy_key === "base") {
        resolvedAngles.push({
          angle: baseAngle,
          origin: "brief",
          briefIdx: idx,
          copyVariantId: "base",
        });
      } else {
        const variant = baseAngle.copy_variants?.find(
          (v) => v.id === sel.copy_key
        );
        if (!variant) {
          // Variant gone (regenerate replaced it) — silently fall back to base.
          resolvedAngles.push({
            angle: baseAngle,
            origin: "brief",
            briefIdx: idx,
            copyVariantId: "base",
          });
        } else {
          resolvedAngles.push({
            angle: {
              ...baseAngle,
              headline: variant.headline,
              body: variant.body ?? baseAngle.body,
              cta: variant.cta ?? baseAngle.cta,
              emphasis_words:
                variant.emphasis_words ?? baseAngle.emphasis_words,
            },
            origin: "brief",
            briefIdx: idx,
            copyVariantId: variant.id,
          });
        }
      }
    } else if (customMatch) {
      const idx = parseInt(customMatch[1], 10);
      if (idx < 0 || idx >= customAngles.length) continue;
      const baseCustom = customAngles[idx];
      if (sel.copy_key === "base") {
        resolvedAngles.push({
          angle: baseCustom,
          origin: "custom",
          briefIdx: null,
          copyVariantId: "base",
        });
      } else {
        // Custom angles carry their variants in-band via custom_angles_json
        // (no DB persistence — they're ephemeral, attached to the form payload).
        const variant = baseCustom.copy_variants?.find(
          (v) => v.id === sel.copy_key
        );
        if (!variant) {
          // Variant gone — fall back to base
          resolvedAngles.push({
            angle: baseCustom,
            origin: "custom",
            briefIdx: null,
            copyVariantId: "base",
          });
        } else {
          resolvedAngles.push({
            angle: {
              ...baseCustom,
              headline: variant.headline,
              body: variant.body ?? baseCustom.body,
              cta: variant.cta ?? baseCustom.cta,
              emphasis_words:
                variant.emphasis_words ?? baseCustom.emphasis_words,
            },
            origin: "custom",
            briefIdx: null,
            copyVariantId: variant.id,
          });
        }
      }
    }
  }

  const effectiveAngles: Angle[] = resolvedAngles.map((r) => r.angle);

  // -------------------------------------------------------------------------
  // SELECTED CONCEPTS — parallel to selected_copies. Each (concept_key,
  // variant_key) becomes one entry in effectiveConcepts. Same legacy fallback :
  // if missing, reconstruct from `concepts` + presets + customs as base only.
  // -------------------------------------------------------------------------
  let selectedConcepts = safeJsonArray<SelectedConcept>(
    formData.get("selected_concepts_json")
  ).filter(
    (s) =>
      s &&
      typeof s.concept_key === "string" &&
      typeof s.variant_key === "string"
  );

  if (selectedConcepts.length === 0) {
    selectedConcepts = [
      ...conceptIndices.map((i) => ({
        concept_key: `brief_${i}`,
        variant_key: "base",
      })),
      ...presetIds.map((id) => ({
        concept_key: `preset_${id}`,
        variant_key: "base",
      })),
      ...customConcepts.map((_, i) => ({
        concept_key: `custom_${i}`,
        variant_key: "base",
      })),
    ];
  }

  type ResolvedConcept = {
    concept: Concept;
    origin: ConceptOrigin;
    identifier: string; // brief idx string | preset id | "custom_N"
    conceptVariantId: string; // "base" or variant.id
  };
  const resolvedConcepts: ResolvedConcept[] = [];
  for (const sel of selectedConcepts) {
    const briefMatch = sel.concept_key.match(/^brief_(\d+)$/);
    const presetMatch = sel.concept_key.match(/^preset_(.+)$/);
    const customMatch = sel.concept_key.match(/^custom_(\d+)$/);

    if (briefMatch) {
      const idx = parseInt(briefMatch[1], 10);
      if (idx < 0 || idx >= briefData.concepts.length) continue;
      const baseConcept = briefData.concepts[idx];
      const override = briefOverrides.get(idx);
      const baseWithOverride: Concept = override
        ? { ...baseConcept, render_style: override }
        : baseConcept;
      if (sel.variant_key === "base") {
        resolvedConcepts.push({
          concept: baseWithOverride,
          origin: "brief",
          identifier: String(idx),
          conceptVariantId: "base",
        });
      } else {
        const variant = baseConcept.concept_variants?.find(
          (v) => v.id === sel.variant_key
        );
        if (!variant) {
          resolvedConcepts.push({
            concept: baseWithOverride,
            origin: "brief",
            identifier: String(idx),
            conceptVariantId: "base",
          });
        } else {
          resolvedConcepts.push({
            concept: {
              ...baseWithOverride,
              name: variant.name,
              description: variant.description,
              render_style:
                variant.render_style ?? baseWithOverride.render_style,
            },
            origin: "brief",
            identifier: String(idx),
            conceptVariantId: variant.id,
          });
        }
      }
    } else if (presetMatch) {
      const presetId = presetMatch[1];
      const presetIdx = (presetIds as string[]).indexOf(presetId);
      if (presetIdx < 0) continue;
      const baseConcept = presetConcepts[presetIdx];
      if (sel.variant_key === "base") {
        resolvedConcepts.push({
          concept: baseConcept,
          origin: "preset",
          identifier: presetId,
          conceptVariantId: "base",
        });
      } else {
        const variant = baseConcept.concept_variants?.find(
          (v) => v.id === sel.variant_key
        );
        if (!variant) {
          resolvedConcepts.push({
            concept: baseConcept,
            origin: "preset",
            identifier: presetId,
            conceptVariantId: "base",
          });
        } else {
          resolvedConcepts.push({
            concept: {
              ...baseConcept,
              name: variant.name,
              description: variant.description,
              render_style: variant.render_style ?? baseConcept.render_style,
            },
            origin: "preset",
            identifier: presetId,
            conceptVariantId: variant.id,
          });
        }
      }
    } else if (customMatch) {
      const idx = parseInt(customMatch[1], 10);
      if (idx < 0 || idx >= customConcepts.length) continue;
      const baseConcept = customConcepts[idx];
      const ident = `custom_${idx}`;
      if (sel.variant_key === "base") {
        resolvedConcepts.push({
          concept: baseConcept,
          origin: "custom",
          identifier: ident,
          conceptVariantId: "base",
        });
      } else {
        const variant = baseConcept.concept_variants?.find(
          (v) => v.id === sel.variant_key
        );
        if (!variant) {
          resolvedConcepts.push({
            concept: baseConcept,
            origin: "custom",
            identifier: ident,
            conceptVariantId: "base",
          });
        } else {
          resolvedConcepts.push({
            concept: {
              ...baseConcept,
              name: variant.name,
              description: variant.description,
              render_style: variant.render_style ?? baseConcept.render_style,
            },
            origin: "custom",
            identifier: ident,
            conceptVariantId: variant.id,
          });
        }
      }
    }
  }

  const effectiveConcepts: Concept[] = resolvedConcepts.map((r) => r.concept);

  // Origins — same length as the effective lists (used for traceability in params)
  const angleOrigins: AngleOrigin[] = resolvedAngles.map((r) => r.origin);
  const angleBriefIndices: (number | null)[] = resolvedAngles.map(
    (r) => r.briefIdx
  );
  const angleCopyVariantIds: string[] = resolvedAngles.map(
    (r) => r.copyVariantId
  );
  const conceptOrigins: ConceptOrigin[] = resolvedConcepts.map((r) => r.origin);
  const conceptIdentifiers: string[] = resolvedConcepts.map(
    (r) => r.identifier
  );
  const conceptVariantIds: string[] = resolvedConcepts.map(
    (r) => r.conceptVariantId
  );

  const creativeType: CreativeType =
    formData.get("creative_type") === "carousel" ? "carousel" : "static";
  const slideCount =
    creativeType === "carousel"
      ? Math.min(
          Math.max(parseInt(String(formData.get("slides") ?? "3"), 10) || 3, 2),
          5
        )
      : 1;

  // Default ON : the user gets varied layouts unless they explicitly opt out.
  // Sent as "1" / "0" by the form ; treat any non-"0" value as truthy.
  const diversifyLayouts =
    String(formData.get("diversify_layouts") ?? "1") !== "0";

  if (
    selectedModels.length === 0 ||
    effectiveAngles.length === 0 ||
    effectiveConcepts.length === 0
  ) {
    const missing: string[] = [];
    if (effectiveAngles.length === 0) missing.push("angle");
    if (effectiveConcepts.length === 0) missing.push("concept");
    if (selectedModels.length === 0) missing.push("modèle");
    const formatList = (arr: string[]) =>
      arr.length === 1
        ? arr[0]
        : arr.slice(0, -1).join(", ") + " et " + arr[arr.length - 1];
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        `Sélection incomplète : il manque au moins 1 ${formatList(missing)}. ` +
          `(reçu : ${effectiveAngles.length} angle${effectiveAngles.length > 1 ? "s" : ""}, ` +
          `${effectiveConcepts.length} concept${effectiveConcepts.length > 1 ? "s" : ""}, ` +
          `${selectedModels.length} modèle${selectedModels.length > 1 ? "s" : ""})`
      )}`
    );
  }

  const headAngle = effectiveAngles[0];

  const totalImages =
    effectiveAngles.length *
    effectiveConcepts.length *
    selectedModels.length *
    slideCount;

  const { data: gen, error: genErr } = await supabase
    .from("generations")
    .insert({
      brief_id: briefId,
      user_id: user.id,
      copy_headline: headAngle.headline,
      copy_body: headAngle.body ?? null,
      copy_cta: headAngle.cta ?? null,
      image_prompt: `Phase 1 (1:1) — ${effectiveAngles.length}A × ${effectiveConcepts.length}C × ${selectedModels.length}M × ${slideCount}S = ${totalImages} images`,
      status: "running",
    })
    .select("id")
    .single();
  if (genErr || !gen) {
    redirect(
      `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
        genErr?.message ?? "Erreur création generation"
      )}`
    );
  }

  // -------------------------------------------------------------------------
  // CAROUSEL pre-pass — generate value-first 3-slide copy per (angle, concept)
  // -------------------------------------------------------------------------
  // For each (angle, concept) pair we ask Claude ONCE for a 3-slide narrative.
  // The pairs iterate the EFFECTIVE lists so brief / preset / custom all work.
  type CarouselKey = `${number}:${number}`;
  const carouselCopyMap = new Map<CarouselKey, CarouselSlideCopy[]>();
  if (creativeType === "carousel") {
    const pairs: { aIdx: number; cIdx: number }[] = [];
    for (let aIdx = 0; aIdx < effectiveAngles.length; aIdx++) {
      for (let cIdx = 0; cIdx < effectiveConcepts.length; cIdx++) {
        pairs.push({ aIdx, cIdx });
      }
    }
    const results = await Promise.all(
      pairs.map(async ({ aIdx, cIdx }) => {
        const angle = effectiveAngles[aIdx];
        const concept = effectiveConcepts[cIdx];
        try {
          const slides = await generateCarouselCopy({
            productSummary: briefData.product_summary,
            angle,
            concept,
          });
          return { aIdx, cIdx, slides, error: null as string | null };
        } catch (e) {
          return {
            aIdx,
            cIdx,
            slides: null,
            error: (e as Error).message,
          };
        }
      })
    );
    for (const r of results) {
      if (r.slides) {
        carouselCopyMap.set(`${r.aIdx}:${r.cIdx}` as CarouselKey, r.slides);
      }
    }
    if (carouselCopyMap.size === 0) {
      const firstError = results.find((r) => r.error)?.error;
      redirect(
        `/projects/${brief.project_id}/briefs/${briefId}?error=${encodeURIComponent(
          `Carrousel copy: ${firstError ?? "échec génération copy"}`
        )}`
      );
    }
  }

  // Build the task matrix — 1:1 only.
  type Task = {
    rowId: string;
    modelId: string;
    angleIdx: number; // index in effectiveAngles
    conceptIdx: number; // index in effectiveConcepts
    angleOrigin: AngleOrigin;
    conceptOrigin: ConceptOrigin;
    conceptIdentifier: string; // brief idx | preset id | "custom_N"
    slide: number; // 1-based; in static mode always 1
    prompt: string;
    mode: "full" | "composite";
    // Composite-mode layout chosen for THIS task (rotates through the
    // creative palette so adjacent images in the batch get distinct visuals)
    layout: Brief["text_overlay"]["layout"];
    // Carousel-only — slide-specific copy used for composite mode + auto-correct
    slideCopy: CarouselSlideCopy | null;
  };
  const tasks: Task[] = [];

  for (const modelId of selectedModels) {
    const model = getModel(modelId)!;
    const mode: "full" | "composite" = model.prefersFullPrompt
      ? "full"
      : "composite";

    for (let aIdx = 0; aIdx < effectiveAngles.length; aIdx++) {
      for (let cIdx = 0; cIdx < effectiveConcepts.length; cIdx++) {
        const angle = effectiveAngles[aIdx];
        const concept = effectiveConcepts[cIdx];
        const carouselSlides =
          creativeType === "carousel"
            ? carouselCopyMap.get(`${aIdx}:${cIdx}` as CarouselKey) ?? null
            : null;

        const slideRange =
          slideCount === 1
            ? [1]
            : Array.from({ length: slideCount }, (_, i) => i + 1);

        for (const slide of slideRange) {
          let prompt: string;
          let slideCopy: CarouselSlideCopy | null = null;

          // Rotate the layout per task ONLY if the user opted into diversity
          // (default ON). When OFF, every task uses the brief's preferred
          // layout — uniformity.
          //
          // SPECIAL CASE : comparison_split concepts ALWAYS use the dedicated
          // "comparison-bottom" layout, regardless of rotation. The visual
          // structure (A vs B diptyque) is intrinsic to the concept ; using
          // any other layout would put the copy in the wrong place.
          const layoutSeed = aIdx * 7 + cIdx * 3 + (slide - 1);
          const isComparison = concept.render_style === "comparison_split";
          const taskLayout = isComparison
            ? "comparison-bottom"
            : diversifyLayouts
            ? pickCreativeLayout(layoutSeed)
            : briefData.text_overlay.layout;

          if (creativeType === "carousel" && carouselSlides) {
            slideCopy = carouselSlides[slide - 1] ?? null;
            if (!slideCopy) continue;
            const carouselSlide: CarouselSlide = {
              role: slideCopy.role,
              headline: slideCopy.headline,
              body: slideCopy.body,
              cta: slideCopy.cta,
            };
            prompt = buildCarouselSlidePrompt({
              concept,
              angle,
              mode,
              theme: briefData.text_overlay.theme,
              layout: taskLayout,
              slide: carouselSlide,
              slideIndex: slide,
              brand: brandContext,
              region,
            });
          } else {
            prompt = buildImagePrompt(
              concept,
              angle,
              mode,
              briefData.text_overlay.theme,
              taskLayout,
              brandContext,
              region
            );
          }

          const slideTag =
            creativeType === "carousel"
              ? ` · ${SLIDE_LABEL[slide] ?? `Slide ${slide}`}`
              : "";

          const aOrigin = angleOrigins[aIdx];
          const cOrigin = conceptOrigins[cIdx];
          const cIdent = conceptIdentifiers[cIdx];

          const copyVariantId = angleCopyVariantIds[aIdx];

          const { data: imgRow } = await supabase
            .from("generated_images")
            .insert({
              generation_id: gen.id,
              model_id: modelId,
              model_label: `${model.label} · ${concept.name} · ${angle.name}${slideTag}`,
              status: "running",
              params: {
                mode,
                // Angle traceability — copy stored directly so we don't have
                // to look up briefData.angles[idx] later (works for custom too).
                angle_origin: aOrigin,
                angle_idx:
                  aOrigin === "brief" ? angleBriefIndices[aIdx] : null,
                angle_name: angle.name,
                angle_headline: angle.headline,
                angle_body: angle.body ?? null,
                angle_cta: angle.cta ?? null,
                // Copy variant traceability — "base" or a variant.id ; lets us
                // know later WHICH copy hook produced this image so we can
                // group winners by variant on the analytics side.
                copy_variant_id: copyVariantId,
                // Concept traceability
                concept_origin: cOrigin,
                concept_idx:
                  cOrigin === "brief" ? Number(cIdent) : null,
                concept_preset_id: cOrigin === "preset" ? cIdent : null,
                concept_name: concept.name,
                concept_variant_id: conceptVariantIds[cIdx],
                render_style: concept.render_style ?? "cinematic",
                format: "1:1",
                // Layout actually used for THIS image (rotated via the
                // creative palette — different from briefData.text_overlay.layout)
                layout: taskLayout,
                slide,
                carousel: creativeType === "carousel",
                carousel_role: slideCopy?.role,
                carousel_headline: slideCopy?.headline,
                carousel_body: slideCopy?.body,
                carousel_cta: slideCopy?.cta,
                variant_kind: "original",
                prompt,
              },
            })
            .select("id")
            .single();
          if (imgRow) {
            tasks.push({
              rowId: imgRow.id,
              modelId,
              angleIdx: aIdx,
              conceptIdx: cIdx,
              angleOrigin: aOrigin,
              conceptOrigin: cOrigin,
              conceptIdentifier: cIdent,
              slide,
              prompt,
              mode,
              layout: taskLayout,
              slideCopy,
            });
          }
        }
      }
    }
  }

  // Run the matrix in parallel — 1:1 only.
  await Promise.all(
    tasks.map(async (t) => {
      try {
        const angle = effectiveAngles[t.angleIdx];
        const concept = effectiveConcepts[t.conceptIdx];
        const renderStyle: RenderStyle = concept.render_style ?? "cinematic";

        // Carousel slides have their OWN copy (per-slide narrative).
        // Static ads use the angle's copy. This is what the compositor
        // and auto-correct will compare against.
        const expectedCopy = t.slideCopy
          ? {
              headline: t.slideCopy.headline,
              body: t.slideCopy.body,
              cta: t.slideCopy.cta,
            }
          : {
              headline: angle.headline,
              body: angle.body,
              cta: angle.cta,
            };

        const result = await runModel(t.modelId, t.prompt);
        if (!result.ok) throw new Error(result.error);

        let imageBytes = result.bytes;
        let mimeType = result.mimeType;

        if (t.mode === "composite") {
          // For comparison-bottom : pull the labels from the concept's
          // `comparison_labels` field (set by Claude when it picks
          // comparison_split). The compositor reads them via emphasis_words[0]
          // and [1] — single channel keeps the API simple.
          const labelsOverride =
            t.layout === "comparison-bottom"
              ? concept.comparison_labels ?? ["AVANT", "APRÈS"]
              : undefined;
          imageBytes = await compositeAd({
            image: imageBytes,
            copy: expectedCopy,
            textOverlay: {
              ...briefData.text_overlay,
              layout: t.layout, // ← rotation creative
              emphasis_words:
                labelsOverride ??
                // Emphasis words only relevant for static — carousel slides
                // already inject their own narrative.
                (t.slideCopy ? undefined : angle.emphasis_words),
            },
          });
          mimeType = "image/jpeg";
        }

        const finalPath = `${user.id}/${brief.project_id}/${gen.id}/${t.rowId}.${
          mimeType === "image/png" ? "png" : "jpg"
        }`;
        const { error: upErr } = await supabase.storage
          .from("generated")
          .upload(finalPath, imageBytes, {
            contentType: mimeType,
            upsert: true,
          });
        if (upErr) throw new Error(`upload: ${upErr.message}`);

        await supabase
          .from("generated_images")
          .update({
            image_url: null,
            storage_path: finalPath,
            status: "done",
            error_message: null,
            params: {
              mode: t.mode,
              angle_origin: t.angleOrigin,
              angle_idx:
                t.angleOrigin === "brief"
                  ? angleBriefIndices[t.angleIdx]
                  : null,
              angle_name: angle.name,
              angle_headline: angle.headline,
              angle_body: angle.body ?? null,
              angle_cta: angle.cta ?? null,
              copy_variant_id: angleCopyVariantIds[t.angleIdx],
              concept_origin: t.conceptOrigin,
              concept_idx:
                t.conceptOrigin === "brief"
                  ? Number(t.conceptIdentifier)
                  : null,
              concept_preset_id:
                t.conceptOrigin === "preset" ? t.conceptIdentifier : null,
              concept_name: concept.name,
              concept_variant_id: conceptVariantIds[t.conceptIdx],
              render_style: renderStyle,
              format: "1:1",
              layout: t.layout,
              slide: t.slide,
              carousel: creativeType === "carousel",
              carousel_role: t.slideCopy?.role,
              carousel_headline: t.slideCopy?.headline,
              carousel_body: t.slideCopy?.body,
              carousel_cta: t.slideCopy?.cta,
              variant_kind: "original",
              prompt: t.prompt,
            },
          })
          .eq("id", t.rowId);
      } catch (e) {
        await supabase
          .from("generated_images")
          .update({
            status: "failed",
            error_message: (e as Error).message,
          })
          .eq("id", t.rowId);
      }
    })
  );

  await supabase.from("generations").update({ status: "done" }).eq("id", gen.id);

  revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
}

export async function deleteGeneration(briefId: string, generationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: brief } = await supabase
    .from("briefs")
    .select("project_id")
    .eq("id", briefId)
    .maybeSingle();

  await supabase.from("generations").delete().eq("id", generationId);

  if (brief?.project_id) {
    revalidatePath(`/projects/${brief.project_id}/briefs/${briefId}`);
  }
}
