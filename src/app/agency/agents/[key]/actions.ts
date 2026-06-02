"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addKnowledge,
  deleteKnowledge,
  toggleKnowledgeActive,
  recordFeedback,
  commitRefinement,
  generateRefineProposal,
  AGENT_KEYS,
  type AgentKey,
  type KnowledgeKind,
  type Rating,
  type RefineProposal,
} from "@/lib/agents";

async function loadUserOr401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function assertAgentKey(key: string): AgentKey {
  if (!(AGENT_KEYS as readonly string[]).includes(key)) {
    redirect(
      `/agency/agents?error=${encodeURIComponent(`Agent inconnu : ${key}`)}`
    );
  }
  return key as AgentKey;
}

// ── KNOWLEDGE ─────────────────────────────────────────────────────────────
export async function addKnowledgeAction(key: string, formData: FormData) {
  const agentKey = assertAgentKey(key);
  const { supabase, userId } = await loadUserOr401();

  const title = String(formData.get("title") ?? "").trim();
  const contentMd = String(formData.get("content_md") ?? "").trim();
  const kind = String(formData.get("kind") ?? "reference") as KnowledgeKind;
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const sourceNote = String(formData.get("source_note") ?? "").trim();
  const weight = Number(formData.get("weight") ?? 1);
  const fileEntry = formData.get("file");
  const file =
    fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : undefined;

  if (!title) {
    redirect(
      `/agency/agents/${agentKey}?error=${encodeURIComponent("Titre requis")}`
    );
  }
  // contentMd OU file requis
  if (!contentMd && !file) {
    redirect(
      `/agency/agents/${agentKey}?error=${encodeURIComponent("Fournis un contenu markdown ou un fichier")}`
    );
  }

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  const res = await addKnowledge(supabase, {
    userId,
    agentKey,
    kind,
    title,
    contentMd,
    tags,
    weight,
    sourceNote: sourceNote || undefined,
    file,
  });
  if ("error" in res) {
    redirect(
      `/agency/agents/${agentKey}?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/agency/agents/${agentKey}`);
  redirect(`/agency/agents/${agentKey}`);
}

export async function deleteKnowledgeAction(
  key: string,
  knowledgeId: string
) {
  const agentKey = assertAgentKey(key);
  const { supabase, userId } = await loadUserOr401();
  await deleteKnowledge(supabase, { userId, id: knowledgeId });
  revalidatePath(`/agency/agents/${agentKey}`);
  redirect(`/agency/agents/${agentKey}`);
}

export async function toggleKnowledgeAction(
  key: string,
  knowledgeId: string,
  isActive: boolean
) {
  const agentKey = assertAgentKey(key);
  const { supabase, userId } = await loadUserOr401();
  await toggleKnowledgeActive(supabase, {
    userId,
    id: knowledgeId,
    isActive,
  });
  revalidatePath(`/agency/agents/${agentKey}`);
  redirect(`/agency/agents/${agentKey}`);
}

// ── FEEDBACK ──────────────────────────────────────────────────────────────
export async function recordFeedbackAction(key: string, formData: FormData) {
  const agentKey = assertAgentKey(key);
  const { supabase, userId } = await loadUserOr401();

  const runId = String(formData.get("run_id") ?? "").trim();
  if (!runId) {
    redirect(
      `/agency/agents/${agentKey}?error=${encodeURIComponent("run_id manquant")}`
    );
  }
  const ratingRaw = formData.get("rating");
  const rating =
    ratingRaw === "1" ? 1 : ratingRaw === "-1" ? -1 : ratingRaw === "0" ? 0 : undefined;
  const tag = (String(formData.get("tag") ?? "").trim() || undefined);
  const comment = (String(formData.get("comment") ?? "").trim() || undefined);
  const correctedMd =
    (String(formData.get("corrected_md") ?? "").trim() || undefined);

  const res = await recordFeedback(supabase, {
    userId,
    runId,
    agentKey,
    rating: rating as Rating | undefined,
    tag,
    comment,
    correctedMd,
  });
  if ("error" in res) {
    redirect(
      `/agency/agents/${agentKey}?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/agency/agents/${agentKey}`);
  redirect(`/agency/agents/${agentKey}`);
}

// ── REFINEMENT ────────────────────────────────────────────────────────────
/**
 * Génère une proposition d'affinage et redirige vers la page de preview.
 * On stocke la proposition en session ? non — on la regénère côté preview
 * pour rester stateless. C'est OK car c'est une action humaine ponctuelle.
 *
 * Implémenté ici sous forme de simple redirect vers /refine ; la page
 * /refine appellera generateRefineProposal côté serveur à l'affichage.
 */
export async function startRefineAction(key: string) {
  const agentKey = assertAgentKey(key);
  redirect(`/agency/agents/${agentKey}/refine`);
}

/**
 * Commit définitif d'une proposition. Le caller (page /refine) embarque la
 * proposition dans un champ caché du formulaire (sérialisée JSON) pour
 * éviter une seconde distillation au moment du commit.
 */
export async function commitRefineAction(key: string, formData: FormData) {
  const agentKey = assertAgentKey(key);
  const { supabase, userId } = await loadUserOr401();

  const proposalJson = String(formData.get("proposal_json") ?? "");
  if (!proposalJson) {
    redirect(
      `/agency/agents/${agentKey}/refine?error=${encodeURIComponent("Proposition manquante")}`
    );
  }
  let proposal: RefineProposal;
  try {
    proposal = JSON.parse(proposalJson) as RefineProposal;
  } catch (e) {
    redirect(
      `/agency/agents/${agentKey}/refine?error=${encodeURIComponent(
        "Proposition illisible : " + (e as Error).message
      )}`
    );
  }
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  const res = await commitRefinement({
    supabase,
    userId,
    proposal,
    notes,
  });
  if ("error" in res) {
    redirect(
      `/agency/agents/${agentKey}/refine?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/agency/agents/${agentKey}`);
  redirect(
    `/agency/agents/${agentKey}?refined=${encodeURIComponent(
      `Mémoire v${res.newVersion} commitée`
    )}`
  );
}

/**
 * Rejet d'une proposition : on marque quand même les feedbacks comme
 * examinés (ingested_at = now, version inchangée) pour ne pas les revoir.
 * Sinon ils reviendraient à chaque tentative.
 */
export async function rejectRefineAction(key: string, formData: FormData) {
  const agentKey = assertAgentKey(key);
  const { supabase, userId } = await loadUserOr401();
  const proposalJson = String(formData.get("proposal_json") ?? "");
  if (proposalJson) {
    try {
      const proposal = JSON.parse(proposalJson) as RefineProposal;
      // commitRefinement avec contenu inchangé → marque ingested sans bump
      await commitRefinement({
        supabase,
        userId,
        proposal: { ...proposal, proposedContentMd: proposal.currentContentMd },
        notes: "rejeté par l'humain",
      });
    } catch {
      // ignore — on a au moins essayé de marquer les feedbacks
    }
  }
  revalidatePath(`/agency/agents/${agentKey}`);
  redirect(
    `/agency/agents/${agentKey}?rejected=${encodeURIComponent("Proposition rejetée")}`
  );
}

// Forces TypeScript à utiliser le type même si on n'instancie pas explicitement.
export async function _internal_kindTouch(): Promise<KnowledgeKind> {
  return "reference";
}

// Pour referencer generateRefineProposal côté page sans la rendre publique
// (juste pour silence l'import inutilisé éventuel)
export const _generateRefineProposalRef = generateRefineProposal;
