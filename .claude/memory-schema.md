# Schéma de la mémoire Agency OS

> Source de vérité du format de chaque fichier mémoire. **Tout agent qui écrit
> dans la mémoire doit respecter ce schéma à la lettre** : sections fixes,
> mêmes titres, mêmes ordres. C'est ce qui rend la mémoire lisible par
> n'importe quel autre agent, exportable proprement, et challengeable par
> l'humain.

L'unité de stockage est la table `public.client_memory` (1 ligne = 1 fichier
markdown). L'export `/export-memory` concatène les 7 fichiers dans l'ordre
ci-dessous, séparés par `\n\n---\n\n`.

---

## 1. `client-profile.md` — Synthèse d'onboarding

**Écrit par** : `orchestrator` (à l'onboarding)
**Lu par** : tous les agents (préambule injecté à chaque appel)

```markdown
# Profil client

## Identité
- Nom :
- Verticale : (assurance-vie-lux | scpi | defisc | banque-privee | autre)
- Marché : (France | Suisse | …)
- Site / LP actuelle(s) :
- Contact opérationnel :

## Produit / service
(synthèse en 3-5 phrases, sortie de l'ingestion docs + Fathom)

## Proposition de valeur
- Promesse principale :
- Promesses secondaires :
- Preuves / différenciateurs :

## Contraintes
### Réglementaires
- (ex : ACPR 2019-R-01 applicable, label ISR obligatoire, mention « risque de perte en capital » requise…)
### Opérationnelles
- (ex : pas de mention du fonds « X » sur Meta, fondateur pas dispo le mercredi…)
### Tonales
- (ce qu'on ne dit jamais, ce qu'on évite)

## Accès & assets
- BM Meta :
- Compte Google Ads :
- Page Facebook :
- Pixel / Mesure :
- Datablaster :

## Récap Fathom (appel d'onboarding)
(verbatim ou synthèse de l'appel — clé pour challenger l'ICP plus tard)

## Documents ingérés
- (liste des fichiers transmis : titre, type, résumé d'1 ligne)

## Landing pages analysées
- URL · Ce qui marche · Ce qui freine · À garder / à refondre
```

---

## 2. `brand-voice.md` — Voix de marque

**Écrit par** : `orchestrator` puis affiné par `copywriter`
**Lu par** : `copywriter`, `production-assistant`, `funnel-builder`,
`legal-compliance`

```markdown
# Voix de marque

## Positionnement en une phrase
"… "

## Archétype
(Sage / Magicien / Régent / Héros / …) — justification 1 ligne

## Ton
- Registres autorisés : (ex : pédagogue, direct, posé, premium)
- Registres interdits : (ex : familier, hype-bro, alarmiste)

## Lexique
### À utiliser
- (mots qui font la maison)
### À bannir
- (mots gimmick, anglicismes interdits, tournures IA, tirets cadratins, …)

## Format type
- Phrases : (courtes / mixtes)
- Ponctuation : (pas de « ; », pas de « — » dans le copy fini, …)
- Émojis : (jamais / parcimonie / OK quand…)

## Exemples canoniques
### Hook qui sonne juste
> …
### Hook qui sonne faux
> …
### Phrase de clôture type
> …
```

---

## 3. `icp.md` — ICP, douleurs, verbatims

**Écrit par** : `market-research`
**Lu par** : tous les agents créa + `funnel-builder` + `media-buyer`

```markdown
# ICP & verbatims

## Synthèse marché
(2-4 phrases — état, taille, dynamique, fenêtres)

## 3 ICP

### ICP 1 — <nom court>
- Profil sociodémo :
- Situation patrimoniale :
- Pain (douleur ressentie) :
- Need (besoin formulé) :
- Problem (problème opérationnel) :
- Desire (état désiré) :
- Niveau de conscience : (unaware → most aware)
- Niveau de sophistication marché :
- Objections principales :
- Déclencheurs d'achat :

### ICP 2 — …
### ICP 3 — …

## Banque d'objections (voice of customer)
| Objection | Verbatim (source) | ICP concerné | Réponse stratégique |
|---|---|---|---|
| … | « … » (r/vosfinances thread X) | ICP 1 | … |

## Verbatims clés
> « citation 1 » — *source précise + URL*
> « citation 2 » — *source précise + URL*

## Veille publicitaire concurrentielle
- Concurrent · Angle utilisé · Hook · Format · Source (Meta Ad Library / lien)
- …

## Sources
- (liste URLs citées — au moins 10 sources crédibles)
```

---

## 4. `angles-promesses.md` — Angles, promesses, Broad Mix

**Écrit par** : `creative-strategist` (validé par humain)
**Lu par** : `copywriter`, `production-assistant`, `funnel-builder`

```markdown
# Angles & promesses

## Promesse maîtresse
"…"  (une seule phrase — celle qui doit conclure 80 % des créas)

## Promesses secondaires
1. …
2. …
3. …

## Angles validés
### Angle <slug> — <titre court>
- Cible : ICP n°
- Levier psychologique : (urgence / peur / statut / social proof / FOMO / simplicité / pédagogie / aspiration)
- Hook(s) prêts :
- Preuve(s) à mobiliser :
- Format(s) recommandé(s) :
- Niveau funnel : (TOF / MOF / BOF)

## Broad Mix (matrice persona × angle × format × funnel)
| Persona | Angle | Format | Niveau funnel | Hypothèse à tester |
|---|---|---|---|---|

## Angles testés et écartés
- (et pourquoi)
```

---

## 5. `creative-learnings.md` — Apprentissages perfs

**Écrit par** : `learning-curator` après chaque rétrospective
**Lu par** : `market-research`, `creative-strategist`, `copywriter`

```markdown
# Learnings créa

> Mis à jour à chaque rétrospective. Source : exports Datablaster + livrables.

## Winners
| Période | Créa | Hook | Format | Hook rate | CTR | CPL | ROAS | Pourquoi ça marche |

## Losers
| Période | Créa | Hook | Format | Hook rate | CTR | CPL | ROAS | Pourquoi ça rate |

## Patterns confirmés
- (généralisations sourcées : « les hooks `objection → retournement` battent les hooks `fear-based` chez ICP 2 »)

## Patterns infirmés
- (ce qu'on croyait et qu'on jette)

## Hypothèses à tester au prochain cycle
1. …
```

---

## 6. `compliance-notes.md` — Notes de conformité

**Écrit par** : `legal-compliance` à chaque check
**Lu par** : `copywriter`, `production-assistant`, `funnel-builder`

```markdown
# Notes de conformité

## Référentiels applicables à ce client
- ACPR : (ex : recommandation 2019-R-01 — IOBSP)
- AMF : (DICI/PRIIPS, communications commerciales)
- ARPP : (financier, art. dédiés)
- Code des assurances :
- Code de la consommation :

## Mentions obligatoires (à intégrer systématiquement)
- (ex : « Le capital investi présente un risque de perte »)
- …

## Claims interdits
- (ex : "rendement garanti", "0 risque", "résultats passés présagent du futur")
- …

## Historique des checks
| Date | Asset | Verdict | Issues clés | Run id |
|---|---|---|---|---|
```

---

## 7. `decisions-log.md` — Journal de décisions

**Écrit par** : `orchestrator` + chaque agent à chaque action
**Lu par** : humain (audit) + `orchestrator` (pour reprendre où on en était)

```markdown
# Journal de décisions

> Chaque action significative est tracée ici. Ordre chronologique inverse
> (le plus récent en haut).

## YYYY-MM-DD HH:MM — <étape> — <agent>
- Action : (ex : a produit le Broad Mix v1)
- Statut gate : (n/a | gate ouvert | gate validé par <user>)
- Run id :
- Livrable : (lien interne)
- Notes : (1-2 lignes max)
```

---

## Conventions communes

- **Markdown CommonMark strict**. Pas de HTML inline.
- **Pas de tableaux à colonnes manquantes** — si une cellule est vide, mettre `—`.
- **Citations** : toujours `>`, jamais en italique seul.
- **Liens** : `[texte](url)` — jamais d'URL nue dans le contenu narratif.
- **Dates** : `YYYY-MM-DD` partout.
- **Niveau de titre** : le fichier commence par `# Titre`, sous-sections en
  `##`, jamais de `#` ailleurs.
