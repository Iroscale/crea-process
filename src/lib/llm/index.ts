/**
 * Couche d'abstraction LLM multi-provider.
 *
 *   import { chat } from "@/lib/llm";
 *   const result = await chat({
 *     model: "claude-sonnet-4-6",
 *     systemBlocks: [...],
 *     userMessage: "...",
 *   });
 *
 * Le routing vers le bon SDK se fait via le catalogue (provider associé au
 * modèle). Ajouter un provider = (1) entries dans catalog.ts (2) adapter
 * <provider>-adapter.ts (3) case dans le switch ci-dessous.
 *
 * Aussi : helpers de résolution de modèle effectif pour un agent donné
 * (override DB → frontmatter → MODEL_BY_AGENT default).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MODEL_CATALOG,
  MODEL_BY_ID,
  getModelInfo,
  isProviderReady,
  PROVIDER_LABELS,
  TIER_LABELS,
  type LLMProvider,
  type ModelInfo,
} from "./catalog";
import type { ChatRequest, ChatResponse, ChatUsage } from "./types";
import { chatAnthropic } from "./anthropic-adapter";
import { chatOpenAI } from "./openai-adapter";
import { chatGoogle } from "./google-adapter";
import { chatDeepSeek } from "./deepseek-adapter";
import { resolveModel, type AgentKey } from "../agents/model-routing";

// Re-exports pratiques
export {
  MODEL_CATALOG,
  MODEL_BY_ID,
  getModelInfo,
  isProviderReady,
  PROVIDER_LABELS,
  TIER_LABELS,
};
export type { LLMProvider, ModelInfo };
export type {
  ChatRequest,
  ChatResponse,
  ChatUsage,
  SystemBlock,
  ChatBlock,
  ChatTurn,
} from "./types";

/**
 * P1.3 : une erreur est "réessayable" si elle est transitoire — réseau,
 * 429 (rate limit), 5xx, surcharge Anthropic (529 / overloaded).
 */
function isRetryableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  if (status && (status === 429 || status >= 500)) return true;
  return /overloaded|rate.?limit|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket hang up/i.test(
    msg
  );
}

/**
 * Point d'entrée unique : envoie une requête à un modèle, route vers
 * le bon adaptateur selon son provider catalogué.
 *
 * P1.3 : retry automatique unique (backoff 2 s) sur les erreurs
 * transitoires (réseau, 429, 5xx, surcharge).
 */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const info = getModelInfo(req.model);
  if (!info) {
    throw new Error(
      `Modèle inconnu : ${req.model}. Ajoute-le dans src/lib/llm/catalog.ts.`
    );
  }
  const dispatch = (): Promise<ChatResponse> => {
    switch (info.provider) {
      case "anthropic":
        return chatAnthropic(req);
      case "openai":
        return chatOpenAI(req);
      case "google":
        return chatGoogle(req);
      case "deepseek":
        return chatDeepSeek(req);
      default:
        throw new Error(`Provider non supporté : ${info.provider}`);
    }
  };

  try {
    return await dispatch();
  } catch (e) {
    if (!isRetryableError(e)) throw e;
    await new Promise((r) => setTimeout(r, 2000));
    return dispatch();
  }
}

/**
 * Estime le coût USD d'un appel à partir du catalogue.
 */
export function estimateCost(model: string, usage: ChatUsage): number {
  const info = getModelInfo(model);
  if (!info) return 0;
  const p = info.pricing;
  const total =
    (usage.prompt_tokens / 1_000_000) * p.input +
    (usage.completion_tokens / 1_000_000) * p.output +
    (usage.cache_read_tokens / 1_000_000) * p.cacheRead +
    (usage.cache_creation_tokens / 1_000_000) * p.cacheWrite;
  return Math.round(total * 10000) / 10000;
}

// ── Résolution du modèle effectif pour un agent ──────────────────────────
/**
 * Retourne le modèle qui sera utilisé pour cet agent, en cascade :
 *   1. Override en DB (agent_model_overrides) pour ce user
 *   2. Frontmatter de l'agent (.claude/agents/<key>.md)
 *   3. MODEL_BY_AGENT (model-routing.ts) par défaut
 *
 * Le caller passe `frontmatterModel` parce qu'il a déjà chargé l'agent.
 */
export async function resolveAgentModel(
  supabase: SupabaseClient,
  args: {
    userId: string;
    agentKey: AgentKey;
    frontmatterModel?: string;
  }
): Promise<{ model: string; source: "override" | "frontmatter" | "default" }> {
  const { data: override } = await supabase
    .from("agent_model_overrides")
    .select("model")
    .eq("user_id", args.userId)
    .eq("agent_key", args.agentKey)
    .maybeSingle();
  if (override?.model) {
    return { model: override.model as string, source: "override" };
  }
  if (args.frontmatterModel) {
    return { model: args.frontmatterModel, source: "frontmatter" };
  }
  return { model: resolveModel(args.agentKey), source: "default" };
}

export async function setAgentModelOverride(
  supabase: SupabaseClient,
  args: { userId: string; agentKey: AgentKey; model: string }
): Promise<{ error?: string }> {
  const info = getModelInfo(args.model);
  if (!info) return { error: `Modèle inconnu : ${args.model}` };
  const { error } = await supabase.from("agent_model_overrides").upsert(
    {
      user_id: args.userId,
      agent_key: args.agentKey,
      model: args.model,
      provider: info.provider,
    },
    { onConflict: "user_id,agent_key" }
  );
  return error ? { error: error.message } : {};
}

export async function clearAgentModelOverride(
  supabase: SupabaseClient,
  args: { userId: string; agentKey: AgentKey }
): Promise<void> {
  await supabase
    .from("agent_model_overrides")
    .delete()
    .eq("user_id", args.userId)
    .eq("agent_key", args.agentKey);
}
