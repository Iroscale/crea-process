/**
 * Memory schema — source de vérité TS des 7 fichiers mémoire client.
 *
 * Côté DB : table `client_memory` (1 ligne = 1 fichier markdown).
 * Côté code : on importe `MEMORY_SLUGS` pour itérer, et `MEMORY_TEMPLATES`
 * pour initialiser un nouveau client avec les 7 fichiers vides au bon format.
 *
 * Le schéma humain (sections, format, qui écrit/lit) est documenté dans
 * `.claude/memory-schema.md`. Ce fichier est la version exécutable.
 */

export const MEMORY_SLUGS = [
  "client-profile",
  "brand-voice",
  "icp",
  "angles-promesses",
  "creative-learnings",
  "compliance-notes",
  "decisions-log",
] as const;

export type MemorySlug = (typeof MEMORY_SLUGS)[number];

export const MEMORY_TITLES: Record<MemorySlug, string> = {
  "client-profile": "Profil client",
  "brand-voice": "Voix de marque",
  icp: "ICP & verbatims",
  "angles-promesses": "Angles & promesses",
  "creative-learnings": "Learnings créa",
  "compliance-notes": "Notes de conformité",
  "decisions-log": "Journal de décisions",
};

/** Ordre d'export quand on concatène les 7 fichiers en un seul markdown. */
export const MEMORY_EXPORT_ORDER: MemorySlug[] = [
  "client-profile",
  "brand-voice",
  "icp",
  "angles-promesses",
  "creative-learnings",
  "compliance-notes",
  "decisions-log",
];

/** Templates initiaux — squelette markdown, sections fixes. */
export const MEMORY_TEMPLATES: Record<MemorySlug, string> = {
  "client-profile": `# Profil client

## Identité
- Nom :
- Verticale :
- Marché :
- Site / LP actuelle(s) :
- Contact opérationnel :

## ⭐ Mission de l'agence (NE PAS L'OUBLIER)
- **Type de business** : (B2C | B2B | B2B2C | Mixte)
- **Objectif principal** : (acquisition de leads qualifiés / RDV / vente directe / inscription simulateur / autre)
- **Cible précise** : (qui exactement ? Si B2B : fonction, secteur, taille entreprise. Si B2C : sociodémo, patrimoine, situation)
- **Action recherchée** : (ce que le prospect doit faire — prise de RDV / simulateur / appel / devis)
- **Stade marché** : (émergent | en croissance | mature | saturé)

## Produit / service

## Proposition de valeur
- Promesse principale :
- Promesses secondaires :
- Preuves / différenciateurs :

## Contraintes
### Réglementaires
### Opérationnelles
### Tonales

## Accès & assets
- BM Meta :
- Compte Google Ads :
- Page Facebook :
- Pixel / Mesure :
- Datablaster :

## Récap Fathom (appel d'onboarding)

## Documents ingérés

## Landing pages analysées
`,

  "brand-voice": `# Voix de marque

## Positionnement en une phrase

## Archétype

## Ton
- Registres autorisés :
- Registres interdits :

## Lexique
### À utiliser
### À bannir

## Format type
- Phrases :
- Ponctuation :
- Émojis :

## Exemples canoniques
### Hook qui sonne juste
### Hook qui sonne faux
### Phrase de clôture type
`,

  icp: `# ICP & verbatims

## Synthèse marché

## 3 ICP

### ICP 1 —
- Profil sociodémo :
- Situation patrimoniale :
- Pain :
- Need :
- Problem :
- Desire :
- Niveau de conscience :
- Niveau de sophistication marché :
- Objections principales :
- Déclencheurs d'achat :

### ICP 2 —

### ICP 3 —

## Banque d'objections (voice of customer)
| Objection | Verbatim (source) | ICP concerné | Réponse stratégique |
|---|---|---|---|

## Verbatims clés

## Veille publicitaire concurrentielle

## Sources
`,

  "angles-promesses": `# Angles & promesses

## Promesse maîtresse

## Promesses secondaires

## Angles validés

## Broad Mix (matrice persona × angle × format × funnel)
| Persona | Angle | Format | Niveau funnel | Hypothèse à tester |
|---|---|---|---|---|

## Angles testés et écartés
`,

  "creative-learnings": `# Learnings créa

## Winners
| Période | Créa | Hook | Format | Hook rate | CTR | CPL | ROAS | Pourquoi ça marche |
|---|---|---|---|---|---|---|---|---|

## Losers
| Période | Créa | Hook | Format | Hook rate | CTR | CPL | ROAS | Pourquoi ça rate |
|---|---|---|---|---|---|---|---|---|

## Patterns confirmés

## Patterns infirmés

## Hypothèses à tester au prochain cycle
`,

  "compliance-notes": `# Notes de conformité

## Référentiels applicables à ce client
- ACPR :
- AMF :
- ARPP :
- Code des assurances :
- Code de la consommation :

## Mentions obligatoires (à intégrer systématiquement)

## Claims interdits

## Historique des checks
| Date | Asset | Verdict | Issues clés | Run id |
|---|---|---|---|---|
`,

  "decisions-log": `# Journal de décisions

> Chaque action significative est tracée ici. Ordre chronologique inverse.
`,
};

/**
 * Concatène les 7 fichiers mémoire dans l'ordre d'export.
 * Utilisé par /export-memory et par le bloc cacheable du serveur.
 */
export function concatMemory(
  files: Partial<Record<MemorySlug, string>>
): string {
  const parts: string[] = [];
  for (const slug of MEMORY_EXPORT_ORDER) {
    const md = files[slug];
    if (md && md.trim().length > 0) parts.push(md.trim());
  }
  return parts.join("\n\n---\n\n");
}
