/**
 * Catalogue des modèles LLM disponibles pour les agents.
 *
 * Ajouter un modèle = ajouter une entrée ici. Brancher un nouveau provider
 * = (1) ajouter ses modèles ici, (2) implémenter `src/lib/llm/<provider>.ts`,
 * (3) router dans `src/lib/llm/index.ts`. Tout le reste (DB, UI) se met
 * à jour automatiquement.
 *
 * Notes :
 * - Les modèles Anthropic sont actifs par défaut (clé déjà en env).
 * - Les modèles OpenAI et Google sont déclarés mais leur adaptateur lance
 *   une erreur claire tant que la clé n'est pas en env. Côté UI, ils
 *   apparaissent comme "branchement requis" via `isProviderReady`.
 * - Les tarifs sont par 1 M tokens (input/output/cacheRead/cacheWrite),
 *   indicatifs — à ajuster selon la grille officielle quand on commit
 *   sur un modèle.
 */

export type LLMProvider = "anthropic" | "openai" | "google";

export interface ModelInfo {
  id: string;
  label: string;
  provider: LLMProvider;
  tier: "fast" | "balanced" | "premium";
  contextWindow: number;
  supportsTools: boolean;
  supportsCacheControl: boolean;
  supportsWebSearch: boolean;
  pricing: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  description: string;
}

export const MODEL_CATALOG: ModelInfo[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    tier: "fast",
    contextWindow: 200_000,
    supportsTools: true,
    supportsCacheControl: true,
    supportsWebSearch: false,
    pricing: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    description:
      "Rapide et bon marché. Pour la mécanique à volume (humanisation, transformations simples).",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    tier: "balanced",
    contextWindow: 200_000,
    supportsTools: true,
    supportsCacheControl: true,
    supportsWebSearch: true,
    pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    description:
      "Équilibre qualité/coût. Défaut pour la plupart des agents : copywriter, creative-strategist, etc.",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "anthropic",
    tier: "premium",
    contextWindow: 200_000,
    supportsTools: true,
    supportsCacheControl: true,
    supportsWebSearch: true,
    pricing: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    description:
      "Qualité maximale. Pour market-research (recherche profonde) et legal-compliance (fiabilité réglementaire).",
  },

  // ── OpenAI (branchement à activer) ─────────────────────────────────────
  {
    id: "gpt-5",
    label: "GPT-5",
    provider: "openai",
    tier: "premium",
    contextWindow: 400_000,
    supportsTools: true,
    supportsCacheControl: true,
    supportsWebSearch: false,
    pricing: { input: 10, output: 30, cacheRead: 1, cacheWrite: 0 },
    description:
      "Modèle phare OpenAI. Excellent en synthèse longue et raisonnement structuré.",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    provider: "openai",
    tier: "balanced",
    contextWindow: 200_000,
    supportsTools: true,
    supportsCacheControl: true,
    supportsWebSearch: false,
    pricing: { input: 0.5, output: 2, cacheRead: 0.05, cacheWrite: 0 },
    description: "Version compacte de GPT-5, ratio coût/qualité agressif.",
  },

  // ── Google (branchement à activer) ─────────────────────────────────────
  {
    id: "gemini-3-pro",
    label: "Gemini 3 Pro",
    provider: "google",
    tier: "premium",
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsCacheControl: true,
    supportsWebSearch: true,
    pricing: { input: 2.5, output: 12.5, cacheRead: 0.25, cacheWrite: 0 },
    description:
      "1 M tokens de contexte, fort sur l'ingestion de gros corpus (idéal pour market-research).",
  },
  {
    id: "gemini-2-5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    tier: "fast",
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsCacheControl: false,
    supportsWebSearch: true,
    pricing: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
    description: "Rapide, peu cher, contexte massif — bonne option transformations.",
  },
];

export const MODEL_BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

export function getModelInfo(id: string): ModelInfo | undefined {
  return MODEL_BY_ID.get(id);
}

/**
 * Vérifie si la clé d'API du provider est présente en env.
 * Côté UI on s'en sert pour griser les modèles non prêts.
 */
export function isProviderReady(provider: LLMProvider): boolean {
  switch (provider) {
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "google":
      return !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
    default:
      return false;
  }
}

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};

export const TIER_LABELS: Record<ModelInfo["tier"], string> = {
  fast: "⚡ Rapide",
  balanced: "⚖️ Équilibré",
  premium: "👑 Premium",
};
