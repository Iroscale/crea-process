/**
 * Skills loader — charge le contenu des skills mobilisés par un agent.
 *
 * Convention :
 *   .claude/skills/<skill-name>/SKILL.md
 *
 * Le SKILL.md peut commencer par un frontmatter YAML (name, description,
 * triggers) — c'est ignoré à l'injection : on n'envoie à l'agent que le
 * corps markdown (le "comment faire").
 *
 * Cache mémoire 5min identique au loader d'agents.
 */
import fs from "node:fs/promises";
import path from "node:path";

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const SKILLS_DIR = () => path.join(process.cwd(), ".claude", "skills");

/**
 * Strip le frontmatter YAML d'un SKILL.md s'il en a un.
 */
function stripFrontmatter(src: string): string {
  const trimmed = src.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return trimmed;
  const endIdx = trimmed.indexOf("\n---", 3);
  if (endIdx === -1) return trimmed;
  return trimmed.slice(endIdx + 4).replace(/^\n/, "");
}

/**
 * Charge un skill par son nom. Retourne le markdown corps (sans frontmatter).
 * Retourne null si le skill n'existe pas (pas d'erreur — graceful).
 */
export async function loadSkill(name: string): Promise<string | null> {
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const filePath = path.join(SKILLS_DIR(), name, "SKILL.md");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const body = stripFrontmatter(raw).trim();
  cache.set(name, { value: body, expiresAt: Date.now() + CACHE_TTL_MS });
  return body;
}

/**
 * Charge plusieurs skills et les concatène en un bloc markdown unique
 * prêt à être injecté dans l'identité de l'agent. Sépare chaque skill
 * par un titre H2 et un séparateur, pour que l'agent les distingue bien.
 *
 * Retourne "" si la liste est vide ou si aucun skill n'est trouvé.
 */
export async function loadSkillsBundle(names: string[]): Promise<string> {
  const filtered = (names ?? []).filter((n) => typeof n === "string" && n.length > 0);
  if (filtered.length === 0) return "";

  const loaded: Array<{ name: string; body: string }> = [];
  for (const name of filtered) {
    const body = await loadSkill(name);
    if (body) loaded.push({ name, body });
  }
  if (loaded.length === 0) return "";

  const parts: string[] = [
    "# Skills mobilisés",
    "",
    "> Tu actives les skills suivants. Suis leurs conventions et leur méthode quand elles s'appliquent.",
  ];
  for (const s of loaded) {
    parts.push("");
    parts.push(`---`);
    parts.push("");
    parts.push(`## Skill : ${s.name}`);
    parts.push("");
    parts.push(s.body);
  }
  return parts.join("\n");
}

/** Test helper. */
export function clearSkillCache(): void {
  cache.clear();
}
