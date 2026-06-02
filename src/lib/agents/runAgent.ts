/**
 * runAgent — orchestrateur d'un appel d'agent côté serveur.
 *
 * Responsabilités :
 *   1. Charger l'agent (frontmatter + body) depuis disque.
 *   2. Charger la mémoire client (7 fichiers) depuis `client_memory`.
 *   3. Construire les blocs `system` cacheables (préambule + agent + mémoire).
 *   4. Appeler l'API Anthropic avec le bon modèle (model-routing).
 *   5. Persister un `agent_runs` (running → done/failed, usage, coût).
 *   6. Optionnellement persister un `deliverables` avec le markdown produit.
 *   7. Mettre à jour `pipeline_steps` : in_progress → gate_pending (si gate
 *      sur l'agent) ou validated.
 *
 * NB : cette fonction ne décide PAS du contenu du livrable. C'est l'appelant
 * (la commande d'étape) qui fournit la `task` et précise s'il faut créer un
 * deliverable. Garde la couche générique.
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
import { chat, estimateCost, resolveAgentModel } from "../llm";
import type { SystemBlock, ChatBlock } from "../llm";

export interface RunAgentArgs {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  agentKey: AgentKey;
  stepKey: string;
  /** Tâche concrète demandée à l'agent pour cet appel (user turn). */
  task: string;
  /** Max output tokens. Par défaut 8000. */
  maxTokens?: number;
  /** Outils API à passer (web_search server tool, etc.). */
  tools?: unknown[];
  /** Bloc(s) additionnel(s) à injecter dans la mémoire éphémère (ex : LP). */
  extraMemoryMarkdown?: string;
  /**
   * Si true (défaut), charge automatiquement les documents client actifs
   * et les concatène à extraMemoryMarkdown via buildDocumentsContextMd.
   * Mettre false pour les étapes qui n'ont pas besoin (ex: compliance check
   * sur un asset précis).
   */
  includeClientDocuments?: boolean;
  /**
   * Si fourni, crée une ligne `deliverables` avec ces métadonnées + le
   * texte produit dans content_md.
   */
  deliverable?: {
    kind: string;
    title: string;
    structured?: unknown;
    filePaths?: string[];
  };
  /**
   * Si true, met à jour la ligne pipeline_steps :
   *   - has_gate selon le frontmatter de l'agent (ou gateOverride si fourni) ;
   *   - status :
   *     · 'gate_pending' si gate=true (en attente de validation humaine),
   *     · 'validated' sinon.
   * Si false, on laisse l'appelant gérer le pipeline_steps lui-même.
   */
  updatePipelineStep?: boolean;
  /**
   * Force le gate à true/false indépendamment du frontmatter de l'agent.
   * Utile quand la config pipeline considère qu'une étape doit attendre
   * validation humaine même si l'agent en lui-même n'a pas de gate.
   */
  gateOverride?: boolean;
}

export interface AgentRunResult {
  runId: string;
  text: string;
  deliverableId?: string;
  status: "done" | "failed";
  errorMessage?: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
  };
  costUsd: number;
  model: string;
}

/**
 * Charge les 7 fichiers mémoire d'un projet depuis client_memory.
 * Si une ligne manque, on traite comme chaîne vide (l'export concat
 * filtre les vides).
 */
async function loadClientMemory(
  supabase: SupabaseClient,
  projectId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("client_memory")
    .select("slug, content_md")
    .eq("project_id", projectId);
  if (error) throw new Error(`Lecture mémoire client échouée : ${error.message}`);
  const map: Partial<Record<MemorySlug, string>> = {};
  for (const row of data ?? []) {
    if (MEMORY_SLUGS.includes(row.slug as MemorySlug)) {
      map[row.slug as MemorySlug] = row.content_md ?? "";
    }
  }
  return concatMemory(map);
}

export async function runAgent(args: RunAgentArgs): Promise<AgentRunResult> {
  const {
    supabase,
    userId,
    projectId,
    agentKey,
    stepKey,
    task,
    maxTokens = 8000,
    tools,
    extraMemoryMarkdown,
    deliverable,
    updatePipelineStep = true,
    gateOverride,
    includeClientDocuments = true,
  } = args;
  const effectiveGate = (key: boolean | undefined, agentGate: boolean) =>
    typeof key === "boolean" ? key : agentGate;

  // ─── Charge agent + préambule + mémoires + documents ────────────────────
  const docsPromise = includeClientDocuments
    ? (async () => {
        const { buildDocumentsContextMd } = await import(
          "../agency/documents"
        );
        return buildDocumentsContextMd(supabase, { userId, projectId });
      })()
    : Promise.resolve("");
  const [agent, preamble, memoryMarkdown, agentMem, knowledgeMd, documentsMd] =
    await Promise.all([
      loadAgent(agentKey),
      loadCommonPreamble(),
      loadClientMemory(supabase, projectId),
      loadAgentMemory(supabase, { userId, agentKey }),
      loadKnowledgeForAgent(supabase, { userId, agentKey }),
      docsPromise,
    ]);
  // Skills : merge `skill` (singulier rétrocompat) et `skills` (liste)
  const skillNames: string[] = [
    ...(agent.frontmatter.skill ? [agent.frontmatter.skill] : []),
    ...(agent.frontmatter.skills ?? []),
  ];
  const skillsMd = await loadSkillsBundle(skillNames);
  const fullMemory = [memoryMarkdown, documentsMd, extraMemoryMarkdown ?? ""]
    .filter((s) => s.trim().length > 0)
    .join("\n\n---\n\n");
  const identityExtras = [
    skillsMd,
    formatAgentIdentityExtras({
      agentMemory: agentMem,
      knowledgeMarkdown: knowledgeMd,
    }),
  ]
    .filter((s) => s.trim().length > 0)
    .join("\n\n---\n\n");
  // Résolution du modèle effectif : override DB → frontmatter → default
  const { model, source: modelSource } = await resolveAgentModel(supabase, {
    userId,
    agentKey,
    frontmatterModel: agent.frontmatter.model,
  });

  // Blocs system unifiés (préambule / identité (body + memory + knowledge + skills)
  // / mémoire client). Marqués cacheable=true → l'adaptateur ajoute le marqueur
  // si le provider le supporte (Anthropic), sinon ignore proprement.
  const systemBlocks: SystemBlock[] = [];
  if (preamble.trim()) {
    systemBlocks.push({ text: preamble, cacheable: true });
  }
  const identityParts: string[] = [];
  if (agent.body.trim()) identityParts.push(agent.body.trim());
  if (identityExtras.trim()) identityParts.push("\n\n---\n\n" + identityExtras.trim());
  const identityText = identityParts.join("\n");
  if (identityText.trim()) {
    systemBlocks.push({ text: identityText, cacheable: true });
  }
  if (fullMemory.trim()) {
    systemBlocks.push({
      text: `# Mémoire client (source de vérité)\n\n${fullMemory}`,
      cacheable: true,
    });
  }

  // ─── Crée la ligne agent_runs en status 'running' ────────────────────────
  const { data: runRow, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      project_id: projectId,
      user_id: userId,
      step_key: stepKey,
      agent_key: agentKey,
      model,
      status: "running",
      input_snapshot: {
        task,
        agent: agent.frontmatter,
        memory_chars: fullMemory.length,
        identity_extras_chars: identityExtras.length,
        agent_memory_version: agentMem?.version ?? null,
        knowledge_used: knowledgeMd.length > 0,
        skills_loaded: skillNames,
        model_source: modelSource,
      },
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    throw new Error(
      `Impossible de créer agent_runs : ${runErr?.message ?? "unknown"}`
    );
  }
  const runId = runRow.id as string;

  // Marque pipeline_steps comme in_progress
  if (updatePipelineStep) {
    const hasGate = effectiveGate(gateOverride, agent.frontmatter.gate === true);
    await supabase
      .from("pipeline_steps")
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          step_key: stepKey,
          status: "in_progress",
          current_run_id: runId,
          has_gate: hasGate,
        },
        { onConflict: "project_id,step_key" }
      );
  }

  // ─── Appel LLM via la couche d'abstraction multi-provider ──────────────
  let text = "";
  let usage: AgentRunResult["usage"] = {
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
  };
  let outputBlocks: ChatBlock[] = [];
  try {
    const resp = await chat({
      model,
      systemBlocks,
      userMessage: task,
      maxTokens,
      tools,
    });
    text = resp.text;
    outputBlocks = resp.blocks;
    usage = resp.usage;
  } catch (err) {
    const msg = (err as Error).message;
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error_message: msg,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updatePipelineStep) {
      await supabase
        .from("pipeline_steps")
        .update({ status: "failed", current_run_id: runId })
        .eq("project_id", projectId)
        .eq("step_key", stepKey);
    }
    return {
      runId,
      text: "",
      status: "failed",
      errorMessage: msg,
      usage,
      costUsd: 0,
      model,
    };
  }

  const costUsd = estimateCost(model, usage);

  // ─── Persiste le deliverable si demandé ──────────────────────────────────
  let deliverableId: string | undefined;
  if (deliverable && text) {
    const { data: delivRow, error: delivErr } = await supabase
      .from("deliverables")
      .insert({
        project_id: projectId,
        user_id: userId,
        step_key: stepKey,
        agent_key: agentKey,
        kind: deliverable.kind,
        title: deliverable.title,
        content_md: text,
        structured: deliverable.structured ?? null,
        file_paths: deliverable.filePaths ?? null,
        run_id: runId,
      })
      .select("id")
      .single();
    if (!delivErr && delivRow) deliverableId = delivRow.id as string;
  }

  // ─── Marque agent_runs comme done + persiste l'output ────────────────────
  await supabase
    .from("agent_runs")
    .update({
      status: "done",
      output: { text, blocks: outputBlocks },
      deliverable_id: deliverableId ?? null,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      cache_read_tokens: usage.cache_read_tokens,
      cache_creation_tokens: usage.cache_creation_tokens,
      cost_estimate_usd: costUsd,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  // ─── Met à jour pipeline_steps selon le gate effectif ───────────────────
  if (updatePipelineStep) {
    const hasGate = effectiveGate(gateOverride, agent.frontmatter.gate === true);
    const nextStatus = hasGate ? "gate_pending" : "validated";
    const patch: Record<string, unknown> = {
      status: nextStatus,
      current_run_id: runId,
      has_gate: hasGate,
    };
    if (nextStatus === "validated") {
      patch.validated_at = new Date().toISOString();
      patch.validated_by = userId;
    }
    await supabase
      .from("pipeline_steps")
      .update(patch)
      .eq("project_id", projectId)
      .eq("step_key", stepKey);
  }

  return {
    runId,
    text,
    deliverableId,
    status: "done",
    usage,
    costUsd,
    model,
  };
}
