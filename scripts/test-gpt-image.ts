import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function tryEndpoint(endpoint: string, body: object) {
  const r = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  console.log(`  → ${endpoint}: ${r.status}`);
  console.log("    " + txt.slice(0, 300));
}

async function main() {
  console.log("=== Variations endpoint GPT Image ===\n");

  await tryEndpoint("fal-ai/gpt-image-1/text-to-image", {
    prompt: "a red apple",
    image_size: "square_hd",
  });

  await tryEndpoint("fal-ai/gpt-image-1", {
    prompt: "a red apple",
    image_size: "square_hd",
  });

  await tryEndpoint("fal-ai/openai/gpt-image-1", {
    prompt: "a red apple",
    image_size: "square_hd",
  });

  // Try with different param shape
  await tryEndpoint("fal-ai/gpt-image-1/text-to-image", {
    prompt: "a red apple",
    image_size: { width: 1024, height: 1024 },
    num_images: 1,
  });

  await tryEndpoint("fal-ai/gpt-image-1/text-to-image", {
    prompt: "a red apple",
    aspect_ratio: "1:1",
    num_images: 1,
    quality: "high",
  });
}

main();
