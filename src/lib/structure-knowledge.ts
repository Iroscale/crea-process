/**
 * Server-side helpers for the project knowledge structuring flow:
 *  - structureKnowledgeFromFiles : produit la première version du brief
 *    structuré à partir de tous les fichiers déposés.
 *  - applyChatTurnToKnowledge   : prend l'état actuel + un message
 *    utilisateur, retourne une réponse + une version mise à jour du brief
 *    (corrections, ajouts).
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import {
  structuredKnowledgeSchema,
  structuredKnowledgeToolJsonSchema,
  type StructuredKnowledge,
} from "./structured-knowledge-schema";

export type KnowledgeFileExtract = {
  file_name: string;
  kind: string;
  extracted_text: string | null;
};

const STRUCTURE_SYSTEM_PROMPT = `Tu es un strategist-copywriter expert en leadgen Meta finance française. On te donne un ensemble de documents que l'utilisateur a déposés sur son projet : fiches produit, scripts de pubs, anciennes annonces, copywriting, etc.

# TA MISSION
Produire un BRIEF PRODUIT STRUCTURÉ qui résume tout ce qu'il faut savoir pour écrire des publicités efficaces sur ce produit. Tu appelles l'outil "produce_structured_knowledge" UNE SEULE FOIS avec ta meilleure synthèse.

# RÈGLES
- **Factuel, pas marketing** : tu extrais ce qui est dans les docs, sans inventer ni romancer.
- **Spécifique** : "épargne pour 35-50 ans patrimoine constitué" > "épargne pour adultes".
- **Si une info manque**, laisse le champ raisonnable vide ou minimal — ne fabule pas.
- **Pricing** : si jamais aucune info tarifaire n'est dans les docs, mets null. Si ordre de grandeur, écris "à partir de X €" ou "frais de gestion ~X %".
- **Brand voice** : déduis-le du ton des docs existants. Si serial-killer du jargon legal, dont_say = ["garanti", "100 %", "explosif", "incroyable", "miraculeux"] etc.
- **Hooks_to_use / hooks_to_avoid** : déduis ce qui peut converter SANS risquer un blocage Meta ou AMF.
- **legal_constraints** : si finance française, mention au minimum les obligations AMF/ACPR si pertinent (mentions légales, profil de risque, performances passées, etc.). Sinon laisse vide.
- **Aucun chiffre inventé** — uniquement ceux des docs.
- **notes** : laisse vide pour la première structuration (ce champ sert pour les ajouts via chat).
- Français, accents corrects.`;

const CHAT_SYSTEM_PROMPT_BASE = `Tu es un strategist-copywriter qui aide l'utilisateur à raffiner son BRIEF PRODUIT STRUCTURÉ. Tu as accès à l'état actuel + à l'historique de conversation.

# COMPORTEMENT
- L'utilisateur peut envoyer des CORRECTIONS ("le pricing c'est 1.2 % pas 2 %") ou des AJOUTS ("on est aussi disponible en démembrement de propriété").
- À chaque tour : tu réponds brièvement (2-4 lignes max) ET tu appelles l'outil "produce_structured_knowledge" avec la version MISE À JOUR du brief intégrant la correction / l'ajout.
- Si l'utilisateur pose une question SANS demander de modification, tu réponds normalement et tu remets à jour le brief en mettant le champ "notes" à jour avec ce qu'on a appris (ou tu laisses inchangé si rien à modifier).
- Tu gardes TOUS les champs du brief — ne supprime rien involontairement.
- Tu mets à jour le champ "notes" en fin de tour avec un changelog très court (style "+pricing corrigé à 1.2%").

# FORMAT DE RÉPONSE
1. D'abord un message texte court à l'utilisateur (2-4 lignes max, naturel)
2. Ensuite, l'appel à l'outil "produce_structured_knowledge" avec le brief complet mis à jour`;

function buildKnowledgeContextBlock(
  files: KnowledgeFileExtract[]
): string {
  if (files.length === 0) {
    return "(aucun document texte exploitable n'a été déposé)";
  }
  const sections: string[] = [];
  // Group by kind for readability
  const byKind = new Map<string, KnowledgeFileExtract[]>();
  for (const f of files) {
    if (!f.extracted_text) continue;
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }
  const order = ["product_doc", "copywriting_doc", "script", "past_ad", "other"];
  for (const kind of order) {
    const list = byKind.get(kind);
    if (!list || list.length === 0) continue;
    sections.push(`## ${kind}\n`);
    for (const f of list) {
      sections.push(`### ${f.file_name}\n${f.extracted_text}\n`);
    }
  }
  return sections.join("\n");
}

/**
 * First-pass structuring : Claude reads every knowledge file and produces
 * a coherent structured product brief.
 */
export async function structureKnowledgeFromFiles(args: {
  projectName: string;
  projectDescription: string | null;
  files: KnowledgeFileExtract[];
}): Promise<StructuredKnowledge> {
  const client = getAnthropic();

  const lines: string[] = [];
  lines.push(`# PROJET : ${args.projectName}`);
  if (args.projectDescription) {
    lines.push(`Description : ${args.projectDescription}`);
  }
  lines.push("");
  lines.push("# DOCUMENTS DÉPOSÉS PAR L'UTILISATEUR");
  lines.push(buildKnowledgeContextBlock(args.files));
  lines.push("");
  lines.push(
    "Produis maintenant le brief structuré via l'outil produce_structured_knowledge."
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: STRUCTURE_SYSTEM_PROMPT,
    tools: [
      {
        name: "produce_structured_knowledge",
        description:
          "Produit le brief produit structuré (synthèse condensée de toute la knowledge base).",
        input_schema:
          structuredKnowledgeToolJsonSchema as unknown as Record<string, unknown> as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_structured_knowledge" },
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("L'agent n'a pas appelé l'outil produce_structured_knowledge");
  }
  const input = toolUse.input as Record<string, unknown>;
  // Inject server-set fields (notes empty, updated_at now)
  const enriched = {
    ...input,
    notes: typeof input.notes === "string" ? input.notes : "",
    updated_at: new Date().toISOString(),
  };
  const parsed = structuredKnowledgeSchema.safeParse(enriched);
  if (!parsed.success) {
    throw new Error(
      "Brief structuré invalide : " +
        parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  return parsed.data;
}

/**
 * Chat turn : applies a user correction/addition to the current structured
 * brief and returns both an assistant text reply AND an updated brief.
 */
export async function applyChatTurnToKnowledge(args: {
  projectName: string;
  current: StructuredKnowledge;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  files: KnowledgeFileExtract[];
}): Promise<{ assistantReply: string; updatedKnowledge: StructuredKnowledge }> {
  const client = getAnthropic();

  // System prompt embeds the current state + the source documents so Claude
  // has full context for the correction.
  const systemParts: string[] = [];
  systemParts.push(CHAT_SYSTEM_PROMPT_BASE);
  systemParts.push("");
  systemParts.push(`# PROJET : ${args.projectName}`);
  systemParts.push("");
  systemParts.push("# ÉTAT ACTUEL DU BRIEF STRUCTURÉ (JSON)");
  systemParts.push("```json");
  systemParts.push(JSON.stringify(args.current, null, 2));
  systemParts.push("```");
  systemParts.push("");
  systemParts.push("# DOCUMENTS SOURCE (référence)");
  systemParts.push(buildKnowledgeContextBlock(args.files));
  const system = systemParts.join("\n");

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    system,
    tools: [
      {
        name: "produce_structured_knowledge",
        description:
          "Met à jour le brief produit structuré complet avec la correction / l'ajout demandé par l'utilisateur. Renvoie le brief ENTIER, pas juste les champs modifiés.",
        input_schema:
          structuredKnowledgeToolJsonSchema as unknown as Record<string, unknown> as never,
      },
    ],
    // Forcer l'appel d'outil en plus du texte
    tool_choice: { type: "tool", name: "produce_structured_knowledge" },
    messages: [
      ...args.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: args.userMessage },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    // Si l'outil n'a pas été appelé (ne devrait pas arriver avec tool_choice),
    // on conserve l'état actuel et on se contente du texte.
    return {
      assistantReply:
        textBlock && textBlock.type === "text"
          ? textBlock.text.trim()
          : "[L'agent n'a pas pu mettre à jour le brief.]",
      updatedKnowledge: args.current,
    };
  }
  const input = toolUse.input as Record<string, unknown>;
  const enriched = {
    ...input,
    notes: typeof input.notes === "string" ? input.notes : args.current.notes,
    updated_at: new Date().toISOString(),
  };
  const parsed = structuredKnowledgeSchema.safeParse(enriched);
  if (!parsed.success) {
    throw new Error(
      "Brief structuré invalide après chat : " +
        parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  const reply =
    textBlock && textBlock.type === "text"
      ? textBlock.text.trim()
      : "Brief mis à jour. ✓";
  return {
    assistantReply: reply,
    updatedKnowledge: parsed.data,
  };
}
