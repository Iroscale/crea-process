/**
 * P0.3 — Vérifie la migration 029 (deliverable_items) + colonnes P0.4.
 * Usage : node scripts/verify-items.mjs
 */
import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env.local" });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let ok = true;
const check = (cond, label) => {
  if (!cond) ok = false;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

try {
  await client.connect();

  for (const t of [
    "deliverable_items",
    "deliverable_versions",
    "deliverable_messages",
    "client_memory_history",
  ]) {
    const r = await client.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
      [t]
    );
    check(r.rows.length === 1, `table ${t}`);
  }

  const cols = await client.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='deliverables'
       and column_name in ('version','status','parent_deliverable_id','memory_slug','applied_to_memory_at')`
  );
  const set = new Set(cols.rows.map((r) => r.column_name));
  for (const c of [
    "version",
    "status",
    "parent_deliverable_id",
    "memory_slug",
    "applied_to_memory_at",
  ]) {
    check(set.has(c), `deliverables.${c}`);
  }

  // Contrainte unique item_key par projet
  const uq = await client.query(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid
     where t.relname='deliverable_items' and c.contype='u'`
  );
  check(uq.rows.length >= 1, "unique(project_id, item_key) sur deliverable_items");

  console.log(ok ? "\n✓ P0.3/P0.4 : OK." : "\n✗ Problèmes détectés.");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
} finally {
  await client.end();
}
