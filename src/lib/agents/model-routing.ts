/**
 * Routage des modèles par agent.
 *
 * Règle générale : Sonnet par défaut, Opus pour les enjeux réglementaires
 * et les fondations (market-research), Haiku pour le volume mécanique.
 *
 * IMPORTANT : les noms de modèle dans `MODEL_BY_AGENT` ci-dessous sont ceux
 * proposés par le brief Agency OS. Si l'API Anthropic ne les reconnaît pas
 * (modèle pas encore lancé / mauvais alias), `resolveModel()` retombe sur
 * la constante existante `CLAUDE_MODEL` du projet (claude-sonnet-4-6).
 *
 * Pour migrer vers de nouveaux alias datés (ex : claude-sonnet-4-6-20251022)
 * il suffit de mettre à jour cette table — aucun appelant n'est impacté.
 */
import { CLAUDE_MODEL, CLAUDE_LIGHT_MODEL } from "../anthropic";

export type AgentKey =
  | "orchestrator"
  | "market-research"
  | "creative-strategist"
  | "copywriter"
  | "production-assistant"
  | "funnel-builder"
  | "video-editor"
  | "tracking"
  | "media-buyer"
  | "legal-compliance"
  | "learning-curator";

export const AGENT_KEYS: AgentKey[] = [
  "orchestrator",
  "market-research",
  "creative-strategist",
  "copywriter",
  "production-assistant",
  "funnel-builder",
  "video-editor",
  "tracking",
  "media-buyer",
  "legal-compliance",
  "learning-curator",
];

/**
 * Modèle souhaité par agent. À tenir à jour quand la doc Claude évolue.
 * Les agents qui ont besoin de plus de puissance sont mis sur Opus.
 */
export const MODEL_BY_AGENT: Record<AgentKey, string> = {
  orchestrator: CLAUDE_MODEL,
  "market-research": "claude-opus-4-8",
  "creative-strategist": CLAUDE_MODEL,
  copywriter: CLAUDE_MODEL,
  "production-assistant": CLAUDE_LIGHT_MODEL,
  "funnel-builder": CLAUDE_MODEL,
  "video-editor": CLAUDE_MODEL,
  tracking: CLAUDE_MODEL,
  "media-buyer": CLAUDE_MODEL,
  "legal-compliance": "claude-opus-4-8",
  "learning-curator": CLAUDE_MODEL,
};

/** Fallback safe si le modèle souhaité n'est pas reconnu côté API. */
export const FALLBACK_MODEL = CLAUDE_MODEL;

/**
 * Tarification approximative en USD / 1M tokens. Utilisée pour estimer le
 * coût d'un agent_run (champ cost_estimate_usd). Ajustable.
 * Si le modèle n'est pas répertorié, on tombe sur le Sonnet default.
 */
type Pricing = { input: number; output: number; cacheRead: number; cacheWrite: number };

const PRICING: Record<string, Pricing> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-opus-4-8": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-haiku-4-5": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
};

export function resolveModel(agent: AgentKey): string {
  return MODEL_BY_AGENT[agent] ?? FALLBACK_MODEL;
}

export function estimateCostUsd(
  model: string,
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  }
): number {
  const p = PRICING[model] ?? PRICING[FALLBACK_MODEL];
  const input = (usage.prompt_tokens ?? 0) / 1_000_000;
  const out = (usage.completion_tokens ?? 0) / 1_000_000;
  const cr = (usage.cache_read_tokens ?? 0) / 1_000_000;
  const cw = (usage.cache_creation_tokens ?? 0) / 1_000_000;
  const total =
    input * p.input + out * p.output + cr * p.cacheRead + cw * p.cacheWrite;
  return Math.round(total * 10000) / 10000;
}
