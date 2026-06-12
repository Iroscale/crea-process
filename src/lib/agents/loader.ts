/**
 * Agent loader — lit les fichiers `.claude/agents/<name>.md` et le préambule
 * commun `.claude/agency-os.system.md`. Parse le frontmatter YAML via
 * `gray-matter` (js-yaml) et retourne un `AgentDefinition` exploitable
 * par le serveur.
 *
 * P1.5 : le parseur YAML maison a été remplacé par gray-matter — fiabilité
 * critique car tous les agents en dépendent (le parseur maison était
 * fragile sur l'indentation et les valeurs contenant `:`).
 *
 * Les fichiers sont lus depuis `process.cwd()` (root du projet en dev comme
 * en prod Next.js standalone). Cache mémoire LRU minimal (5min TTL) pour
 * éviter de re-lire le disque à chaque appel d'agent.
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { AgentKey } from "./model-routing";

export interface AgentFrontmatter {
  name: string;
  model?: string;
  tools?: string[];
  reads?: string[];
  writes?: string[];
  /** Skill unique (rétrocompat). Utilise `skills` pour plusieurs. */
  skill?: string | null;
  /** Liste de skills mobilisés par l'agent (mergée avec `skill` si présent). */
  skills?: string[];
  gate?: boolean;
  escalation_to?: string | null;
  description?: string;
}

export interface AgentDefinition {
  key: AgentKey;
  frontmatter: AgentFrontmatter;
  /** Corps markdown du fichier agent, sans le frontmatter. */
  body: string;
}

const AGENTS_DIR = () => path.join(process.cwd(), ".claude", "agents");
const COMMON_PREAMBLE_PATH = () =>
  path.join(process.cwd(), ".claude", "agency-os.system.md");

// ── In-memory cache ───────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry<T> = { value: T; expiresAt: number };
const agentCache = new Map<string, CacheEntry<AgentDefinition>>();
let preambleCache: CacheEntry<string> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > Date.now();
}

// ── Frontmatter parser (gray-matter / js-yaml) ────────────────────────────
function parseFrontmatter(src: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const trimmed = src.replace(/^﻿/, "");
  try {
    const parsed = matter(trimmed);
    return {
      frontmatter: (parsed.data ?? {}) as Record<string, unknown>,
      body: parsed.content.replace(/^\n/, ""),
    };
  } catch {
    // YAML invalide : on retourne le fichier entier comme body — l'agent
    // reste utilisable avec les valeurs par défaut du frontmatter.
    return { frontmatter: {}, body: trimmed };
  }
}

// ── Public API ────────────────────────────────────────────────────────────
export async function loadCommonPreamble(): Promise<string> {
  if (isFresh(preambleCache)) return preambleCache.value;
  const text = await fs.readFile(COMMON_PREAMBLE_PATH(), "utf8");
  preambleCache = { value: text, expiresAt: Date.now() + CACHE_TTL_MS };
  return text;
}

export async function loadAgent(key: AgentKey): Promise<AgentDefinition> {
  const cached = agentCache.get(key);
  if (isFresh(cached)) return cached.value;

  const filePath = path.join(AGENTS_DIR(), `${key}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(
      `Agent introuvable : ${filePath}. Vérifie que .claude/agents/${key}.md existe.`
    );
  }
  const { frontmatter, body } = parseFrontmatter(raw);
  const fm: AgentFrontmatter = {
    name: String(frontmatter.name ?? key),
    model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
    tools: Array.isArray(frontmatter.tools)
      ? (frontmatter.tools as string[])
      : [],
    reads: Array.isArray(frontmatter.reads)
      ? (frontmatter.reads as string[])
      : [],
    writes: Array.isArray(frontmatter.writes)
      ? (frontmatter.writes as string[])
      : [],
    skill:
      typeof frontmatter.skill === "string"
        ? frontmatter.skill
        : frontmatter.skill === null
          ? null
          : undefined,
    skills: Array.isArray(frontmatter.skills)
      ? (frontmatter.skills as string[])
      : [],
    gate: frontmatter.gate === true,
    escalation_to:
      typeof frontmatter.escalation_to === "string"
        ? frontmatter.escalation_to
        : null,
    description:
      typeof frontmatter.description === "string"
        ? frontmatter.description
        : undefined,
  };
  const def: AgentDefinition = { key, frontmatter: fm, body };
  agentCache.set(key, { value: def, expiresAt: Date.now() + CACHE_TTL_MS });
  return def;
}

/** Test helper — vide les caches (utile dans les scripts de smoke test). */
export function clearAgentCache(): void {
  agentCache.clear();
  preambleCache = null;
}
