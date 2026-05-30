/**
 * Vérifie que la migration 015 a bien créé les 9 tables Agency OS.
 * Usage : node scripts/verify-agency-os.mjs
 */
import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env.local" });

const expectedTables = [
  "client_agency_profile",
  "pipeline_steps",
  "agent_runs",
  "deliverables",
  "client_memory",
  "agency_playbooks",
  "agent_memory",
  "compliance_checks",
  "retro_imports",
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
  for (const t of expectedTables) {
    const present = found.has(t);
    if (!present) ok = false;
    console.log(`  ${present ? "✓" : "✗"} ${t}`);
  }
  console.log(ok ? "\n✓ Toutes les tables Agency OS sont présentes." : "\n✗ Tables manquantes.");
  // Vérifie aussi les RLS
  const rls = await client.query(
    `select c.relname, c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any($1::text[])
     order by c.relname`,
    [expectedTables]
  );
  console.log("\nRLS activé :");
  for (const r of rls.rows) {
    console.log(`  ${r.relrowsecurity ? "✓" : "✗"} ${r.relname}`);
  }
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("✗ Vérification FAILED :", err.message);
  process.exit(1);
} finally {
  await client.end();
}
