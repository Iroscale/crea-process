/**
 * Smoke test : vérifie que les 11 fichiers .claude/agents/*.md sont présents,
 * que leur frontmatter parse correctement, et que les champs critiques
 * (model, gate, skill) sont bien typés.
 *
 * Usage : node scripts/smoke-test-agents.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const AGENTS_DIR = path.join(ROOT, ".claude", "agents");
const PREAMBLE = path.join(ROOT, ".claude", "agency-os.system.md");

const EXPECTED = [
  "orchestrator",
  "market-research",
  "creative-strategist",
  "copywriter",
  "production-assistant",
  "funnel-builder",
  "video-editor",
  "tracking",
  "media-buyer",
  "legal-compliance",
  "learning-curator",
];

function parseFrontmatter(src) {
  const trimmed = src.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return { fm: {}, body: trimmed };
  const endIdx = trimmed.indexOf("\n---", 3);
  if (endIdx === -1) return { fm: {}, body: trimmed };
  const fmText = trimmed.slice(3, endIdx).replace(/^\n/, "");
  const body = trimmed.slice(endIdx + 4).replace(/^\n/, "");
  const out = {};
  const lines = fmText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) { i++; continue; }
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2];
    if (rest === "" || rest === "|") {
      const collected = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === "") { collected.push(""); i++; continue; }
        if (next.startsWith("  - ")) { collected.push("ITEM::" + next.replace(/^\s*-\s*/, "")); i++; continue; }
        if (/^ {2,}/.test(next)) { collected.push(next.replace(/^ {2}/, "")); i++; continue; }
        break;
      }
      if (collected.every((c) => c === "" || c.startsWith("ITEM::"))) {
        out[key] = collected.filter((c) => c.startsWith("ITEM::")).map((c) => c.slice(6).trim());
      } else {
        out[key] = collected.join("\n").trim();
      }
      continue; // i déjà avancé par le while interne
    } else {
      const v = rest.trim();
      if (v.startsWith("[") && v.endsWith("]")) {
        out[key] = v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean);
      } else if (v === "true") out[key] = true;
      else if (v === "false") out[key] = false;
      else if (v === "~" || v === "null") out[key] = null;
      else out[key] = v.replace(/^['"]|['"]$/g, "");
    }
    i++;
  }
  return { fm: out, body };
}

let ok = true;

const preambleStat = await fs.stat(PREAMBLE).catch(() => null);
console.log(`Préambule commun :`);
if (!preambleStat) {
  ok = false;
  console.log(`  ✗ MANQUANT à ${PREAMBLE}`);
} else {
  const preamble = await fs.readFile(PREAMBLE, "utf8");
  console.log(`  ✓ ${PREAMBLE} (${preamble.length} chars)`);
}

console.log(`\nAgents (${EXPECTED.length} attendus) :`);
const seen = new Set();
const files = await fs.readdir(AGENTS_DIR).catch(() => []);
for (const file of files) {
  if (!file.endsWith(".md")) continue;
  const key = file.replace(/\.md$/, "");
  seen.add(key);
  const raw = await fs.readFile(path.join(AGENTS_DIR, file), "utf8");
  const { fm, body } = parseFrontmatter(raw);
  const expected = EXPECTED.includes(key) ? "" : " (NON ATTENDU)";
  const fmOk = fm.name && fm.model && typeof fm.gate === "boolean";
  console.log(`  ${fmOk ? "✓" : "✗"} ${file}${expected}`);
  console.log(`    name=${fm.name} · model=${fm.model} · gate=${fm.gate} · skill=${fm.skill ?? "—"} · body=${body.length} chars`);
  if (!fmOk) ok = false;
}

console.log("\nAgents manquants :");
const missing = EXPECTED.filter((k) => !seen.has(k));
if (missing.length === 0) console.log("  ✓ aucun");
else {
  ok = false;
  for (const m of missing) console.log(`  ✗ ${m}.md`);
}

console.log(ok ? "\n✓ Smoke test agents OK." : "\n✗ Smoke test agents : KO.");
process.exit(ok ? 0 : 1);
