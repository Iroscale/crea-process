/**
 * Adaptateur Google Gemini — STUB.
 *
 * Le SDK `@google/genai` est déjà installé dans ce projet (utilisé pour
 * la génération d'images). Pour activer Gemini en chat pour un agent :
 *   1. Vérifier que GEMINI_API_KEY (ou GOOGLE_API_KEY) est en env.local
 *      + Vercel — déjà présent ici.
 *   2. Implémenter cette fonction : créer un GoogleGenAI client, mapper
 *      systemBlocks → systemInstruction, mapper tools → functionDeclarations,
 *      parser usage_metadata pour les compteurs tokens.
 *
 * Tant que ce stub lève, tout `chat()` qui résout sur Gemini explique
 * proprement pourquoi.
 */
import type { ChatRequest, ChatResponse } from "./types";

export async function chatGoogle(req: ChatRequest): Promise<ChatResponse> {
  throw new Error(
    `Provider Google (Gemini) pas encore branché en chat (modèle demandé : ${req.model}). ` +
      `Le SDK @google/genai est déjà installé. Implémente src/lib/llm/google-adapter.ts ` +
      `en mappant systemBlocks → systemInstruction et messages → contents.`
  );
}
