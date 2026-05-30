/**
 * Runs supabase/schema.sql against your Supabase Postgres.
 *
 * Requires DATABASE_URL in .env.local — get it from:
 *   Supabase Dashboard → Project Settings → Database → Connection string → URI
 *   (use the "Direct connection" string, port 5432, not the pooler at 6543)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

loadEnv({ path: resolve(root, ".env.local") });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(
    "\n❌ DATABASE_URL manquant dans .env.local\n\n" +
      "Récupère-la sur :\n" +
      "  https://supabase.com/dashboard → ton projet → Project Settings → Database\n" +
      "  → Connection string → URI → mode 'Direct connection' (port 5432)\n\n" +
      "Ajoute cette ligne à .env.local :\n" +
      "  DATABASE_URL=postgresql://postgres:<TON_PASSWORD>@db.<REF>.supabase.co:5432/postgres\n"
  );
  process.exit(1);
}

const sqlPath = resolve(root, "supabase", "schema.sql");
const sql = readFileSync(sqlPath, "utf8");

// Parse the URL manually so the dot in "postgres.<ref>" username doesn't trip
// any URL parser, and so we can show a non-secret diagnostic.
const parsed = new URL(dbUrl);
const user = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);
const host = parsed.hostname;
const port = Number(parsed.port || 5432);
const database = parsed.pathname.replace(/^\//, "") || "postgres";

console.log(`→ Host: ${host}`);
console.log(`→ Port: ${port}`);
console.log(`→ User: ${user}`);
console.log(`→ DB:   ${database}`);
console.log(`→ Password length: ${password.length}`);

const client = new Client({
  host,
  port,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("→ Connexion à Postgres…");
  await client.connect();
  console.log("✓ Connecté");
  console.log(`→ Exécution de ${sqlPath} (${sql.length.toLocaleString()} caractères)…`);
  await client.query(sql);
  console.log("✓ Schéma appliqué avec succès");
  await client.end();
}

main().catch(async (err) => {
  console.error("\n❌ Erreur :", err.message);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
