/**
 * Claude "designer" agent — analyzes a landing page (brief + content) and
 * produces opinionated design + CRO directives. Output is consumed by the
 * premium renderer to produce a polished, conversion-optimized HTML.
 *
 * Mental model : the agent acts like a senior CRO consultant + art director
 * who's done dozens of finance LPs. It picks typography, palette, density,
 * sticky CTAs, urgency markers, form optimization strategy, animations,
 * and per-section notes — all justified in `rationale`.
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import {
  designDirectivesSchema,
  designDirectivesJsonSchema,
  type DesignDirectives,
} from "./landing-page-design-schema";
import type {
  LandingPageBrief,
  LandingPageContent,
} from "./landing-page-schema";
import type { BrandContext } from "./brand-context";
import { formatBrandForBriefSystemPrompt } from "./brand-context";
import type { StructuredKnowledge } from "./structured-knowledge-schema";

const SYSTEM_PROMPT = `Tu es un consultant CRO + directeur artistique senior, spécialisé en landing pages Meta Ads finance / fintech / comparateur. Tu as audité et redesigné des centaines de LPs (Foxstone, Ramify, Yomoni, Bourse Direct, Generali, etc.). Tu es payé pour faire grimper le taux de conversion de manière significative.

# TA MISSION
On te donne UNE landing page déjà rédigée (brief stratégique + contenu sectionné A/B). Tu produis un PACKAGE DE DIRECTIVES DESIGN + CRO qui sera appliqué au rendu HTML pour passer la LP du "fonctionnel" au "premium agency-tier".

Tu appelles l'outil produce_design_directives UNE FOIS avec ton package complet.

# PRINCIPES CRO 80/20 (par ordre d'impact prouvé)
1. **Réduction de friction du formulaire** : single_field (email seul) si l'objectif est lead_form / newsletter ; two_step si calculatrice / quiz ; full uniquement si la cible est très qualifiée (B2B premium).
2. **Sticky CTA mobile** : 80%+ du trafic Meta est mobile. Une barre fixe en bas avec CTA = +15-30% conversion en moyenne.
3. **Above-the-fold density** : si le hook est performance/sécurité → form prioritaire ; si la marque est challenger/inconnue → social_proof prioritaire (chiffres + logos avant tout).
4. **Trust cluster près du CTA** : le user décide AU MOMENT du clic. Mettre les chiffres clés (clients, encours, agréments) juste contre le CTA bat les sections trust dispersées.
5. **Urgency/scarcity légitime** : ajoute UN marqueur d'urgence si vraiment légitime (date de fin d'inscription, places limitées, taux qui change). Sinon LAISSE VIDE — l'urgence inventée tue la confiance et l'AMF aime pas.
6. **Counter animations** : sur les stats, démarrer à 0 et compter jusqu'à la valeur capte l'œil et augmente la rétention de la stat.
7. **Exit-intent modal** : utile UNIQUEMENT avec une vraie offre alternative (ex : "Reçois le guide gratuit en PDF"). Sinon désactive.
8. **Reveal-on-scroll** : transitions douces qui rythment le scroll. Évite le parallax sur les LPs sérieuses (réservé tech/lifestyle).

# PRINCIPES DESIGN
1. **Typo display** : pour finance institutionnelle / patrimoine, préfère un sérif moderne (fraunces, source_serif, editorial_new, tiempos) ou un grotesk premium (cabinet_grotesk, neue_haas). Pour fintech techy/jeune, choisis general_sans, satoshi, geist.
2. **Typo body** : toujours sans-serif lisible — inter, geist, manrope, satoshi.
3. **Échelle** : monumental seulement si la marque a une identité audacieuse (cf. Sequoia Capital, Stripe). balanced est le défaut sécuritaire. generous = beaucoup d'air = perception premium.
4. **Palette** : utilise les couleurs de la brand si fournies. Sinon : pour finance, vert émeraude (#059669) ou bleu marine (#0F172A) sur ivoire/off-white. Évite les couleurs flashy (rouge / orange) sauf urgence ciblée.
5. **Background** : white pour clarity, ivory pour chaleur premium (assurance vie, gestion patrimoine), dark/midnight pour fintech techy/edgy (crypto, néobanque).
6. **Personnalité visuelle** : déduis-la du produit + brand. Assurance-vie luxembourgeoise = premium_institutional. Néobanque jeune = techy_modern ou fintech_crisp. PEA pédagogique = warm_human ou editorial_serious. Investissement art = luxe_minimal.

# JUSTIFICATION OBLIGATOIRE
- Le champ \`rationale\` (3-5 phrases) doit expliquer tes choix : pourquoi cette typo, pourquoi cette palette, quel comportement utilisateur tu vises.
- Le champ \`expected_lift\` doit donner une estimation qualitative ou quantitative ("J'estime un lift de +20-30% vs. version standard sur la base de [élément clé]").
- Les \`section_notes\` (clé = nom section) doivent contenir des recommandations précises et actionnables. Pas de "améliorer le hero" générique. Plutôt : "Réduire le sub à 1 phrase max, déplacer les trust badges en grosses cards à droite du form".

# RÈGLES TRANSVERSES
- Aucune promesse de rendement chiffré non vérifié dans urgency_marker / exit_intent_modal.
- Tutoiement OU vouvoiement selon brand_voice. Si pas de signal, utilise vouvoiement adulte.
- Sois opinion-driven — le client paie pour ton avis, pas pour de la prudence diplomatique. Si tu penses que sticky_cta_mobile = true, dis-le et explique.`;

export async function designLandingPage(args: {
  brief: LandingPageBrief;
  content_a: LandingPageContent;
  content_b: LandingPageContent;
  brand?: BrandContext | null;
  knowledge?: StructuredKnowledge | null;
}): Promise<DesignDirectives> {
  const client = getAnthropic();

  const parts: string[] = [];

  if (args.brand) {
    parts.push(formatBrandForBriefSystemPrompt(args.brand));
    parts.push("");
  }
  if (args.knowledge) {
    parts.push("# KNOWLEDGE STRUCTURÉE DU PROJET");
    parts.push(`Produit : ${args.knowledge.product_summary}`);
    parts.push(`Cible : ${args.knowledge.target_audience}`);
    if (args.knowledge.brand_voice) {
      parts.push(
        `Voice : ${args.knowledge.brand_voice.tone}. À dire : ${args.knowledge.brand_voice.do_say.join(" · ")}. À éviter : ${args.knowledge.brand_voice.dont_say.join(" · ")}`
      );
    }
    if (args.knowledge.legal_constraints) {
      parts.push(`Contraintes légales : ${args.knowledge.legal_constraints}`);
    }
    parts.push("");
  }

  parts.push("# BRIEF STRATÉGIQUE DE LA LP");
  parts.push("```json");
  parts.push(JSON.stringify(args.brief, null, 2));
  parts.push("```");
  parts.push("");
  parts.push("# CONTENU SECTIONNÉ — VERSION A");
  parts.push("```json");
  parts.push(JSON.stringify(args.content_a, null, 2));
  parts.push("```");
  parts.push("");
  parts.push("# CONTENU SECTIONNÉ — VERSION B (A/B test)");
  parts.push("```json");
  parts.push(JSON.stringify(args.content_b, null, 2));
  parts.push("```");
  parts.push("");
  parts.push(
    "Produis maintenant via produce_design_directives ton package design + CRO complet."
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "produce_design_directives",
        description:
          "Produit le package design + CRO directives qui sera appliqué au rendu HTML. Justifications obligatoires dans rationale + expected_lift.",
        input_schema: designDirectivesJsonSchema as unknown as Record<
          string,
          unknown
        > as never,
      },
    ],
    tool_choice: { type: "tool", name: "produce_design_directives" },
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      "L'agent designer n'a pas appelé produce_design_directives"
    );
  }
  const parsed = designDirectivesSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      "Directives design invalides : " +
        parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  return parsed.data;
}
