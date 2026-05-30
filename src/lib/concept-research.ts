/**
 * Concept research — "ne jamais manquer d'angles marketing".
 *
 * Two-step pipeline :
 *   1. RESEARCH  — Claude with the web_search server tool actually browses the
 *      web (Reddit, blogs, forums, competitor sites, market reports) and writes
 *      a dense research memo with inline citations.
 *   2. STRUCTURE — a second Claude call (no web) turns that memo into a typed
 *      schema : marketing angles, pain points, audience questions, content
 *      topics, market trends, competitor angles.
 *
 * The web_search tool is passed untyped (SDK 0.39 has no typings for it) — the
 * API supports it server-side regardless.
 */
import { z } from "zod";
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import { formatRegionForBriefSystemPrompt } from "./regions";
import type { StructuredKnowledge } from "./structured-knowledge-schema";

// ──────────────────────────────────────────────────────────────────────────
// OUTPUT SCHEMA
// ──────────────────────────────────────────────────────────────────────────

export const conceptResearchSchema = z.object({
  niche_summary: z
    .string()
    .describe("Synthèse du marché / de la niche en 2-4 phrases"),
  marketing_angles: z
    .array(
      z.object({
        angle: z.string().describe("L'angle marketing en 1 phrase punchy"),
        rationale: z.string().describe("Pourquoi ça peut convertir"),
        lever: z
          .string()
          .describe(
            "Levier psychologique : urgence / peur / statut / social proof / FOMO / simplicité / pédagogie / aspiration"
          ),
        source_hint: z
          .string()
          .describe("D'où vient l'insight (ex : 'thread Reddit r/vosfinances', 'article Les Echos')"),
      })
    )
    .describe("6-12 angles marketing actionnables"),
  pain_points: z
    .array(
      z.object({
        pain: z.string().describe("La douleur / frustration exprimée"),
        evidence: z
          .string()
          .describe("Citation ou paraphrase de ce qu'on a trouvé en ligne"),
        intensity: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("5-10 pain points réels"),
  audience_questions: z
    .array(
      z.object({
        question: z.string().describe("Question réelle posée par l'audience"),
        platform: z
          .string()
          .describe("Plateforme (Reddit r/X, Quora, forum, commentaire YouTube…)"),
        angle_opportunity: z
          .string()
          .describe("L'angle / le contenu qu'on pourrait créer pour y répondre"),
      })
    )
    .describe("5-10 vraies questions de l'audience"),
  content_topics: z
    .array(
      z.object({
        topic: z.string(),
        why_it_resonates: z.string(),
      })
    )
    .describe("4-8 sujets de contenu qui marchent dans cette niche"),
  trends: z
    .array(
      z.object({
        trend: z.string(),
        implication: z.string().describe("Ce que ça implique pour le marketing"),
      })
    )
    .describe("3-6 tendances marché actuelles"),
  competitor_angles: z
    .array(
      z.object({
        competitor: z.string(),
        angle: z.string().describe("L'angle / le positionnement qu'ils utilisent"),
      })
    )
    .describe("3-6 angles utilisés par les concurrents"),
});

export type ConceptResearch = z.infer<typeof conceptResearchSchema>;

const conceptResearchJsonSchema = {
  type: "object",
  properties: {
    niche_summary: { type: "string" },
    marketing_angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string" },
          rationale: { type: "string" },
          lever: { type: "string" },
          source_hint: { type: "string" },
        },
        required: ["angle", "rationale", "lever", "source_hint"],
      },
    },
    pain_points: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pain: { type: "string" },
          evidence: { type: "string" },
          intensity: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["pain", "evidence", "intensity"],
      },
    },
    audience_questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          platform: { type: "string" },
          angle_opportunity: { type: "string" },
        },
        required: ["question", "platform", "angle_opportunity"],
      },
    },
    content_topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          why_it_resonates: { type: "string" },
        },
        required: ["topic", "why_it_resonates"],
      },
    },
    trends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          trend: { type: "string" },
          implication: { type: "string" },
        },
        required: ["trend", "implication"],
      },
    },
    competitor_angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          competitor: { type: "string" },
          angle: { type: "string" },
        },
        required: ["competitor", "angle"],
      },
    },
  },
  required: [
    "niche_summary",
    "marketing_angles",
    "pain_points",
    "audience_questions",
    "content_topics",
    "trends",
    "competitor_angles",
  ],
} as const;

// ──────────────────────────────────────────────────────────────────────────
// PIPELINE
// ──────────────────────────────────────────────────────────────────────────

type ContentBlock = { type: string; text?: string; [k: string]: unknown };

export async function researchConcepts(args: {
  niche: string;
  region?: string | null;
  knowledge?: StructuredKnowledge | null;
}): Promise<{ research: ConceptResearch; sources: string[] }> {
  const client = getAnthropic();

  // ─── STEP 1 : web research memo ────────────────────────────────────────
  const ctxLines: string[] = [];
  ctxLines.push(`# SUJET DE RECHERCHE\n${args.niche}`);
  if (args.knowledge) {
    ctxLines.push("");
    ctxLines.push("# CONTEXTE PRODUIT (pour cibler la recherche)");
    ctxLines.push(`Produit : ${args.knowledge.product_summary}`);
    ctxLines.push(`Cible : ${args.knowledge.target_audience}`);
  }
  if (args.region && args.region !== "international") {
    const r = formatRegionForBriefSystemPrompt(args.region);
    if (r) {
      ctxLines.push("");
      ctxLines.push(r);
      ctxLines.push(
        "Priorise les sources et insights pertinents pour cette région."
      );
    }
  }
  ctxLines.push("");
  ctxLines.push(`# TA MISSION
Tu es un strategist marketing qui fait de la recherche terrain. Utilise web_search de façon AGRESSIVE (plusieurs recherches) pour creuser cette niche :
- Cherche des THREADS Reddit (r/vosfinances, r/france, r/personalfinance…) où l'audience exprime ses douleurs, pose des questions, débat.
- Cherche des ARTICLES de blog / presse qui marchent sur le sujet (angles, titres).
- Cherche ce que font les CONCURRENTS (leurs accroches, leur positionnement).
- Cherche les TENDANCES récentes (réglementation, chiffres marché, actualité).
- Cherche les QUESTIONS fréquentes (Quora, forums, "People also ask", commentaires YouTube).

Fais au moins 4-6 recherches web distinctes. Puis écris un MÉMO DE RECHERCHE dense et structuré en français, avec :
- Les vraies douleurs détectées (cite/paraphrase ce que tu as lu, mentionne la source)
- Les questions réelles de l'audience + la plateforme
- Les angles marketing exploitables (avec le levier psychologique)
- Les sujets de contenu qui résonnent
- Les tendances marché
- Les angles des concurrents

Sois SPÉCIFIQUE et SOURCÉ — pas de généralités. C'est de la recherche terrain, pas du brainstorming en chambre.`);

  const researchResp = await client.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: ctxLines.join("\n") }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 8,
        },
      ],
    } as unknown as Parameters<typeof client.messages.create>[0]
  );

  // Collect the memo text + the cited source URLs.
  const blocks = (
    researchResp as unknown as { content: ContentBlock[] }
  ).content;
  const memo = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n\n")
    .trim();

  const sources = extractSources(blocks);

  if (!memo) {
    throw new Error("La recherche web n'a renvoyé aucun contenu exploitable");
  }

  // ─── STEP 2 : structure the memo ───────────────────────────────────────
  const structureResp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system:
      "Tu structures un mémo de recherche marketing en JSON via l'outil produce_concept_research. Garde les insights SPÉCIFIQUES et SOURCÉS du mémo — n'invente rien, ne dilue pas. Français.",
    tools: [
      {
        name: "produce_concept_research",
        description:
          "Structure le mémo de recherche en angles / pain points / questions / topics / tendances / angles concurrents.",
        input_schema: conceptResearchJsonSchema as unknown as Record<
          string,
          unknown
        > as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_concept_research" },
    messages: [
      {
        role: "user",
        content: `Voici le mémo de recherche terrain à structurer :\n\n${memo}\n\nStructure-le maintenant via produce_concept_research.`,
      },
    ],
  });

  const toolUse = structureResp.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("La structuration n'a pas appelé produce_concept_research");
  }
  const parsed = conceptResearchSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      "Recherche concept invalide : " +
        parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  return { research: parsed.data, sources };
}

/**
 * Pull cited URLs out of the web_search result blocks + text citations.
 */
function extractSources(blocks: ContentBlock[]): string[] {
  const urls = new Set<string>();
  for (const b of blocks) {
    // web_search_tool_result blocks carry an array of results with `url`
    if (b.type === "web_search_tool_result") {
      const content = (b as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const r of content) {
          const u = (r as { url?: string }).url;
          if (u) urls.add(u);
        }
      }
    }
    // text blocks may carry citations with url
    const citations = (b as { citations?: unknown }).citations;
    if (Array.isArray(citations)) {
      for (const c of citations) {
        const u = (c as { url?: string }).url;
        if (u) urls.add(u);
      }
    }
  }
  return Array.from(urls).slice(0, 30);
}
