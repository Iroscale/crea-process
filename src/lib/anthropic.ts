import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquant dans .env.local");
  _client = new Anthropic({ apiKey });
  return _client;
}

// Default heavy model — for finalize, synthesis, complex reasoning.
export const CLAUDE_MODEL = "claude-sonnet-4-6";

// Light model — for batched extraction / classification at low cost.
// Use when you need structured JSON output on many similar items.
export const CLAUDE_LIGHT_MODEL = "claude-haiku-4-5";
