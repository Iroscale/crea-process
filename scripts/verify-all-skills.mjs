/**
 * Inventaire complet des skills et vérification de leur disponibilité
 * pour chaque agent qui les déclare.
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const skillsDir = path.join(root, ".claude", "skills");
const agentsDir = path.join(root, ".claude", "agents");

function parseFrontmatter(src) {
  if (!src.startsWith("---")) return {};
  const endIdx = src.indexOf("\n---", 3);
  if (endIdx === -1) return {};
  const text = src.slice(3, endIdx).replace(/^\n/, "");
  const out = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) { i++; continue; }
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2];
    if (rest === "") {
      // collect indented items
      const items = [];
      i++;
      while (i < lines.length && /^\s+/.test(lines[i])) {
        const itm = lines[i].match(/^\s*-\s*(.+)$/);
        if (itm) items.push(itm[1].trim());
        i++;
      }
      if (items.length > 0) out[key] = items;
      continue;
    }
    if (rest === "~" || rest === "null") out[key] = null;
    else out[key] = rest.trim().replace(/^['"]|['"]$/g, "");
    i++;
  }
  return out;
}

// 1. Liste les skills présents sur disque
const skillsAvailable = new Map();
try {
  const dirs = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const skillName = d.name;
    const skillPath = path.join(skillsDir, skillName, "SKILL.md");
    try {
      const stat = await fs.stat(skillPath);
      const refs = [];
      try {
        const refDirs = await fs.readdir(path.join(skillsDir, skillName, "references"));
        for (const r of refDirs) if (r.endsWith(".md")) refs.push(r);
      } catch {}
      skillsAvailable.set(skillName, { sizeBytes: stat.size, refs });
    } catch {}
  }
} catch {}

console.log("📦 Skills présents sur disque :\n");
for (const [name, info] of skillsAvailable) {
  console.log(`  ✓ ${name}  (SKILL.md ${(info.sizeBytes / 1024).toFixed(1)} ko${info.refs.length ? `, ${info.refs.length} référence(s)` : ""})`);
  for (const r of info.refs) console.log(`      → references/${r}`);
}

// 2. Pour chaque agent, lis son frontmatter et vérifie ses skills
console.log("\n🧠 Mapping agent → skills :\n");
const agentFiles = (await fs.readdir(agentsDir)).filter((f) => f.endsWith(".md"));
let allOk = true;
for (const file of agentFiles.sort()) {
  const raw = await fs.readFile(path.join(agentsDir, file), "utf8");
  const fm = parseFrontmatter(raw);
  const declared = [
    ...(fm.skill ? [fm.skill] : []),
    ...(Array.isArray(fm.skills) ? fm.skills : []),
  ];
  if (declared.length === 0) {
    console.log(`  · ${file.padEnd(28)} (aucun skill)`);
    continue;
  }
  for (const name of declared) {
    const present = skillsAvailable.has(name);
    const mark = present ? "✓" : "✗";
    if (!present) allOk = false;
    console.log(`  ${mark} ${file.padEnd(28)} → ${name}`);
  }
}

console.log(allOk ? "\n✓ Tous les skills déclarés sont présents." : "\n✗ Skills manquants détectés.");
process.exit(allOk ? 0 : 1);
