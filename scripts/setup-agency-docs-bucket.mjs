/**
 * Crée le bucket Supabase Storage `agency-docs` si absent, et applique
 * les bonnes settings (privé, RLS via la table client_documents).
 *
 * Usage : node scripts/setup-agency-docs-bucket.mjs
 *
 * Nécessite SUPABASE_SERVICE_ROLE_KEY dans .env.local.
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "✗ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "agency-docs";

const { data: buckets, error: listErr } = await admin.storage.listBuckets();
if (listErr) {
  console.error("✗ listBuckets :", listErr.message);
  process.exit(1);
}
const exists = (buckets ?? []).some((b) => b.name === BUCKET);

if (exists) {
  console.log(`✓ Bucket ${BUCKET} déjà présent.`);
} else {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024, // 50 MB
  });
  if (error) {
    console.error("✗ createBucket :", error.message);
    process.exit(1);
  }
  console.log(`✓ Bucket ${BUCKET} créé (privé, max 50 MB).`);
}
