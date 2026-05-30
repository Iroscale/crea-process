/**
 * Server-side helpers that call Claude on behalf of a brief:
 *  - chatTurn: respond to a new user message in a chat brief
 *  - finalizeBrief: produce the final structured brief JSON (angles + concepts)
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import { briefSchema, briefToolJsonSchema, type Brief } from "./brief-schema";
import { buildSystemPrompt } from "./prompt-builder";
import {
  formatBrandForBriefSystemPrompt,
  type BrandContext,
} from "./brand-context";
import { formatRegionForBriefSystemPrompt } from "./regions";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const CHAT_SYSTEM_SUFFIX = `

# Ton rôle dans ce chat
Tu accompagnes l'utilisateur pour préparer un brief de création publicitaire (ad carrée 1:1).
Tu poses des questions ciblées, tu suggères des angles d'attaque, tu proposes des variations.
Tu restes BREF (3-6 lignes par message max), tu vas droit au but, tu ne sermonnes pas.
Quand tu as assez d'infos pour produire un brief solide, dis-le explicitement à l'utilisateur :
"On a tout ce qu'il faut, tu peux cliquer sur **Finaliser le brief** quand tu veux."`;

const FINALIZE_SYSTEM_SUFFIX = `

# Ta tâche
Sur la base de tout le contexte (knowledge base, échanges, inspirations), produis le brief final
en appelant l'outil "produce_brief" UNE SEULE FOIS.

Le brief expose deux axes de variation à tester en parallèle :
- angles[]   → 3 à 5 variations de COPY (différents angles marketing pour le même produit)
- concepts[] → 3 à 5 variations de VISUEL (traitements créatifs RADICALEMENT différents)

À la génération, l'utilisateur combine M angles × N concepts × K modèles d'image. Plus tes
angles et concepts sont DIVERSIFIÉS et TRANCHÉS, plus le test sera riche.

# Comment écrire les angles[]
Chaque angle = un autre angle marketing pour le même produit. Couvre AU MOINS 3-4 leviers
psychologiques différents parmi :
- Sécurité / protection ("votre argent, intouchable")
- Performance / résultat ("rendement +X% en 3 ans")
- Statut / élitisme ("le contrat des UHNW")
- Urgence / scarcité ("avant la prochaine réforme")
- Social proof ("3000 patrimoines déjà protégés")
- Aspiration / projection ("partez l'esprit libre")
- Peur de manquer / FOMO ("ce que les autres ne savent pas")
- Simplicité ("en 2 minutes, vous savez")
- Comparatif ("ce que votre banque ne fait pas")
- Pédagogie ("comprendre pourquoi le Luxembourg")

Chaque angle :
- name : nom court mémorable (3-5 mots)
- rationale : pourquoi cet angle peut convertir (1 phrase)
- headline : court (max 8 mots), percutant
- body : 1 phrase max 12 mots (optionnel)
- cta : 2-4 mots impératif (optionnel)
- emphasis_words : 1-3 mots du headline à colorer en accent (optionnel)

# Comment écrire les concepts[]
Chaque concept = un traitement VISUEL radicalement différent. PAS de variations cosmétiques —
vise des familles vraiment éloignées pour maximiser la diversité du test.

## CRUCIAL — render_style et diversité

Sur Meta, le tout-cinematic-premium PERD contre la diversité. L'audience scroll-fatigue les
"belles pubs". Un brief solide MIXE les render_style à travers les concepts. Chaque concept
DOIT déclarer son render_style (champ obligatoire).

Les 7 styles disponibles :

▸ cinematic         — Apple keynote, Octane/Redshift, 3D premium, hero shot, pixel-perfect
                       Pour : prestige, identité de marque, statut, performance (1-2 max par brief)
▸ ugc               — Phone-shot iPhone, lumière naturelle de fenêtre, grain, sujet humain
                       casual filmé en 30s. Look candid, "vidéo de pote".
                       Pour : témoignage, preuve sociale, "j'ai testé", relatable
▸ screenshot_social — Faux SMS / DM / tweet / commentaire Insta — pas de photo, c'est UNE CAPTURE
                       D'ÉCRAN de téléphone (status bar, bulles, timestamp réalistes).
                       Pour : pain conversationnel, "ma sœur m'a recommandé", citation punchy
▸ editorial         — Magazine finance type Les Echos / Capital / Investir : kicker en small caps,
                       headline serif, photo + caption, byline, hairlines fines.
                       Pour : crédibilité institutionnelle, autorité, pédagogie sérieuse
▸ comparison_split  — Diptyque before/after — eux/nous — statu-quo/solution. Deux moitiés
                       fortement contrastées avec labels.
                       Pour : "ta banque vs nous", "avant le PEA / après", "x€/an perdus / gagnés"
▸ data_viz          — Chart-driven : la data est le héros. Bar / line / area chart en style FT
                       ou Bloomberg. Un point de donnée mis en accent.
                       Pour : preuve chiffrée, performance, démonstration objective
▸ meme              — Format meme reconnaissable (Drake, Two Buttons, This Is Fine, Galaxy Brain…)
                       avec punchline financière. Cible 25-40 ans, ton self-deprecating jamais
                       cringe.
                       Pour : angle humoristique, agacement vs systeme, complicité

## Règles de mix

- Pour 4-6 concepts : vise 2 cinematic + 1-2 ugc + 1 screenshot/editorial + 1 data_viz ou meme
- Pour 3 concepts : 1 cinematic + 1 ugc + 1 editorial OU screenshot OU data_viz
- INTERDIT : 3+ concepts dans le même render_style → tu manques de diversité
- Adapte selon le produit : pour un produit institutionnel (assurance-vie haut de gamme),
  pondère vers cinematic/editorial. Pour un produit fintech grand public, pondère vers
  ugc/screenshot/meme.

## Description selon le style

La description de chaque concept doit REFLÉTER son render_style — pas de description
"3D obsidian premium" pour un concept render_style=ugc. Concrètement :

- cinematic         → matières (obsidian, brushed gold), lighting volumétrique, Octane render
- ugc               → "phone-shot iPhone 15 Pro, natural daylight from kitchen window, slight
                       grain, hand-held framing slightly off-center, 30-something French person
                       talking to camera in casual outfit, eye contact, subtitle bar at bottom"
- screenshot_social → "iPhone Messages app screenshot, two contacts (e.g., 'Maman' and 'Moi'),
                       blue and grey bubbles, timestamp 14:23, conversation content [decrit ce
                       qui est dit]. Rendered as a flat phone-screen capture, slight tilt on
                       neutral background"
- editorial         → "Editorial magazine layout, kicker line in small caps top-left ('FINANCE
                       — DOSSIER ÉPARGNE'), serif headline (Tiempos / Domaine), single
                       photograph occupying right half with caption, sans-serif body in 2 columns,
                       byline, hairlines, paper-white background"
- comparison_split  → "Vertical split-screen 50/50, left half labelled 'AVANT' shows [pain visual],
                       right half labelled 'APRÈS' shows [solution visual]. Clear visual contrast
                       (color, lighting). Both halves coherent with brand palette."
                       ⚠ Pour ce render_style, tu DOIS fournir le champ comparison_labels :
                       un tableau de 2 chaînes courtes en MAJUSCULES (1-3 mots chacune) qui
                       étiquetteront chaque moitié. Ex : ["AVANT","APRÈS"], ["VOTRE BANQUE","NOUS"],
                       ["LIVRET A","[PRODUIT]"], ["SANS X","AVEC X"]. Le 1er = pain / statu-quo,
                       le 2nd = solution / produit. Sans ce champ, défaut "AVANT"/"APRÈS".
- data_viz          → "Sober infographic, Financial Times / Bloomberg-Opinion data desk style.
                       ONE bar/line/area chart dominates, axes labelled clearly, a single data
                       point highlighted in accent color, source line at bottom. Off-white
                       background, hairline grid, minimal."
- meme              → "[meme name] format adapted for finance — top panel shows [scene],
                       bottom panel shows [punchline scene]. Bold sans-serif white text with
                       black stroke OR modern Inter Bold. Background colour appropriate to meme."

## Description — règles transverses

- 200+ mots, dense, EN ANGLAIS, prête à injecter dans un prompt d'image
- NE PAS écrire le copy de l'ad dans la description — le headline/body/CTA seront ajoutés
  automatiquement par le générateur de prompt
- Pour ugc, screenshot_social, editorial, meme : tu PEUX décrire le contenu textuel imaginé
  dans la scène (ex: bulles SMS, citation magazine), il sera respecté ou remplacé selon
  le copy de l'angle
- INTERDITS : "Bloomberg corporate / institutional / professional" en générique, "clean /
  modern / minimal" sans descripteurs concrets, listes négatives "no text, no logos"

# Comment choisir text_overlay.theme + layout
text_overlay s'applique à tous les angles et concepts.
- layout : "bottom" par défaut, "split-bottom" pour un block coloré marqué
- text_color : hex contrasté avec la palette dominante (blanc sur sombre, noir sur clair)
- accent_color : couleur vive de la palette (CTA, mots emphase)
- accent_text_color : lisible sur accent (#000 sur or/jaune, #FFF sur rouge/sombre)
- scrim : "bottom-fade" pour layout=bottom et garantir lisibilité, "none" si le concept gère
  déjà la safe zone

# product_summary
1-2 phrases factuelles sur ce qu'on vend, à qui, et la promesse principale.`;

export async function chatTurn(
  projectId: string,
  history: { role: "user" | "assistant"; content: string }[],
  newUserMessage: string,
  inspirationAnalyses: string[] = []
): Promise<string> {
  const { systemPrompt } = await buildSystemPrompt(projectId);

  let system = systemPrompt + CHAT_SYSTEM_SUFFIX;
  if (inspirationAnalyses.length > 0) {
    system +=
      "\n\n# Inspirations uploadées par l'utilisateur\n" +
      inspirationAnalyses
        .map((a, i) => `## Inspiration ${i + 1}\n${a}`)
        .join("\n\n");
  }

  const messages: MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: newUserMessage },
  ];

  const client = getAnthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    system,
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text"
    ? textBlock.text.trim()
    : "[Pas de réponse]";
}

export async function finalizeBrief(
  projectId: string,
  context: {
    userInput: string | null;
    messages: { role: "user" | "assistant"; content: string }[];
    inspirationAnalyses: string[];
    brand?: BrandContext | null;
    region?: string | null;
  }
): Promise<Brief> {
  const { systemPrompt } = await buildSystemPrompt(projectId);
  const brandBlock = context.brand
    ? "\n\n" + formatBrandForBriefSystemPrompt(context.brand)
    : "";
  const regionBlock = context.region
    ? "\n\n" + formatRegionForBriefSystemPrompt(context.region)
    : "";
  const system =
    systemPrompt + brandBlock + regionBlock + FINALIZE_SYSTEM_SUFFIX;

  const parts: string[] = [];
  if (context.userInput) {
    parts.push(`# Brief court de l'utilisateur\n${context.userInput}`);
  }
  if (context.messages.length > 0) {
    parts.push(
      "# Conversation\n" +
        context.messages
          .map((m) => `**${m.role === "user" ? "Utilisateur" : "Assistant"}** : ${m.content}`)
          .join("\n\n")
    );
  }
  if (context.inspirationAnalyses.length > 0) {
    parts.push(
      "# Inspirations\n" +
        context.inspirationAnalyses
          .map((a, i) => `## Inspiration ${i + 1}\n${a}`)
          .join("\n\n")
    );
  }
  parts.push("Produis maintenant le brief final via l'outil produce_brief.");

  const client = getAnthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system,
    tools: [
      {
        name: "produce_brief",
        description:
          "Produit le brief final structuré : angles[] + concepts[] + theme.",
        input_schema: briefToolJsonSchema as unknown as Record<string, unknown> as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_brief" },
    messages: [{ role: "user", content: parts.join("\n\n") }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("L'agent n'a pas appelé l'outil produce_brief");
  }

  const parsed = briefSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      "Brief invalide : " + parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  return parsed.data;
}
