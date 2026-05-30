/**
 * PREMIUM renderer — applies design + CRO directives on top of the LP content
 * to produce an agency-tier HTML output.
 *
 * Outputs above-and-beyond what the standard renderer does :
 *  - Custom typography (display + body) from directives
 *  - Custom palette (primary, accent, bg, surface)
 *  - Sticky mobile CTA bar (top CRO lever)
 *  - Sticky mini-header with mini-CTA after scroll
 *  - Urgency banner
 *  - Reveal-on-scroll animations (vanilla JS Intersection Observer)
 *  - Counter animations on stats
 *  - Trust cluster around CTA
 *  - Form optimization (single_field / two_step / progressive / full)
 *  - Exit-intent modal
 *  - Hover micro-interactions
 */
import type {
  LandingPageContent,
  TrustFunnelContent,
  StoryPivotContent,
  QuizLeadContent,
} from "@/lib/landing-page-schema";
import {
  FONT_CSS,
  BG_COLORS,
  SURFACE_COLORS,
  buildGoogleFontsUrl,
  type DesignDirectives,
} from "@/lib/landing-page-design-schema";

type Variant = "A" | "B";

export function renderPremiumLandingPageHtml(
  content: LandingPageContent,
  directives: DesignDirectives,
  variant: Variant,
  mode: "preview" | "production" = "preview"
): string {
  let body = "";
  if (content.template_id === "trust-funnel") {
    body = renderTrustFunnel(content, directives);
  } else if (content.template_id === "story-pivot") {
    body = renderStoryPivot(content, directives);
  } else {
    body = renderQuizLead(content, directives);
  }
  return wrap(body, directives, variant, mode);
}

// ──────────────────────────────────────────────────────────────────────────
// HTML SHELL
// ──────────────────────────────────────────────────────────────────────────

function wrap(
  body: string,
  d: DesignDirectives,
  variant: Variant,
  mode: "preview" | "production"
): string {
  const isPreview = mode === "preview";
  const fontsUrl = buildGoogleFontsUrl(d.typography.display, d.typography.body);
  const displayFamily = FONT_CSS[d.typography.display].family;
  const bodyFamily = FONT_CSS[d.typography.body].family;
  const bgHex = BG_COLORS[d.palette.bg];
  const surfaceHex = SURFACE_COLORS[d.palette.surface];
  const isDarkBg = d.palette.bg === "dark" || d.palette.bg === "midnight";
  const textColor = isDarkBg ? "#F5F5F5" : "#0A0A0A";
  const mutedColor = isDarkBg ? "rgba(245,245,245,0.6)" : "rgba(10,10,10,0.6)";
  const borderColor = isDarkBg ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const scale = SCALE[d.typography.scale];

  const devBadge = isPreview
    ? `<div class="dev-badge">VARIANTE ${variant} · PREMIUM</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr" data-variant="${variant}" data-mode="premium">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-variant" content="${variant}" />
<title>${isPreview ? "LP preview · " : ""}Variante ${variant}</title>
<script src="https://cdn.tailwindcss.com"></script>
${fontsUrl ? `<link href="${fontsUrl}" rel="stylesheet">` : ""}
<style>
  :root {
    --color-primary: ${d.palette.primary};
    --color-primary-text: ${d.palette.primary_text};
    --color-accent: ${d.palette.accent};
    --color-bg: ${bgHex};
    --color-surface: ${surfaceHex};
    --color-text: ${textColor};
    --color-muted: ${mutedColor};
    --color-border: ${borderColor};
    --display-font: ${displayFamily}, system-ui, sans-serif;
    --body-font: ${bodyFamily}, system-ui, sans-serif;
  }
  html, body { background: var(--color-bg); color: var(--color-text); }
  body { font-family: var(--body-font); -webkit-font-smoothing: antialiased; }
  .display { font-family: var(--display-font); letter-spacing: -0.025em; }
  .h1-display { font-size: ${scale.h1}; font-weight: 800; line-height: 1.04; letter-spacing: -0.03em; }
  .h2-display { font-size: ${scale.h2}; font-weight: 700; line-height: 1.08; letter-spacing: -0.025em; }
  .lead { font-size: ${scale.lead}; line-height: 1.55; }
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-text);
    border-radius: 12px;
    padding: 16px 28px;
    font-weight: 700;
    box-shadow: 0 8px 24px ${hexToRgba(d.palette.primary, 0.32)}, 0 0 0 1px ${hexToRgba(d.palette.primary, 0.08)} inset;
    transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
    display: inline-block;
    text-align: center;
  }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 32px ${hexToRgba(d.palette.primary, 0.42)}; filter: brightness(1.05); }
  .accent-text { color: var(--color-accent); }
  .dev-badge {
    position: fixed; top: 12px; right: 12px; z-index: 999;
    background: rgba(16,185,129,0.1); color: rgb(5,150,105); border: 1px solid rgba(16,185,129,0.3);
    border-radius: 9999px; padding: 4px 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
  }
  ${
    d.animations.reveal_on_scroll
      ? `
  .reveal { opacity: 0; transform: translateY(24px); transition: opacity .7s ease-out, transform .7s ease-out; }
  .reveal.in { opacity: 1; transform: translateY(0); }`
      : ""
  }
  ${
    d.animations.hover_microinteractions
      ? `
  @media (hover: hover) and (pointer: fine) {
    .hover-lift { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
    .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(0,0,0,0.08); border-color: ${hexToRgba(d.palette.primary, 0.3)}; }
  }`
      : ""
  }
  ${
    d.cro.sticky_cta_mobile
      ? `
  .sticky-mobile-cta { position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 50; }
  @media (min-width: 1024px) { .sticky-mobile-cta { display: none; } }
  body.has-sticky-mobile-cta { padding-bottom: 92px; }`
      : ""
  }
  ${
    d.cro.sticky_header
      ? `
  .sticky-header { position: fixed; top: 0; left: 0; right: 0; z-index: 40; backdrop-filter: blur(14px); background: ${hexToRgba(bgHex, 0.78)}; border-bottom: 1px solid var(--color-border); transform: translateY(-100%); transition: transform .3s ease; }
  .sticky-header.show { transform: translateY(0); }`
      : ""
  }
  .urgency-bar { background: linear-gradient(90deg, ${hexToRgba(d.palette.accent, 0.15)} 0%, ${hexToRgba(d.palette.accent, 0.08)} 50%, ${hexToRgba(d.palette.accent, 0.15)} 100%); border-bottom: 1px solid ${hexToRgba(d.palette.accent, 0.2)}; color: var(--color-text); }
  details > summary::-webkit-details-marker { display: none; }
  details > summary { list-style: none; }
</style>
</head>
<body${d.cro.sticky_cta_mobile ? ' class="has-sticky-mobile-cta"' : ""}>
${devBadge}
${
  d.cro.urgency_marker?.enabled
    ? `<div class="urgency-bar"><div class="mx-auto max-w-6xl px-6 py-2 text-center text-sm font-medium">⏳ ${escape(d.cro.urgency_marker.text)}</div></div>`
    : ""
}
${
  d.cro.sticky_header
    ? `<header class="sticky-header" id="stickyHeader">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <span class="display font-bold text-base">${escape(getStickyHeaderTitle())}</span>
          <button onclick="document.getElementById('hero-cta')?.scrollIntoView({behavior:'smooth',block:'center'})" class="btn-primary !py-2 !px-5 !text-sm">${escape(getStickyHeaderCta(d))}</button>
        </div>
      </header>`
    : ""
}
${body}
${
  d.cro.sticky_cta_mobile
    ? `<div class="sticky-mobile-cta">
        <button onclick="document.getElementById('hero-cta')?.scrollIntoView({behavior:'smooth',block:'center'})" class="btn-primary w-full !text-base shadow-2xl">${escape(getStickyMobileCta(d))}</button>
      </div>`
    : ""
}
${
  d.cro.exit_intent_modal?.enabled
    ? renderExitIntentModal(d.cro.exit_intent_modal)
    : ""
}
<script>
${d.animations.reveal_on_scroll ? REVEAL_SCRIPT : ""}
${d.cro.counter_animation ? COUNTER_SCRIPT : ""}
${d.cro.sticky_header ? STICKY_HEADER_SCRIPT : ""}
${d.cro.exit_intent_modal?.enabled ? EXIT_INTENT_SCRIPT : ""}
</script>
</body>
</html>`;
}

const SCALE: Record<
  DesignDirectives["typography"]["scale"],
  { h1: string; h2: string; lead: string }
> = {
  compact: { h1: "clamp(2rem, 5vw, 3.25rem)", h2: "clamp(1.5rem, 3.5vw, 2.25rem)", lead: "1rem" },
  balanced: { h1: "clamp(2.5rem, 6vw, 4.25rem)", h2: "clamp(1.75rem, 4vw, 2.75rem)", lead: "1.125rem" },
  generous: { h1: "clamp(3rem, 7vw, 5.5rem)", h2: "clamp(2rem, 4.5vw, 3.25rem)", lead: "1.25rem" },
  monumental: { h1: "clamp(3.5rem, 9vw, 7rem)", h2: "clamp(2.25rem, 5vw, 3.75rem)", lead: "1.375rem" },
};

const REVEAL_SCRIPT = `
const _reveal = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); _reveal.unobserve(e.target); } });
}, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => _reveal.observe(el));
`;

const COUNTER_SCRIPT = `
const _counter = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const target = parseFloat(el.dataset.counterTo || '0');
    const suffix = el.dataset.counterSuffix || '';
    const prefix = el.dataset.counterPrefix || '';
    const start = performance.now();
    const dur = 1400;
    function step(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target * eased;
      el.textContent = prefix + (target % 1 === 0 ? Math.round(v).toLocaleString('fr-FR') : v.toFixed(1).replace('.', ',')) + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    _counter.unobserve(el);
  });
}, { threshold: 0.4 });
document.querySelectorAll('[data-counter-to]').forEach((el) => _counter.observe(el));
`;

const STICKY_HEADER_SCRIPT = `
let _lastScroll = 0;
const _header = document.getElementById('stickyHeader');
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y > 600 && y > _lastScroll) _header.classList.add('show');
  else if (y < 400 || y < _lastScroll - 8) _header.classList.remove('show');
  _lastScroll = y;
}, { passive: true });
`;

const EXIT_INTENT_SCRIPT = `
let _shown = false;
function _showExit() {
  if (_shown) return; _shown = true;
  document.getElementById('exitModal').classList.remove('hidden');
}
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget && e.clientY < 30) _showExit(); });
setTimeout(() => { /* fallback after 90s of inactivity */ const t = Date.now(); function check() { if (Date.now() - t > 60000) _showExit(); else requestAnimationFrame(check); } check(); }, 60000);
function _closeExit() { document.getElementById('exitModal').classList.add('hidden'); }
`;

function renderExitIntentModal(
  m: NonNullable<DesignDirectives["cro"]["exit_intent_modal"]>
): string {
  return `
<div id="exitModal" class="hidden fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
  <div class="relative w-full max-w-md rounded-3xl bg-white p-8 text-slate-900 shadow-2xl">
    <button onclick="_closeExit()" class="absolute right-4 top-4 text-slate-400 hover:text-slate-700">✕</button>
    <p class="text-xs font-bold uppercase tracking-wider text-emerald-700">Avant de partir</p>
    <h3 class="mt-2 display text-2xl font-bold">${escape(m.headline)}</h3>
    <p class="mt-3 text-sm text-slate-600">${escape(m.offer)}</p>
    <input type="email" placeholder="Votre email" class="mt-5 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
    <button class="btn-primary mt-3 w-full">${escape(m.cta_label)}</button>
  </div>
</div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE RENDERERS
// ──────────────────────────────────────────────────────────────────────────

function renderTrustFunnel(c: TrustFunnelContent, d: DesignDirectives): string {
  // Foxstone-style ordered sections, premium-rendered.
  const parts: string[] = [renderHero(c.hero, d)];
  if (c.stats_band) parts.push(renderStatsBandPremium(c.stats_band, d));
  if (c.press_logos) parts.push(renderPressLogosPremium(c.press_logos, d));
  if (c.solutions) parts.push(renderSolutionsPremium(c.solutions, d));
  if (c.why_us) parts.push(renderWhyUsPremium(c.why_us, d));
  if (c.opportunities)
    parts.push(renderOpportunitiesPremium(c.opportunities, d));
  parts.push(renderHowItWorks(c.how_it_works, d));
  parts.push(renderSocialProof(c.social_proof, d));
  if (c.brand_story) parts.push(renderBrandStoryPremium(c.brand_story, d));
  if (c.simulator) parts.push(renderSimulatorPremium(c.simulator, d));
  if (c.lead_magnet_section)
    parts.push(renderLeadMagnetPremium(c.lead_magnet_section, d));
  // Legacy fallbacks
  if (!c.stats_band && c.trust_band) parts.push(renderTrustBand(c.trust_band, d));
  if (c.problem) parts.push(renderProblem(c.problem, d));
  if (!c.why_us && c.features) parts.push(renderFeatures(c.features, d));
  if (c.comparator) parts.push(renderComparator(c.comparator, d));
  if (c.security) parts.push(renderSecurity(c.security, d));
  parts.push(renderFAQ(c.faq, d));
  parts.push(renderCtaFinal(c.cta_final, d));
  parts.push(renderFooter(d));
  return parts.join("\n");
}

function renderStoryPivot(c: StoryPivotContent, d: DesignDirectives): string {
  return [
    renderHero(c.hero, d),
    renderStory(c.story, d),
    renderChartPivot(c.chart_pivot, d),
    renderSolutionReveal(c.solution_reveal, d),
    renderSocialProof(c.social_proof, d),
    renderSecurity(c.security, d),
    renderFAQ(c.faq, d),
    renderCtaFinal(c.cta_final, d),
    renderFooter(d),
  ].join("\n");
}

function renderQuizLead(c: QuizLeadContent, d: DesignDirectives): string {
  return [
    renderHero(c.hero, d),
    renderWhyMatters(c.why_matters, d),
    renderQuizTeaser(c.quiz_teaser, d),
    renderQuizPreview(c.quiz_preview, d),
    renderSocialProof(c.social_proof, d),
    renderFAQ(c.faq, d),
    renderCtaFinal(c.cta_final, d),
    renderFooter(d),
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────────────
// SECTIONS
// ──────────────────────────────────────────────────────────────────────────

function renderHero(
  h: LandingPageContent["hero"],
  d: DesignDirectives
): string {
  // Form optimization
  let formHtml = "";
  if (h.form) {
    const fields = optimizeFormFields(h.form.fields, d.cro.form_optimization);
    const fieldRows = fields.map((f) => fieldHtml(f, d)).join("");
    const isSingle = d.cro.form_optimization === "single_field";
    formHtml = `
      <div id="hero-cta" class="rounded-3xl bg-white p-7 text-slate-900 shadow-2xl ring-1 ring-black/5">
        <form class="flex flex-col gap-3">
          ${fieldRows}
          <button type="button" class="btn-primary mt-1 w-full !text-base">
            ${escape(h.form.cta.label)}
          </button>
          ${
            h.form.cta.reassurance
              ? `<p class="text-center text-[11px] text-slate-500">${escape(h.form.cta.reassurance)}</p>`
              : ""
          }
        </form>
        ${
          isSingle
            ? `<p class="mt-3 text-center text-[10px] text-slate-400">Aucune carte requise. Désinscription en 1 clic.</p>`
            : ""
        }
      </div>`;
  } else if (h.cta) {
    formHtml = `
      <div id="hero-cta" class="flex flex-wrap items-center gap-4">
        <a href="#cta-final" class="btn-primary !text-base">${escape(h.cta.label)}</a>
        ${
          h.cta.reassurance
            ? `<span class="text-sm" style="color:var(--color-muted)">${escape(h.cta.reassurance)}</span>`
            : ""
        }
      </div>`;
  }

  // Trust cluster near CTA
  const trustCluster =
    d.cro.trust_cluster_near_cta && h.trust_badges?.length
      ? `<div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style="color:var(--color-muted)">
          ${h.trust_badges
            .slice(0, 4)
            .map(
              (b) =>
                `<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span>${escape(b)}</span>`
            )
            .join("")}
        </div>`
      : "";

  const heroBgColor =
    d.palette.bg === "dark" || d.palette.bg === "midnight"
      ? "var(--color-bg)"
      : "#0A0A0A";

  // Headline with accent words highlighted (Foxstone-style)
  const headlineHtml = highlightAccent(
    h.headline,
    h.headline_accent_words ?? [],
    d.palette.accent
  );

  const badgeHtml = h.badge
    ? `<div class="reveal mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium ring-1" style="ring-color:${hexToRgba(d.palette.accent, 0.3)};">${escape(h.badge)}</div>`
    : "";

  const socialProofLine = h.social_proof_line
    ? `<p class="reveal mt-4 text-base font-bold" style="color:${hexToRgba("#F5F5F5", 0.95)}">${escape(h.social_proof_line)}</p>`
    : "";

  const ratingsHtml = h.ratings?.length
    ? `<div class="reveal mt-6 flex flex-wrap items-center gap-5 text-sm">
        ${h.ratings
          .map(
            (r) => `<div class="flex items-center gap-2">
            <span class="font-bold" style="color:${hexToRgba("#F5F5F5", 0.9)}">${escape(r.platform)}</span>
            <span class="text-amber-400">★★★★★</span>
            <span class="font-semibold">${escape(r.rating)}</span>
          </div>`
          )
          .join("")}
      </div>`
    : "";

  const leadBannerHtml = h.lead_magnet_banner
    ? `<a href="#lead-magnet" class="reveal mt-5 inline-flex max-w-md items-start gap-3 rounded-2xl border bg-white/5 p-4 transition hover:bg-white/10" style="border-color:${hexToRgba(d.palette.accent, 0.4)};">
        <span class="text-2xl">📖</span>
        <div class="flex-1 text-sm">
          <div class="text-xs font-bold uppercase tracking-wider accent-text">${escape(h.lead_magnet_banner.kicker)}</div>
          <div class="mt-0.5 font-medium" style="color:${hexToRgba("#F5F5F5", 0.95)}">${escape(h.lead_magnet_banner.text)}</div>
        </div>
        <span class="accent-text">→</span>
      </a>`
    : "";

  return `
<section class="relative overflow-hidden" style="background:${heroBgColor}; color:#F5F5F5;">
  <!-- Hero visual placeholder with gradient -->
  <div class="absolute inset-0">
    <div class="absolute inset-0" style="background: radial-gradient(120% 80% at 90% 0%, ${hexToRgba(d.palette.accent, 0.18)} 0%, transparent 60%), linear-gradient(180deg, ${heroBgColor} 0%, ${heroBgColor} 100%);"></div>
    <div class="absolute inset-0" style="background: radial-gradient(60% 50% at 50% 100%, ${hexToRgba(d.palette.primary, 0.1)} 0%, transparent 70%);"></div>
  </div>
  <div class="relative mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-12 lg:gap-16 lg:py-28">
    <div class="lg:col-span-7">
      ${badgeHtml}
      ${
        h.kicker
          ? `<p class="reveal mb-5 text-xs font-bold uppercase tracking-[0.2em] accent-text">${escape(h.kicker)}</p>`
          : ""
      }
      <h1 class="reveal display h1-display">${headlineHtml}</h1>
      <p class="reveal lead mt-5 max-w-xl" style="color: rgba(245,245,245,0.85);">${escape(h.sub)}</p>
      ${socialProofLine}
      ${
        !h.form && trustCluster
          ? `<div class="reveal">${trustCluster}</div>`
          : ""
      }
      ${!h.form && formHtml ? `<div class="reveal mt-8">${formHtml}</div>` : ""}
      ${ratingsHtml}
      ${leadBannerHtml}
    </div>
    ${
      h.form
        ? `<div class="reveal lg:col-span-5">${formHtml}${trustCluster}${ratingsHtml}${leadBannerHtml}</div>`
        : ""
    }
  </div>
</section>`;
}

/** Replace each accent word in the headline with a colored span. */
function highlightAccent(
  headline: string,
  accentWords: string[],
  accentColor: string
): string {
  if (accentWords.length === 0) return escape(headline);
  let out = escape(headline);
  for (const w of accentWords) {
    if (!w) continue;
    const safe = escape(w);
    const re = new RegExp(safe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    out = out.replace(re, `<span style="color:${accentColor}">${safe}</span>`);
  }
  return out;
}

function optimizeFormFields(
  fields: string[],
  strategy: DesignDirectives["cro"]["form_optimization"]
): string[] {
  if (strategy === "single_field") return ["email"];
  if (strategy === "two_step") return ["email"]; // initial step, full reveals after submit
  if (strategy === "progressive") return fields.slice(0, 3);
  return fields;
}

function fieldHtml(f: string, _d: DesignDirectives): string {
  void _d;
  const map: Record<string, { label: string; type: string; ph: string }> = {
    first_name: { label: "Prénom", type: "text", ph: "Marie" },
    last_name: { label: "Nom", type: "text", ph: "Dupont" },
    email: { label: "Email", type: "email", ph: "marie@exemple.fr" },
    phone: { label: "Téléphone", type: "tel", ph: "06 12 34 56 78" },
    company: { label: "Société", type: "text", ph: "Mon entreprise" },
    amount: { label: "Capital à investir", type: "text", ph: "100 000 €" },
    city: { label: "Ville", type: "text", ph: "Paris" },
    consent: { label: "J'accepte d'être contacté(e)", type: "checkbox", ph: "" },
  };
  const cfg = map[f];
  if (!cfg) return "";
  if (cfg.type === "checkbox") {
    return `<label class="flex items-start gap-2 text-xs text-slate-600">
      <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
      <span>${escape(cfg.label)}</span>
    </label>`;
  }
  return `<label class="block">
    <span class="mb-1 block text-xs font-medium text-slate-700">${escape(cfg.label)}</span>
    <input type="${cfg.type}" placeholder="${escape(cfg.ph)}" class="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2" style="border-color:rgb(203,213,225)" onfocus="this.style.borderColor='var(--color-primary)';this.style.boxShadow='0 0 0 3px ${hexToRgba("#0a0a0a", 0.05)}';" onblur="this.style.borderColor='rgb(203,213,225)';this.style.boxShadow='none';" />
  </label>`;
}

function renderTrustBand(
  b: NonNullable<TrustFunnelContent["trust_band"]>,
  d: DesignDirectives
): string {
  return `
<section class="border-y" style="background: var(--color-surface); border-color: var(--color-border);">
  <div class="mx-auto max-w-6xl px-6 py-10">
    ${
      b.intro
        ? `<p class="mb-6 text-center text-xs uppercase tracking-wider" style="color:var(--color-muted)">${escape(b.intro)}</p>`
        : ""
    }
    <div class="grid grid-cols-2 items-center gap-6 sm:grid-cols-3 md:grid-cols-${Math.min(b.items.length, 6)}">
      ${b.items
        .map((item) => {
          if (item.type === "stat") {
            const num = parseStatNumber(item.value ?? "");
            const counterAttrs =
              d.cro.counter_animation && num !== null
                ? ` data-counter-to="${num.value}" data-counter-prefix="${num.prefix}" data-counter-suffix="${num.suffix}"`
                : "";
            return `<div class="text-center reveal">
              <div class="display text-3xl font-black" style="color:var(--color-primary)"${counterAttrs}>${escape(item.value ?? "")}</div>
              <div class="mt-1 text-[11px] uppercase tracking-wider" style="color:var(--color-muted)">${escape(item.label)}</div>
            </div>`;
          }
          if (item.type === "award") {
            return `<div class="reveal text-center text-xs font-semibold">🏆 ${escape(item.label)}</div>`;
          }
          return `<div class="reveal text-center text-sm font-bold uppercase tracking-wider" style="color:var(--color-muted)">${escape(item.label)}</div>`;
        })
        .join("")}
    </div>
  </div>
</section>`;
}

function parseStatNumber(
  s: string
): { value: number; prefix: string; suffix: string } | null {
  const m = s.match(/^(\D*)(\d[\d\s.,]*)(\D*)$/);
  if (!m) return null;
  const num = parseFloat(m[2].replace(/\s/g, "").replace(",", "."));
  if (isNaN(num)) return null;
  return { value: num, prefix: m[1].trim(), suffix: m[3].trim() };
}

function renderProblem(
  p: NonNullable<TrustFunnelContent["problem"]>,
  d: DesignDirectives
): string {
  void d;
  return `
<section class="py-${d.density === "airy" ? "28" : d.density === "dense" ? "16" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="reveal display h2-display max-w-3xl">${escape(p.headline)}</h2>
    ${
      p.intro
        ? `<p class="reveal lead mt-4 max-w-3xl" style="color:var(--color-muted)">${escape(p.intro)}</p>`
        : ""
    }
    <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-${Math.min(p.pain_points.length, 4)}">
      ${p.pain_points
        .map(
          (pp) => `
        <div class="reveal hover-lift rounded-2xl border p-6" style="background:var(--color-surface); border-color:var(--color-border);">
          <div class="text-3xl">${escape(pp.icon)}</div>
          <div class="mt-4 display text-base font-bold">${escape(pp.label)}</div>
          <p class="mt-2 text-sm" style="color:var(--color-muted)">${escape(pp.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderHowItWorks(
  h: TrustFunnelContent["how_it_works"],
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-surface);">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="reveal display h2-display">${escape(h.headline)}</h2>
    ${
      h.intro
        ? `<p class="reveal lead mt-4 max-w-3xl" style="color:var(--color-muted)">${escape(h.intro)}</p>`
        : ""
    }
    <ol class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(h.steps.length, 4)}">
      ${h.steps
        .map(
          (s) => `
        <li class="reveal hover-lift rounded-2xl p-7" style="background:var(--color-bg); border:1px solid var(--color-border);">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black" style="background:var(--color-primary); color:var(--color-primary-text);">${escape(s.number)}</div>
          <div class="mt-5 display text-lg font-bold">${escape(s.title)}</div>
          <p class="mt-2 text-sm" style="color:var(--color-muted)">${escape(s.body)}</p>
        </li>`
        )
        .join("")}
    </ol>
  </div>
</section>`;
}

function renderFeatures(
  f: NonNullable<TrustFunnelContent["features"]>,
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="reveal display h2-display">${escape(f.headline)}</h2>
    <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      ${f.items
        .map(
          (it) => `
        <div class="reveal hover-lift rounded-2xl border p-6" style="background:var(--color-surface); border-color:var(--color-border);">
          <div class="text-2xl">${escape(it.icon)}</div>
          <div class="mt-3 display text-lg font-bold">${escape(it.title)}</div>
          <p class="mt-2 text-sm" style="color:var(--color-muted)">${escape(it.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderSocialProof(
  s: LandingPageContent["social_proof"],
  d: DesignDirectives
): string {
  const stats = s.stats?.length
    ? `<div class="mb-14 grid gap-8 sm:grid-cols-${Math.min(s.stats.length, 4)}">
        ${s.stats
          .map((st) => {
            const num = parseStatNumber(st.value);
            const counterAttrs =
              d.cro.counter_animation && num !== null
                ? ` data-counter-to="${num.value}" data-counter-prefix="${num.prefix}" data-counter-suffix="${num.suffix}"`
                : "";
            return `<div class="reveal text-center">
              <div class="display text-5xl font-black" style="color:var(--color-primary)"${counterAttrs}>${escape(st.value)}</div>
              <div class="mt-2 text-xs uppercase tracking-wider" style="color:var(--color-muted)">${escape(st.label)}</div>
            </div>`;
          })
          .join("")}
      </div>`
    : "";

  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-surface);">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="reveal display h2-display">${escape(s.headline)}</h2>
    <div class="mt-12">
      ${stats}
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        ${s.testimonials
          .map(
            (t) => `
          <figure class="reveal hover-lift rounded-2xl border p-6" style="background:var(--color-bg); border-color:var(--color-border);">
            ${
              t.rating
                ? `<div class="mb-3 text-amber-400 text-lg">${"★".repeat(Math.round(t.rating))}<span class="text-amber-200">${"★".repeat(5 - Math.round(t.rating))}</span></div>`
                : ""
            }
            <blockquote class="text-sm leading-relaxed">« ${escape(t.quote)} »</blockquote>
            <figcaption class="mt-5 text-xs">
              <div class="font-bold">${escape(t.name)}</div>
              ${t.role ? `<div style="color:var(--color-muted)">${escape(t.role)}</div>` : ""}
            </figcaption>
          </figure>`
          )
          .join("")}
      </div>
    </div>
  </div>
</section>`;
}

function renderComparator(
  c: NonNullable<TrustFunnelContent["comparator"]>,
  d: DesignDirectives
): string {
  void d;
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="reveal display h2-display">${escape(c.headline)}</h2>
    ${
      c.intro
        ? `<p class="reveal lead mt-4 max-w-3xl" style="color:var(--color-muted)">${escape(c.intro)}</p>`
        : ""
    }
    <div class="reveal mt-10 overflow-x-auto rounded-3xl border" style="border-color:var(--color-border); background:var(--color-surface);">
      <table class="w-full text-sm">
        <thead style="background:var(--color-bg);">
          <tr>
            <th class="px-5 py-5 text-left text-xs font-semibold uppercase tracking-wider" style="color:var(--color-muted)">Critère</th>
            ${c.columns
              .map(
                (col, i) => `
              <th class="px-5 py-5 text-center text-xs font-bold uppercase tracking-wider ${i === 0 ? "" : ""}" style="${i === 0 ? "background:var(--color-primary); color:var(--color-primary-text);" : "color:var(--color-muted);"}">${escape(col)}</th>`
              )
              .join("")}
          </tr>
        </thead>
        <tbody class="divide-y" style="color:var(--color-text);">
          ${c.rows
            .map(
              (row) => `
            <tr style="border-color:var(--color-border);">
              <td class="px-5 py-4 font-medium">${escape(row.feature)}</td>
              ${row.values
                .map(
                  (v, i) => `
                <td class="px-5 py-4 text-center" style="${i === 0 ? `background:${hexToRgba(d.palette.primary, 0.06)};` : ""}">${cellValue(v, d)}</td>`
                )
                .join("")}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>`;
}

function cellValue(v: string | boolean, d: DesignDirectives): string {
  if (typeof v === "boolean") {
    return v
      ? `<span style="color:var(--color-primary)" class="text-xl font-bold">✓</span>`
      : `<span style="opacity:0.3" class="text-xl">×</span>`;
  }
  void d;
  return `<span class="font-semibold">${escape(v)}</span>`;
}

function renderSecurity(
  s: NonNullable<TrustFunnelContent["security"]>,
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:#0A0A0A; color:#F5F5F5;">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="reveal display h2-display">${escape(s.headline)}</h2>
    ${
      s.intro
        ? `<p class="reveal lead mt-4 max-w-3xl text-white/70">${escape(s.intro)}</p>`
        : ""
    }
    <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-${Math.min(s.items.length, 4)}">
      ${s.items
        .map(
          (it) => `
        <div class="reveal rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div class="text-2xl">${escape(it.icon)}</div>
          <div class="mt-4 display text-base font-bold">${escape(it.label)}</div>
          <p class="mt-2 text-sm text-white/70">${escape(it.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderFAQ(f: LandingPageContent["faq"], d: DesignDirectives): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-3xl px-6">
    <h2 class="reveal display h2-display">${escape(f.headline)}</h2>
    <div class="reveal mt-10 divide-y rounded-3xl border" style="border-color:var(--color-border);">
      ${f.items
        .map(
          (it) => `
        <details class="group p-6">
          <summary class="flex cursor-pointer items-center justify-between text-base font-semibold">
            <span>${escape(it.q)}</span>
            <span class="transition group-open:rotate-180" style="color:var(--color-muted)">⌄</span>
          </summary>
          <p class="mt-4 text-sm leading-relaxed" style="color:var(--color-muted)">${escape(it.a)}</p>
        </details>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderCtaFinal(
  c: LandingPageContent["cta_final"],
  d: DesignDirectives
): string {
  return `
<section id="cta-final" class="py-${d.density === "airy" ? "28" : "20"}" style="background: linear-gradient(135deg, ${d.palette.primary} 0%, ${shadeHex(d.palette.primary, -0.18)} 100%); color: ${d.palette.primary_text};">
  <div class="mx-auto max-w-3xl px-6 text-center">
    <h2 class="reveal display h1-display">${escape(c.headline)}</h2>
    <p class="reveal lead mx-auto mt-5 max-w-2xl" style="color:${hexToRgba(d.palette.primary_text, 0.9)}">${escape(c.sub)}</p>
    <a href="#hero-cta" onclick="document.getElementById('hero-cta')?.scrollIntoView({behavior:'smooth',block:'center'});event.preventDefault();" class="mt-10 inline-block rounded-2xl bg-white px-10 py-5 text-base font-bold shadow-2xl transition hover:bg-slate-50" style="color:${d.palette.primary}">
      ${escape(c.cta.label)}
    </a>
    ${
      c.reassurance || c.cta.reassurance
        ? `<p class="mt-4 text-xs" style="color:${hexToRgba(d.palette.primary_text, 0.7)}">${escape(c.reassurance ?? c.cta.reassurance ?? "")}</p>`
        : ""
    }
  </div>
</section>`;
}

function renderFooter(d: DesignDirectives): string {
  void d;
  return `
<footer class="py-10 text-center text-[11px]" style="background:#0A0A0A; color:rgba(255,255,255,0.4);">
  <div class="mx-auto max-w-6xl px-6">
    <p>© 2026 — Communication à caractère promotionnel. Ceci ne constitue pas un conseil en investissement personnalisé. Investir comporte des risques de perte en capital.</p>
  </div>
</footer>`;
}

// ── story-pivot ────────────────────────────────────────────────────────────

function renderStory(
  s: StoryPivotContent["story"],
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-3xl px-6">
    <h2 class="reveal display h2-display">${escape(s.headline)}</h2>
    <div class="mt-10 space-y-6 leading-relaxed lead">
      ${s.paragraphs.map((p) => `<p class="reveal">${escape(p)}</p>`).join("")}
    </div>
    ${
      s.pull_quote
        ? `<blockquote class="reveal mt-12 border-l-4 pl-6 display text-3xl italic" style="border-color:var(--color-accent);">${escape(s.pull_quote)}</blockquote>`
        : ""
    }
  </div>
</section>`;
}

function renderChartPivot(
  c: StoryPivotContent["chart_pivot"],
  d: DesignDirectives
): string {
  const maxVal = Math.max(...c.data.map((dp) => dp.value), 1);
  const bars = c.data
    .map(
      (dp) => `
    <div class="flex items-center gap-4">
      <div class="w-32 shrink-0 text-right text-sm font-medium">${escape(dp.label)}</div>
      <div class="relative h-8 flex-1 overflow-hidden rounded-lg" style="background:var(--color-surface);">
        <div class="absolute inset-y-0 left-0 transition-all duration-1000" style="width: ${Math.round((dp.value / maxVal) * 100)}%; background: linear-gradient(90deg, ${d.palette.primary} 0%, ${shadeHex(d.palette.primary, 0.15)} 100%);"></div>
      </div>
      <div class="w-20 text-right text-base font-bold tabular-nums">${dp.value.toLocaleString("fr-FR")}</div>
    </div>`
    )
    .join("");

  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-surface);">
  <div class="mx-auto max-w-4xl px-6">
    <h2 class="reveal display h2-display">${escape(c.headline)}</h2>
    <p class="reveal lead mt-4" style="color:var(--color-muted)">${escape(c.caption)}</p>
    <div class="reveal mt-12 rounded-3xl p-10" style="background:var(--color-bg); border:1px solid var(--color-border);">
      <div class="space-y-5">${bars}</div>
      ${
        c.source
          ? `<p class="mt-8 text-[10px] uppercase tracking-wider" style="color:var(--color-muted)">Source : ${escape(c.source)}</p>`
          : ""
      }
    </div>
  </div>
</section>`;
}

function renderSolutionReveal(
  s: StoryPivotContent["solution_reveal"],
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-4xl px-6">
    <h2 class="reveal display h2-display">${escape(s.headline)}</h2>
    <p class="reveal lead mt-5" style="color:var(--color-muted)">${escape(s.sub)}</p>
    <ul class="mt-10 space-y-4">
      ${s.bullets
        .map(
          (b) => `
        <li class="reveal flex items-start gap-4 rounded-2xl p-5" style="background:${hexToRgba(d.palette.primary, 0.06)};">
          <span class="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold" style="background:var(--color-primary); color:var(--color-primary-text);">✓</span>
          <span class="text-base font-medium">${escape(b)}</span>
        </li>`
        )
        .join("")}
    </ul>
  </div>
</section>`;
}

// ── quiz-lead ──────────────────────────────────────────────────────────────

function renderWhyMatters(
  w: QuizLeadContent["why_matters"],
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="reveal display h2-display">${escape(w.headline)}</h2>
    <p class="reveal lead mt-4 max-w-3xl" style="color:var(--color-muted)">${escape(w.intro)}</p>
    <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-${Math.min(w.bullets.length, 4)}">
      ${w.bullets
        .map(
          (b) => `
        <div class="reveal hover-lift rounded-2xl border p-6" style="background:var(--color-surface); border-color:var(--color-border);">
          <div class="display text-base font-bold">${escape(b.title)}</div>
          <p class="mt-3 text-sm" style="color:var(--color-muted)">${escape(b.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderQuizTeaser(
  q: QuizLeadContent["quiz_teaser"],
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:${hexToRgba(d.palette.primary, 0.06)};">
  <div class="mx-auto max-w-3xl px-6 text-center">
    <h2 class="reveal display h2-display">${escape(q.headline)}</h2>
    <p class="reveal lead mt-5">${escape(q.sub)}</p>
    <ul class="reveal mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
      ${q.bullets
        .map(
          (b) =>
            `<li class="rounded-full border px-4 py-1.5 font-medium" style="border-color:${hexToRgba(d.palette.primary, 0.4)}; background:var(--color-bg); color:var(--color-primary);">✓ ${escape(b)}</li>`
        )
        .join("")}
    </ul>
    <a href="#hero-cta" class="reveal btn-primary mt-10 inline-block !text-base">${escape(q.cta.label)}</a>
    ${
      q.cta.reassurance
        ? `<p class="mt-3 text-xs" style="color:var(--color-muted)">${escape(q.cta.reassurance)}</p>`
        : ""
    }
  </div>
</section>`;
}

function renderQuizPreview(
  q: QuizLeadContent["quiz_preview"],
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-3xl px-6">
    <h2 class="reveal display h2-display">${escape(q.headline)}</h2>
    ${
      q.intro
        ? `<p class="reveal lead mt-4" style="color:var(--color-muted)">${escape(q.intro)}</p>`
        : ""
    }
    <div class="mt-10 space-y-5">
      ${q.sample_questions
        .map(
          (sq, i) => `
        <div class="reveal rounded-2xl border p-7" style="background:var(--color-surface); border-color:var(--color-border);">
          <div class="text-xs font-semibold uppercase tracking-wider" style="color:var(--color-primary);">Question ${i + 1}</div>
          <div class="mt-2 display text-lg font-bold">${escape(sq.question)}</div>
          <div class="mt-5 grid gap-2">
            ${sq.options
              .map(
                (o) => `
              <button class="rounded-xl border px-5 py-3 text-left text-sm font-medium transition hover-lift" style="border-color:var(--color-border); background:var(--color-bg);">
                ${escape(o)}
              </button>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

// ──────────────────────────────────────────────────────────────────────────
// PREMIUM RENDERERS — Foxstone-style sections (with directives applied)
// ──────────────────────────────────────────────────────────────────────────

function renderStatsBandPremium(
  s: NonNullable<TrustFunnelContent["stats_band"]>,
  d: DesignDirectives
): string {
  return `
<section class="py-16" style="background:#0A0A0A; color:#F5F5F5;">
  <div class="mx-auto max-w-6xl px-6">
    <div class="grid grid-cols-2 gap-8 sm:grid-cols-${Math.min(s.items.length, 4)}">
      ${s.items
        .map((it) => {
          const num = parseStatNumber(it.value);
          const counterAttrs =
            d.cro.counter_animation && num !== null
              ? ` data-counter-to="${num.value}" data-counter-prefix="${num.prefix}" data-counter-suffix="${num.suffix}"`
              : "";
          return `
          <div class="reveal text-center">
            <div class="display text-4xl font-black sm:text-5xl"${counterAttrs}>${escape(it.value)}</div>
            <div class="mt-2 text-xs uppercase tracking-wider text-white/60">${escape(it.label)}</div>
          </div>`;
        })
        .join("")}
    </div>
  </div>
</section>`;
}

function renderPressLogosPremium(
  p: NonNullable<TrustFunnelContent["press_logos"]>,
  d: DesignDirectives
): string {
  void d;
  return `
<section class="border-y py-12" style="background:var(--color-bg); border-color:var(--color-border);">
  <div class="mx-auto max-w-6xl px-6">
    <p class="text-center text-xs uppercase tracking-[0.2em]" style="color:var(--color-muted)">${escape(p.headline)}</p>
    <div class="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
      ${p.logos
        .map(
          (l) =>
            `<span class="text-base font-black uppercase tracking-tight" style="color:var(--color-muted)">${escape(l)}</span>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderSolutionsPremium(
  s: NonNullable<TrustFunnelContent["solutions"]>,
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-6xl px-6">
    ${
      s.kicker
        ? `<p class="reveal text-xs font-bold uppercase tracking-[0.2em] accent-text">${escape(s.kicker)}</p>`
        : ""
    }
    <h2 class="reveal display h2-display mt-3">${escape(s.headline)}</h2>
    <div class="mt-12 grid gap-6 lg:grid-cols-${Math.min(s.items.length, 3)}">
      ${s.items
        .map(
          (it) => `
        <div class="reveal hover-lift rounded-3xl border p-7" style="background:var(--color-surface); border-color:var(--color-border);">
          <h3 class="display text-2xl font-bold">${escape(it.name)}</h3>
          <p class="mt-2 text-sm" style="color:var(--color-muted)">${escape(it.tagline)}</p>
          <ul class="mt-5 space-y-1.5 text-sm">
            ${it.highlights
              .map(
                (h) =>
                  `<li class="flex items-start gap-2"><span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style="background:var(--color-primary);"></span><span>${escape(h)}</span></li>`
              )
              .join("")}
          </ul>
          <details class="mt-6">
            <summary class="cursor-pointer text-sm font-semibold accent-text hover:opacity-80">
              Comment ça marche →
            </summary>
            <ol class="mt-5 space-y-4">
              ${it.steps
                .map(
                  (st) => `
                <li class="flex gap-4 text-sm">
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold" style="background:var(--color-primary); color:var(--color-primary-text);">${escape(st.number)}</span>
                  <div>
                    <div class="font-semibold">${escape(st.title)}</div>
                    <p class="mt-1" style="color:var(--color-muted)">${escape(st.body)}</p>
                  </div>
                </li>`
                )
                .join("")}
            </ol>
          </details>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderWhyUsPremium(
  w: NonNullable<TrustFunnelContent["why_us"]>,
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:#0A0A0A; color:#F5F5F5;">
  <div class="mx-auto max-w-6xl px-6">
    ${
      w.kicker
        ? `<p class="reveal text-xs font-bold uppercase tracking-[0.2em]" style="color:${d.palette.accent}">${escape(w.kicker)}</p>`
        : ""
    }
    <h2 class="reveal display h2-display mt-3">${escape(w.headline)}</h2>
    ${
      w.intro
        ? `<p class="reveal mt-4 max-w-3xl text-base text-white/70">${escape(w.intro)}</p>`
        : ""
    }
    <div class="mt-12 grid gap-8 sm:grid-cols-2">
      ${w.reasons
        .map(
          (r) => `
        <div class="reveal border-l-2 pl-5" style="border-color:${d.palette.accent};">
          <h3 class="display text-xl font-bold">${escape(r.title)}</h3>
          <p class="mt-2 text-sm leading-relaxed text-white/70">${escape(r.body)}</p>
          ${
            r.legal_disclaimer
              ? `<p class="mt-2 text-[10px] italic text-white/40">${escape(r.legal_disclaimer)}</p>`
              : ""
          }
        </div>`
        )
        .join("")}
    </div>
    ${
      w.cta
        ? `<a href="#hero-cta" class="btn-primary reveal mt-12 inline-block !text-base">${escape(w.cta.label)} →</a>`
        : ""
    }
  </div>
</section>`;
}

function renderOpportunitiesPremium(
  o: NonNullable<TrustFunnelContent["opportunities"]>,
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-surface);">
  <div class="mx-auto max-w-6xl px-6">
    ${
      o.kicker
        ? `<p class="reveal text-xs font-bold uppercase tracking-[0.2em] accent-text">${escape(o.kicker)}</p>`
        : ""
    }
    <h2 class="reveal display h2-display mt-3">${escape(o.headline)}</h2>
    <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(o.items.length, 3)}">
      ${o.items
        .map(
          (it) => `
        <div class="reveal hover-lift overflow-hidden rounded-2xl border" style="background:var(--color-bg); border-color:var(--color-border);">
          <div class="aspect-video w-full flex items-center justify-center text-xs italic" style="background: linear-gradient(135deg, ${hexToRgba(d.palette.primary, 0.2)} 0%, ${hexToRgba(d.palette.accent, 0.1)} 100%); color: var(--color-muted);">${escape(it.location)}</div>
          <div class="p-5">
            <div class="flex items-center justify-between gap-2">
              <span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style="background:${hexToRgba(d.palette.primary, 0.15)}; color:var(--color-primary);">${escape(it.type)}</span>
              <span class="text-[10px] font-medium" style="color:var(--color-muted)">${escape(it.status)}</span>
            </div>
            <h3 class="mt-3 display font-bold">${escape(it.location)}</h3>
            <p class="text-xs" style="color:var(--color-muted)">${escape(it.category)}</p>
            <dl class="mt-4 grid grid-cols-2 gap-3 text-xs">
              ${it.details
                .map(
                  (det) => `
                <div>
                  <dt style="color:var(--color-muted)">${escape(det.label)}</dt>
                  <dd class="mt-0.5 font-bold">${escape(det.value)}</dd>
                </div>`
                )
                .join("")}
            </dl>
          </div>
        </div>`
        )
        .join("")}
    </div>
    <div class="reveal mt-10 text-center">
      <a href="#hero-cta" class="btn-primary !text-base">${escape(o.cta_label)}</a>
    </div>
  </div>
</section>`;
}

function renderBrandStoryPremium(
  b: NonNullable<TrustFunnelContent["brand_story"]>,
  d: DesignDirectives
): string {
  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-bg);">
  <div class="mx-auto max-w-3xl px-6">
    ${
      b.kicker
        ? `<p class="reveal text-xs font-bold uppercase tracking-[0.2em] accent-text">${escape(b.kicker)}</p>`
        : ""
    }
    <h2 class="reveal display h2-display mt-3">${escape(b.headline)}</h2>
    <p class="reveal lead mt-5">${escape(b.intro)}</p>
    <div class="mt-10 space-y-5">
      ${b.quotes
        .map(
          (q) => `
        <blockquote class="reveal rounded-2xl border-l-4 px-5 py-4 display text-lg italic" style="background:var(--color-surface); border-color:${d.palette.accent};">« ${escape(q.text)} »</blockquote>`
        )
        .join("")}
    </div>
    <blockquote class="reveal mt-10 border-t pt-8" style="border-color:var(--color-border);">
      <p class="display text-2xl italic leading-relaxed">« ${escape(b.closing_quote.text)} »</p>
      <footer class="mt-4 text-sm font-bold" style="color:var(--color-muted)">— ${escape(b.closing_quote.author)}</footer>
    </blockquote>
  </div>
</section>`;
}

function renderSimulatorPremium(
  s: NonNullable<TrustFunnelContent["simulator"]>,
  d: DesignDirectives
): string {
  const inputs = s.inputs
    .map(
      (inp, i) => `
      <div class="reveal rounded-2xl border p-5" style="background:var(--color-bg); border-color:var(--color-border);">
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wider" style="color:var(--color-muted)">${escape(inp.label)}</span>
          <output id="sim-val-${i}" class="mt-2 block display text-3xl font-bold">${formatSimVal(inp.default_value, inp.unit)}</output>
          <input id="sim-input-${i}" type="range" min="${inp.min}" max="${inp.max}" value="${inp.default_value}" data-kind="${inp.kind}" data-unit="${escape(inp.unit)}" class="mt-3 w-full" style="accent-color:${d.palette.primary};" />
          <div class="mt-1.5 flex justify-between text-[10px]" style="color:var(--color-muted)">
            <span>${formatSimVal(inp.min, inp.unit)}</span>
            <span>${formatSimVal(inp.max, inp.unit)}</span>
          </div>
        </label>
      </div>`
    )
    .join("");

  const outputs = s.outputs
    .map(
      (o, i) => `
      <div class="reveal rounded-2xl p-5" style="background:${hexToRgba(d.palette.primary, 0.08)};">
        <div class="text-xs font-semibold uppercase tracking-wider" style="color:var(--color-primary);">${escape(o.label)}</div>
        <div id="sim-out-${i}" data-kind="${o.kind}" class="mt-1 display text-2xl font-bold">—</div>
      </div>`
    )
    .join("");

  return `
<section class="py-${d.density === "airy" ? "28" : "20"}" style="background:var(--color-surface);">
  <div class="mx-auto max-w-5xl px-6">
    ${
      s.kicker
        ? `<p class="reveal text-xs font-bold uppercase tracking-[0.2em] accent-text">${escape(s.kicker)}</p>`
        : ""
    }
    <h2 class="reveal display h2-display mt-3">${escape(s.headline)}</h2>
    <div class="mt-10 grid gap-5 md:grid-cols-3">${inputs}</div>
    <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-${Math.min(s.outputs.length, 4)}">${outputs}</div>
    <p class="mt-6 text-center text-[10px] italic" style="color:var(--color-muted)">${escape(s.disclaimer)}</p>
  </div>
</section>
<script>
  (function() {
    function findByKind(kind) { return Array.from(document.querySelectorAll('[id^="sim-input-"]')).find(e => e.dataset.kind === kind); }
    function compute() {
      var amountEl = findByKind('amount'), rateEl = findByKind('rate'), durEl = findByKind('duration');
      var amount = amountEl ? +amountEl.value : 0, rate = rateEl ? +rateEl.value/100 : 0, dur = durEl ? +durEl.value : 0;
      var annual = amount*rate, quarterly = annual/4, total = annual*dur, totalValue = amount + total;
      Array.from(document.querySelectorAll('[id^="sim-input-"]')).forEach(function(el, idx) {
        document.getElementById('sim-val-'+idx).textContent = fmt(+el.value, el.dataset.unit);
      });
      Array.from(document.querySelectorAll('[id^="sim-out-"]')).forEach(function(el) {
        var k = el.dataset.kind, v = 0;
        if (k==='quarterly_revenue') v = quarterly;
        else if (k==='annual_revenue') v = annual;
        else if (k==='total_revenue') v = total;
        else if (k==='total_value') v = totalValue;
        el.textContent = fmt(v, amountEl ? amountEl.dataset.unit : '€');
      });
    }
    function fmt(v, u) {
      if (u === '%') return v.toFixed(1).replace('.', ',') + ' %';
      if (u === 'ans' || u === 'an') return Math.round(v) + ' ' + u;
      return (u ? u+' ' : '') + Math.round(v).toLocaleString('fr-FR');
    }
    document.querySelectorAll('[id^="sim-input-"]').forEach(function(el) { el.addEventListener('input', compute); });
    compute();
  })();
</script>`;
}

function formatSimVal(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(1).replace(".", ",")} %`;
  if (unit === "ans" || unit === "an") return `${Math.round(v)} ${unit}`;
  return `${unit ? unit + " " : ""}${Math.round(v).toLocaleString("fr-FR")}`;
}

function renderLeadMagnetPremium(
  m: NonNullable<TrustFunnelContent["lead_magnet_section"]>,
  d: DesignDirectives
): string {
  return `
<section id="lead-magnet" class="py-${d.density === "airy" ? "28" : "20"}" style="background:${hexToRgba(d.palette.primary, 0.06)};">
  <div class="mx-auto grid max-w-5xl gap-10 px-6 lg:grid-cols-12 lg:items-center">
    <div class="reveal lg:col-span-5">
      <div class="mx-auto aspect-[3/4] max-w-xs rounded-2xl shadow-2xl ring-1 flex items-center justify-center text-sm font-bold" style="background: linear-gradient(135deg, ${d.palette.primary} 0%, ${shadeHex(d.palette.primary, -0.2)} 100%); color:${d.palette.primary_text}; ring-color:${hexToRgba(d.palette.primary, 0.4)};">
        📖 Cover ebook
      </div>
    </div>
    <div class="lg:col-span-7">
      <p class="reveal text-xs font-bold uppercase tracking-[0.2em] accent-text">${escape(m.kicker)}</p>
      <h2 class="reveal display h2-display mt-3">${escape(m.headline)}</h2>
      <p class="reveal lead mt-4" style="color:var(--color-muted)">${escape(m.sub)}</p>
      <ul class="mt-6 space-y-2">
        ${m.bullets
          .map(
            (b) =>
              `<li class="reveal flex items-start gap-2 text-sm"><span class="mt-1 accent-text">✓</span><span>${escape(b)}</span></li>`
          )
          .join("")}
      </ul>
      <a href="#hero-cta" class="btn-primary reveal mt-8 inline-block !text-base">${escape(m.cta.label)} →</a>
      ${
        m.cta.reassurance
          ? `<p class="reveal mt-3 text-xs" style="color:var(--color-muted)">${escape(m.cta.reassurance)}</p>`
          : ""
      }
    </div>
  </div>
</section>`;
}

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Slightly lighten or darken a hex color (-1 to +1). */
function shadeHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  let r = parseInt(full.slice(0, 2), 16);
  let g = parseInt(full.slice(2, 4), 16);
  let b = parseInt(full.slice(4, 6), 16);
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    const k = 1 + amount;
    r = Math.round(r * k);
    g = Math.round(g * k);
    b = Math.round(b * k);
  }
  return (
    "#" +
    [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
  );
}

function getStickyHeaderTitle(): string {
  return "Crea Process";
}

function getStickyHeaderCta(_d: DesignDirectives): string {
  void _d;
  return "Démarrer";
}

function getStickyMobileCta(_d: DesignDirectives): string {
  void _d;
  return "Démarrer maintenant →";
}
