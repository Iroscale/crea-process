import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

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

  const r = await client.query(`
    select gi.model_id, gi.model_label, gi.status, gi.error_message,
           left(coalesce(gi.image_url, ''), 60) as image_url_short,
           gi.created_at
    from generated_images gi
    join generations g on g.id = gi.generation_id
    order by gi.created_at desc
    limit 30
  `);
  for (const row of r.rows) {
    console.log(
      `[${row.status.padEnd(7)}] ${row.model_id.padEnd(20)} ${row.created_at.toISOString().slice(11, 19)}`
    );
    if (row.status === "failed") console.log("    ❌ " + row.error_message);
    if (row.image_url_short) console.log("    ↗ " + row.image_url_short);
  }

  await client.end();
}
main();
