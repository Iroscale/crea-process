import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  const { runModel } = await import("../src/lib/fal");

  const tests = [
    {
      name: "luxury-perfume",
      prompt: `Square 1:1 ad creative for a premium fragrance "Éclat de Nuit". A confident urban woman in her late twenties on a Parisian street at dusk, soft golden-hour rim light, holding a sleek dark amber perfume bottle in foreground. Editorial fashion photography, Vogue cover quality, shallow depth of field.

Bottom third of image: dark gradient with the following text laid over it, beautifully typeset:
- Headline (large, white, bold sans-serif, two lines): "La nuit t'appartient"
- Body (smaller, white): "Bergamote, oud, vanille. Un sillage qui ne s'oublie pas."
- CTA button (gold rounded pill, dark text, uppercase bold): "DÉCOUVRIR"

Layout: clean, premium, well-spaced. The text is sharp, readable, perfectly spelled in French. No watermarks. No logos other than the CTA button.`,
    },
    {
      name: "insurance-finance",
      prompt: `Square 1:1 finance ad creative. Premium dark theme, deep black background with subtle orange accent triangle diagram (three circles connected by glowing thin orange lines forming a triangle). Minimal, sophisticated, Apple-keynote level design.

Bottom half:
- Headline (large white bold sans-serif, two lines): "Votre argent, intouchable."
- Body (smaller white): "Le seul contrat où votre patrimoine est protégé à 3 niveaux."
- CTA button (orange rounded pill, white uppercase bold): "DÉMARREZ LA SIMULATION"

The text is sharp, perfectly spelled in French. Layout clean and premium. Editorial finance ad style.`,
    },
  ];

  for (const t of tests) {
    console.log(`\n→ ${t.name} on gemini-3-pro-image…`);
    const t0 = Date.now();
    const r = await runModel("gemini-3-pro-image", t.prompt);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (!r.ok) {
      console.log(`  ❌ ${dt}s — ${r.error}`);
      continue;
    }
    const dir = resolve(root, "tmp-composite-tests");
    mkdirSync(dir, { recursive: true });
    const out = resolve(dir, `gemini-full-${t.name}.png`);
    writeFileSync(out, r.bytes);
    console.log(`  ✓ ${dt}s — ${out}`);
  }
}

main().catch((e) => {
  console.error("\n❌", (e as Error).message);
  process.exit(1);
});
