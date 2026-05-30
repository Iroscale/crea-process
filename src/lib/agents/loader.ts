/**
 * Agent loader — lit les fichiers `.claude/agents/<name>.md` et le préambule
 * commun `.claude/agency-os.system.md`. Parse le frontmatter YAML minimal
 * (clés simples, listes inline) et retourne un `AgentDefinition` exploitable
 * par le serveur.
 *
 * Pourquoi un parseur maison plutôt que `gray-matter` / `yaml` :
 * - notre frontmatter est volontairement contraint (clés string, listes
 *   simples) → 60 lignes suffisent.
 * - 0 dépendance supplémentaire.
 *
 * Les fichiers sont lus depuis `process.cwd()` (root du projet en dev comme
 * en prod Next.js standalone). Cache mémoire LRU minimal (5min TTL) pour
 * éviter de re-lire le disque à chaque appel d'agent.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentKey } from "./model-routing";

export interface AgentFrontmatter {
  name: string;
  model?: string;
  tools?: string[];
  reads?: string[];
  writes?: string[];
  skill?: string | null;
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

// ── Frontmatter parser (minimal, opinionated) ─────────────────────────────
/**
 * Parse un bloc frontmatter YAML restreint :
 *   ---
 *   name: market-research
 *   model: claude-opus-4-8
 *   tools: [web_search, web_fetch]
 *   reads:
 *     - memory/client-profile.md
 *     - onboarding_data
 *   writes: [memory/icp.md]
 *   skill: icp-creative-strategy
 *   gate: true
 *   escalation_to: ~
 *   description: |
 *     Description multi-lignes possible.
 *   ---
 */
function parseFrontmatter(src: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const trimmed = src.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: trimmed };
  }
  const endIdx = trimmed.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: trimmed };
  }
  const fmText = trimmed.slice(3, endIdx).replace(/^\n/, "");
  const body = trimmed.slice(endIdx + 4).replace(/^\n/, "");
  const fm = parseYamlSubset(fmText);
  return { frontmatter: fm, body };
}

function parseYamlSubset(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];
    if (rest === "" || rest === "|") {
      // bloc multi-lignes (|) ou liste sur lignes suivantes
      const indent = / {2,}/;
      const collected: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === "") {
          collected.push("");
          i++;
          continue;
        }
        if (next.startsWith("  - ")) {
          collected.push(next.replace(/^\s*-\s*/, "ITEM::"));
          i++;
          continue;
        }
        if (indent.test(next)) {
          collected.push(next.replace(/^ {2}/, ""));
          i++;
          continue;
        }
        break;
      }
      if (collected.every((c) => c === "" || c.startsWith("ITEM::"))) {
        out[key] = collected
          .filter((c) => c.startsWith("ITEM::"))
          .map((c) => coerceScalar(c.slice(6).trim()));
      } else {
        out[key] = collected.join("\n").trim();
      }
    } else {
      out[key] = parseInlineValue(rest);
    }
    i++;
  }
  return out;
}

function parseInlineValue(raw: string): unknown {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((x) => coerceScalar(x.trim()))
      .filter((x) => x !== "");
  }
  return coerceScalar(v);
}

function coerceScalar(v: string): string | number | boolean | null {
  if (v === "" || v === "~" || v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  // strip surrounding quotes
  return v.replace(/^['"]|['"]$/g, "");
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
