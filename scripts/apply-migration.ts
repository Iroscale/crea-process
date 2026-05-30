/**
 * Apply a single SQL migration file against the Supabase Postgres.
 *
 * Usage:
 *   npx tsx scripts/apply-migration.ts supabase/migrations/002_selection_and_variants.sql
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

loadEnv({ path: resolve(root, ".env.local"), override: true });

const arg = process.argv[2];
if (!arg) {
  console.error(
    "\n❌ Usage: npx tsx scripts/apply-migration.ts <path-to-sql-file>\n"
  );
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("\n❌ DATABASE_URL manquant dans .env.local\n");
  process.exit(1);
}

const sqlPath = resolve(root, arg);
const sql = readFileSync(sqlPath, "utf8");

const parsed = new URL(dbUrl);
const client = new Client({
  host: parsed.hostname,
  port: Number(parsed.port || 5432),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log(`→ Migration: ${sqlPath}`);
  await client.connect();
  console.log("✓ Connecté");
  await client.query(sql);
  console.log(`✓ Migration appliquée (${sql.length} caractères)`);
  await client.end();
}

main().catch(async (err) => {
  console.error("\n❌ Erreur :", err.message);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
