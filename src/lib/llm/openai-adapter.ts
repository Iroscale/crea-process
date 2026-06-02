/**
 * Adaptateur OpenAI (GPT) — STUB.
 *
 * Le SDK `openai` n'est pas encore installé dans ce projet. Pour activer
 * GPT pour un agent :
 *   1. `npm install openai`
 *   2. Ajouter `OPENAI_API_KEY=...` dans .env.local + Vercel
 *   3. Implémenter cette fonction en suivant le pattern de
 *      anthropic-adapter.ts (mapping system blocks → messages, parse
 *      usage, etc.)
 *
 * Tant qu'on n'a pas fait ça, tout `chat()` qui résout sur un modèle
 * OpenAI lève une erreur claire — pas de surprise silencieuse.
 */
import type { ChatRequest, ChatResponse } from "./types";

export async function chatOpenAI(req: ChatRequest): Promise<ChatResponse> {
  throw new Error(
    `Provider OpenAI pas encore branché (modèle demandé : ${req.model}). ` +
      `Pour l'activer : 1) npm install openai · 2) OPENAI_API_KEY en env · ` +
      `3) implémenter src/lib/llm/openai-adapter.ts en suivant le pattern ` +
      `de anthropic-adapter.ts.`
  );
}
