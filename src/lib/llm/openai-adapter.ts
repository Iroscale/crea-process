/**
 * Adaptateur OpenAI (GPT) — implémente l'interface `chat()` via le SDK
 * `openai` (Chat Completions API). Le SDK est aussi utilisé par
 * l'adaptateur DeepSeek qui l'instancie avec une baseURL différente.
 *
 * Mapping :
 *   - systemBlocks → fusionnés en 1 seul message system (concaténation).
 *     OpenAI n'accepte qu'1 message system, et leur prompt caching
 *     automatique se base sur le préfixe stable du message.
 *   - userMessage → 1 message user
 *   - tools : passés tel quel (format function calling OpenAI attendu si
 *     fourni — Anthropic web_search ne marche PAS ici)
 *   - usage : extracted from response.usage
 */
import "server-only";
import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ChatRequest, ChatResponse, ChatBlock } from "./types";

let _client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY manquant dans .env.local. " +
        "Ajoute-le côté Vercel aussi : Project → Settings → Environment Variables."
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

export async function chatOpenAI(req: ChatRequest): Promise<ChatResponse> {
  return chatViaOpenAISDK(req, getOpenAI(), "openai");
}

/**
 * Implémentation partagée — utilisée aussi par l'adaptateur DeepSeek
 * (qui passe un client OpenAI avec baseURL différente).
 */
export async function chatViaOpenAISDK(
  req: ChatRequest,
  client: OpenAI,
  providerTag: "openai" | "deepseek"
): Promise<ChatResponse> {
  const systemText = req.systemBlocks
    .map((b) => b.text)
    .filter((s) => s.trim().length > 0)
    .join("\n\n---\n\n");

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemText.trim()) messages.push({ role: "system", content: systemText });
  messages.push({ role: "user", content: req.userMessage });

  // Tools : si fourni dans le format Anthropic (web_search natif), on
  // les ignore pour OpenAI/DeepSeek car ils ne le supportent pas. Si
  // fourni dans le format OpenAI function calling, on les passe tel quel.
  const openAITools = filterOpenAITools(req.tools);

  const resp = (await client.chat.completions.create({
    model: req.model,
    max_tokens: req.maxTokens ?? 4000,
    messages,
    stream: false,
    ...(openAITools.length > 0 ? { tools: openAITools } : {}),
  })) as ChatCompletion;

  const choice = resp.choices[0];
  const text = (choice?.message?.content ?? "").trim();

  // Reconstitue un bloc texte pour rester homogène avec Anthropic
  const blocks: ChatBlock[] = text
    ? [{ type: "text", text }]
    : [];
  // Tool calls éventuels
  const toolCalls = choice?.message?.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      blocks.push({
        type: "tool_use",
        id: tc.id,
        name: (tc as { function?: { name?: string } }).function?.name,
        input: (tc as { function?: { arguments?: string } }).function
          ?.arguments,
      });
    }
  }

  const usage = resp.usage;
  return {
    text,
    blocks,
    usage: {
      prompt_tokens: usage?.prompt_tokens ?? 0,
      completion_tokens: usage?.completion_tokens ?? 0,
      // Cache : OpenAI met prompt_tokens_details.cached_tokens (gpt-4o+)
      cache_read_tokens:
        (usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
          ?.prompt_tokens_details?.cached_tokens ?? 0,
      cache_creation_tokens: 0,
    },
    provider: providerTag,
    model: req.model,
    raw: resp,
  };
}

/**
 * Si tools contient des entrées au format Anthropic (web_search_*), on
 * les filtre. On garde uniquement celles au format function calling OpenAI.
 */
function filterOpenAITools(
  tools: unknown[] | undefined
): ChatCompletionTool[] {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  return tools.filter((t): t is ChatCompletionTool => {
    if (!t || typeof t !== "object") return false;
    const type = (t as { type?: string }).type;
    // Format OpenAI : { type: "function", function: {...} }
    return type === "function";
  });
}
