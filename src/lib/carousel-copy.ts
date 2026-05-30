/**
 * Génère le copy d'un carrousel à 3 slides "valeur d'abord" :
 *  - Slide 1 (hook)        : question / fait peu connu / accroche éducative
 *  - Slide 2 (insight)     : info utile que le lecteur emporte gratuitement
 *  - Slide 3 (application) : on relie au produit avec un CTA doux
 *
 * Le but : créer de la confiance par la valeur, pas par la pression commerciale.
 * Style edutainment finance — Mango, Heu?reka, Snowball.
 */
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import type { Angle, Concept } from "./brief-schema";

export type CarouselSlideCopy = {
  role: "hook" | "insight" | "application";
  headline: string;
  body: string;
  cta?: string;
};

const SYSTEM_PROMPT = `Tu écris des carrousels social media pour un acteur fintech français.

PHILOSOPHIE — VALEUR D'ABORD
Un bon carrousel ne vend PAS un produit. Il offre quelque chose d'utile au lecteur en 3 temps. Le lecteur doit te remercier d'avoir glissé, même s'il ne clique pas. La confiance se construit par la générosité éducative, pas par la pression commerciale.

LE LECTEUR EST INTELLIGENT.
- Pas de "Profitez", "Achetez maintenant", "Offre limitée"
- Pas de superlatifs creux ("révolutionnaire", "incroyable")
- Pas de hype, pas d'urgence factice, pas de chiffres truqués
- Tutoiement OK si la marque le tolère, sinon vouvoiement adulte

STRUCTURE OBLIGATOIRE — 3 slides, chacune avec un rôle précis :

▸ SLIDE 1 — HOOK (rôle : faire stopper le scroll, donner envie de glisser)
  - Une question contre-intuitive, OU un fait peu connu, OU une affirmation qui fait penser
  - Headline : 4 à 9 mots maximum
  - Body : 8 à 18 mots — pose le contexte, ne donne PAS la réponse
  - Pas de CTA. Le seul CTA implicite est "swipe pour la suite"
  - Exemples : "Pourquoi 7 Français sur 10 perdent du pouvoir d'achat sans s'en rendre compte ?" / "Le danger qui vide votre PEL en silence."

▸ SLIDE 2 — INSIGHT (rôle : donner LA valeur, l'info que le lecteur va emporter)
  - Une vraie info utile, factuelle, qui éclaire
  - Le lecteur doit avoir l'impression d'avoir appris quelque chose même s'il s'arrête là
  - Headline : 5 à 10 mots, énonce le principe / la donnée
  - Body : 15 à 30 mots — explique de façon claire, factuelle, sans jargon. Pas de pub déguisée.
  - Pas de CTA, pas de mention du produit
  - Exemples : "L'inflation grignote 3 % de votre épargne par an." / body : "Sur 10 ans, 1 000 € qui dorment sur un livret valent en pouvoir d'achat ce qu'achetaient 740 € au départ."

▸ SLIDE 3 — APPLICATION (rôle : relier la leçon au produit, soft CTA)
  - On relie le insight à ce que le produit permet de FAIRE
  - Headline : 5 à 9 mots — invitation, pas injonction
  - Body : 12 à 25 mots — comment l'appliquer concrètement, avec le produit comme moyen
  - CTA : doux et factuel ("Découvrir", "En savoir plus", "Tester en 2 min", "Comprendre comment")
  - INTERDITS : "Profitez", "Achetez", "Maintenant", "Vite", "Inscrivez-vous"
  - Exemples : headline "Une autre voie est possible." / cta "Découvrir comment"

CONTRAINTES TRANSVERSES
- Français parfait, ponctuation soignée
- Cohérence narrative : le lecteur doit sentir que slide 2 répond à slide 1, et slide 3 applique slide 2
- Tonalité : confiante, calme, experte, jamais autoritaire ni prescriptive
- Aucun chiffre inventé. Si tu utilises un ordre de grandeur, qu'il soit plausible et générique (pas de fausse statistique précise type "78,3 %")
- Pas de mention légale dans ces slides (ce sera ajouté ailleurs en Phase 3)

FORMAT DE SORTIE — JSON STRICT, RIEN D'AUTRE :
{
  "slides": [
    { "role": "hook",        "headline": "…", "body": "…" },
    { "role": "insight",     "headline": "…", "body": "…" },
    { "role": "application", "headline": "…", "body": "…", "cta": "…" }
  ]
}`;

export async function generateCarouselCopy(input: {
  productSummary: string;
  angle: Angle;
  concept: Concept;
}): Promise<CarouselSlideCopy[]> {
  const { productSummary, angle, concept } = input;
  const client = getAnthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Brief :
- Produit : ${productSummary}
- Angle marketing : "${angle.name}"
  - Headline d'inspiration (statique) : "${angle.headline}"
  - Body d'inspiration : "${angle.body ?? "—"}"
  - CTA d'inspiration : "${angle.cta ?? "—"}"
  - Pourquoi cet angle : ${angle.rationale ?? "—"}
- Concept visuel : "${concept.name}"
  - Pourquoi : ${concept.rationale}

Produis le carrousel à 3 slides en suivant strictement la structure HOOK → INSIGHT → APPLICATION. Le copy DOIT être différent du copy d'inspiration ci-dessus (qui sert d'angle, pas à recopier). Donne 3 slides avec narrations distinctes et complémentaires. JSON uniquement.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  type Parsed = {
    slides?: {
      role?: string;
      headline?: string;
      body?: string;
      cta?: string;
    }[];
  };
  let parsed: Parsed = {};
  try {
    parsed = JSON.parse(cleaned) as Parsed;
  } catch {
    throw new Error(
      "Carrousel copy : réponse Claude non-JSON\n" + cleaned.slice(0, 500)
    );
  }
  const slides = parsed.slides ?? [];
  if (slides.length !== 3) {
    throw new Error(
      `Carrousel copy : attendu 3 slides, reçu ${slides.length}`
    );
  }
  // Coerce + validate roles + provide a fallback CTA on slide 3 if missing
  const ROLES: CarouselSlideCopy["role"][] = ["hook", "insight", "application"];
  return slides.map((s, i) => {
    const role = (ROLES[i] ?? s.role) as CarouselSlideCopy["role"];
    return {
      role,
      headline: (s.headline ?? "").trim(),
      body: (s.body ?? "").trim(),
      cta:
        role === "application"
          ? (s.cta ?? "Découvrir").trim()
          : undefined,
    };
  });
}
