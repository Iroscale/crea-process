/**
 * Prompt caching helpers — structure les blocs system pour maximiser les
 * cache hits Anthropic.
 *
 * Stratégie : 3 blocs cacheables en `system` :
 *   1. Préambule commun Agency OS                     (très stable, ~5 min TTL)
 *   2. Identité courante de l'agent =                 (stable par agent
 *      body + agent_memory long terme + agent_knowledge   et entre runs)
 *   3. Mémoire client concaténée (les 7 fichiers)     (stable par client)
 *
 * + un dernier bloc non-cacheable avec la task spécifique de l'appel (passé
 * via `messages[]`, pas via system).
 *
 * Pourquoi fusionner body + memory + knowledge dans un seul bloc ?
 * L'API Anthropic accepte 4 cache breakpoints max par requête. On en utilise
 * 3 ici (préambule, identité, mémoire client) et on garde 1 marge pour la
 * task. Body / memory / knowledge changent rarement (et globalement ensemble
 * quand on enrichit l'agent), donc les fusionner ne nuit pas au cache hit
 * rate dans l'usage normal.
 */

export type CacheableBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

interface BuildSystemArgs {
  /** Préambule commun Agency OS (`.claude/agency-os.system.md`). */
  preamble: string;
  /** System prompt de l'agent (body du `.claude/agents/<key>.md`). */
  agentBody: string;
  /**
   * Mémoire long terme + knowledge enrichi de l'agent, déjà formatés et
   * concaténés par formatAgentIdentityExtras(). Optionnel : vide si agent
   * neuf et sans data enrichie.
   */
  agentIdentityExtras?: string;
  /** Mémoire client (les 7 fichiers concaténés). */
  memoryMarkdown?: string;
}

/**
 * Construit le tableau system pour un appel Anthropic, avec les bons
 * marqueurs de cache.
 *
 * On marque les blocs (1) (2) (3) comme cacheables.
 */
export function buildSystemBlocks(args: BuildSystemArgs): CacheableBlock[] {
  const blocks: CacheableBlock[] = [];

  // 1. Préambule commun (très stable)
  if (args.preamble.trim()) {
    blocks.push({
      type: "text",
      text: args.preamble,
      cache_control: { type: "ephemeral" },
    });
  }

  // 2. Identité courante de l'agent : body + memory long terme + knowledge
  const identityParts: string[] = [];
  if (args.agentBody.trim()) identityParts.push(args.agentBody.trim());
  if (args.agentIdentityExtras && args.agentIdentityExtras.trim()) {
    identityParts.push("\n\n---\n\n" + args.agentIdentityExtras.trim());
  }
  const identityText = identityParts.join("\n");
  if (identityText.trim()) {
    blocks.push({
      type: "text",
      text: identityText,
      cache_control: { type: "ephemeral" },
    });
  }

  // 3. Mémoire client concaténée
  if (args.memoryMarkdown && args.memoryMarkdown.trim()) {
    blocks.push({
      type: "text",
      text: `# Mémoire client (source de vérité)\n\n${args.memoryMarkdown}`,
      cache_control: { type: "ephemeral" },
    });
  }
  return blocks;
}
