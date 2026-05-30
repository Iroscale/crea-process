import { z } from "zod";

/**
 * Structured product brief produced by Claude from all knowledge files
 * uploaded to a project. Stored on `projects.structured_knowledge` and
 * iteratively refined via the knowledge chat.
 *
 * Designed for leadgen Meta finance française — the fields capture what
 * matters to write a converting ad : promesse, cible, preuve, ton, tabous.
 */
export const structuredKnowledgeSchema = z.object({
  product_summary: z
    .string()
    .describe("1-3 phrases : ce qu'on vend, à qui, la promesse principale"),

  target_audience: z
    .string()
    .describe("Profil cible : qui ils sont, leur situation, leurs aspirations"),

  pain_points: z
    .array(z.string())
    .describe("Douleurs / frustrations qu'ils ressentent (3-7 bullets)"),

  value_propositions: z
    .array(z.string())
    .describe("Bénéfices concrets du produit (3-7 bullets)"),

  differentiators: z
    .array(z.string())
    .describe(
      "Ce qui distingue de la concurrence (3-5 bullets, factuel pas marketing)"
    ),

  proof_points: z
    .array(z.string())
    .describe(
      "Chiffres, certifications, social proof, agrément, partenariats (3-7 bullets)"
    ),

  pricing: z
    .string()
    .nullable()
    .describe("Modèle tarifaire ou ordre de grandeur (null si non précisé)"),

  objections: z
    .array(z.string())
    .describe("Objections fréquentes des prospects (3-5 bullets)"),

  brand_voice: z.object({
    tone: z
      .string()
      .describe("Ton général : sérieux institutionnel / chaleureux / direct…"),
    do_say: z
      .array(z.string())
      .describe("Mots-clés / formulations bienvenus (3-7 items)"),
    dont_say: z
      .array(z.string())
      .describe(
        "Mots / promesses à éviter (risque légal, hype, cringe) (3-7 items)"
      ),
  }),

  hooks_to_use: z
    .array(z.string())
    .describe(
      "Angles d'attaque marketing qui peuvent fonctionner pour ce produit (3-7 bullets)"
    ),

  hooks_to_avoid: z
    .array(z.string())
    .describe(
      "Angles à éviter (cringe, légalement risqué, hors-cible) (2-5 bullets)"
    ),

  legal_constraints: z
    .string()
    .describe(
      "Contraintes légales / réglementaires (AMF, ACPR, mentions obligatoires…). Vide si aucune."
    ),

  notes: z
    .string()
    .describe(
      "Notes libres ajoutées via le chat (corrections de l'utilisateur, contexte additionnel)"
    ),

  updated_at: z
    .string()
    .describe("ISO datetime de la dernière mise à jour"),
});

export type StructuredKnowledge = z.infer<typeof structuredKnowledgeSchema>;

/**
 * Anthropic tool input_schema — same shape as `structuredKnowledgeSchema` but
 * in JSON Schema form because the SDK requires JSON Schema for tools.
 */
export const structuredKnowledgeToolJsonSchema = {
  type: "object",
  properties: {
    product_summary: { type: "string" },
    target_audience: { type: "string" },
    pain_points: { type: "array", items: { type: "string" } },
    value_propositions: { type: "array", items: { type: "string" } },
    differentiators: { type: "array", items: { type: "string" } },
    proof_points: { type: "array", items: { type: "string" } },
    pricing: { type: ["string", "null"] },
    objections: { type: "array", items: { type: "string" } },
    brand_voice: {
      type: "object",
      properties: {
        tone: { type: "string" },
        do_say: { type: "array", items: { type: "string" } },
        dont_say: { type: "array", items: { type: "string" } },
      },
      required: ["tone", "do_say", "dont_say"],
    },
    hooks_to_use: { type: "array", items: { type: "string" } },
    hooks_to_avoid: { type: "array", items: { type: "string" } },
    legal_constraints: { type: "string" },
    notes: { type: "string" },
  },
  required: [
    "product_summary",
    "target_audience",
    "pain_points",
    "value_propositions",
    "differentiators",
    "proof_points",
    "pricing",
    "objections",
    "brand_voice",
    "hooks_to_use",
    "hooks_to_avoid",
    "legal_constraints",
    "notes",
  ],
} as const;
