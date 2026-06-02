/**
 * Crée le bucket Supabase Storage `agent-knowledge` (privé) pour les
 * fichiers ressource attachés au knowledge des agents (PDF, DOCX, images).
 *
 * Usage : node scripts/setup-agent-knowledge-bucket.mjs
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "agent-knowledge";
const { data: buckets } = await admin.storage.listBuckets();
const exists = (buckets ?? []).some((b) => b.name === BUCKET);

if (exists) {
  console.log(`✓ Bucket ${BUCKET} déjà présent.`);
} else {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error) {
    console.error("✗", error.message);
    process.exit(1);
  }
  console.log(`✓ Bucket ${BUCKET} créé (privé, max 50 MB).`);
}
