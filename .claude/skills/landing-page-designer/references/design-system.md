# Design System — Tokens Visuels & Composants Code

Référence des tokens CSS, patterns d'animation et snippets de composants
réutilisables pour tous les types de pages du skill landing-page-designer.

---

## Tokens CSS — Base universelle

```css
:root {
  /* ── Palette (à surcharger par marque) ── */
  --color-primary:     #002759;   /* Bleu nuit — ex Destination Exit */
  --color-accent:      #30E6E6;   /* Turquoise — CTA */
  --color-bg:          #FFFFFF;
  --color-bg-soft:     #F4F6F9;   /* Sections alternées */
  --color-text:        #0D1117;
  --color-text-muted:  #5A6374;
  --color-border:      #E2E8F0;
  --color-success:     #22C55E;
  --color-warning:     #F59E0B;

  /* ── Typographie ── */
  --font-display:      'Playfair Display', Georgia, serif;
  --font-body:         'Inter', system-ui, sans-serif;
  --font-mono:         'JetBrains Mono', monospace;

  --text-xs:    0.75rem;   /* 12px */
  --text-sm:    0.875rem;  /* 14px */
  --text-base:  1rem;      /* 16px */
  --text-lg:    1.125rem;  /* 18px */
  --text-xl:    1.25rem;   /* 20px */
  --text-2xl:   1.5rem;    /* 24px */
  --text-3xl:   1.875rem;  /* 30px */
  --text-4xl:   2.25rem;   /* 36px */
  --text-5xl:   3rem;      /* 48px */
  --text-6xl:   3.75rem;   /* 60px */
  --text-7xl:   4.5rem;    /* 72px */

  /* ── Espacement ── */
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-3:  0.75rem;
  --space-4:  1rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;
  --space-32: 8rem;

  /* ── Layout ── */
  --container-sm:  640px;
  --container-md:  768px;
  --container-lg:  1024px;
  --container-xl:  1280px;
  --container-2xl: 1440px;

  /* ── Effets ── */
  --radius-sm:  4px;
  --radius-md:  8px;
  --radius-lg:  16px;
  --radius-xl:  24px;
  --radius-full: 9999px;

  --shadow-sm:  0 1px 3px rgba(0,0,0,0.08);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.10);
  --shadow-lg:  0 8px 32px rgba(0,0,0,0.14);
  --shadow-xl:  0 16px 64px rgba(0,0,0,0.18);

  --transition-fast:   150ms ease;
  --transition-base:   250ms ease;
  --transition-slow:   400ms ease;
  --transition-spring: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## Palettes Complètes par Positionnement

### Finance / M&A / Cabinet conseil
```css
:root {
  --color-primary:    #002759;
  --color-accent:     #C9A84C;  /* Or */
  --color-bg:         #FAFAF8;
  --color-bg-soft:    #F0EDE6;
  --font-display:     'Cormorant Garamond', serif;
  --font-body:        'Inter', sans-serif;
}
```

### Patrimoine HNWI / Luxe
```css
:root {
  --color-primary:    #1A1A2E;  /* Anthracite profond */
  --color-accent:     #D4AF6A;  /* Champagne */
  --color-bg:         #FDFCF8;  /* Ivoire */
  --color-bg-soft:    #F5F0E8;
  --font-display:     'Libre Baskerville', serif;
  --font-body:        'Lato', sans-serif;
}
```

### SaaS B2B / Tech
```css
:root {
  --color-primary:    #1E40AF;
  --color-accent:     #06B6D4;
  --color-bg:         #FFFFFF;
  --color-bg-soft:    #F0F9FF;
  --font-display:     'Syne', sans-serif;
  --font-body:        'Inter', sans-serif;
}
```

### Coaching / Transformation personnelle
```css
:root {
  --color-primary:    #3D2B1F;  /* Terre */
  --color-accent:     #E07B39;  /* Ambre */
  --color-bg:         #FDF8F3;  /* Crème */
  --color-bg-soft:    #F5EDE3;
  --font-display:     'Fraunces', serif;
  --font-body:        'Nunito', sans-serif;
}
```

---

## Composants Code — Snippets Réutilisables

### Hero Section (LP VSL)
```html
<section class="hero">
  <div class="container">
    <p class="hero__eyebrow">Peu importe si vous voulez vendre maintenant ou dans 3 ans</p>
    <h1 class="hero__headline">Découvrez comment multiplier par 10 la valeur de votre entreprise</h1>
    <p class="hero__sub">80% des entreprises ne se vendent jamais ou sont bradées. Faites partie des 4% qui réussissent.</p>
    <div class="hero__video-wrapper">
      <video class="hero__video" poster="thumbnail.jpg" preload="none" playsinline>
        <source src="vsl.mp4" type="video/mp4">
      </video>
      <button class="hero__play-btn" aria-label="Lancer la vidéo">
        <svg><!-- play icon --></svg>
      </button>
    </div>
    <a href="#calendrier" class="btn btn--primary btn--lg">
      Obtenir mon audit gratuit
    </a>
    <p class="hero__reassurance">45 min · Gratuit · Confidentiel · Sans engagement</p>
  </div>
</section>
```

```css
.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  background: var(--color-primary);
  color: white;
  padding: var(--space-24) var(--space-6);
}
.hero__eyebrow {
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-accent);
  margin-bottom: var(--space-4);
}
.hero__headline {
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 4rem);
  font-weight: 700;
  line-height: 1.1;
  max-width: 16ch;
  margin-bottom: var(--space-6);
}
.hero__video-wrapper {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: var(--radius-lg);
  overflow: hidden;
  max-width: 800px;
  margin: var(--space-8) auto;
  box-shadow: var(--shadow-xl);
}
.hero__play-btn {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.3);
  border: none;
  cursor: pointer;
  transition: background var(--transition-base);
}
.hero__play-btn:hover { background: rgba(0,0,0,0.5); }
```

---

### Boutons
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: var(--text-base);
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: all var(--transition-base);
  min-height: 44px; /* Accessibilité mobile */
}

.btn--primary {
  background: var(--color-accent);
  color: var(--color-primary);
}
.btn--primary:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}

.btn--lg {
  padding: var(--space-4) var(--space-8);
  font-size: var(--text-lg);
  border-radius: var(--radius-lg);
}

/* Mobile full-width */
@media (max-width: 640px) {
  .btn--full-mobile { width: 100%; }
}
```

---

### Barre de Progression Quiz
```html
<div class="quiz-progress" role="progressbar" 
     aria-valuenow="3" aria-valuemin="1" aria-valuemax="7">
  <div class="quiz-progress__bar">
    <div class="quiz-progress__fill" style="width: 42%"></div>
  </div>
  <span class="quiz-progress__label">Étape 3 sur 7</span>
</div>
```

```css
.quiz-progress {
  padding: var(--space-4) var(--space-6);
  background: white;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--color-border);
}
.quiz-progress__bar {
  height: 6px;
  background: var(--color-bg-soft);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--space-2);
}
.quiz-progress__fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  transition: width 500ms var(--transition-spring);
}
.quiz-progress__label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
```

---

### Cards de Questions (Quiz)
```html
<div class="quiz-options">
  <button class="quiz-option" data-value="a">
    <span class="quiz-option__icon">🏢</span>
    <span class="quiz-option__label">Société de services</span>
  </button>
  <button class="quiz-option" data-value="b">
    <span class="quiz-option__icon">⚙️</span>
    <span class="quiz-option__label">Industrie / Production</span>
  </button>
</div>
```

```css
.quiz-options {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: 1fr; /* mobile */
}
@media (min-width: 640px) {
  .quiz-options { grid-template-columns: repeat(2, 1fr); }
}

.quiz-option {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  background: white;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-base);
  text-align: left;
  font-size: var(--text-base);
  font-weight: 500;
}
.quiz-option:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.quiz-option.selected {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 5%, white);
}
.quiz-option__icon { font-size: 1.5rem; }
```

---

### Indicateur Score (Résultats Simulateur)
```html
<div class="score-display">
  <div class="score-ring">
    <svg viewBox="0 0 120 120">
      <circle class="score-ring__track" cx="60" cy="60" r="50"/>
      <circle class="score-ring__fill" cx="60" cy="60" r="50"
              stroke-dasharray="314"
              stroke-dashoffset="113" <!-- 314 × (1 - score/100) -->
      />
    </svg>
    <div class="score-ring__value">
      <span class="score-ring__number">64</span>
      <span class="score-ring__label">/100</span>
    </div>
  </div>
  <div class="score-level">
    <span class="score-level__badge">Niveau : Rentable</span>
    <p class="score-level__desc">Votre entreprise est vendable mais peut être significativement valorisée.</p>
  </div>
</div>
```

```css
.score-ring {
  position: relative;
  width: 160px;
  height: 160px;
  margin: 0 auto var(--space-6);
}
.score-ring svg { transform: rotate(-90deg); }
.score-ring__track {
  fill: none;
  stroke: var(--color-bg-soft);
  stroke-width: 10;
}
.score-ring__fill {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 1.5s var(--transition-spring);
}
.score-ring__value {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.score-ring__number {
  font-size: var(--text-4xl);
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}
```

---

### Animations au Scroll (Intersection Observer)
```javascript
// Révélation au scroll — à inclure dans toutes les pages
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
```

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 600ms ease, transform 600ms ease;
}
[data-reveal].is-visible {
  opacity: 1;
  transform: translateY(0);
}
/* Délais en cascade pour les grids */
[data-reveal-delay="1"] { transition-delay: 100ms; }
[data-reveal-delay="2"] { transition-delay: 200ms; }
[data-reveal-delay="3"] { transition-delay: 300ms; }

/* Respecter les préférences utilisateur */
@media (prefers-reduced-motion: reduce) {
  [data-reveal] { opacity: 1; transform: none; transition: none; }
}
```

---

### CTA Sticky Mobile
```html
<div class="cta-sticky" id="ctaSticky">
  <a href="#calendrier" class="btn btn--primary btn--full-mobile">
    Réserver mon appel gratuit
  </a>
</div>
```

```javascript
// Apparaît après avoir scrollé le hero
const hero = document.querySelector('.hero');
const ctaSticky = document.getElementById('ctaSticky');

const heroObserver = new IntersectionObserver(([entry]) => {
  ctaSticky.classList.toggle('is-visible', !entry.isIntersecting);
});
heroObserver.observe(hero);
```

```css
.cta-sticky {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--space-3) var(--space-4);
  background: white;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.12);
  z-index: 100;
  opacity: 0;
  transform: translateY(100%);
  transition: all var(--transition-base);
  display: none; /* Desktop : hidden */
}
.cta-sticky.is-visible {
  opacity: 1;
  transform: translateY(0);
}
@media (max-width: 768px) {
  .cta-sticky { display: block; }
}
```

---

### Accordéon FAQ
```html
<div class="faq">
  <details class="faq__item" open>
    <summary class="faq__question">
      Je ne suis pas encore prêt à vendre
      <span class="faq__icon">+</span>
    </summary>
    <div class="faq__answer">
      <p>C'est exactement le bon moment pour préparer. Les entreprises qui se vendent au meilleur prix sont celles qui ont anticipé 1 à 3 ans à l'avance...</p>
    </div>
  </details>
</div>
```

```css
.faq__item {
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-4) 0;
}
.faq__question {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  font-size: var(--text-lg);
  list-style: none;
  gap: var(--space-4);
}
.faq__question::-webkit-details-marker { display: none; }
.faq__icon {
  flex-shrink: 0;
  font-size: var(--text-2xl);
  transition: transform var(--transition-base);
}
details[open] .faq__icon { transform: rotate(45deg); }
.faq__answer {
  padding-top: var(--space-3);
  color: var(--color-text-muted);
  line-height: 1.7;
}
```

---

## Règles Typographiques

### Hiérarchie (desktop → mobile)
```
H1 display : 60-72px → 36-48px  | font-display, weight 700
H2 section : 36-48px → 28-36px  | font-display, weight 600
H3 card    : 22-28px → 20-24px  | font-body, weight 600
Body       : 17-18px → 16px     | font-body, weight 400
Small      : 14px    → 14px     | font-body, weight 400
Eyebrow    : 12-13px uppercase  | font-body, weight 600, tracking wide
```

### Lisibilité
- Largeur de ligne idéale : 60-75 caractères (max-width: 65ch)
- Interligne body : 1.65-1.75
- Interligne headlines : 1.1-1.2
- Pas de texte blanc sur fond très clair ou texte foncé sur fond très sombre sans contraste suffisant

### Google Fonts recommandés (import)
```html
<!-- Finance / Luxe -->
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

<!-- Coaching / Organique -->
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;1,400&family=Nunito:wght@400;500;600&display=swap" rel="stylesheet">

<!-- SaaS / Tech -->
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```
