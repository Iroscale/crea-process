/**
 * Skills loader — charge le contenu des skills mobilisés par un agent.
 *
 * Convention :
 *   .claude/skills/<skill-name>/SKILL.md
 *   .claude/skills/<skill-name>/references/*.md   (optionnel, chargé aussi)
 *
 * Le SKILL.md peut commencer par un frontmatter YAML (name, description,
 * triggers) — c'est ignoré à l'injection : on n'envoie à l'agent que le
 * corps markdown (le "comment faire"). Les fichiers references/*.md sont
 * inlinés à la suite du SKILL.md, capés à MAX_REF_CHARS chacun, et total
 * skill capé à MAX_SKILL_CHARS.
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
const MAX_REF_CHARS = 12_000;
const MAX_SKILL_CHARS = 50_000;
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
 * Charge un skill par son nom : SKILL.md + references/*.md.
 * Retourne null si SKILL.md n'existe pas (le skill est considéré absent).
 */
export async function loadSkill(name: string): Promise<string | null> {
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const dir = path.join(SKILLS_DIR(), name);
  const skillPath = path.join(dir, "SKILL.md");
  let raw: string;
  try {
    raw = await fs.readFile(skillPath, "utf8");
  } catch {
    return null;
  }
  const parts: string[] = [stripFrontmatter(raw).trim()];

  // Charge références additionnelles si présentes
  const refsDir = path.join(dir, "references");
  try {
    const entries = await fs.readdir(refsDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /\.md$/i.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (files.length > 0) {
      parts.push("\n\n---\n\n## Références additionnelles du skill\n");
      for (const f of files) {
        const refRaw = await fs.readFile(path.join(refsDir, f.name), "utf8");
        const refBody = stripFrontmatter(refRaw).trim();
        const capped =
          refBody.length > MAX_REF_CHARS
            ? refBody.slice(0, MAX_REF_CHARS) +
              `\n\n[…tronqué — ${refBody.length} caractères au total]`
            : refBody;
        parts.push(`\n### Référence : ${f.name}\n`);
        parts.push(capped);
      }
    }
  } catch {
    // pas de dossier references — c'est OK
  }

  let body = parts.join("\n");
  if (body.length > MAX_SKILL_CHARS) {
    body =
      body.slice(0, MAX_SKILL_CHARS) +
      `\n\n[…skill tronqué — ${body.length} caractères au total]`;
  }
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
