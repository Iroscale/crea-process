/**
 * refineAgent — moteur d'affinage d'un agent à partir des feedbacks
 * accumulés.
 *
 * Boucle complète :
 *   1. Charge agent_memory actuelle (peut être vide pour un agent neuf).
 *   2. Charge les feedbacks en attente (ingested_at IS NULL) avec leur
 *      contexte de run (task + output text).
 *   3. Appelle Claude (Sonnet) avec un prompt de distillateur : produit
 *      une **proposition** de nouvelle agent_memory + un résumé de changement.
 *   4. Renvoie la proposition au caller, **sans rien écrire** (preview).
 *   5. Si l'humain valide → commitRefinement() :
 *      - écrit la nouvelle version dans agent_memory (incrémente version)
 *      - archive l'ancienne dans agent_memory_history
 *      - marque les feedbacks comme ingested
 *
 * Règles non négociables du distillateur :
 *   - Ne pas perdre les règles existantes (uniquement enrichir/corriger).
 *   - Cap à 5 ajouts/modifications par refinement (anti-bloat).
 *   - Généraliser : un feedback isolé ne devient pas une règle ; un motif
 *     répété devient une règle.
 *   - Format markdown stable (sections fixes).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic, CLAUDE_MODEL } from "../anthropic";
import type { AgentKey } from "./model-routing";
import { loadAgent } from "./loader";
import {
  loadFeedbackWithRunContext,
  markFeedbackIngested,
  type AgentFeedbackRow,
} from "./feedback";

export interface RefineProposal {
  agentKey: AgentKey;
  currentVersion: number;
  currentContentMd: string;
  proposedContentMd: string;
  changeSummary: string;
  feedbackIds: string[];
  feedbackCount: number;
}

const REFINE_SYSTEM = `Tu es un **distillateur de pratique**. Tu lis :
  1. La mémoire long terme actuelle d'un agent (règles internalisées).
  2. Des feedbacks humains récents sur ses derniers livrables, avec leur
     contexte (la tâche, le livrable produit, la note, le commentaire, et
     parfois la version corrigée par l'humain).

Ta mission : produire une **nouvelle version de la mémoire long terme**
qui généralise les leçons des feedbacks tout en préservant strictement les
règles existantes utiles.

## Règles non négociables
- **Tu n'effaces pas une règle existante** sauf si plusieurs feedbacks
  récents la contredisent explicitement. Si tu modifies, tu motives.
- **Maximum 5 ajouts ou modifications** par refinement. Au-delà, c'est du
  bruit. Tu choisis les plus forts.
- **Un feedback isolé ne devient pas une règle.** Il faut au moins 2
  feedbacks convergents (ou 1 feedback explicite « règle métier ») pour
  formaliser une règle.
- **Tu reformules en règle générale**, pas en anecdote. Mauvais : « ne pas
  mettre 'imaginez' dans la LP du client X ». Bon : « éviter les
  ouvertures hypothétiques type 'imaginez' sauf brand voice explicite ».
- **Format markdown stable** : si une mémoire existante a déjà des
  sections (### Hooks, ### Rythme, ### Pièges…), tu réutilises les mêmes.
  Sinon, tu adoptes un découpage logique propre à l'agent concerné.
- **Pas de paraphrase inutile**. Tu écris des règles courtes et
  exécutables.

## Format de sortie obligatoire

Tu réponds **uniquement** avec ce gabarit (rien avant, rien après) :

\`\`\`
<NEW_MEMORY>
# Mémoire long terme — <agent_key>

(le markdown complet de la nouvelle version, sections et règles)
</NEW_MEMORY>

<CHANGE_SUMMARY>
- (1-5 puces décrivant ce qui change vs la version actuelle, en français)
</CHANGE_SUMMARY>
\`\`\`

Si tu juges qu'aucun changement n'est justifié (feedbacks trop faibles
ou contradictoires), tu réponds quand même avec ce gabarit, en remettant
la mémoire **inchangée** et en mettant dans CHANGE_SUMMARY :
\`- Aucun changement justifié à ce stade (raison : …)\`.`;

function buildRefineUserMessage(args: {
  agentKey: AgentKey;
  agentBody: string;
  currentMemoryMd: string;
  currentVersion: number;
  feedbacks: Array<
    AgentFeedbackRow & {
      run_task: string | null;
      run_output_text: string | null;
    }
  >;
}): string {
  const lines: string[] = [];
  lines.push(`# Agent : ${args.agentKey}`);
  lines.push("");
  lines.push("## System prompt actuel de l'agent (pour contexte)");
  lines.push("```markdown");
  lines.push(args.agentBody.trim());
  lines.push("```");
  lines.push("");
  lines.push(`## Mémoire long terme actuelle — v${args.currentVersion}`);
  if (args.currentMemoryMd.trim()) {
    lines.push("```markdown");
    lines.push(args.currentMemoryMd.trim());
    lines.push("```");
  } else {
    lines.push("_(vide — aucune mémoire formalisée pour l'instant)_");
  }
  lines.push("");
  lines.push(`## Feedbacks à distiller (${args.feedbacks.length})`);
  args.feedbacks.forEach((f, i) => {
    lines.push("");
    lines.push(
      `### Feedback ${i + 1} — rating ${f.rating ?? "?"} · tag : ${f.tag ?? "—"} · ${f.created_at}`
    );
    if (f.run_task) {
      lines.push("**Tâche demandée :**");
      lines.push("```");
      lines.push(f.run_task.trim().slice(0, 800));
      lines.push("```");
    }
    if (f.run_output_text) {
      lines.push("**Livrable produit (extrait) :**");
      lines.push("```");
      lines.push(f.run_output_text.trim().slice(0, 1500));
      lines.push("```");
    }
    if (f.comment) {
      lines.push(`**Commentaire humain :** ${f.comment.trim()}`);
    }
    if (f.corrected_md) {
      lines.push("**Version corrigée par l'humain :**");
      lines.push("```");
      lines.push(f.corrected_md.trim().slice(0, 1500));
      lines.push("```");
    }
  });
  lines.push("");
  lines.push(
    "Distille ces feedbacks en une **nouvelle version de la mémoire** selon le gabarit imposé."
  );
  return lines.join("\n");
}

/**
 * Génère une proposition de mémoire affinée sans rien écrire en base.
 * Le caller affiche le résultat à l'utilisateur (UI : diff + bouton "Commit").
 */
export async function generateRefineProposal(args: {
  supabase: SupabaseClient;
  userId: string;
  agentKey: AgentKey;
  maxFeedbacks?: number;
}): Promise<RefineProposal | { error: string }> {
  const { supabase, userId, agentKey, maxFeedbacks = 30 } = args;

  // 1. Charge agent body + mémoire actuelle
  const [agentDef, memoryRow] = await Promise.all([
    loadAgent(agentKey),
    supabase
      .from("agent_memory")
      .select("content_md, version")
      .eq("user_id", userId)
      .eq("agent_key", agentKey)
      .maybeSingle(),
  ]);
  const currentContentMd = (memoryRow.data?.content_md as string) ?? "";
  const currentVersion = (memoryRow.data?.version as number) ?? 0;

  // 2. Charge feedbacks pending
  const feedbacks = await loadFeedbackWithRunContext(supabase, {
    userId,
    agentKey,
    onlyPending: true,
    limit: maxFeedbacks,
  });

  if (feedbacks.length === 0) {
    return {
      agentKey,
      currentVersion,
      currentContentMd,
      proposedContentMd: currentContentMd,
      changeSummary:
        "- Aucun feedback en attente — rien à distiller pour le moment.",
      feedbackIds: [],
      feedbackCount: 0,
    };
  }

  // 3. Appel Claude
  const client = getAnthropic();
  const userMsg = buildRefineUserMessage({
    agentKey,
    agentBody: agentDef.body,
    currentMemoryMd: currentContentMd,
    currentVersion,
    feedbacks,
  });

  let raw = "";
  try {
    const resp = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: REFINE_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    raw = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n\n")
      .trim();
  } catch (e) {
    return { error: `Distillation Claude a échoué : ${(e as Error).message}` };
  }

  // 4. Parse la sortie selon le gabarit
  const newMemoryMatch = raw.match(/<NEW_MEMORY>\s*([\s\S]*?)\s*<\/NEW_MEMORY>/);
  const changeMatch = raw.match(
    /<CHANGE_SUMMARY>\s*([\s\S]*?)\s*<\/CHANGE_SUMMARY>/
  );
  if (!newMemoryMatch || !changeMatch) {
    return {
      error:
        "Format de réponse invalide : <NEW_MEMORY> et/ou <CHANGE_SUMMARY> manquants.",
    };
  }
  const proposedContentMd = newMemoryMatch[1].trim();
  const changeSummary = changeMatch[1].trim();

  return {
    agentKey,
    currentVersion,
    currentContentMd,
    proposedContentMd,
    changeSummary,
    feedbackIds: feedbacks.map((f) => f.id),
    feedbackCount: feedbacks.length,
  };
}

/**
 * Commit une proposition validée par l'humain :
 *  - upsert agent_memory avec le nouveau content_md (version++)
 *  - archive l'ancienne version dans agent_memory_history
 *  - marque les feedbacks comme ingested_at = now()
 */
export async function commitRefinement(args: {
  supabase: SupabaseClient;
  userId: string;
  proposal: RefineProposal;
  notes?: string;
}): Promise<{ newVersion: number } | { error: string }> {
  const { supabase, userId, proposal, notes } = args;

  if (proposal.proposedContentMd.trim() === "" ||
      proposal.proposedContentMd.trim() === proposal.currentContentMd.trim()) {
    // Pas de changement utile → on marque quand même les feedbacks comme
    // examinés, sinon on les reverra à chaque distillation.
    if (proposal.feedbackIds.length > 0) {
      await markFeedbackIngested(supabase, {
        userId,
        feedbackIds: proposal.feedbackIds,
        version: proposal.currentVersion,
      });
    }
    return { newVersion: proposal.currentVersion };
  }

  const newVersion = proposal.currentVersion + 1;

  // 1. Archive ancienne version si elle existait
  if (proposal.currentContentMd.trim() && proposal.currentVersion >= 1) {
    await supabase.from("agent_memory_history").insert({
      user_id: userId,
      agent_key: proposal.agentKey,
      version: proposal.currentVersion,
      content_md: proposal.currentContentMd,
      refined_from_feedback_ids: null,
      notes: "snapshot avant refinement",
    });
  }

  // 2. Upsert nouvelle version
  const { error: upsertErr } = await supabase
    .from("agent_memory")
    .upsert(
      {
        user_id: userId,
        agent_key: proposal.agentKey,
        content_md: proposal.proposedContentMd,
        version: newVersion,
      },
      { onConflict: "user_id,agent_key" }
    );
  if (upsertErr) return { error: `upsert agent_memory : ${upsertErr.message}` };

  // 3. Snapshot de la nouvelle version dans l'historique avec lineage
  await supabase.from("agent_memory_history").insert({
    user_id: userId,
    agent_key: proposal.agentKey,
    version: newVersion,
    content_md: proposal.proposedContentMd,
    refined_from_feedback_ids: proposal.feedbackIds,
    refined_by: userId,
    notes:
      notes ?? proposal.changeSummary.slice(0, 500),
  });

  // 4. Marque feedbacks comme ingested
  if (proposal.feedbackIds.length > 0) {
    await markFeedbackIngested(supabase, {
      userId,
      feedbackIds: proposal.feedbackIds,
      version: newVersion,
    });
  }

  return { newVersion };
}
