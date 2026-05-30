import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  const { runModel } = await import("../src/lib/fal");

  const prompt = `Cinematic square 1:1 ad creative for SimuAvenir, in the visual language of an Apple keynote reveal — premium, intentional, every pixel art-directed.

Deep obsidian black background (#050508) with a barely-perceptible cool blue radial gradient lifting toward upper-left. Subtle drifting motes of warm gold dust (#D4AF37) suspended in volumetric light beams crossing the frame from upper-camera-left.

Center of the frame: a luminous 3D equilateral triangle, edges drawn in fine glowing warm gold (#D4AF37) with soft inner ambient halo. Each vertex is a brilliant diamond-shaped node radiating warm white light, casting soft glow on surrounding pixels. The triangle floats with subtle isometric depth and a gentle cast shadow beneath, as if levitating in a black-velvet vault.

Vertex labels in tiny crisp white uppercase sans-serif, kerning tight, floating just outside each diamond:
- Top vertex: "COMMISSARIAT AUX ASSURANCES"
- Bottom-left: "COMPAGNIE D'ASSURANCE"
- Bottom-right: "BANQUE DÉPOSITAIRE"
Edge labels in muted gold lowercase serif, set along the inside of each edge:
- Left edge: "Contrôle"
- Right edge: "Contrôle"
- Bottom edge: "Comptes séparés"

Lighting: soft spotlight from upper-camera-left grazes the front face; cool teal rim-light from camera-right defines the back edge. Fine cinematic film grain and soft chromatic aberration on highlights. Rendered like Octane + Redshift, 8K product photography meets motion-graphics still.

Top of frame, centered, kicker line in small white uppercase sans-serif with tight letter-spacing: "TRIANGLE DE SÉCURITÉ"

Below the triangle, in the lower 30% of the frame, the typography:
- Headline (xl, #FFFFFF bold sans-serif Inter / SF Pro Display, 2 lines, with words "seul contrat" and "intouchable" emphasized in warm gold #D4AF37): "Le seul contrat où votre argent est intouchable"
- Body line (md, #B5B5B5 regular): "Assurance-vie luxembourgeoise"
- CTA pill button (warm gold #D4AF37, #050508 uppercase bold tight kerning): "DÉMARREZ LA SIMULATION"
- Tiny disclaimer below CTA in subtle gray #777: "(DÉPÔT MIN REQUIS 250K)"

Layout: balanced negative space, generous breathing room, premium editorial. Text floats elegantly, integrated into the composition rather than slapped on top. Every element intentional. No clip art, no watermarks, no stock-photo feel.

Color palette: deep obsidian black, warm gold accent, cool teal rim, warm white highlights. Maximum 4 colors total.`;

  console.log("→ gemini-3-pro-image — SimuAvenir Apple-keynote treatment…");
  const t0 = Date.now();
  const r = await runModel("gemini-3-pro-image", prompt);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) {
    console.log(`❌ ${dt}s — ${r.error}`);
    return;
  }
  const dir = resolve(root, "tmp-composite-tests");
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, "simuavenir-banana-pro.png");
  writeFileSync(out, r.bytes);
  console.log(`✓ ${dt}s — ${out}`);
}

main().catch((e) => {
  console.error("\n❌", (e as Error).message);
  process.exit(1);
});
