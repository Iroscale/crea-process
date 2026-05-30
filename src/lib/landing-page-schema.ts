import { z } from "zod";

/**
 * Landing page schema — 3 templates inspired by what works on Meta finance/
 * comparator funnels (foxstone.ch, etc.). Each template has a fixed section
 * order and shape ; Claude fills two complete instances (A + B) for A/B
 * testing in the marketing-agency 80/20 spirit.
 *
 * Templates :
 *  - "trust-funnel" : the Foxstone-style classic — hero+form, trust band,
 *      problem, how it works, features, social proof, comparator, security,
 *      FAQ, final CTA. Best for established players, captures qualified leads.
 *  - "story-pivot"  : narrative-driven — hero, founder story, educational
 *      pivot chart, solution reveal, social proof, FAQ, final CTA. Best for
 *      challenger brands, longer scroll but higher conversion on cold traffic.
 *  - "quiz-lead"    : interactive — hero with quiz CTA, why-it-matters,
 *      quiz teaser, how the quiz works, social proof, FAQ, final CTA.
 *      Best for personalization-led offers (assurance vie, prêt, etc.).
 */

// ──────────────────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ──────────────────────────────────────────────────────────────────────────

const ctaButtonSchema = z.object({
  label: z.string().describe("Texte du bouton, 2-4 mots, action douce"),
  /** Reassurance line under the button — "Sans engagement", "1 min", etc. */
  reassurance: z.string().optional(),
});

const formFieldSchema = z.enum([
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "amount", // capital à investir / crédit recherché etc.
  "city",
  "consent",
]);

const heroFormSchema = z.object({
  fields: z.array(formFieldSchema).describe("Champs demandés (3-5 max)"),
  cta: ctaButtonSchema,
});

/** Rating block (Trustpilot, Google, Avis Vérifiés…) */
const platformRatingSchema = z.object({
  platform: z
    .string()
    .describe("Nom plateforme : 'Trustpilot', 'Google', 'Avis Vérifiés'"),
  rating: z
    .string()
    .describe("Note affichée (ex : '4.2/5')"),
  count: z
    .string()
    .optional()
    .describe("Nombre d'avis (ex : '+100 avis')"),
});

/** Lead-magnet banner integré dans le hero (ebook, guide, calculatrice…) */
const leadMagnetBannerSchema = z.object({
  kicker: z
    .string()
    .describe("Étiquette courte ('EBOOK OFFERT', 'GUIDE GRATUIT')"),
  text: z
    .string()
    .describe("Description courte du lead-magnet (1 phrase)"),
});

// Hero — universal across the 3 templates
const heroSchema = z.object({
  /** Top-of-page badge avec drapeau / pays / chiffre fort. Ex : "🇨🇭 6.8% de rendement moyen en 2024" */
  badge: z
    .string()
    .optional()
    .describe(
      "Badge en haut du hero, type Foxstone : un chiffre clé ou un drapeau + claim court. Ex : '🇨🇭 6.8% de rendement moyen en 2024'"
    ),
  kicker: z
    .string()
    .optional()
    .describe("Ligne courte au-dessus du headline en MAJUSCULES (3-7 mots)"),
  headline: z
    .string()
    .describe("Promesse principale — 6-12 mots, percutante"),
  /** Mots du headline à colorer en accent (ex : 'l'immobilier suisse' chez Foxstone) */
  headline_accent_words: z
    .array(z.string())
    .optional()
    .describe(
      "Mots du headline à colorer dans la couleur d'accent (1-3 mots). Ex : ['l\\'immobilier suisse']"
    ),
  sub: z
    .string()
    .describe(
      "Sous-promesse — 1-2 phrases qui qualifient. Précise le levier (chiffre, simplicité, sécurité)"
    ),
  social_proof_line: z
    .string()
    .optional()
    .describe(
      "Ligne de social proof entre sub et CTA (ex : 'Rejoignez une communauté de 30'000+ investisseurs !')"
    ),
  /** Optional ad-style "above-the-fold" form. If absent, just a button. */
  form: heroFormSchema.optional(),
  cta: ctaButtonSchema.optional(), // used when form is null
  /** Reassurance line under CTA (ex : "S'inscrire gratuitement • 2 minutes • Sans engagement") */
  cta_reassurance: z
    .string()
    .optional()
    .describe("Ligne sous le CTA, séparateurs '•' (ex : 'Gratuit • 2 minutes • Sans engagement')"),
  /** Dual ratings sous le CTA (Foxstone affiche Trustpilot + Google) */
  ratings: z
    .array(platformRatingSchema)
    .optional()
    .describe(
      "Notes plateformes affichées sous le CTA (Trustpilot, Google…). 0-3 plateformes."
    ),
  /** Lead magnet banner sous les ratings (ebook, guide…) */
  lead_magnet_banner: leadMagnetBannerSchema
    .optional()
    .describe(
      "Bannière lead-magnet (ebook offert, guide gratuit) sous les ratings. Optionnel."
    ),
  visual_hint: z
    .string()
    .describe(
      "Description visuelle EN dense (200+ mots) pour la génération du hero image. Inclut composition, matières, lumière, palette."
    ),
  trust_badges: z
    .array(z.string())
    .optional()
    .describe(
      "Petits badges sous le hero (3-5 max) : agréments, presse, chiffres clés."
    ),
});

// Trust band — logos/stats above-the-fold
const trustBandSchema = z.object({
  intro: z.string().optional(),
  items: z
    .array(
      z.object({
        type: z.enum(["logo", "stat", "award"]),
        label: z.string(),
        value: z.string().optional(),
      })
    )
    .describe("4-6 items pour bandeau de confiance"),
});

/**
 * Stats band — bandeau de chiffres clés en grande typo (style Foxstone).
 * Ex : CHF 16.8M+ Revenus distribués · 30K+ Investisseurs · CHF 389M+ Investis · 90 Projets
 */
const statsBandSchema = z.object({
  items: z
    .array(
      z.object({
        value: z.string().describe("Chiffre + suffixe (ex : 'CHF 16.8M+', '30K+')"),
        label: z.string().describe("Libellé court sous le chiffre"),
      })
    )
    .describe("3-6 chiffres clés mis en gros"),
});

/**
 * Press logos — bandeau "Ils parlent de nous" avec logos médias.
 * Sur Foxstone : presse suisse / financière qui a parlé du produit.
 */
const pressLogosSchema = z.object({
  headline: z.string().describe("Ex : 'Ils parlent de nous'"),
  logos: z
    .array(z.string())
    .describe(
      "4-8 noms de médias / partenaires (ex : 'Le Temps', 'Bilan', 'PME Magazine'). Render as text-bolt-uppercase placeholders."
    ),
});

/**
 * Solutions / produits multi-cards (style Foxstone : Co-propriété + Crowdlending).
 * Chaque solution a son propre flow d'étapes.
 */
const solutionItemSchema = z.object({
  name: z.string().describe("Nom court du produit (ex : 'Co-propriété')"),
  tagline: z.string().describe("Une ligne descriptive du produit"),
  highlights: z
    .array(z.string())
    .describe(
      "3-4 highlights (ex : 'Dès CHF 25\\'000', 'Durée : 7 ans ou plus', 'Distributions trimestrielles')"
    ),
  steps: z
    .array(
      z.object({
        number: z.string(),
        title: z.string(),
        body: z.string(),
      })
    )
    .describe("3-5 étapes décrivant comment ça marche pour ce produit"),
});

const solutionsSchema = z.object({
  kicker: z
    .string()
    .optional()
    .describe("Ligne au-dessus du headline (ex : 'CE QUE NOUS OFFRONS')"),
  headline: z.string().describe("Ex : 'Découvrez nos solutions d'investissement'"),
  items: z.array(solutionItemSchema).describe("2-3 produits / solutions"),
});

/**
 * Opportunities — cards d'investissements actuels (style Foxstone).
 * Liste des projets en cours avec localisation, prix, rendement, etc.
 */
const opportunityItemSchema = z.object({
  type: z
    .string()
    .describe("Type de produit (ex : 'Co-propriété', 'Prêt participatif')"),
  status: z
    .string()
    .describe("Statut (ex : 'En cours', 'Financé', 'Bientôt disponible')"),
  location: z.string().describe("Localisation du bien (ex : 'Orbe, VD')"),
  category: z
    .string()
    .describe("Catégorie immo (ex : 'Résidentiel', 'Commercial')"),
  details: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      })
    )
    .describe(
      "3-4 lignes détaillées (Prix d'achat, Invest. min., Rendement cible, Taux d'intérêt…)"
    ),
});

const opportunitiesSchema = z.object({
  kicker: z.string().optional().describe("Ex : 'OÙ INVESTIR'"),
  headline: z.string().describe("Ex : 'Explorez nos dernières opportunités'"),
  items: z
    .array(opportunityItemSchema)
    .describe("2-4 opportunités exemple (peut être fictif si pas de vraies dispo)"),
  cta_label: z
    .string()
    .describe("CTA en bas (ex : 'S'inscrire pour voir toutes les opportunités →')"),
});

/**
 * Brand story — histoire du fondateur / ADN de la marque.
 * Foxstone : 4 citations du co-fondateur + un closing quote.
 */
const brandStorySchema = z.object({
  kicker: z.string().optional().describe("Ex : 'NOTRE HISTOIRE'"),
  headline: z.string().describe("Ex : 'L'ADN de Foxstone'"),
  intro: z
    .string()
    .describe("1-2 phrases d'intro qui plante le décor de l'histoire"),
  quotes: z
    .array(
      z.object({
        text: z.string(),
      })
    )
    .describe("3-5 citations narratives qui racontent l'histoire de la marque"),
  closing_quote: z
    .object({
      text: z.string(),
      author: z.string().describe("Nom + rôle (ex : 'David El-Eini, co-fondateur')"),
    })
    .describe("Citation de clôture mise en exergue avec attribution"),
});

/**
 * Simulator — calculatrice / simulateur de rendement (style Foxstone).
 * Sliders d'entrée + calcul live des outputs.
 */
const simulatorSchema = z.object({
  kicker: z.string().optional().describe("Ex : 'SIMULATEUR'"),
  headline: z.string().describe("Ex : 'Estimez vos rendements'"),
  inputs: z
    .array(
      z.object({
        label: z.string().describe("Ex : 'Montant investi'"),
        unit: z
          .string()
          .describe("Unité affichée (ex : 'CHF', '%', 'ans', '€')"),
        default_value: z.number().describe("Valeur par défaut du slider"),
        min: z.number(),
        max: z.number(),
        kind: z
          .enum(["amount", "rate", "duration"])
          .describe(
            "Type sémantique : amount = capital, rate = taux annuel %, duration = durée en années"
          ),
      })
    )
    .describe("3 sliders : amount + rate + duration"),
  outputs: z
    .array(
      z.object({
        label: z.string(),
        kind: z
          .enum(["quarterly_revenue", "annual_revenue", "total_revenue", "total_value"])
          .describe(
            "Type d'output. Le renderer calcule la valeur depuis les inputs."
          ),
      })
    )
    .describe("4 outputs calculés depuis les inputs"),
  disclaimer: z
    .string()
    .describe(
      "Mention légale sous le simulateur (ex : 'Simulation indicative, les rendements passés ne garantissent pas les rendements futurs.')"
    ),
});

/**
 * Lead magnet section (ebook, guide, livre blanc).
 * Foxstone l'utilise 2x : une bannière dans le hero + une section dédiée.
 */
const leadMagnetSectionSchema = z.object({
  kicker: z.string().describe("Ex : 'EBOOK OFFERT'"),
  headline: z
    .string()
    .describe("Ex : 'Le guide complet pour investir dans l'immobilier suisse'"),
  sub: z
    .string()
    .describe("1 phrase qui décrit ce que contient l'ebook + comment l'obtenir"),
  bullets: z
    .array(z.string())
    .describe("3-5 bullet points du contenu de l'ebook"),
  cta: ctaButtonSchema,
});

/**
 * Why us — 4 raisons d'utiliser le produit (style "Pourquoi Foxstone").
 * Chaque raison a un titre + body. Pas d'icône (Foxstone n'en a pas).
 */
const whyUsSchema = z.object({
  kicker: z.string().optional().describe("Ex : 'POURQUOI FOXSTONE'"),
  headline: z.string().describe("Ex : 'Investir dans la pierre, sur une plateforme digitale'"),
  intro: z
    .string()
    .optional()
    .describe("1-2 phrases d'intro qui contextualisent les raisons"),
  reasons: z
    .array(
      z.object({
        title: z.string().describe("Titre court (3-6 mots)"),
        body: z.string().describe("1-3 phrases qui développent"),
        legal_disclaimer: z
          .string()
          .optional()
          .describe(
            "Mention légale sous la raison si chiffre/rendement (ex : '*Les performances passées ne préjugent pas...')"
          ),
      })
    )
    .describe("4 raisons clés"),
  cta: ctaButtonSchema.optional(),
});

// Problem — pain points
const problemSchema = z.object({
  headline: z.string(),
  intro: z.string().optional(),
  pain_points: z
    .array(
      z.object({
        icon: z.string().describe("Emoji ou nom d'icône courte (ex: '🔻','📉','⏳')"),
        label: z.string().describe("Titre court (3-6 mots)"),
        body: z.string().describe("1-2 phrases qui amplifient la douleur"),
      })
    )
    .describe("3-4 pain points"),
});

// How it works — steps
const howItWorksSchema = z.object({
  headline: z.string(),
  intro: z.string().optional(),
  steps: z
    .array(
      z.object({
        number: z.string(),
        title: z.string(),
        body: z.string(),
      })
    )
    .describe("3-4 étapes du parcours produit"),
});

// Features — value props as cards
const featuresSchema = z.object({
  headline: z.string(),
  items: z
    .array(
      z.object({
        icon: z.string(),
        title: z.string(),
        body: z.string(),
      })
    )
    .describe("4-6 features / bénéfices"),
});

// Social proof — testimonials + stats
const socialProofSchema = z.object({
  headline: z.string(),
  stats: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
      })
    )
    .optional()
    .describe("Chiffres clés en haut (3-4 max)"),
  testimonials: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().optional(),
        quote: z.string(),
        rating: z.number().optional(),
      })
    )
    .describe("3-6 témoignages"),
});

// Comparator — vs concurrence
const comparatorSchema = z.object({
  headline: z.string(),
  intro: z.string().optional(),
  /** Column labels — first one should be the user's product, others are competitors */
  columns: z
    .array(z.string())
    .describe("3-4 colonnes : produit + concurrents (ex : 'Foxstone', 'Banque', 'Livret A')"),
  rows: z
    .array(
      z.object({
        feature: z.string(),
        values: z
          .array(z.union([z.boolean(), z.string()]))
          .describe(
            "Une valeur par colonne. boolean OU string (ex: '3.5%' / 'oui' / 'non' / '24h')"
          ),
      })
    )
    .describe("5-8 lignes de comparaison"),
});

// Security / trust block (chiffres clés, agréments)
const securitySchema = z.object({
  headline: z.string(),
  intro: z.string().optional(),
  items: z
    .array(
      z.object({
        icon: z.string(),
        label: z.string(),
        body: z.string(),
      })
    )
    .describe("3-5 piliers de sécurité / réglementaire"),
});

// FAQ — 5-10 Q&A
const faqSchema = z.object({
  headline: z.string(),
  items: z
    .array(
      z.object({
        q: z.string(),
        a: z.string(),
      })
    )
    .describe("5-10 questions fréquentes"),
});

// Final CTA — last block before footer
const ctaFinalSchema = z.object({
  headline: z.string(),
  sub: z.string(),
  cta: ctaButtonSchema,
  reassurance: z.string().optional(),
});

// Story — for template 2 (story-pivot)
const storySchema = z.object({
  headline: z.string(),
  paragraphs: z
    .array(z.string())
    .describe(
      "3-5 paragraphes narratifs qui racontent l'histoire (douleur → bascule → solution)"
    ),
  pull_quote: z.string().optional().describe("Citation mise en exergue"),
});

// Chart pivot — educational chart that flips the reader's belief
const chartPivotSchema = z.object({
  headline: z.string(),
  caption: z.string(),
  chart_description: z
    .string()
    .describe(
      "Ce que le chart représente (chiffres, axes). Sera utilisé pour générer une viz."
    ),
  data: z
    .array(z.object({ label: z.string(), value: z.number() }))
    .describe("3-7 data points"),
  source: z.string().optional(),
});

// Solution reveal — story template's payoff
const solutionRevealSchema = z.object({
  headline: z.string(),
  sub: z.string(),
  bullets: z.array(z.string()).describe("3-5 bullets de bénéfices saillants"),
});

// Quiz teaser — for template 3 (quiz-lead)
const quizTeaserSchema = z.object({
  headline: z.string(),
  sub: z.string(),
  bullets: z
    .array(z.string())
    .describe("3 promesses du quiz (ex : 'Adapté à votre situation', 'En 2 min', 'Gratuit')"),
  cta: ctaButtonSchema,
});

const quizPreviewSchema = z.object({
  headline: z.string(),
  intro: z.string().optional(),
  sample_questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()),
      })
    )
    .describe("3 exemples de questions (3-4 options chacune)"),
});

const whyMattersSchema = z.object({
  headline: z.string(),
  intro: z.string(),
  bullets: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
      })
    )
    .describe("3-4 raisons"),
});

// ──────────────────────────────────────────────────────────────────────────
// FULL TEMPLATE CONTENT
// ──────────────────────────────────────────────────────────────────────────

/**
 * Trust-funnel template — réplique de la structure Foxstone (lp.foxstone.ch).
 * Ordre vertical des sections, du hero au CTA final :
 *
 *   1. hero            — badge + headline (mots accent en couleur) + ratings + lead-magnet banner
 *   2. stats_band      — 4 chiffres clés en grande typo
 *   3. press_logos     — "Ils parlent de nous"
 *   4. solutions       — 2-3 produits avec leurs propres étapes (tabs/cards)
 *   5. why_us          — 4 raisons "Pourquoi [marque]"
 *   6. opportunities   — Cards d'investissements actuels
 *   7. how_it_works    — 4 étapes générales pour démarrer
 *   8. social_proof    — Testimonials détaillés
 *   9. brand_story     — Histoire du fondateur / ADN
 *  10. simulator       — Calculatrice de rendement
 *  11. lead_magnet     — Section dédiée à l'ebook / guide
 *  12. faq             — Questions fréquentes
 *  13. cta_final       — CTA + bénéfices
 *
 * Les sections "Foxstone-specific" sont OPTIONNELLES pour rester rétrocompatible
 * avec les LPs déjà générées (qui n'ont pas ces sections).
 */
export const trustFunnelContentSchema = z.object({
  template_id: z.literal("trust-funnel"),
  hero: heroSchema,
  stats_band: statsBandSchema.optional(),
  press_logos: pressLogosSchema.optional(),
  solutions: solutionsSchema.optional(),
  why_us: whyUsSchema.optional(),
  opportunities: opportunitiesSchema.optional(),
  how_it_works: howItWorksSchema,
  social_proof: socialProofSchema,
  brand_story: brandStorySchema.optional(),
  simulator: simulatorSchema.optional(),
  lead_magnet_section: leadMagnetSectionSchema.optional(),
  faq: faqSchema,
  cta_final: ctaFinalSchema,
  // Legacy fields kept for backward compat with existing LPs ; new
  // generations should NOT use them — they're rendered only as fallbacks.
  trust_band: trustBandSchema.optional(),
  problem: problemSchema.optional(),
  features: featuresSchema.optional(),
  comparator: comparatorSchema.optional(),
  security: securitySchema.optional(),
});

export const storyPivotContentSchema = z.object({
  template_id: z.literal("story-pivot"),
  hero: heroSchema,
  story: storySchema,
  chart_pivot: chartPivotSchema,
  solution_reveal: solutionRevealSchema,
  social_proof: socialProofSchema,
  security: securitySchema,
  faq: faqSchema,
  cta_final: ctaFinalSchema,
});

export const quizLeadContentSchema = z.object({
  template_id: z.literal("quiz-lead"),
  hero: heroSchema,
  why_matters: whyMattersSchema,
  quiz_teaser: quizTeaserSchema,
  quiz_preview: quizPreviewSchema,
  social_proof: socialProofSchema,
  faq: faqSchema,
  cta_final: ctaFinalSchema,
});

export const landingPageContentSchema = z.discriminatedUnion("template_id", [
  trustFunnelContentSchema,
  storyPivotContentSchema,
  quizLeadContentSchema,
]);

export type TrustFunnelContent = z.infer<typeof trustFunnelContentSchema>;
export type StoryPivotContent = z.infer<typeof storyPivotContentSchema>;
export type QuizLeadContent = z.infer<typeof quizLeadContentSchema>;
export type LandingPageContent = z.infer<typeof landingPageContentSchema>;

export type TemplateId = LandingPageContent["template_id"];

// ──────────────────────────────────────────────────────────────────────────
// BRIEF — what we ask the user / Claude figures out
// ──────────────────────────────────────────────────────────────────────────

export const landingPageBriefSchema = z.object({
  product: z
    .string()
    .describe("Le produit / l'offre poussé sur cette LP (1 phrase)"),
  audience: z
    .string()
    .describe("La cible précise (profil, niveau de richesse, contexte)"),
  objective: z
    .enum(["lead_form", "calendly", "purchase", "newsletter", "quiz"])
    .describe("Action principale attendue de la LP"),
  hook_angle: z
    .string()
    .describe(
      "L'angle d'attaque principal (sécurité, performance, simplicité, urgence, peur de manquer, statut, etc.)"
    ),
  cta_destination: z
    .string()
    .describe("Où le CTA mène (URL form, calendly, page produit…)"),
  promise: z
    .string()
    .describe("La promesse principale en 1 phrase (la grosse claim de la page)"),
  proof_points: z
    .array(z.string())
    .describe(
      "3-5 éléments de preuve à intégrer (chiffres, agréments, partenaires)"
    ),
});

export type LandingPageBrief = z.infer<typeof landingPageBriefSchema>;

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE METADATA — used to render selection UI + describe to Claude
// ──────────────────────────────────────────────────────────────────────────

export const TEMPLATES: Record<
  TemplateId,
  {
    label: string;
    short: string;
    description: string;
    sections: string[];
    best_for: string;
  }
> = {
  "trust-funnel": {
    label: "Trust Funnel (Foxstone-style)",
    short: "🏛 Réplique du modèle Foxstone : 13 sections, crédibilité max",
    description:
      "Structure vertical complète style lp.foxstone.ch : hero (badge + headline mot-accent + ratings + ebook banner) → stats band (chiffres clés) → press logos → solutions multi-produits avec étapes → pourquoi nous → opportunités d'investissement → comment investir (4 étapes) → témoignages → brand story (citations fondateur) → simulateur de rendement → ebook offert → FAQ → CTA final. Le best-in-class finance suisse / fintech française.",
    sections: [
      "hero",
      "stats_band",
      "press_logos",
      "solutions",
      "why_us",
      "opportunities",
      "how_it_works",
      "social_proof",
      "brand_story",
      "simulator",
      "lead_magnet_section",
      "faq",
      "cta_final",
    ],
    best_for:
      "Acteurs établis (fintech, comparateur, gestion patrimoniale) avec produits multiples, agréments réglementaires, vraies opportunités d'investissement à présenter. Audience qualifiée Meta Ads chaud / lookalike.",
  },
  "story-pivot": {
    label: "Story Pivot",
    short: "📖 Narrative — bascule émotionnelle puis révélation",
    description:
      "Hero + histoire fondateur/client, chart pédagogique qui fait basculer la croyance, révélation solution, social proof, sécurité, FAQ, CTA final. Plus long mais convertit du trafic froid.",
    sections: [
      "hero",
      "story",
      "chart_pivot",
      "solution_reveal",
      "social_proof",
      "security",
      "faq",
      "cta_final",
    ],
    best_for:
      "Challengers, marques jeunes sans énorme social proof. Trafic Meta froid qui n'a jamais entendu parler de toi.",
  },
  "quiz-lead": {
    label: "Quiz Lead",
    short: "🧮 Quiz / calculatrice — personnalisation-driven",
    description:
      "Hero avec CTA quiz, pourquoi c'est important, teaser quiz, preview de questions, social proof, FAQ, CTA final. Le user est pris dans une logique d'engagement (quiz) avant de qualifier.",
    sections: [
      "hero",
      "why_matters",
      "quiz_teaser",
      "quiz_preview",
      "social_proof",
      "faq",
      "cta_final",
    ],
    best_for:
      "Offres où la personnalisation est clé (assurance vie, prêt, gestion patrimoniale). Quand le résultat dépend du profil.",
  },
};

// ──────────────────────────────────────────────────────────────────────────
// JSON SCHEMA for Claude tool_use — generated dynamically per template
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns an Anthropic-compatible JSON Schema (input_schema) describing
 * the FULL output Claude must produce for a given template :
 *   { brief, content_a, content_b }
 */
export function buildLandingPageToolSchema(templateId: TemplateId) {
  return {
    type: "object",
    properties: {
      brief: landingPageBriefJsonSchema,
      content_a: contentJsonSchemaForTemplate(templateId),
      content_b: contentJsonSchemaForTemplate(templateId),
    },
    required: ["brief", "content_a", "content_b"],
  } as const;
}

const landingPageBriefJsonSchema = {
  type: "object",
  properties: {
    product: { type: "string" },
    audience: { type: "string" },
    objective: {
      type: "string",
      enum: ["lead_form", "calendly", "purchase", "newsletter", "quiz"],
    },
    hook_angle: { type: "string" },
    cta_destination: { type: "string" },
    promise: { type: "string" },
    proof_points: { type: "array", items: { type: "string" } },
  },
  required: [
    "product",
    "audience",
    "objective",
    "hook_angle",
    "cta_destination",
    "promise",
    "proof_points",
  ],
} as const;

// Section-level JSON schemas (mirror the zod definitions above)

const ctaButtonJsonSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    reassurance: { type: "string" },
  },
  required: ["label"],
} as const;

const platformRatingJsonSchema = {
  type: "object",
  properties: {
    platform: { type: "string" },
    rating: { type: "string" },
    count: { type: "string" },
  },
  required: ["platform", "rating"],
} as const;

const leadMagnetBannerJsonSchema = {
  type: "object",
  properties: {
    kicker: { type: "string" },
    text: { type: "string" },
  },
  required: ["kicker", "text"],
} as const;

const heroJsonSchema = {
  type: "object",
  properties: {
    badge: { type: "string" },
    kicker: { type: "string" },
    headline: { type: "string" },
    headline_accent_words: { type: "array", items: { type: "string" } },
    sub: { type: "string" },
    social_proof_line: { type: "string" },
    form: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "first_name",
              "last_name",
              "email",
              "phone",
              "company",
              "amount",
              "city",
              "consent",
            ],
          },
        },
        cta: ctaButtonJsonSchema,
      },
      required: ["fields", "cta"],
    },
    cta: ctaButtonJsonSchema,
    cta_reassurance: { type: "string" },
    ratings: { type: "array", items: platformRatingJsonSchema },
    lead_magnet_banner: leadMagnetBannerJsonSchema,
    visual_hint: { type: "string" },
    trust_badges: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "sub", "visual_hint"],
} as const;

// ─── New Foxstone-style section JSON schemas ─────────────────────────────

const statsBandJsonSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          label: { type: "string" },
        },
        required: ["value", "label"],
      },
    },
  },
  required: ["items"],
} as const;

const pressLogosJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    logos: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "logos"],
} as const;

const solutionsJsonSchema = {
  type: "object",
  properties: {
    kicker: { type: "string" },
    headline: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          tagline: { type: "string" },
          highlights: { type: "array", items: { type: "string" } },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                number: { type: "string" },
                title: { type: "string" },
                body: { type: "string" },
              },
              required: ["number", "title", "body"],
            },
          },
        },
        required: ["name", "tagline", "highlights", "steps"],
      },
    },
  },
  required: ["headline", "items"],
} as const;

const opportunitiesJsonSchema = {
  type: "object",
  properties: {
    kicker: { type: "string" },
    headline: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          status: { type: "string" },
          location: { type: "string" },
          category: { type: "string" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
        },
        required: ["type", "status", "location", "category", "details"],
      },
    },
    cta_label: { type: "string" },
  },
  required: ["headline", "items", "cta_label"],
} as const;

const brandStoryJsonSchema = {
  type: "object",
  properties: {
    kicker: { type: "string" },
    headline: { type: "string" },
    intro: { type: "string" },
    quotes: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    closing_quote: {
      type: "object",
      properties: {
        text: { type: "string" },
        author: { type: "string" },
      },
      required: ["text", "author"],
    },
  },
  required: ["headline", "intro", "quotes", "closing_quote"],
} as const;

const simulatorJsonSchema = {
  type: "object",
  properties: {
    kicker: { type: "string" },
    headline: { type: "string" },
    inputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          unit: { type: "string" },
          default_value: { type: "number" },
          min: { type: "number" },
          max: { type: "number" },
          kind: {
            type: "string",
            enum: ["amount", "rate", "duration"],
          },
        },
        required: ["label", "unit", "default_value", "min", "max", "kind"],
      },
    },
    outputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "quarterly_revenue",
              "annual_revenue",
              "total_revenue",
              "total_value",
            ],
          },
        },
        required: ["label", "kind"],
      },
    },
    disclaimer: { type: "string" },
  },
  required: ["headline", "inputs", "outputs", "disclaimer"],
} as const;

const leadMagnetSectionJsonSchema = {
  type: "object",
  properties: {
    kicker: { type: "string" },
    headline: { type: "string" },
    sub: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
    cta: ctaButtonJsonSchema,
  },
  required: ["kicker", "headline", "sub", "bullets", "cta"],
} as const;

const whyUsJsonSchema = {
  type: "object",
  properties: {
    kicker: { type: "string" },
    headline: { type: "string" },
    intro: { type: "string" },
    reasons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          legal_disclaimer: { type: "string" },
        },
        required: ["title", "body"],
      },
    },
    cta: ctaButtonJsonSchema,
  },
  required: ["headline", "reasons"],
} as const;

// trustBandJsonSchema, problemJsonSchema, featuresJsonSchema,
// comparatorJsonSchema removed — they were used by the old trust-funnel
// structure. The new Foxstone-style trust-funnel uses statsBandJsonSchema,
// whyUsJsonSchema, etc. The legacy zod fields remain (optional) for parsing
// pre-existing landing_pages records, but Claude no longer generates them.

const howItWorksJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    intro: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["number", "title", "body"],
      },
    },
  },
  required: ["headline", "steps"],
} as const;

const socialProofJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    stats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          label: { type: "string" },
        },
        required: ["value", "label"],
      },
    },
    testimonials: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          quote: { type: "string" },
          rating: { type: "number" },
        },
        required: ["name", "quote"],
      },
    },
  },
  required: ["headline", "testimonials"],
} as const;

const securityJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    intro: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          icon: { type: "string" },
          label: { type: "string" },
          body: { type: "string" },
        },
        required: ["icon", "label", "body"],
      },
    },
  },
  required: ["headline", "items"],
} as const;

const faqJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          q: { type: "string" },
          a: { type: "string" },
        },
        required: ["q", "a"],
      },
    },
  },
  required: ["headline", "items"],
} as const;

const ctaFinalJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    sub: { type: "string" },
    cta: ctaButtonJsonSchema,
    reassurance: { type: "string" },
  },
  required: ["headline", "sub", "cta"],
} as const;

const storyJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    paragraphs: { type: "array", items: { type: "string" } },
    pull_quote: { type: "string" },
  },
  required: ["headline", "paragraphs"],
} as const;

const chartPivotJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    caption: { type: "string" },
    chart_description: { type: "string" },
    data: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "number" },
        },
        required: ["label", "value"],
      },
    },
    source: { type: "string" },
  },
  required: ["headline", "caption", "chart_description", "data"],
} as const;

const solutionRevealJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    sub: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "sub", "bullets"],
} as const;

const quizTeaserJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    sub: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
    cta: ctaButtonJsonSchema,
  },
  required: ["headline", "sub", "bullets", "cta"],
} as const;

const quizPreviewJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    intro: { type: "string" },
    sample_questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["question", "options"],
      },
    },
  },
  required: ["headline", "sample_questions"],
} as const;

const whyMattersJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    intro: { type: "string" },
    bullets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["title", "body"],
      },
    },
  },
  required: ["headline", "intro", "bullets"],
} as const;

function contentJsonSchemaForTemplate(templateId: TemplateId) {
  if (templateId === "trust-funnel") {
    // Foxstone-style structure : 13 sections dans l'ordre vertical.
    return {
      type: "object",
      properties: {
        template_id: { type: "string", const: "trust-funnel" },
        hero: heroJsonSchema,
        stats_band: statsBandJsonSchema,
        press_logos: pressLogosJsonSchema,
        solutions: solutionsJsonSchema,
        why_us: whyUsJsonSchema,
        opportunities: opportunitiesJsonSchema,
        how_it_works: howItWorksJsonSchema,
        social_proof: socialProofJsonSchema,
        brand_story: brandStoryJsonSchema,
        simulator: simulatorJsonSchema,
        lead_magnet_section: leadMagnetSectionJsonSchema,
        faq: faqJsonSchema,
        cta_final: ctaFinalJsonSchema,
      },
      required: [
        "template_id",
        "hero",
        "stats_band",
        "press_logos",
        "solutions",
        "why_us",
        "opportunities",
        "how_it_works",
        "social_proof",
        "brand_story",
        "simulator",
        "lead_magnet_section",
        "faq",
        "cta_final",
      ],
    };
  }
  if (templateId === "story-pivot") {
    return {
      type: "object",
      properties: {
        template_id: { type: "string", const: "story-pivot" },
        hero: heroJsonSchema,
        story: storyJsonSchema,
        chart_pivot: chartPivotJsonSchema,
        solution_reveal: solutionRevealJsonSchema,
        social_proof: socialProofJsonSchema,
        security: securityJsonSchema,
        faq: faqJsonSchema,
        cta_final: ctaFinalJsonSchema,
      },
      required: [
        "template_id",
        "hero",
        "story",
        "chart_pivot",
        "solution_reveal",
        "social_proof",
        "security",
        "faq",
        "cta_final",
      ],
    };
  }
  // quiz-lead
  return {
    type: "object",
    properties: {
      template_id: { type: "string", const: "quiz-lead" },
      hero: heroJsonSchema,
      why_matters: whyMattersJsonSchema,
      quiz_teaser: quizTeaserJsonSchema,
      quiz_preview: quizPreviewJsonSchema,
      social_proof: socialProofJsonSchema,
      faq: faqJsonSchema,
      cta_final: ctaFinalJsonSchema,
    },
    required: [
      "template_id",
      "hero",
      "why_matters",
      "quiz_teaser",
      "quiz_preview",
      "social_proof",
      "faq",
      "cta_final",
    ],
  };
}
