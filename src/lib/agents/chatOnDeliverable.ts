/**
 * P0.2 — Chat itératif sur un livrable.
 *
 * L'opérateur discute avec l'agent de l'étape à propos d'UN livrable
 * précis. Le contexte injecté :
 *   - préambule commun Agency OS
 *   - identité de l'agent de l'étape (body + skills + agent_memory + knowledge)
 *   - mémoire client (7 fichiers)
 *   - LE LIVRABLE COURANT (contenu complet)
 *   - instruction de rôle : itération, réponse avec <UPDATED_DELIVERABLE>
 *     si une modification est demandée
 *
 * Quand la réponse contient <UPDATED_DELIVERABLE>…</UPDATED_DELIVERABLE>,
 * le contenu proposé est extrait et stocké sur le message assistant
 * (proposed_content_md). L'application est un choix EXPLICITE de
 * l'opérateur (bouton « Appliquer cette version » → nouvelle version du
 * livrable via updateDeliverableVersioned, source 'chat').
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AgentKey } from "./model-routing";
import { loadAgent, loadCommonPreamble } from "./loader";
import { MEMORY_SLUGS, concatMemory, type MemorySlug } from "./memory-schema";
import {
  loadKnowledgeForAgent,
  loadAgentMemory,
  formatAgentIdentityExtras,
} from "./knowledge";
import { loadSkillsBundle } from "./skills";
import { chat, resolveAgentModel } from "../llm";
import type { SystemBlock, ChatTurn } from "../llm";

const HISTORY_CAP = 20;

const ITERATION_INSTRUCTION = `# Rôle de cette conversation

Tu itères sur le livrable ci-dessus avec l'opérateur de l'agence. Règles :

- Quand l'opérateur pose une **question** ou demande un **avis** : réponds
  normalement, de façon concise et utile. N'inclus PAS de balise.
- Quand l'opérateur demande une **modification** du livrable : réponds avec
  ton raisonnement COURT (2-4 phrases max sur ce que tu changes et pourquoi),
  PUIS le livrable complet mis à jour entre balises :

<UPDATED_DELIVERABLE>
(le livrable ENTIER, pas un extrait — il remplacera la version courante)
</UPDATED_DELIVERABLE>

- Le livrable entre balises doit rester complet et autonome : même format,
  toutes les sections, pas de « … reste inchangé ».
- Conserve la langue française et les contraintes du préambule (conformité
  finance régulée, anti-IA-ish).`;

export interface DeliverableChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposed_content_md: string | null;
  applied_version: number | null;
  created_at: string;
}

/** Extrait le contenu entre balises <UPDATED_DELIVERABLE>. */
export function extractUpdatedDeliverable(text: string): string | null {
  const m = text.match(
    /<UPDATED_DELIVERABLE>\s*([\s\S]*?)\s*<\/UPDATED_DELIVERABLE>/
  );
  return m ? m[1].trim() : null;
}

/** Retire le bloc balisé du texte affiché dans le chat (gardé à part). */
export function stripUpdatedDeliverable(text: string): string {
  return text
    .replace(/<UPDATED_DELIVERABLE>[\s\S]*?<\/UPDATED_DELIVERABLE>/, "")
    .trim();
}

async function loadClientMemory(
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

export async function chatOnDeliverable(args: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  deliverableId: string;
  userMessage: string;
}): Promise<
  | { assistantText: string; proposedContentMd: string | null }
  | { error: string }
> {
  const { supabase, userId, projectId, deliverableId, userMessage } = args;

  // 1. Charge le livrable + son agent
  const { data: deliv } = await supabase
    .from("deliverables")
    .select("id, content_md, title, kind, step_key, agent_key, version")
    .eq("id", deliverableId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!deliv) return { error: "Livrable introuvable" };
  const agentKey = deliv.agent_key as AgentKey;

  // 2. Charge le contexte complet (mêmes briques que runAgent)
  const [agent, preamble, memoryMarkdown, agentMem, knowledgeMd] =
    await Promise.all([
      loadAgent(agentKey),
      loadCommonPreamble(),
      loadClientMemory(supabase, projectId),
      loadAgentMemory(supabase, { userId, agentKey }),
      loadKnowledgeForAgent(supabase, { userId, agentKey }),
    ]);
  const skillNames: string[] = [
    ...(agent.frontmatter.skill ? [agent.frontmatter.skill] : []),
    ...(agent.frontmatter.skills ?? []),
  ];
  const skillsMd = await loadSkillsBundle(skillNames);
  const identityExtras = [
    skillsMd,
    formatAgentIdentityExtras({
      agentMemory: agentMem,
      knowledgeMarkdown: knowledgeMd,
    }),
  ]
    .filter((s) => s.trim().length > 0)
    .join("\n\n---\n\n");

  const { model } = await resolveAgentModel(supabase, {
    userId,
    agentKey,
    frontmatterModel: agent.frontmatter.model,
  });

  const systemBlocks: SystemBlock[] = [];
  if (preamble.trim()) systemBlocks.push({ text: preamble, cacheable: true });
  const identityParts: string[] = [];
  if (agent.body.trim()) identityParts.push(agent.body.trim());
  if (identityExtras.trim()) identityParts.push(identityExtras.trim());
  if (identityParts.length > 0) {
    systemBlocks.push({
      text: identityParts.join("\n\n---\n\n"),
      cacheable: true,
    });
  }
  if (memoryMarkdown.trim()) {
    systemBlocks.push({
      text: `# Mémoire client (source de vérité)\n\n${memoryMarkdown}`,
      cacheable: true,
    });
  }
  // Le livrable courant + l'instruction d'itération (non cacheable : change
  // à chaque application de version)
  systemBlocks.push({
    text: `# Livrable en cours d'itération

**Titre** : ${deliv.title}
**Type** : ${deliv.kind} · **Étape** : ${deliv.step_key} · **Version** : v${deliv.version}

---

${deliv.content_md}

---

${ITERATION_INSTRUCTION}`,
    cacheable: false,
  });

  // 3. Historique (20 derniers tours)
  const { data: rawHistory } = await supabase
    .from("deliverable_messages")
    .select("role, content")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_CAP);
  const history: ChatTurn[] = (rawHistory ?? [])
    .reverse()
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));

  // 4. Persiste le message user AVANT l'appel (traçabilité même si erreur)
  await supabase.from("deliverable_messages").insert({
    deliverable_id: deliverableId,
    project_id: projectId,
    user_id: userId,
    role: "user",
    content: userMessage,
  });

  // 5. Appel LLM
  let assistantRaw = "";
  try {
    const resp = await chat({
      model,
      systemBlocks,
      history,
      userMessage,
      maxTokens: 8000,
    });
    assistantRaw = resp.text;
  } catch (e) {
    return { error: `Appel agent échoué : ${(e as Error).message}` };
  }
  if (!assistantRaw.trim()) {
    return { error: "Réponse vide de l'agent" };
  }

  // 6. Extrait la proposition éventuelle + persiste le message assistant
  const proposedContentMd = extractUpdatedDeliverable(assistantRaw);
  const displayText = proposedContentMd
    ? stripUpdatedDeliverable(assistantRaw) ||
      "(proposition de mise à jour du livrable ci-dessous)"
    : assistantRaw;

  await supabase.from("deliverable_messages").insert({
    deliverable_id: deliverableId,
    project_id: projectId,
    user_id: userId,
    role: "assistant",
    content: displayText,
    proposed_content_md: proposedContentMd,
  });

  return { assistantText: displayText, proposedContentMd };
}

/** Liste les messages du chat d'un livrable. */
export async function listDeliverableMessages(
  supabase: SupabaseClient,
  deliverableId: string
): Promise<DeliverableChatMessage[]> {
  const { data } = await supabase
    .from("deliverable_messages")
    .select("id, role, content, proposed_content_md, applied_version, created_at")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: true });
  return (data ?? []) as DeliverableChatMessage[];
}
