import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY manquante");
    process.exit(1);
  }
  console.log(
    "✓ GEMINI_API_KEY trouvée (length:",
    process.env.GEMINI_API_KEY.length,
    ")"
  );

  const { runModel } = await import("../src/lib/fal");

  const prompt = `A cinematic editorial fashion campaign image, square 1:1 aspect ratio. A confident urban woman in her late twenties, soft golden-hour light from camera left grazing her face, wearing a sleek black trench coat. Behind her, a dreamy out-of-focus Parisian street at dusk with warm bokeh streetlights — cool teal-and-amber color palette. Holding a sleek dark amber perfume bottle with subtle gold accents in lower foreground, slightly out of focus. The lower third recedes into a soft gradient of deep navy-to-black for layout breathing room. Shot on Hasselblad with shallow depth of field, editorial fashion photography style, Vogue cover quality.`;

  for (const id of ["gemini-3-pro-image", "gemini-2.5-flash-image"]) {
    console.log(`\n→ ${id}…`);
    const t0 = Date.now();
    const r = await runModel(id, prompt);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (!r.ok) {
      console.log(`  ❌ ${dt}s — ${r.error}`);
      continue;
    }
    console.log(
      `  ✓ ${dt}s — ${(r.bytes.length / 1024).toFixed(1)} KB ${r.mimeType}`
    );
    const dir = resolve(root, "tmp-composite-tests");
    mkdirSync(dir, { recursive: true });
    const out = resolve(dir, `gemini-test-${id}.png`);
    writeFileSync(out, r.bytes);
    console.log(`    → ${out}`);
  }
}

main().catch((e) => {
  console.error("\n❌", (e as Error).message);
  process.exit(1);
});
