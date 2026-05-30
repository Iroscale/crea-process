/**
 * Test direct de l'appel Claude pour la finalisation d'un brief.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { briefSchema, briefToolJsonSchema } from "../src/lib/brief-schema";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
loadEnv({ path: resolve(root, ".env.local"), override: true });

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY manquante dans .env.local");
    process.exit(1);
  }
  console.log(
    "✓ ANTHROPIC_API_KEY trouvée (length:",
    process.env.ANTHROPIC_API_KEY.length,
    ")"
  );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `Tu es un copywriter expert spécialisé dans la création d'ads carrées (1:1).

# Projet : Parfum Éclat
Marque de parfum premium pour femme.

# Tone of voice
Premium, désirable, direct. Tutoiement. Évite le jargon.

# Documentation produit
Le parfum "Éclat de Nuit" est un eau de parfum boisé floral, lancé en 2025.
Notes de tête : bergamote, poivre rose. Notes de cœur : rose de mai, jasmin.
Notes de fond : oud, vanille, musc. Cible : femmes 25-40, urbaines, sensuelles.
Prix : 89€ pour 50ml.

# Ta tâche
Sur la base de tout le contexte, produis le brief final en appelant l'outil "produce_brief" UNE SEULE FOIS.`;

  const userInput = `# Brief court de l'utilisateur
Veux pousser notre nouveau parfum Éclat de Nuit, cible 25-35 femmes urbaines,
ton premium et désirable. On veut une ambiance nocturne, sensuelle.

Produis maintenant le brief final via l'outil produce_brief.`;

  console.log("→ Appel Claude Sonnet 4.6 avec tool produce_brief…");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: systemPrompt,
    tools: [
      {
        name: "produce_brief",
        description: "Produit le brief final structuré pour la génération d'image.",
        input_schema: briefToolJsonSchema as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_brief" },
    messages: [{ role: "user", content: userInput }],
  });

  console.log("✓ Réponse reçue. stop_reason:", response.stop_reason);
  console.log("  usage:", response.usage);

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    console.error("❌ Pas de tool_use dans la réponse:");
    console.error(JSON.stringify(response.content, null, 2));
    process.exit(1);
  }

  console.log("\n=== Brief produit ===");
  console.log(JSON.stringify(toolUse.input, null, 2));

  const parsed = briefSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.error("\n❌ Brief NE VALIDE PAS le schema zod :");
    console.error(parsed.error.issues);
    process.exit(1);
  }
  console.log("\n✓ Brief valide selon zod");
}

main().catch((err) => {
  console.error("\n❌ Erreur :", (err as Error).message);
  if ("status" in (err as object)) {
    console.error("  HTTP status:", (err as { status: number }).status);
  }
  process.exit(1);
});
