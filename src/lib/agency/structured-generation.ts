/**
 * P0.3 — Génération structurée : sortie JSON validée zod + 1 retry.
 *
 * Pour les étapes structurées (angles, scripts, primary texts, concepts
 * image), l'agent répond en JSON strict. Ce module :
 *   1. construit l'instruction de format injectée dans la task,
 *   2. parse la sortie (tolère les fences ```json et le texte autour),
 *   3. valide avec zod,
 *   4. retry 1 fois en renvoyant l'erreur de parsing au modèle,
 *   5. insère les deliverable_items et re-rend le content_md du livrable.
 */
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, resolveAgentModel } from "../llm";
import type { SystemBlock } from "../llm";
import { loadAgent, loadCommonPreamble } from "../agents/loader";
import {
  MEMORY_SLUGS,
  concatMemory,
  type MemorySlug,
} from "../agents/memory-schema";
import type { AgentKey } from "../agents/model-routing";
import {
  ITEM_SCHEMAS,
  ITEM_JSON_INSTRUCTIONS,
  insertItems,
  rerenderDeliverableFromItems,
  updateItemContent,
  type ItemKind,
} from "./items";

/**
 * Bloc d'instruction ajouté à la task de l'agent pour obtenir du JSON.
 */
export function buildStructuredInstruction(kind: ItemKind): string {
  return `

# FORMAT DE SORTIE OBLIGATOIRE — JSON STRICT

Tu réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant/après,
pas de fence markdown). Structure :

{
  "items": [ … ]
}

${ITEM_JSON_INSTRUCTIONS[kind]}

Règles :
- item_key : slug kebab-case stable et unique (a-z, 0-9, tirets).
- Tous les champs sont remplis — pas de placeholder, pas de champ vide.
- Le contenu reste en français, conforme au préambule (finance régulée).
- AUCUN texte hors du JSON.`;
}

/** Extrait et parse le JSON d'une sortie LLM (tolère fences + texte). */
function extractJson(text: string): unknown {
  let candidate = text.trim();
  // Fence ```json … ```
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidate = fence[1].trim();
  // Sinon, repère le premier { et le dernier }
  if (!candidate.startsWith("{")) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) candidate = candidate.slice(start, end + 1);
  }
  return JSON.parse(candidate);
}

export interface ParsedItems {
  items: Record<string, unknown>[];
}

/** Parse + valide la sortie. Retourne l'erreur exploitable pour le retry. */
export function parseItemsOutput(
  text: string,
  kind: ItemKind
): { items: Record<string, unknown>[] } | { parseError: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { parseError: `JSON invalide : ${(e as Error).message}` };
  }
  const envelope = z.object({ items: z.array(ITEM_SCHEMAS[kind]).min(1) });
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(" ; ");
    return { parseError: `Validation échouée : ${issues}` };
  }
  return { items: parsed.data.items as Record<string, unknown>[] };
}

/**
 * Post-traitement d'un run structuré :
 *   parse → retry si invalide → insertion items → re-rendu du livrable.
 *
 * Le retry est un appel LLM minimal (pas un re-run complet) : on renvoie
 * la sortie brute + l'erreur au modèle qui corrige le JSON.
 */
export async function processStructuredOutput(
  supabase: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    deliverableId: string;
    kind: ItemKind;
    rawText: string;
    model: string;
  }
): Promise<{ inserted: number } | { error: string }> {
  const { userId, projectId, deliverableId, kind, rawText, model } = args;

  // 1er essai
  let parsed = parseItemsOutput(rawText, kind);

  // Retry unique : on renvoie l'erreur au modèle
  if ("parseError" in parsed) {
    try {
      const fix = await chat({
        model,
        systemBlocks: [
          {
            text:
              "Tu corriges une sortie JSON invalide. Réponds UNIQUEMENT avec " +
              "le JSON corrigé, sans texte autour, sans fence markdown. " +
              "Conserve l'intégralité du contenu — tu ne corriges QUE le format.",
            cacheable: false,
          },
        ],
        userMessage: `Sortie à corriger :\n\n${rawText}\n\nErreur de validation :\n${parsed.parseError}\n\nFormat attendu :\n{ "items": [ … ] }\n${ITEM_JSON_INSTRUCTIONS[kind]}`,
        maxTokens: 8000,
      });
      parsed = parseItemsOutput(fix.text, kind);
    } catch (e) {
      return {
        error: `Sortie JSON invalide et retry échoué : ${(e as Error).message}`,
      };
    }
  }
  if ("parseError" in parsed) {
    return { error: `Sortie JSON invalide après retry : ${parsed.parseError}` };
  }

  // Insertion des items
  const ins = await insertItems(supabase, {
    userId,
    projectId,
    deliverableId,
    kind,
    items: parsed.items,
  });
  if ("error" in ins) return ins;

  // Le content_md du livrable devient le rendu des items
  await rerenderDeliverableFromItems(supabase, { deliverableId, kind });

  return { inserted: ins.inserted };
}

// ── Régénération / ajout d'items ciblés ──────────────────────────────────

async function loadClientMemoryMd(
  supabase: SupabaseClient,
  projectId: string
): Promise<string> {
  const { data } = await supabase
    .from("client_memory")
    .select("slug, content_md")
    .eq("project_id", projectId);
  const map: Partial<Record<MemorySlug, string>> = {};
  for (const row of data ?? []) {
    if (MEMORY_SLUGS.includes(row.slug as MemorySlug)) {
      map[row.slug as MemorySlug] = row.content_md ?? "";
    }
  }
  return concatMemory(map);
}

async function buildItemAgentContext(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; agentKey: AgentKey }
): Promise<{ systemBlocks: SystemBlock[]; model: string }> {
  const [agent, preamble, memoryMd] = await Promise.all([
    loadAgent(args.agentKey),
    loadCommonPreamble(),
    loadClientMemoryMd(supabase, args.projectId),
  ]);
  const { model } = await resolveAgentModel(supabase, {
    userId: args.userId,
    agentKey: args.agentKey,
    frontmatterModel: agent.frontmatter.model,
  });
  const systemBlocks: SystemBlock[] = [];
  if (preamble.trim()) systemBlocks.push({ text: preamble, cacheable: true });
  if (agent.body.trim())
    systemBlocks.push({ text: agent.body, cacheable: true });
  if (memoryMd.trim()) {
    systemBlocks.push({
      text: `# Mémoire client (source de vérité)\n\n${memoryMd}`,
      cacheable: true,
    });
  }
  return { systemBlocks, model };
}

/**
 * Régénère UN item avec son contexte (livrable parent + instruction
 * optionnelle de l'opérateur). Met à jour l'item en place (status repasse
 * à 'proposed' si l'opérateur l'avait rejeté).
 */
export async function regenerateSingleItem(
  supabase: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    itemId: string;
    instruction?: string;
  }
): Promise<{ ok: true } | { error: string }> {
  const { userId, projectId, itemId, instruction } = args;

  const { data: item } = await supabase
    .from("deliverable_items")
    .select("id, item_key, kind, content_md, structured, deliverable_id")
    .eq("id", itemId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!item) return { error: "Item introuvable" };
  const kind = item.kind as ItemKind;

  const { data: deliv } = await supabase
    .from("deliverables")
    .select("agent_key, content_md")
    .eq("id", item.deliverable_id as string)
    .maybeSingle();
  if (!deliv) return { error: "Livrable parent introuvable" };

  const { systemBlocks, model } = await buildItemAgentContext(supabase, {
    userId,
    projectId,
    agentKey: deliv.agent_key as AgentKey,
  });

  const userMessage = `Voici un item à régénérer (améliorer), au sein du livrable suivant.

# Livrable complet (pour contexte et cohérence)
${deliv.content_md}

# Item à régénérer (item_key: ${item.item_key})
${item.content_md}

${instruction ? `# Consigne de l'opérateur\n${instruction}\n` : ""}
# FORMAT DE SORTIE — JSON STRICT
Réponds UNIQUEMENT avec : { "items": [ <l'item régénéré, UN SEUL> ] }
Garde le même item_key (« ${item.item_key} ») et le même angle_ref le cas
échéant. Améliore le contenu, pas la structure.
${ITEM_JSON_INSTRUCTIONS[kind]}`;

  let parsed: ReturnType<typeof parseItemsOutput>;
  try {
    const resp = await chat({ model, systemBlocks, userMessage, maxTokens: 8000 });
    parsed = parseItemsOutput(resp.text, kind);
    if ("parseError" in parsed) {
      // retry unique
      const fix = await chat({
        model,
        systemBlocks: [
          {
            text: "Tu corriges une sortie JSON invalide. Réponds UNIQUEMENT avec le JSON corrigé.",
            cacheable: false,
          },
        ],
        userMessage: `Sortie :\n${resp.text}\n\nErreur :\n${parsed.parseError}\n\nFormat : { "items": [ … ] }\n${ITEM_JSON_INSTRUCTIONS[kind]}`,
        maxTokens: 8000,
      });
      parsed = parseItemsOutput(fix.text, kind);
    }
  } catch (e) {
    return { error: `Appel agent échoué : ${(e as Error).message}` };
  }
  if ("parseError" in parsed) {
    return { error: `JSON invalide après retry : ${parsed.parseError}` };
  }
  const newItem = parsed.items[0];
  if (!newItem) return { error: "Aucun item dans la réponse" };
  // Conserve l'item_key d'origine quoi qu'il arrive
  newItem.item_key = item.item_key;

  const upd = await updateItemContent(supabase, {
    userId,
    itemId,
    structured: newItem,
    kind,
  });
  if (upd.error) return { error: upd.error };

  // L'item régénéré redevient 'proposed' (à re-valider)
  await supabase
    .from("deliverable_items")
    .update({ status: "proposed" })
    .eq("id", itemId);

  await rerenderDeliverableFromItems(supabase, {
    deliverableId: item.deliverable_id as string,
    kind,
  });
  return { ok: true };
}

/**
 * « Propose-m'en N de plus » : génère des items additionnels différents
 * des existants, les insère en 'proposed'.
 */
export async function generateMoreItems(
  supabase: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    deliverableId: string;
    count: number;
    instruction?: string;
  }
): Promise<{ inserted: number } | { error: string }> {
  const { userId, projectId, deliverableId, count, instruction } = args;

  const { data: deliv } = await supabase
    .from("deliverables")
    .select("agent_key, content_md, kind")
    .eq("id", deliverableId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!deliv) return { error: "Livrable introuvable" };

  // Déduit le kind depuis les items existants
  const { data: existing } = await supabase
    .from("deliverable_items")
    .select("kind")
    .eq("deliverable_id", deliverableId)
    .limit(1);
  const kind = (existing?.[0]?.kind as ItemKind) ?? null;
  if (!kind) return { error: "Aucun item existant — relance l'étape complète" };

  const { systemBlocks, model } = await buildItemAgentContext(supabase, {
    userId,
    projectId,
    agentKey: deliv.agent_key as AgentKey,
  });

  const userMessage = `Voici le livrable existant. Propose ${count} item(s) SUPPLÉMENTAIRE(S),
clairement différents des existants (autres leviers / autres approches).

# Livrable existant
${deliv.content_md}

${instruction ? `# Consigne de l'opérateur\n${instruction}\n` : ""}
# FORMAT DE SORTIE — JSON STRICT
Réponds UNIQUEMENT avec : { "items": [ … ${count} item(s) … ] }
item_key : nouveaux slugs (pas de collision avec les existants).
${ITEM_JSON_INSTRUCTIONS[kind]}`;

  let parsed: ReturnType<typeof parseItemsOutput>;
  try {
    const resp = await chat({ model, systemBlocks, userMessage, maxTokens: 8000 });
    parsed = parseItemsOutput(resp.text, kind);
    if ("parseError" in parsed) {
      const fix = await chat({
        model,
        systemBlocks: [
          {
            text: "Tu corriges une sortie JSON invalide. Réponds UNIQUEMENT avec le JSON corrigé.",
            cacheable: false,
          },
        ],
        userMessage: `Sortie :\n${resp.text}\n\nErreur :\n${parsed.parseError}\n\nFormat : { "items": [ … ] }\n${ITEM_JSON_INSTRUCTIONS[kind]}`,
        maxTokens: 8000,
      });
      parsed = parseItemsOutput(fix.text, kind);
    }
  } catch (e) {
    return { error: `Appel agent échoué : ${(e as Error).message}` };
  }
  if ("parseError" in parsed) {
    return { error: `JSON invalide après retry : ${parsed.parseError}` };
  }

  const ins = await insertItems(supabase, {
    userId,
    projectId,
    deliverableId,
    kind,
    items: parsed.items,
  });
  if ("error" in ins) return ins;
  await rerenderDeliverableFromItems(supabase, { deliverableId, kind });
  return { inserted: ins.inserted };
}
