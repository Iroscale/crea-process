/**
 * Pipeline Agency OS — source de vérité pour les 13 étapes.
 *
 * Toutes les pages /agency/* lisent cette config : ordre des étapes,
 * agent à appeler, présence d'un gate humain, libellé, description,
 * et prompt par défaut à pré-remplir dans le formulaire de lancement.
 *
 * Le user_input peut être un blob libre (mode "lance avec ce brief")
 * ou être construit en remplaçant les variables {var} dans defaultPrompt
 * par les valeurs saisies dans le formulaire.
 */
import type { AgentKey, MemorySlug } from "@/lib/agents";

export type StepKey =
  | "onboarding"
  | "01-market-research"
  | "02-angles-promesses"
  | "03-broad-mix"
  | "04-video-founder-ads"
  | "05-image-concepts"
  | "06-landing-page"
  | "07-quiz-funnel"
  | "08-video-brief"
  | "09-tracking"
  | "10-campaign-setup"
  | "retrospective"
  | "export-memory";

export interface StepConfig {
  key: StepKey;
  order: number;            // ordre d'affichage dans le pipeline (0 = onboarding)
  agentKey: AgentKey | null; // null = pas d'agent (export-memory)
  title: string;
  emoji: string;
  tagline: string;          // 1 ligne, affichée sur les cards
  gate: boolean;             // gate humain à la sortie ?
  /**
   * Catégorie : pipeline (étapes principales linéaires) | extra (rétro,
   * export) | onboarding.
   */
  category: "pipeline" | "extra" | "onboarding";
  /** Étape précédente attendue validée (lecture humaine, pas verrou auto). */
  expectsBefore?: StepKey[];
  /**
   * Prompt par défaut envoyé à l'agent. Variables {var} remplacées au moment
   * du lancement par les valeurs du formulaire. Le user peut éditer librement.
   */
  defaultPrompt: string;
  /** Champs de formulaire à proposer en plus du prompt brut. */
  formFields?: Array<{
    name: string;
    label: string;
    type: "text" | "textarea" | "select";
    options?: string[];
    placeholder?: string;
    required?: boolean;
  }>;
  /** Type du livrable produit (pour le champ deliverables.kind). */
  deliverableKind: string;
  /**
   * Fichier mémoire client alimenté par le livrable validé de cette étape.
   * À la validation du gate, l'opérateur peut appliquer le livrable dans
   * client_memory[memorySlug] (preview diff + snapshot historique).
   * null/absent = le livrable ne va pas en mémoire (consommé via la couche
   * items structurés en aval).
   */
  memorySlug?: MemorySlug;
}

export const STEPS: StepConfig[] = [
  // ─── ONBOARDING ────────────────────────────────────────────────────────
  {
    key: "onboarding",
    order: 0,
    agentKey: "orchestrator",
    title: "Onboarding",
    emoji: "📥",
    tagline: "Ingestion docs, LPs, Fathom → client-profile.md",
    gate: false,
    category: "onboarding",
    deliverableKind: "client-profile",
    memorySlug: "client-profile",
    defaultPrompt: `Intention : ingest-onboarding.

# Bloc onboarding fourni par l'équipe

{onboarding_blob}

Tu produis :
1. Un patch markdown pour client-profile.md (sections fixes du schéma).
2. Une v0 de brand-voice.md (à affiner par copywriter plus tard).
3. Une entrée pour decisions-log.md.
4. La liste des manques à combler avant l'étape 1.`,
    formFields: [
      {
        name: "onboarding_blob",
        label: "Bloc d'onboarding (Fathom + docs + LP analyse + accès)",
        type: "textarea",
        placeholder:
          "Colle ici la transcription Fathom, les notes des documents, l'analyse des LP actuelles, les accès BM/Google Ads, et tout ce que le client a transmis.",
        required: true,
      },
    ],
  },

  // ─── ÉTAPES PRINCIPALES ────────────────────────────────────────────────
  {
    key: "01-market-research",
    order: 1,
    agentKey: "market-research",
    title: "Market research",
    emoji: "🔍",
    tagline: "3 ICP sourcés + verbatims + veille concurrentielle",
    gate: true,
    category: "pipeline",
    expectsBefore: ["onboarding"],
    deliverableKind: "icp",
    memorySlug: "icp",
    defaultPrompt: `Niche / sujet à creuser : {niche}
Région cible : {region}

Mission : produire le contenu complet de memory/icp.md selon le schéma de
.claude/memory-schema.md, avec recherche web profonde (au moins 6-10
recherches distinctes : Reddit, forums, avis solutions concurrentes,
Meta Ad Library, Google Ads transparency, presse spécialisée).

Cite tes sources (URL obligatoires, minimum 10). Verbatims réels. 3 ICP
distincts et segmentables.`,
    formFields: [
      {
        name: "niche",
        label: "Niche / sujet à creuser",
        type: "textarea",
        placeholder: "Ex : assurance-vie luxembourgeoise pour patrimoine 250 k€+",
        required: true,
      },
      {
        name: "region",
        label: "Région",
        type: "select",
        options: ["France", "Suisse", "International"],
        required: true,
      },
    ],
  },
  {
    key: "02-angles-promesses",
    order: 2,
    agentKey: "creative-strategist",
    title: "Angles & promesses",
    emoji: "🎯",
    tagline: "Promesse maîtresse + 6-12 angles + hooks prêts",
    gate: false,
    category: "pipeline",
    expectsBefore: ["01-market-research"],
    deliverableKind: "angles-promesses",
    memorySlug: "angles-promesses",
    defaultPrompt: `À partir de l'ICP validée (memory/icp.md) et de la brand voice, produis
le contenu complet de memory/angles-promesses.md selon le schéma.

Note particulière de cette session : {note}`,
    formFields: [
      {
        name: "note",
        label: "Note d'orientation (optionnel)",
        type: "textarea",
        placeholder:
          "Ex : on veut tester un angle 'pédagogue posé' avant un angle 'urgence fiscale'. Ou laisse vide pour la version par défaut.",
      },
    ],
  },
  {
    key: "03-broad-mix",
    order: 3,
    agentKey: "creative-strategist",
    title: "Broad Mix",
    emoji: "🧩",
    tagline: "Matrice persona × angle × format × niveau funnel",
    gate: false,
    category: "pipeline",
    expectsBefore: ["02-angles-promesses"],
    deliverableKind: "broad-mix",
    defaultPrompt: `Construis le Broad Mix complet pour ce client à partir des angles
validés. Format : matrice persona × angle × format × niveau funnel avec
20-30 paris prioritaires, chacun avec son hypothèse testable.

Budget de tests prévu : {budget}. Contraintes particulières : {contraintes}.`,
    formFields: [
      {
        name: "budget",
        label: "Budget de tests prévu (mensuel)",
        type: "text",
        placeholder: "Ex : 8 k€/mois",
      },
      {
        name: "contraintes",
        label: "Contraintes (formats interdits, etc.)",
        type: "textarea",
        placeholder: "Ex : pas de fondateur dispo pour UGC ce mois-ci.",
      },
    ],
  },
  {
    key: "04-video-founder-ads",
    order: 4,
    agentKey: "copywriter",
    title: "Video founder ads",
    emoji: "🎬",
    tagline: "3 scripts (30s/60s/90s) + humanisation prompteur",
    gate: true,
    category: "pipeline",
    expectsBefore: ["03-broad-mix"],
    deliverableKind: "founder-script",
    defaultPrompt: `Rédige 3 variantes de script vidéo founder ads (30s, 60s, 90s) pour
l'angle suivant : {angle}

ICP cible : {icp_target}
Format : narration structurée plan par plan, 2-3 moments de pivot, CTA répété 2 fois.

Note : après cette étape, lance "Humaniser le script (production-assistant)"
pour la version prompteur.`,
    formFields: [
      {
        name: "angle",
        label: "Angle ciblé (slug de angles-promesses.md)",
        type: "text",
        placeholder: "Ex : fiscalite-claire",
        required: true,
      },
      {
        name: "icp_target",
        label: "ICP cible (1, 2, 3 ou nom)",
        type: "text",
        placeholder: "Ex : ICP 1",
        required: true,
      },
    ],
  },
  {
    key: "05-image-concepts",
    order: 5,
    agentKey: "copywriter",
    title: "10 concepts image",
    emoji: "🖼️",
    tagline: "10 concepts publicitaires (hook, sous-texte, prompt, légende)",
    gate: true,
    category: "pipeline",
    expectsBefore: ["03-broad-mix"],
    deliverableKind: "image-concepts",
    defaultPrompt: `Produis 10 concepts image publicitaires variés, en respectant la matrice
du Broad Mix. Chaque concept inclut : ICP cible, levier, format, hook sur
l'image, sous-texte si pertinent, prompt visuel pour le générateur, légende
Meta, CTA bouton, niveau funnel.

Variation des leviers obligatoire (max 3 concepts par levier).

Note particulière : {note}`,
    formFields: [
      {
        name: "note",
        label: "Note (optionnel)",
        type: "textarea",
        placeholder:
          "Ex : focus angles fiscalité et social proof. Pas de visuel personnel du fondateur.",
      },
    ],
  },
  {
    key: "06-landing-page",
    order: 6,
    agentKey: "copywriter",
    title: "Landing page",
    emoji: "🪜",
    tagline: "LP complète Hero → Preuves → FAQ → CTA",
    gate: true,
    category: "pipeline",
    expectsBefore: ["02-angles-promesses"],
    deliverableKind: "landing-page",
    defaultPrompt: `Rédige la landing page complète pour la promesse maîtresse, en
intégrant 3-5 objections de la banque d'objections (memory/icp.md).

Angle dominant : {angle}
Page hébergée sur : {host}
CTA principal : {cta}

Sections attendues : Hero, Promesse, Preuves, Comment ça marche,
Objections, FAQ, CTA final.`,
    formFields: [
      {
        name: "angle",
        label: "Angle dominant",
        type: "text",
        placeholder: "Ex : pédagogie-fiscalite",
        required: true,
      },
      {
        name: "host",
        label: "Hébergement (Unbounce, Webflow, etc.)",
        type: "text",
        placeholder: "Ex : Unbounce",
      },
      {
        name: "cta",
        label: "CTA principal",
        type: "text",
        placeholder: "Ex : Simuler mon contrat (30 sec)",
        required: true,
      },
    ],
  },
  {
    key: "07-quiz-funnel",
    order: 7,
    agentKey: "funnel-builder",
    title: "Quiz funnel",
    emoji: "❓",
    tagline: "Spec quiz + scoring + intégrations",
    gate: true,
    category: "pipeline",
    expectsBefore: ["06-landing-page"],
    deliverableKind: "quiz-spec",
    defaultPrompt: `Conçois la spec complète du quiz funnel.

Objectif business : {business_goal}
Verticale : {vertical}
Type de lead recherché : {lead_kind}

Livrables : arborescence, détail des étapes, scoring tier A/B/C, 2-3 pages
résultat, intégrations CRM + événements à tracker.`,
    formFields: [
      {
        name: "business_goal",
        label: "Objectif business",
        type: "text",
        placeholder: "Ex : prendre des RDV qualifiés sous 24h",
        required: true,
      },
      {
        name: "vertical",
        label: "Verticale",
        type: "select",
        options: [
          "assurance-vie-lux",
          "scpi",
          "defisc",
          "banque-privee",
          "autre",
        ],
        required: true,
      },
      {
        name: "lead_kind",
        label: "Type de lead recherché",
        type: "text",
        placeholder: "Ex : patrimoine > 250 k€, urbain, 45-65 ans",
      },
    ],
  },
  {
    key: "08-video-brief",
    order: 8,
    agentKey: "video-editor",
    title: "Brief montage vidéo",
    emoji: "✂️",
    tagline: "EDL + sous-titres + sound design + adaptations multi-formats",
    gate: true,
    category: "pipeline",
    expectsBefore: ["04-video-founder-ads"],
    deliverableKind: "video-edl",
    defaultPrompt: `Produis le brief de montage complet (EDL timecodée + sous-titres + sound
design + adaptations 1:1 / 9:16 / 16:9).

Script source : (livré à l'étape 04 — relis le dernier deliverable
'founder-script' pour ce projet)

Durées cibles : {durations}
Rushs disponibles : {rushs}`,
    formFields: [
      {
        name: "durations",
        label: "Durées cibles (par format)",
        type: "text",
        placeholder: "Ex : 1:1 30s · 9:16 30s · 16:9 60s",
      },
      {
        name: "rushs",
        label: "Rushs disponibles (master, b-roll…)",
        type: "textarea",
        placeholder: "Ex : 4 prises de chaque ligne + 20 min b-roll bureau + plans mains/ordi.",
      },
    ],
  },
  {
    key: "09-tracking",
    order: 9,
    agentKey: "tracking",
    title: "Tracking",
    emoji: "📡",
    tagline: "Events, GTM, Meta CAPI, Google, UTM, Datablaster",
    gate: false,
    category: "pipeline",
    expectsBefore: ["07-quiz-funnel"],
    deliverableKind: "tracking-plan",
    defaultPrompt: `Produis le plan de tracking complet pour le funnel.

Stack actuelle : {stack}
CMP utilisée : {cmp}
CRM cible : {crm}
Objectif principal de conversion : {goal}

Inclus : inventaire événements, dataLayer schema, GTM, Meta CAPI, Google Ads
enhanced conversions, convention UTM, mapping Datablaster, QA checklist.`,
    formFields: [
      {
        name: "stack",
        label: "Stack actuelle (pixel installé ? GTM ?)",
        type: "text",
        placeholder: "Ex : GTM web installé, Meta pixel OK, pas de CAPI",
      },
      {
        name: "cmp",
        label: "CMP",
        type: "text",
        placeholder: "Ex : Axeptio",
      },
      {
        name: "crm",
        label: "CRM",
        type: "text",
        placeholder: "Ex : Hubspot",
      },
      {
        name: "goal",
        label: "Conversion principale",
        type: "text",
        placeholder: "Ex : qualified_lead avec tier A",
      },
    ],
  },
  {
    key: "10-campaign-setup",
    order: 10,
    agentKey: "media-buyer",
    title: "Campaign setup",
    emoji: "🚀",
    tagline: "Structure Meta + Google, nommage, budget, plan de test",
    gate: false,
    category: "pipeline",
    expectsBefore: ["09-tracking"],
    deliverableKind: "campaign-plan",
    defaultPrompt: `Produis la structure de lancement Meta + Google pour la première vague.

Budget total mensuel : {budget_total}
Objectif lead/jour : {leads_target}
Plateformes prioritaires : {platforms}

Inclus : structure campagnes (CBO/ABO), ad sets, ads (mapping aux 10
concepts), convention nommage, budget split TOF/MOF/BOF, critères
kill/scale/refresh, vues Datablaster attendues.`,
    formFields: [
      {
        name: "budget_total",
        label: "Budget total mensuel",
        type: "text",
        placeholder: "Ex : 12 k€/mois",
        required: true,
      },
      {
        name: "leads_target",
        label: "Objectif leads/jour",
        type: "text",
        placeholder: "Ex : 8 leads tier A/jour",
      },
      {
        name: "platforms",
        label: "Plateformes (Meta, Google, autres)",
        type: "text",
        placeholder: "Ex : Meta prioritaire, Google search en complément",
      },
    ],
  },

  // ─── ÉTAPES EXTRA ──────────────────────────────────────────────────────
  {
    key: "retrospective",
    order: 11,
    agentKey: "learning-curator",
    title: "Rétrospective",
    emoji: "♻️",
    tagline: "Distille les perfs Datablaster en learnings",
    gate: false,
    category: "extra",
    deliverableKind: "retro-report",
    defaultPrompt: `Mission : produire la rétrospective du cycle.

Période : {period_start} → {period_end}
Critère retenu : {metric}

Lis les retro_imports parsed pour cette période + les livrables produits sur
le projet. Identifie winners/losers, patterns confirmés/infirmés, hypothèses
pour le prochain cycle. Patches mémoire : creative-learnings.md,
agency_playbooks/winning-hooks-bank (anonymisé), agent_memory/*.`,
    formFields: [
      {
        name: "period_start",
        label: "Début période (YYYY-MM-DD)",
        type: "text",
        placeholder: "2026-05-01",
        required: true,
      },
      {
        name: "period_end",
        label: "Fin période (YYYY-MM-DD)",
        type: "text",
        placeholder: "2026-05-30",
        required: true,
      },
      {
        name: "metric",
        label: "Critère retenu",
        type: "select",
        options: ["CPL", "ROAS", "Hook rate", "CTR"],
      },
    ],
  },
  {
    key: "export-memory",
    order: 12,
    agentKey: null,
    title: "Export mémoire",
    emoji: "📤",
    tagline: "Télécharge les 7 fichiers concaténés en un .md portable",
    gate: false,
    category: "extra",
    deliverableKind: "memory-export",
    defaultPrompt: "",
  },
];

export const STEP_BY_KEY: Record<StepKey, StepConfig> = Object.fromEntries(
  STEPS.map((s) => [s.key, s])
) as Record<StepKey, StepConfig>;

export const PIPELINE_STEPS = STEPS.filter((s) => s.category === "pipeline");
export const ONBOARDING_STEP = STEPS.find((s) => s.key === "onboarding")!;
export const EXTRA_STEPS = STEPS.filter((s) => s.category === "extra");

/**
 * Remplit un prompt template en injectant les valeurs du formulaire.
 * Variables non fournies remplacées par "—".
 */
export function fillPrompt(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = values[key];
    return v && v.trim().length > 0 ? v.trim() : "—";
  });
}

// ── Navigation entre étapes ──────────────────────────────────────────────
const STEPS_BY_ORDER = [...STEPS].sort((a, b) => a.order - b.order);

/** Retourne l'étape suivante dans l'ordre du pipeline (ou null si dernière). */
export function getNextStep(current: StepKey): StepConfig | null {
  const idx = STEPS_BY_ORDER.findIndex((s) => s.key === current);
  if (idx === -1) return null;
  return STEPS_BY_ORDER[idx + 1] ?? null;
}

/** Retourne l'étape précédente (ou null si première). */
export function getPreviousStep(current: StepKey): StepConfig | null {
  const idx = STEPS_BY_ORDER.findIndex((s) => s.key === current);
  if (idx <= 0) return null;
  return STEPS_BY_ORDER[idx - 1];
}

/**
 * Étape "actionnable" à proposer à l'utilisateur : la première étape
 * dans l'ordre dont le statut est todo, gate_pending, in_progress ou
 * failed (= il y a quelque chose à faire dessus). Si tout est validé,
 * renvoie la première étape extra non touchée (retro), sinon null.
 */
export function getActionableStep(
  statusByStep: Map<string, string>
): StepConfig | null {
  for (const step of STEPS_BY_ORDER) {
    const status = statusByStep.get(step.key) ?? "todo";
    if (status === "todo" || status === "in_progress" || status === "gate_pending" || status === "failed") {
      return step;
    }
  }
  return null;
}
