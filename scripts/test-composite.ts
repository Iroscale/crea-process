/**
 * Test the compositor end-to-end.
 * Uses a known fal.ai image URL + sample brief.
 * Output : /tmp/composite-test-{layout}.jpg
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  const { compositeAd } = await import("../src/lib/composite-ad");

  // Use a known clean visual we generated earlier
  const imageUrl =
    "https://v3b.fal.media/files/b/0a97b002/hIvGr3FqkR35xFFqBLXwi_HFAAx97E.jpg";

  const layouts = ["bottom", "top", "center", "split-bottom"] as const;

  for (const layout of layouts) {
    console.log(`→ Composing layout=${layout}…`);
    const buf = await compositeAd({
      image: imageUrl,
      copy: {
        headline: "La nuit t'appartient",
        body: "Un sillage qui ne s'oublie pas. Bergamote, oud, vanille.",
        cta: "Découvrir",
      },
      textOverlay: {
        layout,
        theme: {
          text_color: "#FFFFFF",
          accent_color: "#C9A84C",
          accent_text_color: "#0A0A0A",
          scrim: layout === "bottom" ? "bottom-fade" : layout === "top" ? "top-fade" : "none",
        },
        emphasis_words: ["nuit"],
      },
    });
    const outDir = resolve(root, "tmp-composite-tests");
    mkdirSync(outDir, { recursive: true });
    const out = resolve(outDir, `composite-test-${layout}.jpg`);
    writeFileSync(out, buf);
    console.log(`  ✓ ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
