/**
 * Server-side helpers for the landing page generation flow.
 *
 *  - generateLandingPage    : produit le brief LP + content_a + content_b
 *    en un seul appel Claude tool_use.
 *  - applyChatTurnToLP      : applique une correction utilisateur (chat) en
 *    régénérant la version concernée tout en préservant le reste.
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import {
  buildLandingPageToolSchema,
  landingPageContentSchema,
  landingPageBriefSchema,
  TEMPLATES,
  type LandingPageBrief,
  type LandingPageContent,
  type TemplateId,
} from "./landing-page-schema";
import type { BrandContext } from "./brand-context";
import { formatBrandForBriefSystemPrompt } from "./brand-context";
import { formatRegionForBriefSystemPrompt } from "./regions";
import type { StructuredKnowledge } from "./structured-knowledge-schema";

const SYSTEM_PROMPT_BASE = `Tu es un copywriter expert en landing pages Meta Ads finance / comparateur (style Foxstone, Ramify, Yomoni, Goodvest, Bourse Direct). Tu maîtrises les funnels de capture qualifiée, le copywriting direct response, les codes de réassurance réglementaire (AMF / ACPR), et le 80/20 marketing : où concentrer le copy pour maximiser la conversion.

# RÉFÉRENCE STRUCTURELLE — lp.foxstone.ch
Le template "trust-funnel" RÉPLIQUE EXACTEMENT la structure Foxstone, qui a été optimisée à coups de millions d'€ ad-spend. Tu dois remplir TOUTES les sections, en respectant les règles Foxstone :

- **hero.badge** : un chiffre fort + drapeau pays. Ex Foxstone : "🇨🇭 6.8% de rendement moyen en 2024". Adapte au produit (chiffre clé + symbole pays/marque).
- **hero.headline** : 6-12 mots, structure "Verbe d'action + bénéfice + précision". Ex Foxstone : "Générez des revenus stables grâce à l'immobilier suisse".
- **hero.headline_accent_words** : les 1-3 mots à colorer en accent. Ex Foxstone : ["l'immobilier suisse"]. Cible le mot qui définit la PROMESSE.
- **hero.sub** : 1-2 phrases courtes. Ex Foxstone : "Investissez en quelques clics dès CHF 10'000, sans gestion ni tracas. Nous nous occupons de tout."
- **hero.social_proof_line** : ligne de social proof juste sous le sub. Ex Foxstone : "Rejoignez une communauté de 30'000+ investisseurs !"
- **hero.cta** : verbe d'action + complément (ex : "Découvrir les opportunités", "Calculer mon rendement", "Démarrer ma simulation").
- **hero.cta_reassurance** : 3 micro-bullets séparés par "•". Ex Foxstone : "S'inscrire gratuitement • 2 minutes • Sans engagement".
- **hero.ratings** : Trustpilot + Google + 1 plateforme tierce si dispo. Format : platform / rating / count. Inventer plausible si pas de donnée.
- **hero.lead_magnet_banner** : un ebook / guide / livre blanc offert pour amorcer la capture. Banner inline sous les ratings.

- **stats_band** : 4 chiffres clés en GRANDE typo. Ex Foxstone : "CHF 16.8M+ Revenus distribués · 30K+ Investisseurs · CHF 389M+ Investis · 90 Projets". CHIFFRES PLAUSIBLES, pas hyperboliques.

- **press_logos** : "Ils parlent de nous" + 4-8 noms médias plausibles dans la verticale (Les Echos, Capital, Bilan, Le Temps, BFM Business, Investir, etc.).

- **solutions** : 2-3 produits / offres distincts, chacun avec son flow d'étapes. Ex Foxstone : Co-propriété (Dès CHF 25'000 · 7 ans+ · Distributions trimestrielles + 4 étapes spécifiques) ET Crowdlending (Dès CHF 10'000 · 12-36 mois · Annuelle ou échéance + 4 étapes spécifiques). Si le produit est mono, fait UN seul item enrichi.

- **why_us** : 4 raisons d'utiliser le produit. Sans icône. Format Foxstone : titre court + 2-3 phrases qui développent. Ex : "Dès CHF 10'000" / "Rendements attractifs" / "Transparence et sélection rigoureuse" / "100% digital, zéro contrainte". Inclure un legal_disclaimer pour les rendements (*Les performances passées ne préjugent pas...).

- **opportunities** : 2-4 cartes d'opportunités d'investissement actuelles. Format Foxstone : type / status (En cours, Financé) / location (Orbe, VD) / category (Résidentiel) / 3-4 details (Prix d'achat, Invest. min., Rendement cible, Taux d'intérêt). PEUT ÊTRE DES EXEMPLES PLAUSIBLES si pas de vraies données.

- **how_it_works** : 4 étapes générales du parcours user (Inscription → Accès → Sélection → Profit, ou équivalent). DIFFÉRENT des steps internes aux solutions.

- **social_proof.testimonials** : 4-5 témoignages détaillés (~50-100 mots chacun) avec prénom + initial + rôle / âge plausible. Ex Foxstone : "Marco Torti / Retraité", "Alexandre B. / COO d'une Start-up". Pas de noms complets (anonymat).

- **brand_story** : ADN de la marque. Format Foxstone : kicker NOTRE HISTOIRE + headline (ex : "L'ADN de [marque]") + intro courte + 3-5 quotes narratives qui racontent (1ères ventes, anecdote fondateur, vision) + un closing_quote signé (nom + rôle). PAS d'inventer des fondateurs, mais on peut rester abstrait ("le co-fondateur").

- **simulator** : calculatrice de rendement. 3 inputs typiques : montant investi (amount), rendement annuel estimé (rate), durée (duration). 4 outputs calculés : revenu trimestriel, annuel, total, valeur totale. Disclaimer obligatoire AMF/ACPR.

- **lead_magnet_section** : section dédiée à l'ebook (RAPPELLE celui du hero). Format Foxstone : kicker EBOOK OFFERT + headline (ex : "Le guide complet pour [thème]") + sub + 4-5 bullets du contenu + CTA "Créer mon compte et recevoir l'ebook".

- **faq** : 6-8 vraies questions, pas génériques. Ex Foxstone : "Qu'est-ce que [produit] ?", "Comment fonctionne [mécanisme] ?", "Quel est le montant minimum ?", "Quel est le rendement moyen ?", "Comment sont sélectionnés les [biens/produits] ?", "Différences entre [produit A] et [produit B] ?".

- **cta_final** : "Prêt à [verbe d'action] ?" + sub social proof + CTA + 3 bénéfices avec "✓" en sépaateurs (ex : "✓ Gratuit · ✓ Sans engagement · ✓ Plateforme suisse").


# TA MISSION
Sur la base du contexte projet (knowledge base structurée + brand DA + région) et du brief court de l'utilisateur, tu produis :

1. **brief** : la synthèse stratégique de la LP (produit, cible, objectif, hook angle, promesse, proof points)
2. **content_a** : la PREMIÈRE version complète de la LP (toutes les sections du template)
3. **content_b** : la SECONDE version — A/B test "20/80 agency-style"

## RÈGLES A/B TEST 20/80
Tu ne testes PAS tout en même temps. Pour avoir des données rapides, tu changes UNIQUEMENT les leviers à fort impact :
- **Hero headline** : versions opposées (chiffre vs émotion / sécurité vs performance / négatif vs positif)
- **Hero sub** : reformule complètement la promesse pour amplifier le hook différent
- **Hero CTA label** : action vs promesse ("Découvrir mon plan" vs "Recevoir le guide gratuit")
- **CTA final** : même règle
- **Optionnel** : 1 social proof testimonial différent OU 1 stat différente

⚠ Le RESTE des sections (problem, features, comparator, security, FAQ…) doit être **IDENTIQUE** entre A et B. C'est ce qui isole la variable testée. Une grosse agence marketing testerait UNE chose à la fois pour avoir des données interprétables.

## RÈGLES COPYWRITING (Andrometa direct-response)
- **Headlines** : 6-12 mots, hook spécifique, pas générique. Préfère "Récupérer 3 % d'inflation perdue" à "Mieux investir".
- **Sub-headlines** : 1-2 phrases, précise la promesse, qualifie la cible.
- **CTA labels** : 2-4 mots, action douce ("Découvrir comment", "Tester en 2 min", "Calculer mon économie"). INTERDITS : "Achetez", "Profitez", "Maintenant", "Cliquez ici".
- **Body / paragraphes** : pas de jargon, pas de marketing-speak, factuel. Un seul message par section.
- **Pas de chiffres inventés**. Ordre de grandeur ("près de", "environ", "jusqu'à") sauf si confirmé par les docs / structured_knowledge.
- **AMF compliance** : aucune promesse de rendement chiffré non vérifié. Mentionne le risque de perte en capital quand pertinent.

## RÈGLES DE STRUCTURE
- Respecte le template fourni — toutes les sections requises, dans le bon ordre.
- Le **hero.visual_hint** doit être en ANGLAIS, dense (200+ mots), prêt à injecter dans un prompt Gemini. Décris matières / lumière / palette / composition / sujet.
- Le **comparator** : la première colonne = produit du client, autres = concurrents (banque, livret A, autre courtier). 5-8 lignes de comparaison où le produit est clairement avantagé sur les bonnes lignes (sans mentir).
- La **FAQ** doit aborder les vraies objections du brief structuré (champ structured_knowledge.objections).
- Le **social_proof.testimonials** : 3-6 témoignages avec prénoms réalistes français + rôles plausibles + citation crédible (pas hyperbolique).

## TON
- Tutoiement OU vouvoiement adulte selon brand_voice.
- Sobre, autoritaire, factuel. Pas de hype.
- Français parfait, accents corrects.`;

function buildSystemPrompt(args: {
  templateId: TemplateId;
  brand?: BrandContext | null;
  region?: string | null;
  knowledge?: StructuredKnowledge | null;
}): string {
  const tmpl = TEMPLATES[args.templateId];
  const parts: string[] = [SYSTEM_PROMPT_BASE];

  parts.push(`# TEMPLATE CHOISI : ${tmpl.label}`);
  parts.push(tmpl.description);
  parts.push("");
  parts.push(`Sections à produire (dans l'ordre) : ${tmpl.sections.join(" → ")}`);
  parts.push(`Best for : ${tmpl.best_for}`);

  if (args.knowledge) {
    parts.push("");
    parts.push("# BRIEF PRODUIT STRUCTURÉ — utilise-le comme source de vérité");
    parts.push(`**Produit** : ${args.knowledge.product_summary}`);
    parts.push(`**Cible** : ${args.knowledge.target_audience}`);
    if (args.knowledge.value_propositions?.length > 0)
      parts.push(
        `**Value props** : ${args.knowledge.value_propositions.join(" · ")}`
      );
    if (args.knowledge.differentiators?.length > 0)
      parts.push(
        `**Différenciateurs** : ${args.knowledge.differentiators.join(" · ")}`
      );
    if (args.knowledge.proof_points?.length > 0)
      parts.push(
        `**Proof points** : ${args.knowledge.proof_points.join(" · ")}`
      );
    if (args.knowledge.objections?.length > 0)
      parts.push(
        `**Objections fréquentes (à traiter dans la FAQ)** : ${args.knowledge.objections.join(" · ")}`
      );
    if (args.knowledge.brand_voice) {
      parts.push(
        `**Voice** : ${args.knowledge.brand_voice.tone}. À dire : ${args.knowledge.brand_voice.do_say.join(" · ")}. À éviter : ${args.knowledge.brand_voice.dont_say.join(" · ")}`
      );
    }
    if (args.knowledge.legal_constraints) {
      parts.push(`**Contraintes légales** : ${args.knowledge.legal_constraints}`);
    }
  }

  if (args.brand) {
    parts.push("");
    parts.push(formatBrandForBriefSystemPrompt(args.brand));
  }

  if (args.region && args.region !== "international") {
    const r = formatRegionForBriefSystemPrompt(args.region);
    if (r) {
      parts.push("");
      parts.push(r);
    }
  }

  return parts.join("\n");
}

export async function generateLandingPage(args: {
  templateId: TemplateId;
  userInput: string | null;
  brand?: BrandContext | null;
  region?: string | null;
  knowledge?: StructuredKnowledge | null;
}): Promise<{
  brief: LandingPageBrief;
  content_a: LandingPageContent;
  content_b: LandingPageContent;
}> {
  const client = getAnthropic();
  const system = buildSystemPrompt(args);
  const toolInputSchema = buildLandingPageToolSchema(args.templateId);

  const userParts: string[] = [];
  if (args.userInput) {
    userParts.push("# BRIEF COURT DE L'UTILISATEUR");
    userParts.push(args.userInput);
  } else {
    userParts.push(
      "Aucun brief court fourni — base-toi sur le contexte projet pour produire la LP la plus solide possible."
    );
  }
  userParts.push("");
  userParts.push(
    "Produis maintenant via l'outil produce_landing_page : { brief, content_a, content_b }. Rappel : seuls les leviers haut-impact (hero + cta_final) varient entre A et B."
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system,
    tools: [
      {
        name: "produce_landing_page",
        description:
          "Produit le brief LP + 2 versions complètes (A/B test). Toutes les sections du template doivent être remplies.",
        input_schema: toolInputSchema as unknown as Record<
          string,
          unknown
        > as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_landing_page" },
    messages: [{ role: "user", content: userParts.join("\n") }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("L'agent n'a pas appelé l'outil produce_landing_page");
  }
  const input = toolUse.input as {
    brief?: unknown;
    content_a?: unknown;
    content_b?: unknown;
  };

  const briefParsed = landingPageBriefSchema.safeParse(input.brief);
  if (!briefParsed.success) {
    throw new Error(
      "Brief LP invalide : " +
        briefParsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  const aParsed = landingPageContentSchema.safeParse(input.content_a);
  if (!aParsed.success) {
    throw new Error(
      "Content A invalide : " +
        aParsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  const bParsed = landingPageContentSchema.safeParse(input.content_b);
  if (!bParsed.success) {
    throw new Error(
      "Content B invalide : " +
        bParsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  return {
    brief: briefParsed.data,
    content_a: aParsed.data,
    content_b: bParsed.data,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// CHAT TURN — refine via conversation
// ──────────────────────────────────────────────────────────────────────────

const CHAT_SYSTEM_BASE = `Tu es un expert LP Meta Ads en mode REFINE. L'utilisateur a une LP déjà générée (brief + content_a + content_b) et il te demande des corrections / ajouts.

# COMPORTEMENT
- Réponds brièvement (2-4 lignes max) avant d'appeler l'outil.
- Tu DOIS appeler produce_landing_page avec le triplet COMPLET mis à jour. Garde tout ce que l'utilisateur n'a pas demandé de changer.
- Si l'utilisateur demande "renforce le hero" : modifie hero dans A ET B (en gardant la différence A/B sur le hook).
- Si l'utilisateur demande "ajoute un témoignage" : modifie social_proof dans les DEUX (cohérence).
- Si l'utilisateur demande "fais 2 versions plus opposées sur le hero" : amplifie l'écart hero A vs hero B (un côté logique/chiffre vs un côté émotion/peur, par exemple).

# RÈGLES À RESPECTER
- A/B reste 20/80 : hors hero + cta_final, A et B sont identiques.
- Pas de promesse de rendement chiffré non vérifié.
- Garde la voice brand. Préserve les proof points existants (sauf si l'utilisateur demande d'en ajouter / supprimer).`;

export async function applyChatTurnToLP(args: {
  templateId: TemplateId;
  current: {
    brief: LandingPageBrief;
    content_a: LandingPageContent;
    content_b: LandingPageContent;
  };
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  brand?: BrandContext | null;
  region?: string | null;
  knowledge?: StructuredKnowledge | null;
}): Promise<{
  reply: string;
  brief: LandingPageBrief;
  content_a: LandingPageContent;
  content_b: LandingPageContent;
}> {
  const client = getAnthropic();
  const baseSystem = buildSystemPrompt({
    templateId: args.templateId,
    brand: args.brand,
    region: args.region,
    knowledge: args.knowledge,
  });
  const system =
    CHAT_SYSTEM_BASE +
    "\n\n" +
    baseSystem +
    "\n\n# ÉTAT ACTUEL\n```json\n" +
    JSON.stringify(args.current, null, 2) +
    "\n```";

  const toolInputSchema = buildLandingPageToolSchema(args.templateId);

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system,
    tools: [
      {
        name: "produce_landing_page",
        description:
          "Met à jour le triplet complet (brief + content_a + content_b) en intégrant la correction.",
        input_schema: toolInputSchema as unknown as Record<
          string,
          unknown
        > as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_landing_page" },
    messages: [
      ...args.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: args.userMessage },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const toolUse = response.content.find((b) => b.type === "tool_use");
  const reply =
    textBlock && textBlock.type === "text"
      ? textBlock.text.trim()
      : "Mise à jour appliquée. ✓";

  if (!toolUse || toolUse.type !== "tool_use") {
    return {
      reply,
      brief: args.current.brief,
      content_a: args.current.content_a,
      content_b: args.current.content_b,
    };
  }

  const input = toolUse.input as {
    brief?: unknown;
    content_a?: unknown;
    content_b?: unknown;
  };

  const briefParsed = landingPageBriefSchema.safeParse(input.brief);
  const aParsed = landingPageContentSchema.safeParse(input.content_a);
  const bParsed = landingPageContentSchema.safeParse(input.content_b);

  if (!briefParsed.success || !aParsed.success || !bParsed.success) {
    // Soft-fail : keep current state, surface the error in the reply
    const issues: string[] = [];
    if (!briefParsed.success) issues.push("brief");
    if (!aParsed.success) issues.push("content_a");
    if (!bParsed.success) issues.push("content_b");
    return {
      reply: `⚠ Validation partielle (${issues.join(", ")}) — état précédent conservé.`,
      brief: args.current.brief,
      content_a: args.current.content_a,
      content_b: args.current.content_b,
    };
  }

  return {
    reply,
    brief: briefParsed.data,
    content_a: aParsed.data,
    content_b: bParsed.data,
  };
}
