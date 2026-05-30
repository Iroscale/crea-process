import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  const key = process.env.FAL_KEY;
  if (!key) {
    console.error("❌ FAL_KEY manquante");
    process.exit(1);
  }
  console.log("Key length:", key.length, "starts with:", key.slice(0, 8) + "…");

  // Direct REST call to fal.ai to see exact HTTP response
  console.log("\n→ Test 1 : appel REST direct via fetch");
  const r1 = await fetch("https://queue.fal.run/fal-ai/flux-pro/v1.1", {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: "a red apple, square 1:1",
      image_size: "square_hd",
      num_images: 1,
    }),
  });
  console.log("  Status:", r1.status, r1.statusText);
  const txt1 = await r1.text();
  console.log("  Body:", txt1.slice(0, 500));

  console.log("\n→ Test 2 : endpoint synchrone fal.run (modèle plus léger)");
  const r2 = await fetch("https://fal.run/fal-ai/fast-sdxl", {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: "a red apple, square 1:1",
      image_size: "square_hd",
      num_images: 1,
    }),
  });
  console.log("  Status:", r2.status, r2.statusText);
  const txt2 = await r2.text();
  console.log("  Body:", txt2.slice(0, 500));
}

main().catch((e) => {
  console.error("\n❌", (e as Error).message);
  process.exit(1);
});
