"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import SubmitButton from "./submit-button";
import {
  RENDER_STYLE_LABELS,
  type Angle,
  type Brief,
  type ConceptVariant,
  type RenderStyle,
} from "@/lib/brief-schema";
import {
  PRESET_CONCEPT_LIST,
  type PresetConceptId,
  type CustomAngleInput,
  type CustomConceptInput,
  type PresetSelectionInput,
} from "@/lib/preset-concepts";
import {
  regenerateAngleCopyVariants,
  updateAngleCopyVariant,
  deleteAngleCopyVariant,
  generateCustomAngleCopyVariants,
  regenerateConceptVariants,
  addConceptVariantFromIdea,
  updateConceptVariant,
  deleteConceptVariant,
  generateEphemeralConceptVariants,
  generateEphemeralConceptVariantFromIdea,
} from "./actions";

const RENDER_STYLE_KEYS: RenderStyle[] = [
  "cinematic",
  "ugc",
  "screenshot_social",
  "editorial",
  "comparison_split",
  "data_viz",
  "meme",
];

/**
 * Only the serializable fields of ImageModel — the parent server component
 * cannot send the full ImageModel because it contains functions (buildInput,
 * extractUrls) which React Server Components disallow across the boundary.
 */
export type ModelOption = {
  id: string;
  label: string;
  description: string;
  prefersFullPrompt?: boolean;
};

type CreativeType = "static" | "carousel";

/**
 * Selection encoding for copy slots :
 *   - angle_key : "brief_<idx>" or "custom_<idx>"
 *   - copy_key  : "base" (the angle's original copy) or "<variant.id>"
 *
 * Each entry = ONE creative slot in the generation matrix. So 2 selected
 * variants on the same angle = 2 slots = 2× the visuals.
 */
export type SelectedCopy = {
  angle_key: string;
  copy_key: string;
};

type Props = {
  briefId: string;
  briefData: Brief;
  models: ModelOption[];
  action: (formData: FormData) => Promise<void> | void;
};

/**
 * Client-managed generation form. Why client-side?
 *  - Live total counter (angles × concepts × models × slides) so the user
 *    knows exactly what they're about to spend before clicking.
 *  - Submit button stays disabled until they've selected at least 1 angle,
 *    1 concept and 1 model — prevents the "Sélectionne au moins 1 X" error
 *    that used to fire when the user thought a card was checked but the
 *    underlying input wasn't (visual desync).
 *  - Per-angle copy variants : the user can select multiple copy hooks
 *    per angle (base + N variants). Each selected copy = 1 visual slot
 *    in the matrix.
 */
export default function GenerationForm({
  briefId,
  briefData,
  models,
  action,
}: Props) {
  // Brief angle selections : map<angleIdx, Set<copyKey>>.
  // copyKey = "base" or a variant.id. An angle is "in use" iff its set has size > 0.
  const [selectedCopiesByAngle, setSelectedCopiesByAngle] = useState<
    Map<number, Set<string>>
  >(() =>
    briefData.angles.length > 0
      ? new Map([[0, new Set<string>(["base"])]])
      : new Map()
  );

  // Same shape but for CUSTOM angles (keyed by their index in the customAngles
  // array). Default selection on a freshly added custom angle = {"base"} so
  // the matrix counter ticks up immediately like before.
  const [selectedCustomCopies, setSelectedCustomCopies] = useState<
    Map<number, Set<string>>
  >(() => new Map());

  // Brief concept selections : map<conceptIdx, Set<variantKey>>.
  // variantKey = "base" or a concept_variant.id. A concept is "in use" iff
  // its set has size > 0. Same shape pattern as selectedCopiesByAngle.
  const [selectedBriefConceptVariants, setSelectedBriefConceptVariants] =
    useState<Map<number, Set<string>>>(() =>
      briefData.concepts.length > 0
        ? new Map([[0, new Set<string>(["base"])]])
        : new Map()
    );
  // Brief concepts also get a per-concept style override map. Defaults come
  // from briefData.concepts[i].render_style — Claude assigned them, the user
  // can tweak any of them at generation time.
  const [briefConceptStyles, setBriefConceptStyles] = useState<
    Map<number, RenderStyle>
  >(
    () =>
      new Map(
        briefData.concepts.map(
          (c, i) => [i, c.render_style ?? "cinematic"] as const
        )
      )
  );
  // Preset selections : same shape but keyed by preset id. Variants for a
  // preset live in `presetVariants` since presets are not persisted to DB.
  const [selectedPresetConceptVariants, setSelectedPresetConceptVariants] =
    useState<Map<PresetConceptId, Set<string>>>(() => new Map());
  const [presetStyles, setPresetStyles] = useState<
    Map<PresetConceptId, RenderStyle>
  >(
    () =>
      new Map(
        PRESET_CONCEPT_LIST.map(
          (p) => [p.id, p.render_style ?? "cinematic"] as const
        )
      )
  );
  // Ephemeral concept variants generated for a preset — kept in client state
  // and shipped via preset_concepts_json at submit. Persisting them to DB
  // doesn't make sense because presets aren't owned by the brief.
  const [presetVariants, setPresetVariants] = useState<
    Map<PresetConceptId, ConceptVariant[]>
  >(() => new Map());
  const [customAngles, setCustomAngles] = useState<CustomAngleInput[]>([]);
  const [customConcepts, setCustomConcepts] = useState<CustomConceptInput[]>(
    []
  );
  // Selected variant keys per CUSTOM concept (keyed by index in customConcepts).
  // Same default-on-add semantics as custom angles : implicit {"base"} until
  // the user explicitly toggles.
  const [selectedCustomConceptVariants, setSelectedCustomConceptVariants] =
    useState<Map<number, Set<string>>>(() => new Map());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    () => new Set(models.length > 0 ? [models[0].id] : [])
  );
  const [creativeType, setCreativeType] = useState<CreativeType>("static");
  // Rotation through the creative layout palette (sticker / side-strip /
  // magazine / floating-card / marquee / etc.) → guarantees varied
  // compositions across the matrix. Defaults to ON (variety wins on Meta).
  // When OFF, every image uses the brief's preferred layout.
  const [diversifyLayouts, setDiversifyLayouts] = useState<boolean>(true);

  // -------------------------------------------------------------------------
  // Sync selections after the brief regenerates/edits/deletes a variant.
  // When `briefData.angles[idx].copy_variants` changes (via revalidatePath
  // from a server action), variant IDs that no longer exist must be pruned
  // from the selection state so the matrix count stays accurate.
  // -------------------------------------------------------------------------
  useEffect(() => {
    setSelectedCopiesByAngle((prev) => {
      let changed = false;
      const next = new Map<number, Set<string>>();
      prev.forEach((copyKeys, angleIdx) => {
        const angle = briefData.angles[angleIdx];
        if (!angle) {
          changed = true;
          return;
        }
        const valid = new Set<string>([
          "base",
          ...(angle.copy_variants ?? []).map((v) => v.id),
        ]);
        const filtered = new Set<string>();
        copyKeys.forEach((k) => {
          if (valid.has(k)) filtered.add(k);
          else changed = true;
        });
        if (filtered.size > 0) {
          next.set(angleIdx, filtered);
        } else {
          // All previous copies were pruned by a regenerate — keep the angle
          // active with "base" so the user doesn't have to re-check it.
          next.set(angleIdx, new Set(["base"]));
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    // Same prune logic for BRIEF concept variants.
    setSelectedBriefConceptVariants((prev) => {
      let changed = false;
      const next = new Map<number, Set<string>>();
      prev.forEach((variantKeys, conceptIdx) => {
        const concept = briefData.concepts[conceptIdx];
        if (!concept) {
          changed = true;
          return;
        }
        const valid = new Set<string>([
          "base",
          ...(concept.concept_variants ?? []).map((v) => v.id),
        ]);
        const filtered = new Set<string>();
        variantKeys.forEach((k) => {
          if (valid.has(k)) filtered.add(k);
          else changed = true;
        });
        if (filtered.size > 0) {
          next.set(conceptIdx, filtered);
        } else {
          next.set(conceptIdx, new Set(["base"]));
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [briefData]);

  // -------------------------------------------------------------------------
  // Derived counts
  // -------------------------------------------------------------------------
  // Effective counts — only count VALID custom entries (with at least a name
  // or content), so empty drafts don't fool the user into thinking they have
  // more selected than they actually do.
  const validCustomAngles = customAngles.filter(
    (a) => a.headline.trim().length > 0
  );
  const validCustomConcepts = customConcepts.filter(
    (c) => c.description.trim().length > 0
  );

  // Total copy slots = sum of selected copies across brief angles + sum across
  // valid custom angles (each custom angle defaults to "base" if no explicit
  // selection has been made yet, matching the legacy 1-slot-per-custom-angle UX).
  const briefCopySlots = Array.from(selectedCopiesByAngle.values()).reduce(
    (acc, s) => acc + s.size,
    0
  );
  let customCopySlots = 0;
  customAngles.forEach((ca, idx) => {
    if (ca.headline.trim().length === 0) return;
    const keys = selectedCustomCopies.get(idx) ?? new Set(["base"]);
    customCopySlots += keys.size;
  });
  const totalCopySlots = briefCopySlots + customCopySlots;

  // Concept slots = sum of selected variant keys across brief + preset + custom.
  // Each variant slot will produce its own image in the matrix.
  const briefConceptSlots = Array.from(
    selectedBriefConceptVariants.values()
  ).reduce((acc, s) => acc + s.size, 0);
  const presetConceptSlots = Array.from(
    selectedPresetConceptVariants.values()
  ).reduce((acc, s) => acc + s.size, 0);
  let customConceptSlots = 0;
  customConcepts.forEach((cc, idx) => {
    if (cc.description.trim().length === 0) return;
    const keys =
      selectedCustomConceptVariants.get(idx) ?? new Set(["base"]);
    customConceptSlots += keys.size;
  });
  const totalConcepts =
    briefConceptSlots + presetConceptSlots + customConceptSlots;

  const slideCount = creativeType === "carousel" ? 3 : 1;
  const totalImages =
    totalCopySlots * totalConcepts * selectedModels.size * slideCount;

  const canSubmit =
    totalCopySlots > 0 && totalConcepts > 0 && selectedModels.size > 0;

  // -------------------------------------------------------------------------
  // Hidden payloads
  // -------------------------------------------------------------------------
  const selectedCopiesPayload: SelectedCopy[] = [];
  selectedCopiesByAngle.forEach((copyKeys, angleIdx) => {
    copyKeys.forEach((copyKey) => {
      selectedCopiesPayload.push({
        angle_key: `brief_${angleIdx}`,
        copy_key: copyKey,
      });
    });
  });
  // Custom angles : iterate the FULL `customAngles` array (so our
  // `selectedCustomCopies` keys stay stable when drafts get added/removed),
  // but emit angle_key = `custom_${validIdx}` matching the position in the
  // validCustomAngles list — that's what the server will see in custom_angles_json.
  let validIdx = 0;
  customAngles.forEach((ca, origIdx) => {
    if (ca.headline.trim().length === 0) return;
    const keys = selectedCustomCopies.get(origIdx) ?? new Set(["base"]);
    keys.forEach((copyKey) => {
      selectedCopiesPayload.push({
        angle_key: `custom_${validIdx}`,
        copy_key: copyKey,
      });
    });
    validIdx++;
  });

  // Build the serialized payload of selected presets — only those that have
  // at least one variant key selected, with their chosen render_style and
  // any ephemeral concept_variants generated by the user. The server uses
  // selected_concepts_json to know WHICH variant of which preset to render.
  const presetSelectionsPayload: PresetSelectionInput[] = Array.from(
    selectedPresetConceptVariants.entries()
  )
    .filter(([, set]) => set.size > 0)
    .map(([id]) => ({
      id,
      render_style: presetStyles.get(id) ?? "cinematic",
      concept_variants: presetVariants.get(id),
    }));

  // Brief concept style overrides — only send entries that actually differ
  // from the brief's default to keep the payload small.
  const briefOverridesPayload: { idx: number; render_style: RenderStyle }[] =
    Array.from(briefConceptStyles.entries())
      .filter(([idx, style]) => {
        const def = briefData.concepts[idx]?.render_style ?? "cinematic";
        return style !== def;
      })
      .map(([idx, style]) => ({ idx, render_style: style }));

  // ---- selected_concepts_json : per-concept-variant payload ---------------
  // Same shape as selected_copies_json but for concepts. Each entry = 1 entry
  // in effectiveConcepts (each multiplies the matrix). concept_key encodes
  // the origin and identifier ; variant_key is "base" or a variant.id.
  type SelectedConcept = { concept_key: string; variant_key: string };
  const selectedConceptsPayload: SelectedConcept[] = [];
  selectedBriefConceptVariants.forEach((variantKeys, conceptIdx) => {
    variantKeys.forEach((variantKey) => {
      selectedConceptsPayload.push({
        concept_key: `brief_${conceptIdx}`,
        variant_key: variantKey,
      });
    });
  });
  selectedPresetConceptVariants.forEach((variantKeys, presetId) => {
    variantKeys.forEach((variantKey) => {
      selectedConceptsPayload.push({
        concept_key: `preset_${presetId}`,
        variant_key: variantKey,
      });
    });
  });
  // Custom concepts : same valid-only / position-mapping logic as custom angles.
  let validConceptIdx = 0;
  customConcepts.forEach((cc, origIdx) => {
    if (cc.description.trim().length === 0) return;
    const keys =
      selectedCustomConceptVariants.get(origIdx) ?? new Set(["base"]);
    keys.forEach((variantKey) => {
      selectedConceptsPayload.push({
        concept_key: `custom_${validConceptIdx}`,
        variant_key: variantKey,
      });
    });
    validConceptIdx++;
  });

  // -------------------------------------------------------------------------
  // Mutators for selectedCopiesByAngle
  // -------------------------------------------------------------------------
  function setAngleEnabled(angleIdx: number, enabled: boolean) {
    setSelectedCopiesByAngle((prev) => {
      const next = new Map(prev);
      if (enabled) {
        // Default selection on enable : the base copy
        next.set(angleIdx, new Set(["base"]));
      } else {
        next.delete(angleIdx);
      }
      return next;
    });
  }

  function toggleCopy(angleIdx: number, copyKey: string, on: boolean) {
    setSelectedCopiesByAngle((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(angleIdx) ?? []);
      if (on) current.add(copyKey);
      else current.delete(copyKey);
      if (current.size === 0) next.delete(angleIdx);
      else next.set(angleIdx, current);
      return next;
    });
  }

  function toggleCustomCopy(angleIdx: number, copyKey: string, on: boolean) {
    setSelectedCustomCopies((prev) => {
      const next = new Map(prev);
      // Materialize the implicit default {"base"} so toggles are predictable.
      const current = new Set(next.get(angleIdx) ?? new Set(["base"]));
      if (on) current.add(copyKey);
      else current.delete(copyKey);
      // Empty set means "this custom angle has no copy selected". We keep the
      // entry so the count stays at 0 (the user explicitly removed everything).
      next.set(angleIdx, current);
      return next;
    });
  }

  // ---- Concept variant mutators ------------------------------------------

  function setBriefConceptEnabled(conceptIdx: number, enabled: boolean) {
    setSelectedBriefConceptVariants((prev) => {
      const next = new Map(prev);
      if (enabled) next.set(conceptIdx, new Set(["base"]));
      else next.delete(conceptIdx);
      return next;
    });
  }
  function toggleBriefConceptVariant(
    conceptIdx: number,
    variantKey: string,
    on: boolean
  ) {
    setSelectedBriefConceptVariants((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(conceptIdx) ?? []);
      if (on) current.add(variantKey);
      else current.delete(variantKey);
      if (current.size === 0) next.delete(conceptIdx);
      else next.set(conceptIdx, current);
      return next;
    });
  }
  function setPresetEnabled(presetId: PresetConceptId, enabled: boolean) {
    setSelectedPresetConceptVariants((prev) => {
      const next = new Map(prev);
      if (enabled) next.set(presetId, new Set(["base"]));
      else next.delete(presetId);
      return next;
    });
  }
  function togglePresetVariant(
    presetId: PresetConceptId,
    variantKey: string,
    on: boolean
  ) {
    setSelectedPresetConceptVariants((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(presetId) ?? []);
      if (on) current.add(variantKey);
      else current.delete(variantKey);
      if (current.size === 0) next.delete(presetId);
      else next.set(presetId, current);
      return next;
    });
  }
  function toggleCustomConceptVariant(
    conceptIdx: number,
    variantKey: string,
    on: boolean
  ) {
    setSelectedCustomConceptVariants((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(conceptIdx) ?? new Set(["base"]));
      if (on) current.add(variantKey);
      else current.delete(variantKey);
      next.set(conceptIdx, current);
      return next;
    });
  }

  return (
    <form action={action} className="mt-5 flex flex-col gap-5">
      {/* Hidden serialized inputs — server reads these to merge with brief */}
      <input
        type="hidden"
        name="selected_copies_json"
        value={JSON.stringify(selectedCopiesPayload)}
      />
      <input
        type="hidden"
        name="custom_angles_json"
        value={JSON.stringify(validCustomAngles)}
      />
      <input
        type="hidden"
        name="custom_concepts_json"
        value={JSON.stringify(validCustomConcepts)}
      />
      <input
        type="hidden"
        name="preset_concepts_json"
        value={JSON.stringify(presetSelectionsPayload)}
      />
      <input
        type="hidden"
        name="brief_concept_overrides_json"
        value={JSON.stringify(briefOverridesPayload)}
      />
      <input
        type="hidden"
        name="selected_concepts_json"
        value={JSON.stringify(selectedConceptsPayload)}
      />

      {/* Live summary banner */}
      <Summary
        copies={totalCopySlots}
        concepts={totalConcepts}
        models={selectedModels.size}
        slides={slideCount}
        total={totalImages}
        creativeType={creativeType}
      />

      {/* Angles + their copy variants */}
      <Group
        title="Angles à tester (copy)"
        hint="Coche un angle, génère des variantes de hook, sélectionne ce qui te plaît"
        count={totalCopySlots}
        empty={totalCopySlots === 0}
        layout="stack"
      >
        {briefData.angles.map((a, i) => {
          const copies = selectedCopiesByAngle.get(i);
          const enabled = (copies?.size ?? 0) > 0;
          return (
            <AngleCardWithVariants
              key={`brief-angle-${i}`}
              briefId={briefId}
              angleIdx={i}
              angle={a}
              enabled={enabled}
              selectedCopyKeys={copies ?? new Set()}
              onToggleAngle={(on) => setAngleEnabled(i, on)}
              onToggleCopy={(copyKey, on) => toggleCopy(i, copyKey, on)}
            />
          );
        })}

        {/* Custom angles — input cards */}
        {customAngles.map((ca, i) => (
          <CustomAngleCard
            key={`custom-angle-${i}`}
            briefId={briefId}
            value={ca}
            onChange={(next) =>
              setCustomAngles((prev) =>
                prev.map((x, j) => (j === i ? next : x))
              )
            }
            onRemove={() => {
              setCustomAngles((prev) => prev.filter((_, j) => j !== i));
              // Re-key selectedCustomCopies : entries with idx > i shift down.
              setSelectedCustomCopies((prev) => {
                const next = new Map<number, Set<string>>();
                prev.forEach((set, idx) => {
                  if (idx === i) return;
                  next.set(idx > i ? idx - 1 : idx, set);
                });
                return next;
              });
            }}
            selectedCopyKeys={
              selectedCustomCopies.get(i) ?? new Set(["base"])
            }
            onToggleCopy={(copyKey, on) => toggleCustomCopy(i, copyKey, on)}
          />
        ))}
        <AddCard
          label="+ Ajouter un angle perso"
          onClick={() =>
            setCustomAngles((prev) => [
              ...prev,
              { name: "", headline: "" },
            ])
          }
        />
      </Group>

      {/* Concepts — brief + presets + custom */}
      <Group
        title="Concepts visuels à tester"
        hint="Sélectionne 1+ concepts, ou utilise un preset / le tien"
        count={totalConcepts}
        empty={totalConcepts === 0}
      >
        {briefData.concepts.map((c, i) => {
          const defaultStyle: RenderStyle = c.render_style ?? "cinematic";
          const chosenStyle =
            briefConceptStyles.get(i) ?? defaultStyle;
          const variantKeys =
            selectedBriefConceptVariants.get(i) ?? new Set<string>();
          const enabled = variantKeys.size > 0;
          return (
            <ConceptCardWithVariants
              key={i}
              inputId={`brief-concept-style-${i}`}
              theme="brief"
              badge={`C${i + 1}`}
              title={c.name}
              desc={c.rationale}
              defaultStyle={defaultStyle}
              chosenStyle={chosenStyle}
              checked={enabled}
              onToggle={(on) => setBriefConceptEnabled(i, on)}
              onStyleChange={(s) =>
                setBriefConceptStyles((prev) => {
                  const next = new Map(prev);
                  next.set(i, s);
                  return next;
                })
              }
              variants={c.concept_variants ?? []}
              selectedVariantKeys={variantKeys}
              onToggleVariant={(variantKey, on) =>
                toggleBriefConceptVariant(i, variantKey, on)
              }
              onRegenerateVariants={async (count) => {
                const fd = new FormData();
                fd.set("concept_idx", String(i));
                fd.set("count", String(count));
                await regenerateConceptVariants(briefId, fd);
              }}
              onAddVariantFromIdea={async (idea) => {
                const fd = new FormData();
                fd.set("concept_idx", String(i));
                fd.set("idea", idea);
                await addConceptVariantFromIdea(briefId, fd);
              }}
              onUpdateVariant={async (variantId, updated) => {
                const fd = new FormData();
                fd.set("concept_idx", String(i));
                fd.set("variant_id", variantId);
                fd.set("name", updated.name);
                fd.set("description", updated.description);
                if (updated.render_style)
                  fd.set("render_style", updated.render_style);
                await updateConceptVariant(briefId, fd);
              }}
              onDeleteVariant={async (variantId) => {
                const fd = new FormData();
                fd.set("concept_idx", String(i));
                fd.set("variant_id", variantId);
                await deleteConceptVariant(briefId, fd);
              }}
            />
          );
        })}

        {/* Backward-compat hidden mirror — the new selected_concepts_json is
            authoritative but we still emit `concepts` for any legacy code path. */}
        {Array.from(selectedBriefConceptVariants.keys()).map((i) => (
          <input
            key={`concept-hidden-${i}`}
            type="hidden"
            name="concepts"
            value={String(i)}
          />
        ))}

        {/* Presets — always available, with style override + variants */}
        {PRESET_CONCEPT_LIST.map((p) => {
          const defaultStyle: RenderStyle = p.render_style ?? "cinematic";
          const chosenStyle = presetStyles.get(p.id) ?? defaultStyle;
          const variantKeys =
            selectedPresetConceptVariants.get(p.id) ?? new Set<string>();
          const enabled = variantKeys.size > 0;
          const variants = presetVariants.get(p.id) ?? [];
          return (
            <ConceptCardWithVariants
              key={p.id}
              inputId={`preset-style-${p.id}`}
              theme="preset"
              badge="PRESET"
              title={p.name}
              desc={p.rationale}
              defaultStyle={defaultStyle}
              chosenStyle={chosenStyle}
              checked={enabled}
              onToggle={(on) => setPresetEnabled(p.id, on)}
              onStyleChange={(s) =>
                setPresetStyles((prev) => {
                  const next = new Map(prev);
                  next.set(p.id, s);
                  return next;
                })
              }
              variants={variants}
              selectedVariantKeys={variantKeys}
              onToggleVariant={(variantKey, on) =>
                togglePresetVariant(p.id, variantKey, on)
              }
              onRegenerateVariants={async (count) => {
                const result = await generateEphemeralConceptVariants(
                  briefId,
                  {
                    name: p.name,
                    rationale: p.rationale,
                    description: p.description,
                    render_style: chosenStyle,
                    count,
                  }
                );
                setPresetVariants((prev) => {
                  const next = new Map(prev);
                  next.set(p.id, result);
                  return next;
                });
              }}
              onAddVariantFromIdea={async (idea) => {
                const result = await generateEphemeralConceptVariantFromIdea(
                  briefId,
                  {
                    name: p.name,
                    rationale: p.rationale,
                    description: p.description,
                    render_style: chosenStyle,
                    idea,
                  }
                );
                setPresetVariants((prev) => {
                  const next = new Map(prev);
                  next.set(p.id, [...(next.get(p.id) ?? []), result]);
                  return next;
                });
              }}
              onUpdateVariant={async (variantId, updated) => {
                setPresetVariants((prev) => {
                  const next = new Map(prev);
                  const list = (next.get(p.id) ?? []).map((v) =>
                    v.id === variantId
                      ? {
                          ...v,
                          name: updated.name,
                          description: updated.description,
                          render_style: updated.render_style,
                        }
                      : v
                  );
                  next.set(p.id, list);
                  return next;
                });
              }}
              onDeleteVariant={async (variantId) => {
                setPresetVariants((prev) => {
                  const next = new Map(prev);
                  next.set(
                    p.id,
                    (next.get(p.id) ?? []).filter((v) => v.id !== variantId)
                  );
                  return next;
                });
                setSelectedPresetConceptVariants((prev) => {
                  const next = new Map(prev);
                  const set = new Set(next.get(p.id) ?? []);
                  set.delete(variantId);
                  if (set.size > 0) next.set(p.id, set);
                  else next.delete(p.id);
                  return next;
                });
              }}
            />
          );
        })}

        {/* Custom concepts — draft + variants */}
        {customConcepts.map((cc, i) => (
          <CustomConceptCard
            key={`custom-concept-${i}`}
            briefId={briefId}
            value={cc}
            onChange={(next) =>
              setCustomConcepts((prev) =>
                prev.map((x, j) => (j === i ? next : x))
              )
            }
            onRemove={() => {
              setCustomConcepts((prev) => prev.filter((_, j) => j !== i));
              setSelectedCustomConceptVariants((prev) => {
                const next = new Map<number, Set<string>>();
                prev.forEach((set, idx) => {
                  if (idx === i) return;
                  next.set(idx > i ? idx - 1 : idx, set);
                });
                return next;
              });
            }}
            selectedVariantKeys={
              selectedCustomConceptVariants.get(i) ?? new Set(["base"])
            }
            onToggleVariant={(variantKey, on) =>
              toggleCustomConceptVariant(i, variantKey, on)
            }
          />
        ))}
        <AddCard
          label="+ Ajouter un concept perso"
          onClick={() =>
            setCustomConcepts((prev) => [
              ...prev,
              { name: "", description: "", render_style: "cinematic" },
            ])
          }
        />
      </Group>

      {/* Models */}
      <Group
        title="Modèles d'image"
        hint="Multi-sélection"
        count={selectedModels.size}
        empty={selectedModels.size === 0}
      >
        {models.map((m) => (
          <Choice
            key={m.id}
            name="models"
            value={m.id}
            checked={selectedModels.has(m.id)}
            onToggle={(next) =>
              setSelectedModels((prev) => toggleStr(prev, m.id, next))
            }
            badge={m.prefersFullPrompt ? "AI" : "CMP"}
            badgeClass={
              m.prefersFullPrompt
                ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                : "bg-black/40 text-white"
            }
            title={m.label}
            desc={m.description}
          />
        ))}
      </Group>

      {/* Type créa */}
      <Group title="Type de créa" hint="Choisis un seul">
        <Radio
          name="creative_type"
          value="static"
          checked={creativeType === "static"}
          onSelect={() => setCreativeType("static")}
          badge="STA"
          badgeClass="bg-emerald-500/15 text-emerald-400"
          title="Statique"
          desc="1 image par combinaison angle × concept × modèle"
        />
        <Radio
          name="creative_type"
          value="carousel"
          checked={creativeType === "carousel"}
          onSelect={() => setCreativeType("carousel")}
          badge="CAR"
          badgeClass="bg-rose-500/15 text-rose-400"
          title="Carrousel 3 slides"
          desc="Valeur d'abord : Hook éducatif → Insight utile → Application soft"
        />
      </Group>
      <input type="hidden" name="slides" value="3" />
      <input
        type="hidden"
        name="diversify_layouts"
        value={diversifyLayouts ? "1" : "0"}
      />

      {/* Diversifier les compositions */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={diversifyLayouts}
            onChange={(ev) => setDiversifyLayouts(ev.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
              diversifyLayouts
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border-white/30 bg-transparent"
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3.5 w-3.5 transition ${diversifyLayouts ? "opacity-100" : "opacity-0"}`}
            >
              <polyline points="4 10 8 14 16 6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                🎨 Diversifier les compositions
              </span>
              {diversifyLayouts && (
                <span className="rounded bg-[var(--color-primary)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
                  ACTIVÉ
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {diversifyLayouts
                ? "Chaque image pioche un layout différent du palette créatif (sticker, side-strip, magazine-cover, floating-card, marquee-band…). Garantit la variété visuelle dans le batch."
                : "Toutes les images utilisent le layout préféré du brief — uniformité visuelle."}
            </div>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {canSubmit ? (
            <>💡 ~30-60s par image</>
          ) : (
            <span className="text-amber-300">
              ⚠ Sélectionne au moins 1 copy, 1 concept et 1 modèle pour lancer.
            </span>
          )}
        </p>
        <SubmitButton
          pendingLabel="Génération en cours…"
          disabled={!canSubmit}
        >
          {canSubmit
            ? `Lancer le batch 1:1 (${totalImages})`
            : "Lancer le batch 1:1"}
        </SubmitButton>
      </div>
    </form>
  );
}

// =============================================================================
// AngleCardWithVariants
// =============================================================================

/**
 * A single brief angle + its copy variants panel. The user can :
 *   - Toggle the angle ON/OFF (auto-selects "base" copy on enable).
 *   - Toggle individual copies (base + variants) — multi-select.
 *   - Click "Générer N variantes" to ask Claude for fresh hooks.
 *   - Click ✏ on a variant to edit a few words.
 *   - Click ✗ on a variant to remove it.
 *
 * All variant operations are server actions called via useTransition so the
 * parent form state is preserved (no nested forms — just direct calls).
 */
function AngleCardWithVariants({
  briefId,
  angleIdx,
  angle,
  enabled,
  selectedCopyKeys,
  onToggleAngle,
  onToggleCopy,
}: {
  briefId: string;
  angleIdx: number;
  angle: Angle;
  enabled: boolean;
  selectedCopyKeys: Set<string>;
  onToggleAngle: (enabled: boolean) => void;
  onToggleCopy: (copyKey: string, on: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState<number>(5);
  const [editingId, setEditingId] = useState<string | null>(null);

  const variants = angle.copy_variants ?? [];

  function callRegenerate() {
    const fd = new FormData();
    fd.set("angle_idx", String(angleIdx));
    fd.set("count", String(count));
    startTransition(() => regenerateAngleCopyVariants(briefId, fd));
  }

  function callDelete(variantId: string) {
    const fd = new FormData();
    fd.set("angle_idx", String(angleIdx));
    fd.set("variant_id", variantId);
    startTransition(() => deleteAngleCopyVariant(briefId, fd));
  }

  return (
    <div
      className={`relative rounded-xl border-2 transition ${
        enabled
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/30"
          : "border-white/15 bg-[var(--color-background)]"
      }`}
    >
      {/* Header : angle name + headline + main checkbox */}
      <label className="flex cursor-pointer items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(ev) => onToggleAngle(ev.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
            enabled
              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "border-white/30 bg-transparent"
          }`}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3.5 w-3.5 transition ${enabled ? "opacity-100" : "opacity-0"}`}
          >
            <polyline points="4 10 8 14 16 6" />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--color-primary)]">
              A{angleIdx + 1}
            </span>
            <span className="text-sm font-semibold text-[var(--color-foreground)]">
              {angle.name}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {angle.rationale}
          </div>
        </div>
      </label>

      {/* Variants panel — only when angle is enabled */}
      {enabled && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 pb-3 pt-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Variantes copy
              </span>
              <span className="rounded bg-[var(--color-primary)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
                {selectedCopyKeys.size} sélectionné
                {selectedCopyKeys.size > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={count}
                disabled={pending}
                onChange={(ev) => setCount(parseInt(ev.target.value, 10))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1 text-[10px] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
                title="Nombre de variantes à produire"
              >
                {[3, 5, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} variantes
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={callRegenerate}
                disabled={pending}
                className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/15 px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/25 disabled:opacity-50"
                title={
                  variants.length > 0
                    ? "Remplacer toutes les variantes existantes"
                    : "Générer N variantes"
                }
              >
                {pending
                  ? "⏳ Génération…"
                  : variants.length > 0
                  ? "🔄 Régénérer"
                  : "✨ Générer"}
              </button>
            </div>
          </div>

          {/* The base copy is always available */}
          <CopyRow
            label="Base"
            copy={{
              headline: angle.headline,
              body: angle.body,
              cta: angle.cta,
            }}
            checked={selectedCopyKeys.has("base")}
            onToggle={(on) => onToggleCopy("base", on)}
            isBase
          />

          {/* Generated variants — edit + delete are server-persisted */}
          {variants.map((v, i) => (
            <CopyRow
              key={v.id}
              label={`V${i + 1}`}
              copy={v}
              checked={selectedCopyKeys.has(v.id)}
              onToggle={(on) => onToggleCopy(v.id, on)}
              onEdit={() => setEditingId(v.id)}
              onDelete={() => callDelete(v.id)}
              editing={editingId === v.id}
              onSave={(updated) =>
                new Promise<void>((resolve) => {
                  const fd = new FormData();
                  fd.set("angle_idx", String(angleIdx));
                  fd.set("variant_id", v.id);
                  fd.set("headline", updated.headline);
                  fd.set("body", updated.body ?? "");
                  fd.set("cta", updated.cta ?? "");
                  startTransition(async () => {
                    await updateAngleCopyVariant(briefId, fd);
                    resolve();
                  });
                })
              }
              onCloseEdit={() => setEditingId(null)}
            />
          ))}

          {variants.length === 0 && !pending && (
            <p className="mt-2 text-[10px] italic text-[var(--color-muted-foreground)]">
              💡 Clique sur « ✨ Générer » pour explorer d&apos;autres
              formulations sur cet angle.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One row in the copy-variants panel — base or variant. Shows headline + body
 * + cta, a checkbox to add it to the matrix, and optional edit/delete buttons.
 * In edit mode swaps to an inline form that calls the parent's onSave callback
 * (which can wrap a server action OR a local state update — same UI, two flows).
 */
function CopyRow({
  label,
  copy,
  checked,
  onToggle,
  isBase = false,
  onEdit,
  onDelete,
  editing = false,
  onSave,
  onCloseEdit,
}: {
  label: string;
  copy: { headline: string; body?: string; cta?: string };
  checked: boolean;
  onToggle: (on: boolean) => void;
  isBase?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  editing?: boolean;
  onSave?: (updated: {
    headline: string;
    body?: string;
    cta?: string;
  }) => void | Promise<void>;
  onCloseEdit?: () => void;
}) {
  if (editing && onSave) {
    return (
      <CopyEditForm
        initial={copy}
        onSave={onSave}
        onClose={onCloseEdit ?? (() => {})}
      />
    );
  }
  return (
    <label
      className={`mt-1.5 flex cursor-pointer items-start gap-2 rounded-md border p-2 transition ${
        checked
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
          : "border-white/10 bg-[var(--color-background)] hover:bg-white/[0.03]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(ev) => onToggle(ev.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition ${
          checked
            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "border-white/30 bg-transparent"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition ${checked ? "opacity-100" : "opacity-0"}`}
        >
          <polyline points="4 10 8 14 16 6" />
        </svg>
      </span>

      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
          isBase
            ? "bg-amber-500/15 text-amber-300"
            : "bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
        }`}
      >
        {label}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[var(--color-foreground)]">
          {copy.headline}
        </div>
        {(copy.body || copy.cta) && (
          <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
            {copy.body && <span>{copy.body}</span>}
            {copy.body && copy.cta && (
              <span className="mx-1.5 opacity-50">·</span>
            )}
            {copy.cta && (
              <span className="font-semibold">CTA: {copy.cta}</span>
            )}
          </div>
        )}
      </div>

      {(onEdit || onDelete) && (
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(ev) => ev.preventDefault()}
        >
          {onEdit && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onEdit();
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/10 hover:text-[var(--color-foreground)]"
              title="Modifier"
            >
              ✏
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onDelete();
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-red-500/20 hover:text-red-300"
              title="Supprimer cette variante"
            >
              ✗
            </button>
          )}
        </div>
      )}
    </label>
  );
}

/**
 * Inline edit form for one variant. Calls the parent's onSave callback
 * which decides where the update goes (server action for brief angles,
 * client state for custom angles). Stays mounted within the parent
 * generation form (no nested form).
 */
function CopyEditForm({
  initial,
  onSave,
  onClose,
}: {
  initial: { headline: string; body?: string; cta?: string };
  onSave: (updated: {
    headline: string;
    body?: string;
    cta?: string;
  }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [headline, setHeadline] = useState(initial.headline);
  const [body, setBody] = useState(initial.body ?? "");
  const [cta, setCta] = useState(initial.cta ?? "");

  async function save() {
    if (!headline.trim()) return;
    setPending(true);
    try {
      await onSave({
        headline: headline.trim(),
        body: body.trim() || undefined,
        cta: cta.trim() || undefined,
      });
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-1.5 rounded-md border-2 border-amber-500/40 bg-amber-500/5 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-amber-300">
          ✏ Édition variante
        </span>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/10 hover:text-[var(--color-foreground)] disabled:opacity-50"
          title="Annuler"
        >
          ✗
        </button>
      </div>
      <input
        type="text"
        value={headline}
        onChange={(ev) => setHeadline(ev.target.value)}
        placeholder="Headline (obligatoire)"
        className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
      />
      <input
        type="text"
        value={body}
        onChange={(ev) => setBody(ev.target.value)}
        placeholder="Body (optionnel)"
        className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] focus:border-[var(--color-primary)] focus:outline-none"
      />
      <input
        type="text"
        value={cta}
        onChange={(ev) => setCta(ev.target.value)}
        placeholder="CTA (optionnel)"
        className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] focus:border-[var(--color-primary)] focus:outline-none"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-muted-foreground)] transition hover:bg-white/5 disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !headline.trim()}
          className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "✓ Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================

function Summary({
  copies,
  concepts,
  models,
  slides,
  total,
  creativeType,
}: {
  copies: number;
  concepts: number;
  models: number;
  slides: number;
  total: number;
  creativeType: CreativeType;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="copies" n={copies} />
        <span className="text-[var(--color-muted-foreground)]">×</span>
        <Stat label="concepts" n={concepts} />
        <span className="text-[var(--color-muted-foreground)]">×</span>
        <Stat label="modèles" n={models} />
        {creativeType === "carousel" && (
          <>
            <span className="text-[var(--color-muted-foreground)]">×</span>
            <Stat label="slides" n={slides} />
          </>
        )}
        <span className="text-[var(--color-muted-foreground)]">→</span>
        <span
          className={`rounded-md px-2 py-1 font-bold ${
            total > 0
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "bg-amber-500/30 text-amber-200"
          }`}
        >
          {total} image{total > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <span
      className={`rounded-md px-2 py-1 font-medium ${
        n === 0
          ? "bg-amber-500/15 text-amber-300"
          : "bg-[var(--color-card)] text-[var(--color-foreground)]"
      }`}
    >
      <b>{n}</b>{" "}
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
    </span>
  );
}

function Group({
  title,
  hint,
  count,
  empty,
  layout = "grid",
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  empty?: boolean;
  layout?: "grid" | "stack";
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {title}
          </div>
          {typeof count === "number" && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                empty
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
              }`}
            >
              {count} sélectionné{count > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {hint && (
          <div className="text-[10px] text-[var(--color-muted-foreground)]">
            {hint}
          </div>
        )}
      </div>
      <div
        className={
          layout === "stack"
            ? "mt-2 flex flex-col gap-2"
            : "mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {children}
      </div>
    </div>
  );
}

function Choice({
  name,
  value,
  checked,
  onToggle,
  badge,
  badgeClass,
  title,
  desc,
  extraBadge,
}: {
  name: string;
  value: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  badge: string;
  badgeClass: string;
  title: string;
  desc: string;
  extraBadge?: ReactNode;
}) {
  return (
    <label
      className="
        group relative cursor-pointer rounded-lg border-2 p-3 transition
        border-white/15 bg-[var(--color-background)]
        hover:border-white/30 hover:bg-white/[0.03]
        has-[:checked]:border-[var(--color-primary)]
        has-[:checked]:bg-[var(--color-primary)]/10
        has-[:checked]:ring-1 has-[:checked]:ring-[var(--color-primary)]/40
      "
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(ev) => onToggle(ev.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="
          absolute right-2 top-2 flex h-5 w-5 items-center justify-center
          rounded-md border-2 transition
          border-white/30 bg-transparent
          peer-checked:border-[var(--color-primary)]
          peer-checked:bg-[var(--color-primary)]
          peer-checked:text-[var(--color-primary-foreground)]
        "
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 opacity-0 group-has-[:checked]:opacity-100"
        >
          <polyline points="4 10 8 14 16 6" />
        </svg>
      </span>

      <div className="flex flex-wrap items-center gap-1.5 pr-7">
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeClass}`}
        >
          {badge}
        </span>
        <span className="text-sm font-semibold text-[var(--color-foreground)]">
          {title}
        </span>
        {extraBadge}
      </div>
      <div className="mt-1 line-clamp-2 pr-7 text-xs text-[var(--color-muted-foreground)] group-has-[:checked]:text-[var(--color-foreground)]/80">
        {desc}
      </div>
    </label>
  );
}

function Radio({
  name,
  value,
  checked,
  onSelect,
  badge,
  badgeClass,
  title,
  desc,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  badge: string;
  badgeClass: string;
  title: string;
  desc: string;
}) {
  return (
    <label
      className="
        group relative cursor-pointer rounded-lg border-2 p-3 transition
        border-white/15 bg-[var(--color-background)]
        hover:border-white/30 hover:bg-white/[0.03]
        has-[:checked]:border-[var(--color-primary)]
        has-[:checked]:bg-[var(--color-primary)]/10
        has-[:checked]:ring-1 has-[:checked]:ring-[var(--color-primary)]/40
      "
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect()}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="
          absolute right-2 top-2 flex h-5 w-5 items-center justify-center
          rounded-full border-2 transition
          border-white/30 bg-transparent
          peer-checked:border-[var(--color-primary)]
        "
      >
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] opacity-0 transition group-has-[:checked]:opacity-100" />
      </span>

      <div className="flex items-center gap-2 pr-7">
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeClass}`}
        >
          {badge}
        </span>
        <span className="text-sm font-semibold text-[var(--color-foreground)]">
          {title}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 pr-7 text-xs text-[var(--color-muted-foreground)] group-has-[:checked]:text-[var(--color-foreground)]/80">
        {desc}
      </div>
    </label>
  );
}

/**
 * Theme variations for the concept card — affects accent colors only.
 *  - brief   : Claude-generated angles, primary violet
 *  - preset  : podcast / blog / faux article…, emerald
 *  - custom  : user-typed concept, amber
 */
type ConceptCardTheme = "brief" | "preset" | "custom";

const CONCEPT_THEME: Record<
  ConceptCardTheme,
  {
    container: string;
    indicator: string;
    badge: string;
    panelBorder: string;
    activeBorder: string;
    activeBg: string;
    activeRing: string;
  }
> = {
  brief: {
    container:
      "has-[input[type=checkbox]:checked]:border-[var(--color-primary)] has-[input[type=checkbox]:checked]:bg-[var(--color-primary)]/10 has-[input[type=checkbox]:checked]:ring-1 has-[input[type=checkbox]:checked]:ring-[var(--color-primary)]/40",
    indicator:
      "peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-primary)] peer-checked:text-[var(--color-primary-foreground)]",
    badge: "bg-amber-500/15 text-amber-400",
    panelBorder: "border-[var(--color-border)]",
    activeBorder: "border-[var(--color-primary)]",
    activeBg: "bg-[var(--color-primary)]/5",
    activeRing: "ring-1 ring-[var(--color-primary)]/30",
  },
  preset: {
    container:
      "has-[input[type=checkbox]:checked]:border-emerald-400/70 has-[input[type=checkbox]:checked]:bg-emerald-500/10 has-[input[type=checkbox]:checked]:ring-1 has-[input[type=checkbox]:checked]:ring-emerald-400/40",
    indicator:
      "peer-checked:border-emerald-400 peer-checked:bg-emerald-400 peer-checked:text-black",
    badge: "bg-emerald-500/15 text-emerald-300",
    panelBorder: "border-emerald-500/30",
    activeBorder: "border-emerald-400",
    activeBg: "bg-emerald-500/5",
    activeRing: "ring-1 ring-emerald-400/40",
  },
  custom: {
    container: "",
    indicator: "",
    badge: "bg-amber-500/15 text-amber-400",
    panelBorder: "border-amber-500/30",
    activeBorder: "border-amber-400",
    activeBg: "bg-amber-500/5",
    activeRing: "ring-1 ring-amber-400/40",
  },
};

/**
 * Concept card with an embedded render_style dropdown AND a copy-style
 * variants panel. Used for BRIEF, PRESET, and CUSTOM concepts — origin
 * theming differs but the variant operations are uniform. Operations are
 * pluggable via callbacks so the same component handles server-persisted
 * (brief) and ephemeral (preset / custom) flows.
 */
function ConceptCardWithVariants({
  inputId,
  theme,
  badge,
  title,
  desc,
  defaultStyle,
  chosenStyle,
  checked,
  onToggle,
  onStyleChange,
  variants,
  selectedVariantKeys,
  onToggleVariant,
  onRegenerateVariants,
  onAddVariantFromIdea,
  onUpdateVariant,
  onDeleteVariant,
}: {
  inputId: string;
  theme: ConceptCardTheme;
  badge: string;
  title: string;
  desc: string;
  defaultStyle: RenderStyle;
  chosenStyle: RenderStyle;
  checked: boolean;
  onToggle: (next: boolean) => void;
  onStyleChange: (s: RenderStyle) => void;
  variants: ConceptVariantClient[];
  selectedVariantKeys: Set<string>;
  onToggleVariant: (variantKey: string, on: boolean) => void;
  onRegenerateVariants: (count: number) => void | Promise<void>;
  onAddVariantFromIdea: (idea: string) => void | Promise<void>;
  onUpdateVariant: (
    variantId: string,
    updated: { name: string; description: string; render_style?: RenderStyle }
  ) => void | Promise<void>;
  onDeleteVariant: (variantId: string) => void | Promise<void>;
}) {
  const themeClasses = CONCEPT_THEME[theme];

  return (
    <div
      className={`relative rounded-lg border-2 transition ${
        checked
          ? `${themeClasses.activeBorder} ${themeClasses.activeBg} ${themeClasses.activeRing}`
          : "border-white/15 bg-[var(--color-background)]"
      }`}
    >
      {/* Header : checkbox + title + style picker */}
      <label
        className={`
          group relative block cursor-pointer p-3
          hover:bg-white/[0.03]
        `}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(ev) => onToggle(ev.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`
            absolute right-2 top-2 flex h-5 w-5 items-center justify-center
            rounded-md border-2 transition
            border-white/30 bg-transparent
            ${themeClasses.indicator}
          `}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 opacity-0 peer-checked:opacity-100"
          >
            <polyline points="4 10 8 14 16 6" />
          </svg>
        </span>

        <div className="flex flex-wrap items-center gap-1.5 pr-7">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${themeClasses.badge}`}
          >
            {badge}
          </span>
          <span className="text-sm font-semibold text-[var(--color-foreground)]">
            {title}
          </span>
        </div>
        <div className="mt-1 line-clamp-2 pr-7 text-xs text-[var(--color-muted-foreground)]">
          {desc}
        </div>

        {/* Style picker — always visible so the user can plan before checking */}
        <div
          className="mt-2 flex items-center gap-1.5"
          onClick={(ev) => ev.preventDefault()}
        >
          <label
            htmlFor={inputId}
            className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]"
          >
            Style :
          </label>
          <select
            id={inputId}
            value={chosenStyle}
            onChange={(ev) => {
              ev.stopPropagation();
              onStyleChange(ev.target.value as RenderStyle);
            }}
            onClick={(ev) => ev.stopPropagation()}
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
            title={`Style par défaut suggéré : ${RENDER_STYLE_LABELS[defaultStyle]}`}
          >
            {RENDER_STYLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {RENDER_STYLE_LABELS[k]}
                {k === defaultStyle ? " · défaut" : ""}
              </option>
            ))}
          </select>
        </div>
      </label>

      {/* Variants panel — only when concept is checked */}
      {checked && (
        <ConceptVariantsPanel
          theme={theme}
          baseLabel={title}
          baseRenderStyle={chosenStyle}
          variants={variants}
          selectedVariantKeys={selectedVariantKeys}
          onToggleVariant={onToggleVariant}
          onRegenerateVariants={onRegenerateVariants}
          onAddVariantFromIdea={onAddVariantFromIdea}
          onUpdateVariant={onUpdateVariant}
          onDeleteVariant={onDeleteVariant}
        />
      )}
    </div>
  );
}

// Looser shape that matches both ConceptVariant from brief-schema and the
// ephemeral variants for presets/customs (same fields).
type ConceptVariantClient = {
  id: string;
  name: string;
  description: string;
  render_style?: RenderStyle;
};

/**
 * Variants panel for a concept — multi-select base + variants, regenerate N
 * variants, modify with own idea, edit / delete per variant. Pluggable
 * operations via callbacks (server actions vs. local state).
 */
function ConceptVariantsPanel({
  theme,
  baseLabel,
  baseRenderStyle,
  variants,
  selectedVariantKeys,
  onToggleVariant,
  onRegenerateVariants,
  onAddVariantFromIdea,
  onUpdateVariant,
  onDeleteVariant,
}: {
  theme: ConceptCardTheme;
  baseLabel: string;
  baseRenderStyle: RenderStyle;
  variants: ConceptVariantClient[];
  selectedVariantKeys: Set<string>;
  onToggleVariant: (variantKey: string, on: boolean) => void;
  onRegenerateVariants: (count: number) => void | Promise<void>;
  onAddVariantFromIdea: (idea: string) => void | Promise<void>;
  onUpdateVariant: (
    variantId: string,
    updated: { name: string; description: string; render_style?: RenderStyle }
  ) => void | Promise<void>;
  onDeleteVariant: (variantId: string) => void | Promise<void>;
}) {
  const themeClasses = CONCEPT_THEME[theme];
  const [pending, setPending] = useState(false);
  const [count, setCount] = useState<number>(5);
  const [idea, setIdea] = useState<string>("");
  const [showIdea, setShowIdea] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callRegenerate() {
    setError(null);
    setPending(true);
    try {
      await onRegenerateVariants(count);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function callAddFromIdea() {
    const trimmed = idea.trim();
    if (!trimmed) return;
    setError(null);
    setPending(true);
    try {
      await onAddVariantFromIdea(trimmed);
      setIdea("");
      setShowIdea(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function callDelete(variantId: string) {
    setPending(true);
    try {
      await onDeleteVariant(variantId);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`border-t ${themeClasses.panelBorder} bg-[var(--color-background)]/60 px-3 pb-3 pt-2`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Variantes visuelles
          </span>
          <span className="rounded bg-[var(--color-primary)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
            {selectedVariantKeys.size} sélectionné
            {selectedVariantKeys.size > 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={count}
            disabled={pending}
            onChange={(ev) => setCount(parseInt(ev.target.value, 10))}
            className="rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1 text-[10px] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
            title="Nombre de variantes à produire"
          >
            {[3, 5, 8].map((n) => (
              <option key={n} value={n}>
                {n} variantes
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={callRegenerate}
            disabled={pending}
            className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/15 px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/25 disabled:opacity-50"
            title={
              variants.length > 0
                ? "Remplacer toutes les variantes existantes"
                : "Générer N variantes"
            }
          >
            {pending
              ? "⏳"
              : variants.length > 0
              ? "🔄 Régénérer"
              : "✨ Générer"}
          </button>
          <button
            type="button"
            onClick={() => setShowIdea((s) => !s)}
            disabled={pending}
            className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
            title="Donner une idée perso pour modifier le concept"
          >
            💡 Mon idée
          </button>
        </div>
      </div>

      {/* Idea input — appears when "💡 Mon idée" is toggled */}
      {showIdea && (
        <div className="mb-2 rounded-md border-2 border-amber-500/40 bg-amber-500/5 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-amber-300">
              💡 Décris la modification
            </span>
            <button
              type="button"
              onClick={() => {
                setShowIdea(false);
                setIdea("");
              }}
              disabled={pending}
              className="rounded px-1 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/10 hover:text-[var(--color-foreground)] disabled:opacity-50"
              title="Annuler"
            >
              ✗
            </button>
          </div>
          <textarea
            value={idea}
            onChange={(ev) => setIdea(ev.target.value)}
            placeholder="Ex : 'Remplace le triangle par un coffre-fort dans une bibliothèque parisienne, garde le rendu Octane premium' ou 'Version UGC iPhone, un trentenaire qui parle face caméra'"
            rows={2}
            disabled={pending}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] focus:border-amber-400 focus:outline-none placeholder:text-[var(--color-muted-foreground)]/60 disabled:opacity-50"
          />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={callAddFromIdea}
              disabled={pending || !idea.trim()}
              className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-50"
            >
              {pending ? "⏳ Génération…" : "✓ Ajouter cette variante"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
          ⚠ {error}
        </p>
      )}

      {/* Base concept row */}
      <ConceptVariantRow
        label="Base"
        name={baseLabel}
        description={null}
        renderStyle={baseRenderStyle}
        checked={selectedVariantKeys.has("base")}
        onToggle={(on) => onToggleVariant("base", on)}
        isBase
      />

      {/* Generated variants */}
      {variants.map((v, i) => (
        <ConceptVariantRow
          key={v.id}
          label={`V${i + 1}`}
          name={v.name}
          description={v.description}
          renderStyle={v.render_style ?? baseRenderStyle}
          checked={selectedVariantKeys.has(v.id)}
          onToggle={(on) => onToggleVariant(v.id, on)}
          onEdit={() => setEditingId(v.id)}
          onDelete={() => callDelete(v.id)}
          editing={editingId === v.id}
          onSave={async (updated) => {
            await onUpdateVariant(v.id, updated);
          }}
          onCloseEdit={() => setEditingId(null)}
        />
      ))}

      {variants.length === 0 && !pending && (
        <p className="mt-2 text-[10px] italic text-[var(--color-muted-foreground)]">
          💡 Clique sur « ✨ Générer » pour explorer d&apos;autres
          réalisations visuelles, ou « 💡 Mon idée » pour guider la
          modification toi-même.
        </p>
      )}
    </div>
  );
}

/**
 * One row in the concept variants panel — base or variant. Shows name +
 * a description preview + render_style badge, a checkbox to add it to the
 * matrix, and optional edit/delete buttons.
 */
function ConceptVariantRow({
  label,
  name,
  description,
  renderStyle,
  checked,
  onToggle,
  isBase = false,
  onEdit,
  onDelete,
  editing = false,
  onSave,
  onCloseEdit,
}: {
  label: string;
  name: string;
  description: string | null;
  renderStyle?: RenderStyle;
  checked: boolean;
  onToggle: (on: boolean) => void;
  isBase?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  editing?: boolean;
  onSave?: (updated: {
    name: string;
    description: string;
    render_style?: RenderStyle;
  }) => void | Promise<void>;
  onCloseEdit?: () => void;
}) {
  if (editing && onSave && description !== null) {
    return (
      <ConceptVariantEditForm
        initial={{
          name,
          description,
          render_style: renderStyle,
        }}
        onSave={onSave}
        onClose={onCloseEdit ?? (() => {})}
      />
    );
  }
  return (
    <label
      className={`mt-1.5 flex cursor-pointer items-start gap-2 rounded-md border p-2 transition ${
        checked
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
          : "border-white/10 bg-[var(--color-background)] hover:bg-white/[0.03]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(ev) => onToggle(ev.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition ${
          checked
            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "border-white/30 bg-transparent"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition ${checked ? "opacity-100" : "opacity-0"}`}
        >
          <polyline points="4 10 8 14 16 6" />
        </svg>
      </span>

      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
          isBase
            ? "bg-amber-500/15 text-amber-300"
            : "bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
        }`}
      >
        {label}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--color-foreground)]">
            {name}
          </span>
          {renderStyle && (
            <span className="rounded bg-white/5 px-1 py-0.5 text-[9px] text-[var(--color-muted-foreground)]">
              {RENDER_STYLE_LABELS[renderStyle]}
            </span>
          )}
        </div>
        {description && (
          <div className="mt-0.5 line-clamp-2 text-[10px] text-[var(--color-muted-foreground)]">
            {description}
          </div>
        )}
      </div>

      {(onEdit || onDelete) && (
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(ev) => ev.preventDefault()}
        >
          {onEdit && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onEdit();
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/10 hover:text-[var(--color-foreground)]"
              title="Modifier"
            >
              ✏
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onDelete();
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-red-500/20 hover:text-red-300"
              title="Supprimer cette variante"
            >
              ✗
            </button>
          )}
        </div>
      )}
    </label>
  );
}

function ConceptVariantEditForm({
  initial,
  onSave,
  onClose,
}: {
  initial: { name: string; description: string; render_style?: RenderStyle };
  onSave: (updated: {
    name: string;
    description: string;
    render_style?: RenderStyle;
  }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [renderStyle, setRenderStyle] = useState<RenderStyle>(
    initial.render_style ?? "cinematic"
  );

  async function save() {
    if (!name.trim() || !description.trim()) return;
    setPending(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        render_style: renderStyle,
      });
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-1.5 rounded-md border-2 border-amber-500/40 bg-amber-500/5 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-amber-300">
          ✏ Édition variante visuelle
        </span>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/10 hover:text-[var(--color-foreground)] disabled:opacity-50"
          title="Annuler"
        >
          ✗
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(ev) => setName(ev.target.value)}
        placeholder="Nom court (ex : 'Coffre-fort suisse')"
        className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
      />
      <textarea
        value={description}
        onChange={(ev) => setDescription(ev.target.value)}
        placeholder="Description visuelle (en anglais, dense)"
        rows={4}
        className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] focus:border-[var(--color-primary)] focus:outline-none"
      />
      <div className="mb-1.5 flex items-center gap-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Style :
        </label>
        <select
          value={renderStyle}
          onChange={(ev) => setRenderStyle(ev.target.value as RenderStyle)}
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        >
          {RENDER_STYLE_KEYS.map((k) => (
            <option key={k} value={k}>
              {RENDER_STYLE_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-muted-foreground)] transition hover:bg-white/5 disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !name.trim() || !description.trim()}
          className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "✓ Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function toggleStr(prev: Set<string>, id: string, on: boolean): Set<string> {
  const next = new Set(prev);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

// =============================================================================
// Custom angle / concept cards
// =============================================================================

function AddCard({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[6rem] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-white/15 p-3 text-xs text-[var(--color-muted-foreground)] transition hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-foreground)]"
    >
      {label}
    </button>
  );
}

/**
 * Custom angle card — two-mode UX :
 *  1. DRAFT mode (validated:false) : the user types name + headline + body + cta.
 *     A "✓ Valider" button enables once the headline is non-empty. No variants
 *     UI yet — the form needs the angle locked to know what to ask Claude.
 *  2. VALIDATED mode (validated:true) : the inputs lock, a variants panel
 *     unlocks. The user can generate / select / edit / delete variants exactly
 *     like a brief angle, except all operations are CLIENT-SIDE — variants are
 *     generated by a server action that returns them but persists nothing.
 *     A "↩ Modifier" button rolls the card back to draft (variants kept).
 *
 *  selectedCopyKeys is the parent's set of selected copies for THIS custom
 *  angle index ; an unvalidated custom angle uses the implicit default of
 *  {"base"} (shown as locked-in below the inputs to avoid surprising counters).
 */
function CustomAngleCard({
  briefId,
  value,
  onChange,
  onRemove,
  selectedCopyKeys,
  onToggleCopy,
}: {
  briefId: string;
  value: CustomAngleInput;
  onChange: (next: CustomAngleInput) => void;
  onRemove: () => void;
  selectedCopyKeys: Set<string>;
  onToggleCopy: (copyKey: string, on: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState<number>(5);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = value.headline.trim().length > 0;
  const validated = !!value.validated;
  const variants = value.copy_variants ?? [];

  function callGenerateOrRegenerate() {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateCustomAngleCopyVariants(briefId, {
          name: value.name,
          headline: value.headline,
          body: value.body,
          cta: value.cta,
          count,
        });
        onChange({ ...value, copy_variants: result });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function callDeleteVariant(variantId: string) {
    onChange({
      ...value,
      copy_variants: variants.filter((v) => v.id !== variantId),
    });
  }

  function callUpdateVariant(
    variantId: string,
    updated: { headline: string; body?: string; cta?: string }
  ) {
    onChange({
      ...value,
      copy_variants: variants.map((v) =>
        v.id === variantId ? { ...v, ...updated } : v
      ),
    });
  }

  // ---------------- DRAFT MODE ----------------
  if (!validated) {
    return (
      <div
        className={`relative rounded-xl border-2 p-3 transition ${
          valid
            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/40"
            : "border-amber-500/40 bg-amber-500/5"
        }`}
      >
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-[10px] text-[var(--color-muted-foreground)] hover:bg-red-500/20 hover:text-red-300"
          title="Supprimer"
        >
          ✗
        </button>
        <div className="mb-2 flex items-center gap-1.5 pr-7">
          <span className="rounded-md bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--color-primary)]">
            PERSO
          </span>
          <span className="text-xs font-semibold text-[var(--color-foreground)]">
            Angle personnalisé — brouillon
          </span>
        </div>
        <input
          type="text"
          value={value.name}
          onChange={(ev) => onChange({ ...value, name: ev.target.value })}
          placeholder="Nom court (optionnel)"
          className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
        <textarea
          value={value.headline}
          onChange={(ev) => onChange({ ...value, headline: ev.target.value })}
          placeholder="Headline / accroche — ex : 'Le Livret A vous appauvrit en silence'"
          rows={2}
          className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--color-muted-foreground)]/60"
        />
        <input
          type="text"
          value={value.body ?? ""}
          onChange={(ev) => onChange({ ...value, body: ev.target.value })}
          placeholder="Body (optionnel) — 1 phrase argumentée"
          className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--color-muted-foreground)]/60"
        />
        <input
          type="text"
          value={value.cta ?? ""}
          onChange={(ev) => onChange({ ...value, cta: ev.target.value })}
          placeholder="CTA (optionnel) — ex : 'Découvrir comment'"
          className="mb-2 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[11px] focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--color-muted-foreground)]/60"
        />

        <div className="flex items-center justify-between gap-2">
          {!valid ? (
            <p className="text-[10px] text-amber-300">
              Headline obligatoire pour valider.
            </p>
          ) : (
            <p className="text-[10px] text-[var(--color-muted-foreground)]">
              💡 Valide pour débloquer la génération de variantes.
            </p>
          )}
          <button
            type="button"
            onClick={() => onChange({ ...value, validated: true })}
            disabled={!valid}
            className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/15 px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/25 disabled:opacity-50"
          >
            ✓ Valider
          </button>
        </div>
      </div>
    );
  }

  // ---------------- VALIDATED MODE ----------------
  return (
    <div className="relative rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/30">
      {/* Locked summary header */}
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--color-primary)]">
              PERSO
            </span>
            <span className="text-sm font-semibold text-[var(--color-foreground)]">
              {value.name.trim() || "Angle personnalisé"}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Angle personnalisé écrit par toi — variantes générées sur demande
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ ...value, validated: false })}
            disabled={pending}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/10 hover:text-[var(--color-foreground)] disabled:opacity-50"
            title="Re-modifier les inputs"
          >
            ↩ Modifier
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
            title="Supprimer cet angle"
          >
            ✗
          </button>
        </div>
      </div>

      {/* Variants panel */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 pb-3 pt-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Variantes copy
            </span>
            <span className="rounded bg-[var(--color-primary)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
              {selectedCopyKeys.size} sélectionné
              {selectedCopyKeys.size > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={count}
              disabled={pending}
              onChange={(ev) => setCount(parseInt(ev.target.value, 10))}
              className="rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1 text-[10px] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
              title="Nombre de variantes à produire"
            >
              {[3, 5, 8].map((n) => (
                <option key={n} value={n}>
                  {n} variantes
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={callGenerateOrRegenerate}
              disabled={pending}
              className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/15 px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/25 disabled:opacity-50"
              title={
                variants.length > 0
                  ? "Remplacer toutes les variantes existantes"
                  : "Générer N variantes"
              }
            >
              {pending
                ? "⏳ Génération…"
                : variants.length > 0
                ? "🔄 Régénérer"
                : "✨ Générer"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
            ⚠ {error}
          </p>
        )}

        {/* Base copy (the user's typed angle) */}
        <CopyRow
          label="Base"
          copy={{
            headline: value.headline,
            body: value.body,
            cta: value.cta,
          }}
          checked={selectedCopyKeys.has("base")}
          onToggle={(on) => onToggleCopy("base", on)}
          isBase
        />

        {/* Generated variants — local mutations */}
        {variants.map((v, i) => (
          <CopyRow
            key={v.id}
            label={`V${i + 1}`}
            copy={v}
            checked={selectedCopyKeys.has(v.id)}
            onToggle={(on) => onToggleCopy(v.id, on)}
            onEdit={() => setEditingId(v.id)}
            onDelete={() => callDeleteVariant(v.id)}
            editing={editingId === v.id}
            onSave={(updated) => callUpdateVariant(v.id, updated)}
            onCloseEdit={() => setEditingId(null)}
          />
        ))}

        {variants.length === 0 && !pending && (
          <p className="mt-2 text-[10px] italic text-[var(--color-muted-foreground)]">
            💡 Clique sur « ✨ Générer » pour explorer d&apos;autres
            formulations sur cet angle perso.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Custom concept card — same dual-mode UX as CustomAngleCard :
 *  1. DRAFT : user types name + description + render_style. Validate to lock.
 *  2. VALIDATED : variants panel unlocks (ephemeral via server action).
 */
function CustomConceptCard({
  briefId,
  value,
  onChange,
  onRemove,
  selectedVariantKeys,
  onToggleVariant,
}: {
  briefId: string;
  value: CustomConceptInput;
  onChange: (next: CustomConceptInput) => void;
  onRemove: () => void;
  selectedVariantKeys: Set<string>;
  onToggleVariant: (variantKey: string, on: boolean) => void;
}) {
  const valid = value.description.trim().length > 0;
  const validated = !!value.validated;

  // -------- DRAFT MODE --------
  if (!validated) {
    return (
      <div
        className={`relative rounded-xl border-2 p-3 transition ${
          valid
            ? "border-amber-400 bg-amber-500/5 ring-1 ring-amber-400/40"
            : "border-amber-500/40 bg-amber-500/5"
        }`}
      >
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-[10px] text-[var(--color-muted-foreground)] hover:bg-red-500/20 hover:text-red-300"
          title="Supprimer"
        >
          ✗
        </button>
        <div className="mb-2 flex items-center gap-1.5 pr-7">
          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">
            PERSO
          </span>
          <span className="text-xs font-semibold text-[var(--color-foreground)]">
            Concept personnalisé — brouillon
          </span>
        </div>
        <input
          type="text"
          value={value.name}
          onChange={(ev) => onChange({ ...value, name: ev.target.value })}
          placeholder="Nom court (ex : 'Sablier en cristal')"
          className="mb-1.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
        <textarea
          value={value.description}
          onChange={(ev) =>
            onChange({ ...value, description: ev.target.value })
          }
          placeholder="Description visuelle — ex : 'un sablier en cristal qui se vide sur fond noir profond, lumière dramatique de côté, particules de poussière flottantes, photo macro Hasselblad'"
          rows={3}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--color-muted-foreground)]/60"
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Style :
          </label>
          <select
            value={value.render_style}
            onChange={(ev) =>
              onChange({
                ...value,
                render_style: ev.target.value as RenderStyle,
              })
            }
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
          >
            {RENDER_STYLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {RENDER_STYLE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {!valid ? (
            <p className="text-[10px] text-amber-300">
              Description obligatoire pour valider.
            </p>
          ) : (
            <p className="text-[10px] text-[var(--color-muted-foreground)]">
              💡 Valide pour débloquer la génération de variantes.
            </p>
          )}
          <button
            type="button"
            onClick={() => onChange({ ...value, validated: true })}
            disabled={!valid}
            className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
          >
            ✓ Valider
          </button>
        </div>
      </div>
    );
  }

  // -------- VALIDATED MODE --------
  const conceptName = value.name.trim() || "Concept personnalisé";
  const variants = value.concept_variants ?? [];

  return (
    <div className="relative rounded-xl border-2 border-amber-400 bg-amber-500/5 ring-1 ring-amber-400/40">
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">
              PERSO
            </span>
            <span className="text-sm font-semibold text-[var(--color-foreground)]">
              {conceptName}
            </span>
            <span className="rounded bg-white/5 px-1 py-0.5 text-[9px] text-[var(--color-muted-foreground)]">
              {RENDER_STYLE_LABELS[value.render_style]}
            </span>
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-[var(--color-muted-foreground)]">
            {value.description}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ ...value, validated: false })}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/10 hover:text-[var(--color-foreground)]"
            title="Re-modifier"
          >
            ↩ Modifier
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-red-500/20 hover:text-red-300"
            title="Supprimer ce concept"
          >
            ✗
          </button>
        </div>
      </div>

      <ConceptVariantsPanel
        theme="custom"
        baseLabel={conceptName}
        baseRenderStyle={value.render_style}
        variants={variants}
        selectedVariantKeys={selectedVariantKeys}
        onToggleVariant={onToggleVariant}
        onRegenerateVariants={async (count) => {
          const result = await generateEphemeralConceptVariants(briefId, {
            name: conceptName,
            rationale: "Concept personnalisé écrit par l'utilisateur",
            description: value.description,
            render_style: value.render_style,
            count,
          });
          onChange({ ...value, concept_variants: result });
        }}
        onAddVariantFromIdea={async (idea) => {
          const result = await generateEphemeralConceptVariantFromIdea(
            briefId,
            {
              name: conceptName,
              rationale: "Concept personnalisé écrit par l'utilisateur",
              description: value.description,
              render_style: value.render_style,
              idea,
            }
          );
          onChange({
            ...value,
            concept_variants: [...variants, result],
          });
        }}
        onUpdateVariant={async (variantId, updated) => {
          onChange({
            ...value,
            concept_variants: variants.map((v) =>
              v.id === variantId ? { ...v, ...updated } : v
            ),
          });
        }}
        onDeleteVariant={async (variantId) => {
          onChange({
            ...value,
            concept_variants: variants.filter((v) => v.id !== variantId),
          });
        }}
      />
    </div>
  );
}
