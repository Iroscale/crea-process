/**
 * P0.3 — Items structurés des livrables.
 *
 * Chaque livrable « structuré » est décomposé en items individuellement
 * validables (proposed → validated / rejected). L'aval consomme les items
 * VALIDÉS, jamais du texte libre.
 *
 * 4 kinds :
 *   - angle          (étape 02)  : angle marketing avec levier, ICP, hooks
 *   - script         (étape 04)  : script vidéo rattaché à un angle
 *   - primary-text   (étape 04b) : texte Meta au-dessus de la créa
 *   - image-concept  (étape 05)  : concept visuel rattaché à un angle
 *
 * Le rattachement amont (script → angle, etc.) est porté par
 * structured.angle_ref (item_key) + parent_item_id (uuid résolu à
 * l'insertion).
 */
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ItemKind = "angle" | "script" | "primary-text" | "image-concept";
export type ItemStatus = "proposed" | "validated" | "rejected" | "archived";

// ── Schémas zod par kind ──────────────────────────────────────────────────

export const angleItemSchema = z.object({
  item_key: z
    .string()
    .regex(/^[a-z0-9-]+$/, "slug kebab-case attendu")
    .describe("Slug stable, ex: angle-fiscalite-claire"),
  title: z.string().min(3),
  angle: z.string().describe("L'angle marketing en 1 phrase punchy"),
  rationale: z.string().describe("Pourquoi ça peut convertir"),
  lever: z
    .string()
    .describe(
      "Levier psychologique : urgence / peur / statut / social proof / FOMO / simplicité / pédagogie / aspiration"
    ),
  icp_target: z.string().describe("ICP visé (ex: 'ICP 1' ou nom court)"),
  hooks: z.array(z.string()).min(1).describe("1-3 hooks prêts à utiliser"),
  proofs: z.array(z.string()).describe("Preuves mobilisables"),
  formats: z
    .array(z.string())
    .describe("Formats recommandés : video founder, image, UGC, carrousel…"),
  funnel_stage: z.enum(["TOF", "MOF", "BOF"]),
});

export const scriptItemSchema = z.object({
  item_key: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  angle_ref: z
    .string()
    .describe("item_key de l'angle validé auquel ce script est rattaché"),
  duration: z.string().describe("Durée cible, ex: '30s', '60s', '90s'"),
  hook: z.string().describe("Phrase d'ouverture (2 premières secondes)"),
  script_md: z
    .string()
    .describe("Script complet plan par plan, format markdown"),
  cta: z.string().describe("CTA final"),
});

export const primaryTextItemSchema = z.object({
  item_key: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  angle_ref: z.string().describe("item_key de l'angle"),
  script_ref: z
    .string()
    .nullable()
    .optional()
    .describe("item_key du script rattaché (optionnel)"),
  length: z.enum(["court", "moyen", "long"]),
  text: z.string().describe("Le primary text complet"),
  hook_first_line: z
    .string()
    .describe("Première ligne = hook visible avant le 'voir plus' Meta"),
  cta: z.string(),
});

export const imageConceptItemSchema = z.object({
  item_key: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  angle_ref: z.string().describe("item_key de l'angle"),
  icp_target: z.string(),
  lever: z.string(),
  format: z.string().describe("single image | carrousel"),
  hook_on_image: z
    .string()
    .describe("La grosse phrase qu'on lit en 0,5s sur le visuel"),
  subtext: z.string().nullable().optional(),
  visual_prompt: z
    .string()
    .describe("Prompt visuel précis pour le générateur d'images"),
  meta_caption: z.string().describe("Légende Meta sous le visuel"),
  cta_button: z.string(),
  funnel_stage: z.enum(["TOF", "MOF", "BOF"]),
});

export const ITEM_SCHEMAS: Record<ItemKind, z.ZodTypeAny> = {
  angle: angleItemSchema,
  script: scriptItemSchema,
  "primary-text": primaryTextItemSchema,
  "image-concept": imageConceptItemSchema,
};

/** Description du format JSON attendu, injectée dans le prompt de l'agent. */
export const ITEM_JSON_INSTRUCTIONS: Record<ItemKind, string> = {
  angle: `Chaque item du tableau "items" a EXACTEMENT ces champs :
{
  "item_key": "angle-<slug-kebab-case>",
  "title": "Titre court de l'angle",
  "angle": "L'angle marketing en 1 phrase punchy",
  "rationale": "Pourquoi ça peut convertir (2-3 phrases)",
  "lever": "urgence | peur | statut | social proof | FOMO | simplicité | pédagogie | aspiration",
  "icp_target": "ICP 1 (ou nom court de l'ICP)",
  "hooks": ["hook 1 prêt à utiliser", "hook 2"],
  "proofs": ["preuve mobilisable 1", "preuve 2"],
  "formats": ["video founder", "image"],
  "funnel_stage": "TOF" | "MOF" | "BOF"
}`,
  script: `Chaque item du tableau "items" a EXACTEMENT ces champs :
{
  "item_key": "script-<duree>-<slug-angle>",
  "title": "Titre du script",
  "angle_ref": "item_key EXACT de l'angle validé fourni dans le contexte",
  "duration": "60s",
  "hook": "Phrase d'ouverture (2 premières secondes)",
  "script_md": "Script complet plan par plan en markdown (### [01] …)",
  "cta": "CTA final"
}`,
  "primary-text": `Chaque item du tableau "items" a EXACTEMENT ces champs :
{
  "item_key": "ptext-<longueur>-<slug-angle>",
  "title": "Titre court",
  "angle_ref": "item_key EXACT de l'angle validé",
  "script_ref": "item_key du script rattaché ou null",
  "length": "court" | "moyen" | "long",
  "text": "Le primary text complet (la 1ère ligne EST le hook)",
  "hook_first_line": "Première ligne (visible avant le 'voir plus' Meta)",
  "cta": "CTA"
}`,
  "image-concept": `Chaque item du tableau "items" a EXACTEMENT ces champs :
{
  "item_key": "concept-<n>-<slug-angle>",
  "title": "Titre du concept",
  "angle_ref": "item_key EXACT de l'angle validé",
  "icp_target": "ICP visé",
  "lever": "levier psychologique",
  "format": "single image | carrousel",
  "hook_on_image": "La phrase lue en 0,5s sur le visuel",
  "subtext": "Sous-texte ou null",
  "visual_prompt": "Prompt visuel précis pour le générateur d'images",
  "meta_caption": "Légende Meta (3-5 phrases)",
  "cta_button": "Texte du bouton",
  "funnel_stage": "TOF" | "MOF" | "BOF"
}`,
};

// ── Rendu markdown par kind ───────────────────────────────────────────────

type AnyItem = Record<string, unknown>;

function renderAngleMd(it: AnyItem): string {
  const hooks = ((it.hooks as string[]) ?? []).map((h) => `  - « ${h} »`).join("\n");
  const proofs = ((it.proofs as string[]) ?? []).map((p) => `  - ${p}`).join("\n");
  return `### ${it.title}
- **Angle** : ${it.angle}
- **Pourquoi ça marche** : ${it.rationale}
- **Levier** : ${it.lever} · **Cible** : ${it.icp_target} · **Funnel** : ${it.funnel_stage}
- **Hooks prêts** :
${hooks}
- **Preuves** :
${proofs}
- **Formats** : ${((it.formats as string[]) ?? []).join(", ")}`;
}

function renderScriptMd(it: AnyItem): string {
  return `### ${it.title} (${it.duration})
- **Angle** : \`${it.angle_ref}\` · **Hook** : « ${it.hook} »
- **CTA** : ${it.cta}

${it.script_md}`;
}

function renderPrimaryTextMd(it: AnyItem): string {
  return `### ${it.title} (${it.length})
- **Angle** : \`${it.angle_ref}\`${it.script_ref ? ` · **Script** : \`${it.script_ref}\`` : ""}
- **Hook 1ère ligne** : « ${it.hook_first_line} »
- **CTA** : ${it.cta}

${it.text}`;
}

function renderImageConceptMd(it: AnyItem): string {
  return `### ${it.title}
- **Angle** : \`${it.angle_ref}\` · **Cible** : ${it.icp_target} · **Levier** : ${it.lever}
- **Format** : ${it.format} · **Funnel** : ${it.funnel_stage}
- **Hook sur l'image** : « ${it.hook_on_image} »${it.subtext ? `\n- **Sous-texte** : ${it.subtext}` : ""}
- **Prompt visuel** : ${it.visual_prompt}
- **Légende Meta** : ${it.meta_caption}
- **Bouton CTA** : ${it.cta_button}`;
}

export function renderItemMd(kind: ItemKind, structured: AnyItem): string {
  switch (kind) {
    case "angle":
      return renderAngleMd(structured);
    case "script":
      return renderScriptMd(structured);
    case "primary-text":
      return renderPrimaryTextMd(structured);
    case "image-concept":
      return renderImageConceptMd(structured);
  }
}

const KIND_TITLES: Record<ItemKind, string> = {
  angle: "Angles marketing",
  script: "Scripts vidéo",
  "primary-text": "Textes publicitaires (primary texts)",
  "image-concept": "Concepts image",
};

/** Rendu du livrable complet depuis ses items. */
export function renderDeliverableMd(
  kind: ItemKind,
  items: Array<{ structured: AnyItem; status: string }>
): string {
  const parts = [`# ${KIND_TITLES[kind]} (${items.length})`];
  for (const it of items) {
    parts.push("");
    parts.push(renderItemMd(kind, it.structured));
  }
  return parts.join("\n");
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export interface DeliverableItemRow {
  id: string;
  deliverable_id: string;
  project_id: string;
  item_key: string;
  kind: ItemKind;
  title: string;
  content_md: string;
  structured: AnyItem | null;
  status: ItemStatus;
  parent_item_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * Insère une liste d'items structurés pour un livrable. Résout
 * parent_item_id à partir des refs (angle_ref / script_ref).
 * En cas de collision d'item_key sur le projet, suffixe -2, -3…
 */
export async function insertItems(
  supabase: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    deliverableId: string;
    kind: ItemKind;
    items: AnyItem[];
  }
): Promise<{ inserted: number } | { error: string }> {
  const { userId, projectId, deliverableId, kind, items } = args;

  // Item_keys déjà pris sur ce projet (contrainte unique)
  const { data: existing } = await supabase
    .from("deliverable_items")
    .select("item_key, id")
    .eq("project_id", projectId);
  const taken = new Set((existing ?? []).map((r) => r.item_key as string));
  const keyToId = new Map(
    (existing ?? []).map((r) => [r.item_key as string, r.id as string])
  );

  let inserted = 0;
  let position = 0;
  for (const raw of items) {
    let itemKey = String(raw.item_key ?? `item-${position}`);
    let n = 2;
    while (taken.has(itemKey)) {
      itemKey = `${raw.item_key}-${n++}`;
    }
    taken.add(itemKey);

    // Résolution du parent (angle_ref prioritaire, sinon script_ref)
    const parentRef =
      (raw.angle_ref as string | undefined) ??
      (raw.script_ref as string | undefined) ??
      null;
    const parentId = parentRef ? (keyToId.get(parentRef) ?? null) : null;

    const contentMd = renderItemMd(kind, raw);
    const { data: ins, error } = await supabase
      .from("deliverable_items")
      .insert({
        deliverable_id: deliverableId,
        project_id: projectId,
        user_id: userId,
        item_key: itemKey,
        kind,
        title: String(raw.title ?? itemKey),
        content_md: contentMd,
        structured: raw,
        status: "proposed",
        parent_item_id: parentId,
        position: position++,
      })
      .select("id")
      .single();
    if (error) return { error: `insert item ${itemKey} : ${error.message}` };
    if (ins) keyToId.set(itemKey, ins.id as string);
    inserted++;
  }
  return { inserted };
}

export async function listItemsForDeliverable(
  supabase: SupabaseClient,
  deliverableId: string
): Promise<DeliverableItemRow[]> {
  const { data } = await supabase
    .from("deliverable_items")
    .select("*")
    .eq("deliverable_id", deliverableId)
    .order("position", { ascending: true });
  return (data ?? []) as DeliverableItemRow[];
}

/**
 * Items validés d'un kind donné sur un projet — c'est la source des
 * multi-selects de consommation aval (étape scripts lit les angles
 * validés, etc.).
 */
export async function listValidatedItems(
  supabase: SupabaseClient,
  args: { projectId: string; kind: ItemKind }
): Promise<DeliverableItemRow[]> {
  const { data } = await supabase
    .from("deliverable_items")
    .select("*")
    .eq("project_id", args.projectId)
    .eq("kind", args.kind)
    .eq("status", "validated")
    .order("position", { ascending: true });
  return (data ?? []) as DeliverableItemRow[];
}

export async function setItemStatus(
  supabase: SupabaseClient,
  args: { userId: string; itemId: string; status: ItemStatus }
): Promise<void> {
  await supabase
    .from("deliverable_items")
    .update({ status: args.status })
    .eq("id", args.itemId)
    .eq("user_id", args.userId);
}

export async function updateItemContent(
  supabase: SupabaseClient,
  args: {
    userId: string;
    itemId: string;
    structured: AnyItem;
    kind: ItemKind;
  }
): Promise<{ error?: string }> {
  const parsed = ITEM_SCHEMAS[args.kind].safeParse(args.structured);
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; "),
    };
  }
  const contentMd = renderItemMd(args.kind, parsed.data as AnyItem);
  await supabase
    .from("deliverable_items")
    .update({
      structured: parsed.data,
      content_md: contentMd,
      title: String((parsed.data as AnyItem).title ?? ""),
    })
    .eq("id", args.itemId)
    .eq("user_id", args.userId);
  return {};
}

/**
 * Recalcule le content_md du livrable depuis ses items non-rejetés et
 * le met à jour (sans bump de version : c'est un rendu dérivé).
 */
export async function rerenderDeliverableFromItems(
  supabase: SupabaseClient,
  args: { deliverableId: string; kind: ItemKind }
): Promise<void> {
  const items = await listItemsForDeliverable(supabase, args.deliverableId);
  const visible = items.filter(
    (i) => i.status !== "rejected" && i.status !== "archived"
  );
  const md = renderDeliverableMd(
    args.kind,
    visible.map((i) => ({ structured: i.structured ?? {}, status: i.status }))
  );
  await supabase
    .from("deliverables")
    .update({ content_md: md })
    .eq("id", args.deliverableId);
}
