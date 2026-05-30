/**
 * Transforme l'analyse d'un import publicitaire en un Brief structuré.
 * L'idée Andrometa : on REPREND les angles + promesses gagnants tels quels
 * (ils ont prouvé leur valeur), et on FAIT VARIER les concepts visuels via
 * différents render_styles pour tester si le concept gagnant performe encore
 * mieux dans un autre registre (cinematic vs UGC vs editorial vs data viz…).
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import { briefSchema, briefToolJsonSchema, type Brief } from "./brief-schema";

export type LearningsInput = {
  importName: string;
  platform: string;
  winning_angles: { name: string; appearances_in_top: number; rationale: string }[];
  winning_promises: { promise: string; appearances_in_top: number; rationale: string }[];
  winning_concepts: {
    name: string;
    render_style: string;
    appearances_in_top: number;
    rationale: string;
  }[];
  losing_patterns: { pattern: string; rationale: string }[];
  recommendations: { title: string; detail: string }[];
};

const SYSTEM_PROMPT = `Tu es un expert en stratégie publicitaire. On te donne le résultat de l'analyse d'une campagne publicitaire active : les angles, promesses, concepts qui ont gagné (et ceux qui ont perdu). Tu dois produire un BRIEF de création publicitaire structuré qui réutilise ces learnings pour générer une nouvelle vague de créas optimisée.

PRINCIPE ANDROMETA — varier les concepts :
- Les ANGLES gagnants sont REPRIS tels quels (ils ont prouvé leur valeur sur les data réelles)
- Les PROMESSES gagnantes sont REPRISES (formulées telles qu'elles ont marché, ou avec léger raffinement)
- Les CONCEPTS gagnants sont REPRIS, MAIS on les diversifie en RENDER_STYLES différents pour tester
  si c'est le concept qui marche ou la combinaison concept × style. Si tu vois "Pyramide 3D" gagner
  en cinematic, propose AUSSI le même concept en UGC, en editorial, en comparison split. Mix les
  styles fortement (cf. règles de mix ci-dessous).

# Comment écrire les angles[] (3-5 items)
Reprends les angles gagnants 1:1 (mêmes name + headline). Pour chaque angle :
- name : court (3-5 mots, ex : "Sécurité absolue")
- rationale : "Angle gagnant validé sur Meta (apparu N fois dans le top 20%)"
- headline : reprends UNE des promesses gagnantes qui matche cet angle, formulée hook-style en max 8 mots
- body : courte phrase qui détaille la promesse (max 12 mots)
- cta : impératif court ("En savoir plus", "Découvrir", "Tester en 2 min", etc.)
- emphasis_words : 1-3 mots du headline à mettre en accent

# Comment écrire les concepts[] (4-6 items, MIXER les render_styles)
Reprends les concepts gagnants ET varie leur render_style. Règle :
- 1-2 cinematic premium (si présent dans les gagnants)
- 1-2 ugc / phone-shot (TOUJOURS proposer, c'est le manquant le plus fréquent)
- 1 screenshot_social (SMS / DM / tweet)
- 1 editorial (faux article finance)
- Optionnellement : 1 comparison_split, data_viz, ou meme

Pour chaque concept :
- name : nom court (ex : "Sablier en cristal", "Personne au calme avec son téléphone")
- rationale : pourquoi ce concept × ce style (ex : "Concept gagnant 'Pyramide' validé en cinematic, on teste en UGC pour le rendre plus relatable")
- render_style : un de ["cinematic", "ugc", "screenshot_social", "editorial", "comparison_split", "data_viz", "meme"]
- description : description visuelle DENSE en ANGLAIS (200+ mots), prête à injecter dans un prompt d'image, cohérente avec le render_style choisi.

# text_overlay
Choisis un layout (bottom / top / center / split-bottom) + un theme (text_color, accent_color, accent_text_color, scrim) cohérent avec les concepts. Si tu n'as pas de marque imposée, choisis des couleurs neutres premium (#0A0A0A, #FFD700 par défaut).

# product_summary
Synthèse 1-2 phrases sur ce que vend la campagne. Déduis-le des angles + promesses.

INTERDITS (tu enfreins, le brief est rejeté) :
- NE PAS ignorer les insights gagnants
- NE PAS reproduire les patterns perdants
- NE PAS empiler 4 concepts cinematic — diversifie absolument
- NE PAS inventer des chiffres (utilise les promesses telles qu'elles sont écrites)

Appelle l'outil produce_brief UNE SEULE FOIS avec le brief complet.`;

export async function generateBriefFromLearnings(
  input: LearningsInput
): Promise<Brief> {
  const client = getAnthropic();

  const winningAnglesText = input.winning_angles
    .map(
      (a, i) =>
        `${i + 1}. "${a.name}" (×${a.appearances_in_top} dans le top) — ${a.rationale}`
    )
    .join("\n");
  const winningPromisesText = input.winning_promises
    .map(
      (p, i) =>
        `${i + 1}. "${p.promise}" (×${p.appearances_in_top}) — ${p.rationale}`
    )
    .join("\n");
  const winningConceptsText = input.winning_concepts
    .map(
      (c, i) =>
        `${i + 1}. "${c.name}" en ${c.render_style} (×${c.appearances_in_top}) — ${c.rationale}`
    )
    .join("\n");
  const losingText = input.losing_patterns
    .map((p, i) => `${i + 1}. ${p.pattern} — ${p.rationale}`)
    .join("\n");
  const recsText = input.recommendations
    .map((r, i) => `${i + 1}. ${r.title} : ${r.detail}`)
    .join("\n");

  const userPayload = `Source des learnings : ${input.importName} (${input.platform})

══ ANGLES GAGNANTS (top 20% des ads) ══
${winningAnglesText || "(aucun identifié)"}

══ PROMESSES GAGNANTES ══
${winningPromisesText || "(aucune identifiée)"}

══ CONCEPTS GAGNANTS ══
${winningConceptsText || "(aucun identifié)"}

══ PATTERNS PERDANTS (à éviter) ══
${losingText || "(aucun identifié)"}

══ RECOMMANDATIONS DE L'ANALYSE ══
${recsText || "(aucune)"}

Produis maintenant le brief structuré via l'outil produce_brief, en réutilisant les angles + promesses gagnants et en variant les render_styles pour les concepts (Andrometa).`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "produce_brief",
        description:
          "Produit le brief final structuré : angles[] + concepts[] + theme.",
        input_schema: briefToolJsonSchema as unknown as Record<
          string,
          unknown
        > as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_brief" },
    messages: [{ role: "user", content: userPayload }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      "Claude n'a pas appelé produce_brief — impossible de créer le brief"
    );
  }
  const parsed = briefSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      "Brief invalide : " + parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  return parsed.data;
}
