/**
 * Agent knowledge — données enrichissantes injectées dans le contexte de
 * chaque agent au runtime.
 *
 * 4 kinds :
 *   - reference     : doc de référence (à lire pour s'imprégner du contexte)
 *   - good_example  : livrable réussi (à imiter)
 *   - anti_example  : mauvais livrable (à ne pas refaire)
 *   - rule          : règle métier explicite (« toujours faire X, ne jamais Y »)
 *
 * loadKnowledgeForAgent() retourne un bloc markdown structuré prêt à être
 * concaténé au system prompt. On limite à `maxItems` pour éviter de gonfler
 * le contexte au-delà du raisonnable.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentKey } from "./model-routing";

export type KnowledgeKind =
  | "reference"
  | "good_example"
  | "anti_example"
  | "rule";

export interface AgentKnowledgeRow {
  id: string;
  user_id: string;
  agent_key: string;
  kind: KnowledgeKind;
  title: string;
  content_md: string;
  tags: string[] | null;
  weight: number;
  is_active: boolean;
  source_note: string | null;
  created_at: string;
  updated_at: string;
}

const KIND_LABELS: Record<KnowledgeKind, string> = {
  reference: "📚 Références",
  good_example: "✅ Bons exemples (à imiter)",
  anti_example: "❌ Anti-exemples (à éviter)",
  rule: "📐 Règles métier",
};

const KIND_ORDER: KnowledgeKind[] = [
  "rule",
  "good_example",
  "anti_example",
  "reference",
];

// ── CRUD ───────────────────────────────────────────────────────────────────
export async function addKnowledge(
  supabase: SupabaseClient,
  args: {
    userId: string;
    agentKey: AgentKey;
    kind: KnowledgeKind;
    title: string;
    contentMd: string;
    tags?: string[];
    weight?: number;
    sourceNote?: string;
  }
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("agent_knowledge")
    .insert({
      user_id: args.userId,
      agent_key: args.agentKey,
      kind: args.kind,
      title: args.title,
      content_md: args.contentMd,
      tags: args.tags ?? null,
      weight: args.weight ?? 1,
      source_note: args.sourceNote ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "insert failed" };
  return { id: data.id as string };
}

export async function listKnowledge(
  supabase: SupabaseClient,
  args: { userId: string; agentKey: AgentKey; onlyActive?: boolean }
): Promise<AgentKnowledgeRow[]> {
  let q = supabase
    .from("agent_knowledge")
    .select("*")
    .eq("user_id", args.userId)
    .eq("agent_key", args.agentKey)
    .order("kind", { ascending: true })
    .order("weight", { ascending: false })
    .order("created_at", { ascending: false });
  if (args.onlyActive !== false) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentKnowledgeRow[];
}

export async function deleteKnowledge(
  supabase: SupabaseClient,
  args: { userId: string; id: string }
): Promise<void> {
  await supabase
    .from("agent_knowledge")
    .delete()
    .eq("id", args.id)
    .eq("user_id", args.userId);
}

export async function toggleKnowledgeActive(
  supabase: SupabaseClient,
  args: { userId: string; id: string; isActive: boolean }
): Promise<void> {
  await supabase
    .from("agent_knowledge")
    .update({ is_active: args.isActive })
    .eq("id", args.id)
    .eq("user_id", args.userId);
}

// ── Bloc à injecter dans le system prompt ─────────────────────────────────
/**
 * Charge les knowledge actifs et les formate en un bloc markdown structuré
 * destiné à être concaténé au system prompt de l'agent.
 *
 * `maxItemsPerKind` permet de capper la taille du contexte (par défaut 8 par
 * kind, classés par weight décroissant puis date).
 *
 * Retourne une chaîne vide si l'agent n'a aucun knowledge actif.
 */
export async function loadKnowledgeForAgent(
  supabase: SupabaseClient,
  args: { userId: string; agentKey: AgentKey; maxItemsPerKind?: number }
): Promise<string> {
  const rows = await listKnowledge(supabase, {
    userId: args.userId,
    agentKey: args.agentKey,
    onlyActive: true,
  });
  if (rows.length === 0) return "";

  const cap = args.maxItemsPerKind ?? 8;
  const byKind = new Map<KnowledgeKind, AgentKnowledgeRow[]>();
  for (const k of KIND_ORDER) byKind.set(k, []);
  for (const row of rows) {
    const arr = byKind.get(row.kind as KnowledgeKind);
    if (arr) arr.push(row);
  }

  const parts: string[] = ["# Connaissance enrichie de l'agent"];
  parts.push(
    "> Cette section est entretenue par l'humain (Thibault). Tu la prends" +
      " comme **contexte additionnel non négociable** : les règles s'appliquent," +
      " les bons exemples sont à imiter, les anti-exemples à éviter."
  );
  let totalCount = 0;
  for (const kind of KIND_ORDER) {
    const items = (byKind.get(kind) ?? []).slice(0, cap);
    if (items.length === 0) continue;
    parts.push(`\n## ${KIND_LABELS[kind]}`);
    for (const it of items) {
      const tags =
        it.tags && it.tags.length > 0
          ? ` _(tags : ${it.tags.join(", ")})_`
          : "";
      const src = it.source_note ? ` — source : ${it.source_note}` : "";
      parts.push(`\n### ${it.title}${tags}${src}\n\n${it.content_md.trim()}`);
      totalCount++;
    }
  }
  if (totalCount === 0) return "";
  return parts.join("\n");
}

// ── Helper pour charger agent_memory (mémoire long terme) ─────────────────
/**
 * Charge la mémoire long terme d'un agent (table `agent_memory`, alimentée
 * par refineAgent). Retourne le markdown ou "" si absent.
 */
export async function loadAgentMemory(
  supabase: SupabaseClient,
  args: { userId: string; agentKey: AgentKey }
): Promise<{ contentMd: string; version: number } | null> {
  const { data } = await supabase
    .from("agent_memory")
    .select("content_md, version")
    .eq("user_id", args.userId)
    .eq("agent_key", args.agentKey)
    .maybeSingle();
  if (!data) return null;
  return {
    contentMd: (data.content_md as string) ?? "",
    version: (data.version as number) ?? 1,
  };
}

/**
 * Formate la mémoire long terme + le knowledge en un seul bloc markdown
 * destiné à être fusionné avec le body de l'agent (cf. prompt-cache).
 */
export function formatAgentIdentityExtras(args: {
  agentMemory: { contentMd: string; version: number } | null;
  knowledgeMarkdown: string;
}): string {
  const parts: string[] = [];
  if (args.agentMemory && args.agentMemory.contentMd.trim()) {
    parts.push(
      `# Mémoire long terme de l'agent (v${args.agentMemory.version})\n` +
        "> Distillée à partir des feedbacks accumulés. À traiter comme des" +
        " règles internalisées par toi.\n\n" +
        args.agentMemory.contentMd.trim()
    );
  }
  if (args.knowledgeMarkdown.trim()) {
    parts.push(args.knowledgeMarkdown.trim());
  }
  return parts.join("\n\n---\n\n");
}
