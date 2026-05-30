/**
 * Vérifie que la migration 016 a créé les tables de la boucle d'apprentissage.
 * Usage : node scripts/verify-learning-loop.mjs
 */
import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env.local" });

const expectedTables = [
  "agent_knowledge",
  "agent_feedback",
  "agent_memory_history",
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])
     order by table_name`,
    [expectedTables]
  );
  const found = new Set(rows.map((r) => r.table_name));
  let ok = true;
  console.log("Tables apprentissage :");
  for (const t of expectedTables) {
    const present = found.has(t);
    if (!present) ok = false;
    console.log(`  ${present ? "✓" : "✗"} ${t}`);
  }

  // Check colonnes critiques sur agent_knowledge
  const kCols = await client.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='agent_knowledge'
     order by column_name`
  );
  const kSet = new Set(kCols.rows.map((r) => r.column_name));
  console.log("\nColonnes agent_knowledge :");
  for (const c of ["agent_key", "kind", "title", "content_md", "tags", "weight", "is_active", "source_note"]) {
    console.log(`  ${kSet.has(c) ? "✓" : "✗"} ${c}`);
    if (!kSet.has(c)) ok = false;
  }

  // Check colonnes critiques sur agent_feedback
  const fCols = await client.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='agent_feedback'
     order by column_name`
  );
  const fSet = new Set(fCols.rows.map((r) => r.column_name));
  console.log("\nColonnes agent_feedback :");
  for (const c of ["run_id", "agent_key", "rating", "tag", "comment", "corrected_md", "ingested_at", "ingested_into_version"]) {
    console.log(`  ${fSet.has(c) ? "✓" : "✗"} ${c}`);
    if (!fSet.has(c)) ok = false;
  }

  console.log(ok ? "\n✓ Boucle d'apprentissage prête." : "\n✗ Problèmes détectés.");
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("✗", err.message);
  process.exit(1);
} finally {
  await client.end();
}
