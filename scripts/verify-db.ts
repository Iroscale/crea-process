import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local") });

const parsed = new URL(process.env.DATABASE_URL!);
const client = new Client({
  host: parsed.hostname,
  port: Number(parsed.port || 5432),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema='public' order by table_name
  `);
  console.log("Tables (public):");
  for (const r of tables.rows) console.log("  -", r.table_name);

  const buckets = await client.query(`select id from storage.buckets order by id`);
  console.log("\nStorage buckets:");
  for (const r of buckets.rows) console.log("  -", r.id);

  await client.end();
}
main();
