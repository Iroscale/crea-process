/**
 * P0.1 — Vérifie la migration 026 (sync livrables → mémoire client).
 * Usage : node scripts/verify-memory-sync.mjs
 */
import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env.local" });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let ok = true;
try {
  await client.connect();

  // Colonnes ajoutées sur deliverables
  const cols = await client.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='deliverables'
       and column_name in ('memory_slug','applied_to_memory_at')`
  );
  const colSet = new Set(cols.rows.map((r) => r.column_name));
  for (const c of ["memory_slug", "applied_to_memory_at"]) {
    const present = colSet.has(c);
    if (!present) ok = false;
    console.log(`  ${present ? "✓" : "✗"} deliverables.${c}`);
  }

  // Table historique
  const hist = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name='client_memory_history'`
  );
  const histOk = hist.rows.length === 1;
  if (!histOk) ok = false;
  console.log(`  ${histOk ? "✓" : "✗"} table client_memory_history`);

  // RLS
  const rls = await client.query(
    `select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname='client_memory_history'`
  );
  const rlsOk = rls.rows[0]?.relrowsecurity === true;
  if (!rlsOk) ok = false;
  console.log(`  ${rlsOk ? "✓" : "✗"} RLS sur client_memory_history`);

  console.log(ok ? "\n✓ P0.1 mémoire sync : OK." : "\n✗ P0.1 : problèmes.");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
} finally {
  await client.end();
}
