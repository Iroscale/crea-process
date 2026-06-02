/**
 * Adaptateur Anthropic — implémente l'interface `chat()` via le SDK
 * @anthropic-ai/sdk déjà installé.
 *
 * Gère le prompt caching natif (cache_control: ephemeral) sur les blocs
 * système marqués `cacheable: true`.
 */
import "server-only";
import { getAnthropic } from "../anthropic";
import type { ChatRequest, ChatResponse, ChatBlock } from "./types";

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicTextBlockWithCache {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export async function chatAnthropic(
  req: ChatRequest
): Promise<ChatResponse> {
  const client = getAnthropic();

  // Construit les blocs system avec cache_control sur ceux marqués cacheable
  const systemBlocks: AnthropicTextBlockWithCache[] = req.systemBlocks
    .filter((b) => b.text.trim().length > 0)
    .map((b) => ({
      type: "text",
      text: b.text,
      ...(b.cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));

  const params = {
    model: req.model,
    max_tokens: req.maxTokens ?? 4000,
    system: systemBlocks,
    messages: [{ role: "user" as const, content: req.userMessage }],
    ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
  };

  const resp = await client.messages.create(
    params as unknown as Parameters<typeof client.messages.create>[0]
  );

  const blocks = (resp as unknown as { content: ChatBlock[] }).content;
  const text = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n\n")
    .trim();

  const u = (resp as unknown as { usage?: AnthropicUsage }).usage ?? {};
  return {
    text,
    blocks,
    usage: {
      prompt_tokens: u.input_tokens ?? 0,
      completion_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_tokens: u.cache_creation_input_tokens ?? 0,
    },
    provider: "anthropic",
    model: req.model,
    raw: resp,
  };
}
