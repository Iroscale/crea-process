# Architectures de Pages — Wireframes & Règles de Conversion

Référence détaillée des structures section par section pour chaque mode.
Inclut les règles de hiérarchie, les patterns de conversion et les pièges à éviter.

---

## MODE 1 — Landing Page VSL

### Objectif
Faire regarder la VSL → déclencher le clic vers le calendrier de RDV.

### Structure complète

```
┌─────────────────────────────────────┐
│  NAVBAR (sticky, hauteur max 60px)  │
│  Logo gauche | CTA droit (petit)    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  HERO (above the fold — 100vh)      │
│                                     │
│  [Chapeau — 12px uppercase]         │
│  "Peu importe si vous voulez..."    │
│                                     │
│  HEADLINE H1 — 48-64px bold        │
│  Max 8-10 mots, bénéfice central   │
│                                     │
│  Sous-titre — 18-22px regular      │
│  Statistique choc + promesse       │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      VIDÉO VSL (16:9)       │    │
│  │   Thumbnail avec play btn   │    │
│  │   Lazy load — ne joue pas   │    │
│  │   automatiquement           │    │
│  └─────────────────────────────┘    │
│                                     │
│  [CTA sous vidéo — bouton large]   │
│  "Obtenir mon bilan stratégique offert" │
│                                     │
│  Micro-copy sous CTA :             │
│  "45 min • Gratuit • Confidentiel" │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  SOCIAL PROOF BAND                  │
│  Logos partenaires / presse        │
│  OU chiffres clés (3 max)          │
│  "+1500 dirigeants accompagnés"    │
│  Fond légèrement contrasté         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  PROBLÈME (miroir de la douleur)   │
│                                     │
│  H2 — "Vous avez tout donné..."   │
│  3-4 paragraphes courts            │
│  Texte centré ou gauche, max 65ch  │
│                                     │
│  Liste des symptômes :             │
│  ✗ [Douleur 1]                     │
│  ✗ [Douleur 2]                     │
│  ✗ [Douleur 3]                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  LA MÉTHODE (solution)             │
│                                     │
│  H2 — "La Méthode [Nom]"          │
│  Sous-titre : promesse de méthode  │
│                                     │
│  [Visuel pyramide ou étapes]       │
│                                     │
│  Étapes 1-5 avec icône + titre +  │
│  corps de 2-3 lignes               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  BÉNÉFICES (3-4 cards)             │
│                                     │
│  Grid 2×2 ou 1×4                   │
│  Chaque card : icône + titre +     │
│  corps 40 mots max                 │
│                                     │
│  Pas de listes à puces dans cards  │
│  → phrases courtes                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ÉTUDE DE CAS (1 ou 2 max)         │
│                                     │
│  Photo (vraie) + prénom + contexte │
│  Situation avant → résultat après  │
│  Chiffre en grand (x3, 1.7M€...)  │
│                                     │
│  Citation courte entre guillemets  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  CTA INTERMÉDIAIRE                 │
│  Répétition bouton + micro-copy    │
│  Utile si LP longue (>3 screens)   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  FAQ (5-6 questions)               │
│                                     │
│  Accordéon (une ouverte par défaut)│
│  Questions = vraies objections     │
│  "Je ne suis pas encore prêt"     │
│  "J'ai déjà un comptable"         │
│  "Je n'ai pas le budget"          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  CTA FINAL (section dédiée)        │
│                                     │
│  H2 — "Prêt à construire          │
│         votre vraie sortie ?"      │
│                                     │
│  Bullet points de réassurance :    │
│  ✓ 45 minutes                      │
│  ✓ 100% confidentiel               │
│  ✓ Sans engagement                 │
│  ✓ Expertise terrain               │
│                                     │
│  BOUTON LARGE — couleur max        │
│  + Urgence douce si applicable     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  FOOTER minimal                     │
│  Mentions légales | RGPD | Contact │
└─────────────────────────────────────┘
```

### Règles spécifiques LP VSL
- La vidéo ne se lance JAMAIS automatiquement (Google Ads pénalise, UX mauvaise)
- Le thumbnail doit avoir un visage humain regardant l'objectif
- CTA sticky sur mobile : bouton flottant en bas d'écran
- Aucune navigation externe (pas de liens sortants sauf RDV)
- Désactiver la navbar sur mobile pour maximiser l'espace

---

## MODE 2 — Landing Page Simulateur

### Objectif
Faire démarrer le simulateur → qualifier + générer lead.

### Structure complète

```
┌─────────────────────────────────────┐
│  HERO (above the fold)              │
│                                     │
│  H1 — "Estimez la valeur de votre  │
│  entreprise en 2 min"               │
│                                     │
│  Sous-titre : promesse + 3 bullets  │
│  • 2 minutes seulement              │
│  • Estimation sur-mesure            │
│  • Gratuit et sans engagement       │
│                                     │
│  Aperçu simulateur (screenshot     │
│  ou preview animée de la Q1)       │
│                                     │
│  CTA : "Démarrer ma simulation"    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  BÉNÉFICES SIMULATEUR (3 colonnes) │
│  Icône + Titre + Corps 30 mots     │
│  "Valorisation précise"            │
│  "Leviers identifiés"              │
│  "Plan d'action personnalisé"      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  COMMENT ÇA MARCHE (3 étapes)      │
│  Numéro grand + texte              │
│  1. Répondez aux questions          │
│  2. Obtenez votre diagnostic        │
│  3. Découvrez vos leviers          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  PREUVE SOCIALE                     │
│  Témoignages anonymisés ou         │
│  Exemples de résultats (données)   │
│  "Entreprise services, 2,1M€..."   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  RÉASSURANCE                        │
│  🔒 Données confidentielles         │
│  ⚡ Résultats en 2 minutes          │
│  📊 Basé sur X entreprises         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  CTA FINAL                          │
│  Répétition + bouton + micro-copy  │
└─────────────────────────────────────┘
```

---

## MODE 3 — Quiz Funnel

### Architecture d'état et navigation

```
┌─────────────────────────┐
│  ÉCRAN 0 — ACCROCHE     │
│  Headline quiz          │
│  Promesse de résultat   │
│  Durée estimée          │
│  CTA "Commencer"        │
└────────────┬────────────┘
             │
    ┌────────▼────────┐
    │   QUESTION 1    │◄──── Barre de progression
    │   [Options]     │      "Étape 1 sur 7"
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │   QUESTION 2    │
    └────────┬────────┘
             │
            ...
             │
    ┌────────▼────────┐
    │  CAPTURE LEAD   │◄──── OPTIONNEL
    │  Prénom + Email │      (avant résultats)
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │  ÉCRAN ANALYSE  │◄──── Animation 3-5s
    │  "Analyse en    │      (crée anticipation)
    │   cours..."     │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │  RÉSULTATS      │◄──── MODE 4B
    └─────────────────┘
```

### Design des questions

**Principes :**
- Une question = un écran (jamais plusieurs questions visibles)
- Options en cards larges (pas de radio buttons natifs)
- Icône ou emoji dans chaque option (rend le choix visuel)
- Animation de transition entre questions (slide ou fade)
- Jamais de "page suivante" — auto-advance après sélection si pertinent

**Types de questions :**

```
TYPE SINGLE (choix unique)
┌──────────────────────────┐
│  [Icône] Option A        │
└──────────────────────────┘
┌──────────────────────────┐
│  [Icône] Option B        │
└──────────────────────────┘

TYPE SCALE (0-10 ou slider)
[←────────●────────→]
 Peu probable        Très probable

TYPE TEXTE LIBRE
[                    ]
 Votre réponse...
```

### Scoring & personnalisation

Chaque réponse contribue à 1-3 dimensions :
- Score global (ex: 0-100 → niveau dans la pyramide)
- Segment (ex: "prêt à vendre" / "en réflexion" / "en préparation")
- Personnalisation du message de résultats

---

## MODE 4A — Page de Remerciement VSL (après RDV)

### Objectif
Maintenir la conviction → réduire le no-show → préparer le call.

```
┌─────────────────────────────────────┐
│  CONFIRMATION (above the fold)      │
│                                     │
│  ✓ Grand (couleur accent)          │
│                                     │
│  H1 — "Votre rendez-vous           │
│         est confirmé."              │
│                                     │
│  [Jour] [Mois] à [Heure]          │
│  Lien de connexion : [bouton]      │
│                                     │
│  "Ajoutez à votre calendrier"      │
│  [Google Cal] [Apple Cal] [iCal]   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  PENDANT QUE VOUS ATTENDEZ...      │
│                                     │
│  H2 — "3 choses à savoir avant     │
│         notre échange"              │
│                                     │
│  OU vidéo courte de nurturing      │
│  (2-5 min — founder raconte)       │
│                                     │
│  Ou document PDF à télécharger     │
│  "Le guide de la cession réussie"  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  CE QUI VA SE PASSER               │
│                                     │
│  3 étapes du call :                │
│  1. On analyse votre situation      │
│  2. On identifie vos leviers        │
│  3. On vous donne un plan concret   │
│                                     │
│  "Ce n'est pas un pitch commercial. │
│   C'est une vraie analyse."        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  TÉMOIGNAGE DE QQUN QUI A FAIT LE  │
│  CALL → transformation             │
│  (renforcer que le call vaut le    │
│   déplacement mental)              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ANTI-ANNULATION                   │
│                                     │
│  "Si vous ne pouvez pas venir,     │
│   cliquez ici pour reprogrammer"   │
│  (lien discret — pas proéminent)   │
└─────────────────────────────────────┘
```

---

## MODE 4B — Page Résultats Simulateur

### Objectif
Rendre le score tangible et personnel → déclencher le désir d'aller plus loin.

```
┌─────────────────────────────────────┐
│  SCORE PERSONNALISÉ                 │
│                                     │
│  "Bonjour [Prénom],"               │
│                                     │
│  [INDICATEUR VISUEL GRAND]         │
│  Jauge / Score / Niveau pyramide   │
│  Ex: "Niveau : Rentable"           │
│  Ex: "Score : 61/100"              │
│                                     │
│  H2 — "Votre entreprise est        │
│         au niveau [X]"             │
│                                     │
│  Paragraphe d'interprétation       │
│  personnalisé selon le niveau      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  DÉTAIL DES DIMENSIONS             │
│                                     │
│  3-5 axes évalués avec score :     │
│  Rentabilité     ████░░ 72%        │
│  Indépendance    ██░░░░ 38%        │
│  Unicité         ███░░░ 55%        │
│  Organisation    ████░░ 68%        │
│                                     │
│  Chaque barre = cliquer pour       │
│  voir l'interprétation             │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  CE QUI VOUS FREINE                │
│  (personnalisé selon les réponses) │
│                                     │
│  ⚠ [Point faible 1 identifié]     │
│  ⚠ [Point faible 2 identifié]     │
│                                     │
│  "Ces 2 points peuvent réduire     │
│   votre valorisation de 30-50%"   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  PROCHAINE ÉTAPE (CTA principal)   │
│                                     │
│  H2 — "Votre diagnostic est prêt.  │
│         Et maintenant ?"           │
│                                     │
│  "Pour aller au niveau supérieur   │
│   et identifier vos vrais leviers" │
│                                     │
│  CTA PRIMAIRE :                    │
│  "Réserver mon bilan stratégique"  │
│                                     │
│  CTA SECONDAIRE (discret) :        │
│  "Voir la vidéo complète"          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  RÉASSURANCE FINALE                │
│  🔒 Vos résultats restent privés   │
│  Aucune donnée revendue            │
└─────────────────────────────────────┘
```

---

## Règles de Conversion Universelles

### Au-dessus de la fold
- La promesse doit être lisible en 3 secondes
- Le CTA doit être visible sans scroll sur un écran 375px
- Pas plus de 2 couleurs différentes dans le hero

### Les CTA
- Verbe d'action + bénéfice : "Obtenir mon diagnostic" / "Démarrer ma simulation"
- Jamais : "Envoyer", "Valider", "Cliquer ici", "En savoir plus"
- Couleur qui contraste avec TOUT le reste de la page
- Largeur 100% sur mobile

### Les formulaires
- Maximum 2-3 champs (prénom + email = standard)
- Placeholder explicite dans chaque champ
- Bouton submit = CTA fort (pas "Envoyer")
- Checkbox RGPD discrète mais présente

### La preuve sociale
- Toujours avant la FAQ
- Photos réelles > icônes génériques
- Chiffres spécifiques > généralités
- Étoiles de notation > texte seul

### La FAQ
- Questions = vraies objections (extraites des verbatims)
- Accordéon : 1 ouverte par défaut (celle qui bloque le plus)
- Réponses courtes (3-5 lignes max)
- Pas de jargon dans les réponses
