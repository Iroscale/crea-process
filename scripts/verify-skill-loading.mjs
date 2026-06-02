/**
 * Vérifie que le skill sales-copy-blueprint est lisible et que son
 * contenu est sensé être injecté pour le copywriter.
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const skillPath = path.join(root, ".claude", "skills", "sales-copy-blueprint", "SKILL.md");
const copywriterPath = path.join(root, ".claude", "agents", "copywriter.md");

try {
  const skill = await fs.readFile(skillPath, "utf8");
  console.log(`✓ skill chargé : ${skill.length} chars`);

  // Strip frontmatter pour estimer ce qu'on injecte
  const stripped = skill.startsWith("---")
    ? skill.slice(skill.indexOf("\n---", 3) + 4).replace(/^\n/, "")
    : skill;
  console.log(`  → corps injectable : ${stripped.length} chars`);

  const copywriter = await fs.readFile(copywriterPath, "utf8");
  const matches = copywriter.match(/skills:\s*\n\s*-\s*sales-copy-blueprint/);
  if (matches) {
    console.log(`✓ copywriter référence bien sales-copy-blueprint dans son frontmatter`);
  } else {
    console.log(`✗ copywriter ne référence PAS sales-copy-blueprint`);
    process.exit(1);
  }
  console.log(`\n✓ Skill prêt à être injecté au prochain run copywriter.`);
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}
