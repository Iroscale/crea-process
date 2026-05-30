/**
 * One-shot migration runner — applies a single .sql file via direct Postgres
 * connection (DATABASE_URL from .env.local). Used to bootstrap migrations when
 * the Supabase CLI isn't installed.
 *
 * Usage : node scripts/apply-migration.mjs supabase/migrations/010_project_knowledge_structure.sql
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env.local" });

const file = process.argv[2];
if (!file) {
  console.error("Usage : node scripts/apply-migration.mjs <path-to-sql>");
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), "utf8");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is missing from .env.local");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  // Supabase pooler / direct both want SSL.
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`→ Connected. Applying ${file} (${sql.length} bytes)…`);
  await client.query(sql);
  console.log("✓ Migration applied successfully.");

  // Quick sanity check : list new column + table
  const checkColumn = await client.query(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'projects'
       and column_name = 'structured_knowledge'`
  );
  const checkTable = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = 'project_knowledge_messages'`
  );
  console.log(
    "  • projects.structured_knowledge :",
    checkColumn.rows.length === 1
      ? `OK (${checkColumn.rows[0].data_type})`
      : "MISSING"
  );
  console.log(
    "  • project_knowledge_messages :",
    checkTable.rows.length === 1 ? "OK" : "MISSING"
  );
} catch (err) {
  console.error("✗ Migration FAILED :", err.message);
  process.exit(1);
} finally {
  await client.end();
}
