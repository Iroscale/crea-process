import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  const { runModel } = await import("../src/lib/fal");

  const premiumPrompt = `Cinematic square 1:1 ad creative, in the visual language of an Apple keynote reveal slide.

A floating, polished obsidian glass triangular contract document, suspended in deep dark void, edges catching a thin glowing line of warm gold (#C9A84C). The triangle has subtle isometric depth, levitating with soft cast shadow beneath. Around it, faint particles of gold dust drift through the volumetric light beams. Background is pure deep obsidian #050505 with a barely-perceptible radial gradient lifting to #1A1A2E in the upper-left, like the inside of a black-velvet vault. Three diamond-shaped vertices glow with warm gold internal light, each anchoring a thin connecting line that traces the equilateral form.

Lighting: a single soft spotlight from upper-camera-left grazes the front face of the triangle, revealing micro-texture on its surface; cool teal rim-light from camera-right defines the back edge. Fine cinematic film grain, soft chromatic aberration on highlights. Rendered like Octane + Redshift, 8K product photography meets motion-graphics still.

Composition: triangle occupies the upper 55% of the frame, perfectly centered, with vertices labeled in tiny crisp gold uppercase serif: "COMMISSARIAT" (top), "COMPAGNIE" (bottom-left), "BANQUE" (bottom-right) — labels float just outside each vertex with refined tracking. Bottom 40% recedes into pure obsidian void, providing breathing room.

Typography: premium sans-serif (SF Pro Display / Inter), tight kerning, large negative space.
- Headline (xl, #FFFFFF, bold, 2 lines): "Votre argent, intouchable au Luxembourg"
- Body (md, #B5B5B5, regular): "Le seul contrat qui sépare vos fonds de la compagnie."
- CTA (small gold #C9A84C rounded pill, #050505 uppercase bold): "DÉMARREZ LA SIMULATION"

Text floats elegantly in the lower void, integrated into the composition. Editorial, intentional, premium. Every pixel art-directed. No clip art. No watermarks. No stock-photo feel.`;

  console.log("→ gemini-3-pro-image with premium prompt…");
  const t0 = Date.now();
  const r = await runModel("gemini-3-pro-image", premiumPrompt);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) {
    console.log(`❌ ${dt}s — ${r.error}`);
    return;
  }
  const dir = resolve(root, "tmp-composite-tests");
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, "gemini-premium-luxembourg.png");
  writeFileSync(out, r.bytes);
  console.log(`✓ ${dt}s — ${out}`);
}

main().catch((e) => {
  console.error("\n❌", (e as Error).message);
  process.exit(1);
});
