/**
 * Types partagés par tous les adaptateurs LLM.
 */
import type { LLMProvider } from "./catalog";

export interface SystemBlock {
  text: string;
  /** Si true, l'adaptateur ajoute le marqueur de cache si le provider le supporte. */
  cacheable?: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  systemBlocks: SystemBlock[];
  userMessage: string;
  /**
   * Historique de conversation optionnel (multi-tours). Les tours sont
   * envoyés avant userMessage. Utilisé par le chat itératif sur livrable.
   */
  history?: ChatTurn[];
  maxTokens?: number;
  /**
   * Outils côté serveur (web_search Anthropic, function-calling, etc.).
   * Format propre à chaque provider — on passe tel quel, l'adaptateur gère.
   */
  tools?: unknown[];
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface ChatBlock {
  type: string;
  text?: string;
  [k: string]: unknown;
}

export interface ChatResponse {
  /** Texte concaténé de tous les blocs textuels de la réponse. */
  text: string;
  /** Blocs typés bruts (citations web, tool_use, etc.). */
  blocks: ChatBlock[];
  usage: ChatUsage;
  provider: LLMProvider;
  model: string;
  /** Réponse brute du SDK pour debug avancé. */
  raw?: unknown;
}
