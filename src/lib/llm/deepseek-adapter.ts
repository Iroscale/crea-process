/**
 * Adaptateur DeepSeek — utilise le SDK OpenAI avec une baseURL custom
 * (https://api.deepseek.com/v1). L'API DeepSeek est compatible OpenAI
 * Chat Completions, donc on réutilise la même logique de mapping.
 *
 * Modèles supportés :
 *   - deepseek-chat      (DeepSeek V3)
 *   - deepseek-reasoner  (DeepSeek R1 — chain of thought)
 *
 * Pour activer : DEEPSEEK_API_KEY dans .env.local + Vercel.
 */
import "server-only";
import OpenAI from "openai";
import type { ChatRequest, ChatResponse } from "./types";
import { chatViaOpenAISDK } from "./openai-adapter";

let _client: OpenAI | null = null;

function getDeepSeek(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY manquant dans .env.local. " +
        "Crée une clé sur https://platform.deepseek.com/api_keys puis ajoute-la côté Vercel."
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com/v1",
  });
  return _client;
}

export async function chatDeepSeek(req: ChatRequest): Promise<ChatResponse> {
  return chatViaOpenAISDK(req, getDeepSeek(), "deepseek");
}
