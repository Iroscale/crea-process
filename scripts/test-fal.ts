import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  if (!process.env.FAL_KEY) {
    console.error("❌ FAL_KEY manquante");
    process.exit(1);
  }
  console.log("✓ FAL_KEY trouvée (length:", process.env.FAL_KEY.length, ")");

  const { runModel, IMAGE_MODELS } = await import("../src/lib/fal");

  const prompt =
    "A cinematic premium fragrance ad, square 1:1, sensual urban woman with dark perfume bottle in foreground, golden city lights, chiaroscuro, high-end fashion photography.";

  // Test avec les nouveaux modèles
  const toTest = ["nano-banana-pro", "gpt-image-1"];

  for (const modelId of toTest) {
    const m = IMAGE_MODELS.find((x) => x.id === modelId)!;
    console.log(`\n→ ${m.label} (${m.endpoint})…`);
    const t0 = Date.now();
    const result = await runModel(modelId, prompt);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (result.ok) {
      console.log(
        `  ✓ ${dt}s — ${(result.bytes.length / 1024).toFixed(1)} KB ${result.mimeType}`
      );
    } else {
      console.log(`  ❌ ${dt}s — ${result.error}`);
    }
  }
}

main().catch((e) => {
  console.error("\n❌", (e as Error).message);
  process.exit(1);
});
