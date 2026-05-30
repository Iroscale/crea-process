/**
 * Pure HTML renderer for landing page content. Each section becomes a
 * Tailwind block. The output is a complete HTML document including the
 * Tailwind CDN script, ready to be injected as `srcDoc` of an iframe.
 *
 * No client-side JS dependency at runtime — just the rendered HTML, which
 * means we can also reuse this exact output later when publishing to
 * Unbounce (template body) OR when self-hosting on Vercel.
 */
import type {
  LandingPageContent,
  TrustFunnelContent,
  StoryPivotContent,
  QuizLeadContent,
} from "@/lib/landing-page-schema";

type Variant = "A" | "B";

/**
 * Render a landing page as a complete HTML document.
 * - `mode = "preview"` (default) : adds a small VARIANTE badge for QA inside
 *   the in-app iframe.
 * - `mode = "production"` : strips dev artefacts. Use this when exporting
 *   the file for a developer or for Unbounce import.
 */
export function renderLandingPageHtml(
  content: LandingPageContent,
  variant: Variant,
  mode: "preview" | "production" = "preview"
): string {
  let body = "";
  if (content.template_id === "trust-funnel") {
    body = renderTrustFunnel(content);
  } else if (content.template_id === "story-pivot") {
    body = renderStoryPivot(content);
  } else {
    body = renderQuizLead(content);
  }
  return wrap(body, variant, mode);
}

// ──────────────────────────────────────────────────────────────────────────
// HTML SHELL
// ──────────────────────────────────────────────────────────────────────────

function wrap(
  body: string,
  variant: Variant,
  mode: "preview" | "production"
): string {
  const isPreview = mode === "preview";
  const title = isPreview
    ? `LP preview · Variante ${variant}`
    : `Landing page · Variante ${variant}`;
  // The floating dev badge is preview-only — strip it for the production export.
  const devBadge = isPreview
    ? `<div class="absolute right-3 top-3 z-50 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">VARIANTE ${variant}</div>`
    : "";
  // Inject A/B identifier as a meta + data attribute so Unbounce / GA can
  // wire variant tracking when it's published.
  const meta = !isPreview
    ? `<meta name="x-variant" content="${variant}" />`
    : "";
  return `<!DOCTYPE html>
<html lang="fr" data-variant="${variant}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${meta}
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Source+Serif+4:wght@600;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .font-serif { font-family: 'Source Serif 4', 'Tiempos', Georgia, serif; }
  .ring-accent { box-shadow: 0 0 0 2px rgba(34,197,94,0.35); }
</style>
</head>
<body class="bg-white text-slate-900">
${devBadge}
${body}
</body>
</html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE 1 — TRUST FUNNEL (Foxstone-style)
// ──────────────────────────────────────────────────────────────────────────

function renderTrustFunnel(c: TrustFunnelContent): string {
  // Foxstone-style ordered sections. Optional sections render only if present.
  const parts: string[] = [renderHero(c.hero)];
  if (c.stats_band) parts.push(renderStatsBand(c.stats_band));
  if (c.press_logos) parts.push(renderPressLogos(c.press_logos));
  if (c.solutions) parts.push(renderSolutions(c.solutions));
  if (c.why_us) parts.push(renderWhyUs(c.why_us));
  if (c.opportunities) parts.push(renderOpportunities(c.opportunities));
  parts.push(renderHowItWorks(c.how_it_works));
  parts.push(renderSocialProof(c.social_proof));
  if (c.brand_story) parts.push(renderBrandStory(c.brand_story));
  if (c.simulator) parts.push(renderSimulator(c.simulator));
  if (c.lead_magnet_section)
    parts.push(renderLeadMagnetSection(c.lead_magnet_section));
  // Legacy sections — render only if present and the new structure isn't.
  if (!c.stats_band && c.trust_band) parts.push(renderTrustBand(c.trust_band));
  if (c.problem) parts.push(renderProblem(c.problem));
  if (!c.why_us && c.features) parts.push(renderFeatures(c.features));
  if (c.comparator) parts.push(renderComparator(c.comparator));
  if (c.security) parts.push(renderSecurity(c.security));
  parts.push(renderFAQ(c.faq));
  parts.push(renderCtaFinal(c.cta_final));
  parts.push(renderFooter());
  return parts.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE 2 — STORY PIVOT
// ──────────────────────────────────────────────────────────────────────────

function renderStoryPivot(c: StoryPivotContent): string {
  return [
    renderHero(c.hero),
    renderStory(c.story),
    renderChartPivot(c.chart_pivot),
    renderSolutionReveal(c.solution_reveal),
    renderSocialProof(c.social_proof),
    renderSecurity(c.security),
    renderFAQ(c.faq),
    renderCtaFinal(c.cta_final),
    renderFooter(),
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE 3 — QUIZ LEAD
// ──────────────────────────────────────────────────────────────────────────

function renderQuizLead(c: QuizLeadContent): string {
  return [
    renderHero(c.hero),
    renderWhyMatters(c.why_matters),
    renderQuizTeaser(c.quiz_teaser),
    renderQuizPreview(c.quiz_preview),
    renderSocialProof(c.social_proof),
    renderFAQ(c.faq),
    renderCtaFinal(c.cta_final),
    renderFooter(),
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────────────
// SECTIONS — shared
// ──────────────────────────────────────────────────────────────────────────

function renderHero(h: LandingPageContent["hero"]): string {
  // Foxstone-style hero : light bg with peach gradient, headline noir + accent words orange,
  // form/cta on left, visual on right (mascot-style placeholder).
  const headlineHtml = highlightAccent(h.headline, h.headline_accent_words ?? []);

  let ctaHtml = "";
  if (h.form) {
    const fieldRows = h.form.fields.map((f) => fieldHtml(f)).filter(Boolean).join("");
    ctaHtml = `
      <div class="mt-8 max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-black/5">
        <form class="flex flex-col gap-3">
          ${fieldRows}
          <button type="button" class="mt-2 rounded-2xl bg-orange-500 px-7 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600">
            ${escape(h.form.cta.label)} →
          </button>
        </form>
      </div>`;
  } else if (h.cta) {
    ctaHtml = `
      <a href="#" class="mt-8 inline-block rounded-2xl bg-orange-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600">
        ${escape(h.cta.label)} →
      </a>`;
  }

  const reassurance = h.cta_reassurance
    ? `<p class="mt-3 text-xs text-slate-500">${escape(h.cta_reassurance)}</p>`
    : "";

  const ratings = h.ratings?.length
    ? `<div class="mt-6 flex flex-wrap items-center gap-5">
        ${h.ratings
          .map(
            (r) => `<div class="flex items-center gap-2 text-sm">
            <span class="font-bold ${r.platform.toLowerCase().includes("trust") ? "text-emerald-600" : ""}">${escape(r.platform)}</span>
            <span class="text-amber-400">★★★★★</span>
            <span class="font-semibold">${escape(r.rating)}</span>
          </div>`
          )
          .join("")}
      </div>`
    : "";

  const leadBanner = h.lead_magnet_banner
    ? `<a href="#lead-magnet" class="mt-5 flex items-start gap-3 max-w-md rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-4 hover:bg-orange-50 transition">
        <span class="text-2xl">📖</span>
        <div class="flex-1 text-sm">
          <div class="text-xs font-bold uppercase tracking-wider text-orange-600">${escape(h.lead_magnet_banner.kicker)}</div>
          <div class="mt-0.5 font-medium text-slate-800">${escape(h.lead_magnet_banner.text)}</div>
        </div>
        <span class="text-orange-500">→</span>
      </a>`
    : "";

  const badge = h.badge
    ? `<div class="mb-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-orange-200">${escape(h.badge)}</div>`
    : "";

  const placeholderRight = `<div class="aspect-[3/4] w-full rounded-3xl bg-gradient-to-br from-orange-100 via-orange-50 to-white flex items-center justify-center ring-1 ring-orange-200/40">
    <div class="text-center text-orange-400/60 text-xs italic px-8 max-w-md">
      🎨 Visuel hero :<br>
      ${escape(h.visual_hint).slice(0, 200)}…
    </div>
  </div>`;

  return `
<section class="relative overflow-hidden bg-gradient-to-br from-orange-50/40 via-white to-orange-50/30">
  <div class="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-12 lg:gap-12 lg:py-24">
    <div class="lg:col-span-7">
      ${badge}
      <h1 class="text-4xl font-black leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">${headlineHtml}</h1>
      <p class="mt-5 max-w-xl text-lg leading-relaxed text-slate-700">${escape(h.sub)}</p>
      ${
        h.social_proof_line
          ? `<p class="mt-4 font-bold text-slate-900">${escape(h.social_proof_line)}</p>`
          : ""
      }
      ${ctaHtml}
      ${reassurance}
      ${ratings}
      ${leadBanner}
    </div>
    <div class="relative lg:col-span-5">
      ${placeholderRight}
    </div>
  </div>
</section>`;
}

/** Replace each accent word in `headline` by an <span class="text-orange-500">. */
function highlightAccent(headline: string, accentWords: string[]): string {
  if (accentWords.length === 0) return escape(headline);
  let out = escape(headline);
  for (const w of accentWords) {
    if (!w) continue;
    const safe = escape(w);
    // Replace exactly once per accent word, case-insensitive
    const re = new RegExp(
      safe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    out = out.replace(re, `<span class="text-orange-500">${safe}</span>`);
  }
  return out;
}

function fieldHtml(f: string): string {
  const map: Record<string, { label: string; type: string; ph: string }> = {
    first_name: { label: "Prénom", type: "text", ph: "Marie" },
    last_name: { label: "Nom", type: "text", ph: "Dupont" },
    email: { label: "Email", type: "email", ph: "marie@exemple.fr" },
    phone: { label: "Téléphone", type: "tel", ph: "06 12 34 56 78" },
    company: { label: "Société", type: "text", ph: "Mon entreprise" },
    amount: {
      label: "Capital à investir",
      type: "text",
      ph: "100 000 €",
    },
    city: { label: "Ville", type: "text", ph: "Paris" },
    consent: {
      label: "J'accepte d'être contacté(e)",
      type: "checkbox",
      ph: "",
    },
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
    <input type="${cfg.type}" placeholder="${escape(cfg.ph)}" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
  </label>`;
}

function renderTrustBand(b: NonNullable<TrustFunnelContent["trust_band"]>): string {
  return `
<section class="border-y border-slate-200 bg-slate-50 py-8">
  <div class="mx-auto max-w-6xl px-6">
    ${b.intro ? `<p class="mb-4 text-center text-xs uppercase tracking-wider text-slate-500">${escape(b.intro)}</p>` : ""}
    <div class="grid grid-cols-2 items-center gap-6 sm:grid-cols-3 md:grid-cols-${Math.min(b.items.length, 6)}">
      ${b.items
        .map((item) => {
          if (item.type === "stat") {
            return `<div class="text-center">
              <div class="text-2xl font-black text-slate-900">${escape(item.value ?? "")}</div>
              <div class="text-[11px] uppercase tracking-wider text-slate-500">${escape(item.label)}</div>
            </div>`;
          }
          if (item.type === "award") {
            return `<div class="text-center text-xs font-semibold text-slate-700">
              🏆 ${escape(item.label)}
            </div>`;
          }
          // logo
          return `<div class="text-center text-sm font-bold uppercase tracking-wider text-slate-400">
            ${escape(item.label)}
          </div>`;
        })
        .join("")}
    </div>
  </div>
</section>`;
}

function renderProblem(p: NonNullable<TrustFunnelContent["problem"]>): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(p.headline)}</h2>
    ${p.intro ? `<p class="mt-3 max-w-3xl text-base text-slate-600">${escape(p.intro)}</p>` : ""}
    <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(p.pain_points.length, 4)}">
      ${p.pain_points
        .map(
          (pp) => `
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div class="text-3xl">${escape(pp.icon)}</div>
          <div class="mt-3 text-sm font-bold text-slate-900">${escape(pp.label)}</div>
          <p class="mt-1.5 text-sm text-slate-600">${escape(pp.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderHowItWorks(h: TrustFunnelContent["how_it_works"]): string {
  return `
<section class="bg-slate-50 py-20">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(h.headline)}</h2>
    ${h.intro ? `<p class="mt-3 max-w-3xl text-base text-slate-600">${escape(h.intro)}</p>` : ""}
    <ol class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(h.steps.length, 4)}">
      ${h.steps
        .map(
          (s) => `
        <li class="rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-base font-black text-white">${escape(s.number)}</div>
          <div class="mt-4 text-base font-bold">${escape(s.title)}</div>
          <p class="mt-2 text-sm text-slate-600">${escape(s.body)}</p>
        </li>`
        )
        .join("")}
    </ol>
  </div>
</section>`;
}

function renderFeatures(f: NonNullable<TrustFunnelContent["features"]>): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(f.headline)}</h2>
    <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      ${f.items
        .map(
          (it) => `
        <div class="rounded-xl border border-slate-200 p-6 transition hover:border-emerald-300 hover:shadow-lg">
          <div class="text-2xl">${escape(it.icon)}</div>
          <div class="mt-3 text-base font-bold">${escape(it.title)}</div>
          <p class="mt-2 text-sm text-slate-600">${escape(it.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderSocialProof(s: LandingPageContent["social_proof"]): string {
  const stats = s.stats?.length
    ? `<div class="mb-12 grid gap-6 sm:grid-cols-${Math.min(s.stats.length, 4)}">
        ${s.stats
          .map(
            (st) => `
          <div class="text-center">
            <div class="text-4xl font-black text-emerald-600">${escape(st.value)}</div>
            <div class="mt-1 text-xs uppercase tracking-wider text-slate-500">${escape(st.label)}</div>
          </div>`
          )
          .join("")}
      </div>`
    : "";

  return `
<section class="bg-slate-50 py-20">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(s.headline)}</h2>
    <div class="mt-10">
      ${stats}
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        ${s.testimonials
          .map(
            (t) => `
          <figure class="rounded-xl border border-slate-200 bg-white p-6">
            ${
              t.rating
                ? `<div class="mb-3 text-amber-400">${"★".repeat(Math.round(t.rating))}${"☆".repeat(5 - Math.round(t.rating))}</div>`
                : ""
            }
            <blockquote class="text-sm italic text-slate-700">« ${escape(t.quote)} »</blockquote>
            <figcaption class="mt-4 text-xs">
              <div class="font-bold">${escape(t.name)}</div>
              ${t.role ? `<div class="text-slate-500">${escape(t.role)}</div>` : ""}
            </figcaption>
          </figure>`
          )
          .join("")}
      </div>
    </div>
  </div>
</section>`;
}

function renderComparator(c: NonNullable<TrustFunnelContent["comparator"]>): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(c.headline)}</h2>
    ${c.intro ? `<p class="mt-3 max-w-3xl text-base text-slate-600">${escape(c.intro)}</p>` : ""}
    <div class="mt-10 overflow-x-auto rounded-2xl border border-slate-200">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase">
          <tr>
            <th class="px-5 py-4 text-left font-semibold text-slate-600">Critère</th>
            ${c.columns
              .map(
                (col, i) =>
                  `<th class="px-5 py-4 text-center font-bold ${
                    i === 0
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600"
                  }">${escape(col)}</th>`
              )
              .join("")}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${c.rows
            .map(
              (row) => `
            <tr>
              <td class="px-5 py-4 font-medium text-slate-900">${escape(row.feature)}</td>
              ${row.values
                .map(
                  (v, i) =>
                    `<td class="px-5 py-4 text-center ${i === 0 ? "bg-emerald-50/50" : ""}">${cellValue(v)}</td>`
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

function cellValue(v: string | boolean): string {
  if (typeof v === "boolean") {
    return v
      ? `<span class="text-emerald-600 text-lg font-bold">✓</span>`
      : `<span class="text-slate-300 text-lg">×</span>`;
  }
  return `<span class="font-semibold">${escape(v)}</span>`;
}

function renderSecurity(s: NonNullable<TrustFunnelContent["security"]>): string {
  return `
<section class="bg-slate-950 py-20 text-white">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(s.headline)}</h2>
    ${s.intro ? `<p class="mt-3 max-w-3xl text-base text-white/70">${escape(s.intro)}</p>` : ""}
    <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(s.items.length, 4)}">
      ${s.items
        .map(
          (it) => `
        <div class="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <div class="text-2xl">${escape(it.icon)}</div>
          <div class="mt-3 text-base font-bold">${escape(it.label)}</div>
          <p class="mt-2 text-sm text-white/70">${escape(it.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderFAQ(f: LandingPageContent["faq"]): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-3xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(f.headline)}</h2>
    <div class="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200">
      ${f.items
        .map(
          (it) => `
        <details class="group p-5">
          <summary class="flex cursor-pointer items-center justify-between text-base font-semibold text-slate-900">
            <span>${escape(it.q)}</span>
            <span class="text-slate-400 transition group-open:rotate-180">⌄</span>
          </summary>
          <p class="mt-3 text-sm text-slate-600">${escape(it.a)}</p>
        </details>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderCtaFinal(c: LandingPageContent["cta_final"]): string {
  return `
<section class="bg-gradient-to-br from-emerald-600 to-emerald-800 py-20 text-white">
  <div class="mx-auto max-w-3xl px-6 text-center">
    <h2 class="text-4xl font-black sm:text-5xl">${escape(c.headline)}</h2>
    <p class="mx-auto mt-5 max-w-2xl text-lg text-white/90">${escape(c.sub)}</p>
    <a href="#" class="mt-8 inline-block rounded-xl bg-white px-8 py-4 text-base font-bold text-emerald-700 shadow-2xl hover:bg-slate-50">
      ${escape(c.cta.label)}
    </a>
    ${
      c.reassurance || c.cta.reassurance
        ? `<p class="mt-4 text-xs text-white/70">${escape(c.reassurance ?? c.cta.reassurance ?? "")}</p>`
        : ""
    }
  </div>
</section>`;
}

function renderFooter(): string {
  return `
<footer class="bg-slate-950 py-10 text-center text-[11px] text-white/40">
  <div class="mx-auto max-w-6xl px-6">
    <p>© 2026 — Communication à caractère promotionnel. Ceci ne constitue pas un conseil en investissement personnalisé. Investir comporte des risques de perte en capital.</p>
  </div>
</footer>`;
}

// ──────────────────────────────────────────────────────────────────────────
// SECTIONS — story-pivot specific
// ──────────────────────────────────────────────────────────────────────────

function renderStory(s: StoryPivotContent["story"]): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-3xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(s.headline)}</h2>
    <div class="mt-8 space-y-5 text-base leading-relaxed text-slate-700">
      ${s.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}
    </div>
    ${
      s.pull_quote
        ? `<blockquote class="mt-8 border-l-4 border-emerald-500 pl-5 font-serif text-2xl italic text-slate-900">${escape(s.pull_quote)}</blockquote>`
        : ""
    }
  </div>
</section>`;
}

function renderChartPivot(c: StoryPivotContent["chart_pivot"]): string {
  // Simple bar chart — find max value, render bars proportionally
  const maxVal = Math.max(...c.data.map((d) => d.value), 1);
  const bars = c.data
    .map(
      (d) => `
    <div class="flex items-center gap-3">
      <div class="w-32 shrink-0 text-right text-xs font-medium text-slate-700">${escape(d.label)}</div>
      <div class="relative h-7 flex-1 overflow-hidden rounded bg-slate-100">
        <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-600" style="width: ${Math.round((d.value / maxVal) * 100)}%"></div>
      </div>
      <div class="w-16 text-right text-sm font-bold tabular-nums text-slate-900">${d.value.toLocaleString("fr-FR")}</div>
    </div>`
    )
    .join("");

  return `
<section class="bg-slate-50 py-20">
  <div class="mx-auto max-w-4xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(c.headline)}</h2>
    <p class="mt-3 text-base text-slate-600">${escape(c.caption)}</p>
    <div class="mt-10 rounded-2xl bg-white p-8 ring-1 ring-slate-200">
      <div class="space-y-4">${bars}</div>
      ${
        c.source
          ? `<p class="mt-6 text-[10px] uppercase tracking-wider text-slate-400">Source : ${escape(c.source)}</p>`
          : ""
      }
    </div>
  </div>
</section>`;
}

function renderSolutionReveal(
  s: StoryPivotContent["solution_reveal"]
): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-4xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(s.headline)}</h2>
    <p class="mt-4 text-lg text-slate-600">${escape(s.sub)}</p>
    <ul class="mt-8 space-y-3">
      ${s.bullets
        .map(
          (b) => `
        <li class="flex items-start gap-3 rounded-lg bg-emerald-50 p-4">
          <span class="mt-0.5 text-emerald-600">✓</span>
          <span class="text-base font-medium text-slate-800">${escape(b)}</span>
        </li>`
        )
        .join("")}
    </ul>
  </div>
</section>`;
}

// ──────────────────────────────────────────────────────────────────────────
// SECTIONS — quiz-lead specific
// ──────────────────────────────────────────────────────────────────────────

function renderWhyMatters(w: QuizLeadContent["why_matters"]): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-6xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(w.headline)}</h2>
    <p class="mt-3 max-w-3xl text-base text-slate-600">${escape(w.intro)}</p>
    <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(w.bullets.length, 4)}">
      ${w.bullets
        .map(
          (b) => `
        <div class="rounded-xl border border-slate-200 p-5">
          <div class="text-base font-bold">${escape(b.title)}</div>
          <p class="mt-2 text-sm text-slate-600">${escape(b.body)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderQuizTeaser(q: QuizLeadContent["quiz_teaser"]): string {
  return `
<section class="bg-emerald-50 py-20">
  <div class="mx-auto max-w-3xl px-6 text-center">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(q.headline)}</h2>
    <p class="mt-4 text-lg text-slate-700">${escape(q.sub)}</p>
    <ul class="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
      ${q.bullets
        .map(
          (b) =>
            `<li class="rounded-full border border-emerald-300 bg-white px-4 py-1.5 font-medium text-emerald-700">✓ ${escape(b)}</li>`
        )
        .join("")}
    </ul>
    <a href="#" class="mt-8 inline-block rounded-xl bg-emerald-600 px-7 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700">
      ${escape(q.cta.label)}
    </a>
    ${
      q.cta.reassurance
        ? `<p class="mt-3 text-xs text-slate-500">${escape(q.cta.reassurance)}</p>`
        : ""
    }
  </div>
</section>`;
}

function renderQuizPreview(q: QuizLeadContent["quiz_preview"]): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-3xl px-6">
    <h2 class="font-serif text-3xl font-bold sm:text-4xl">${escape(q.headline)}</h2>
    ${q.intro ? `<p class="mt-3 text-base text-slate-600">${escape(q.intro)}</p>` : ""}
    <div class="mt-8 space-y-4">
      ${q.sample_questions
        .map(
          (sq, i) => `
        <div class="rounded-2xl border border-slate-200 p-6">
          <div class="text-xs font-semibold uppercase tracking-wider text-emerald-600">Question ${i + 1}</div>
          <div class="mt-2 text-base font-bold">${escape(sq.question)}</div>
          <div class="mt-4 grid gap-2">
            ${sq.options
              .map(
                (o) => `
              <button class="rounded-lg border border-slate-200 px-4 py-2.5 text-left text-sm transition hover:border-emerald-300 hover:bg-emerald-50">
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
// FOXSTONE-STYLE SECTIONS — added to match lp.foxstone.ch structure
// ──────────────────────────────────────────────────────────────────────────

function renderStatsBand(
  s: NonNullable<TrustFunnelContent["stats_band"]>
): string {
  return `
<section class="bg-slate-900 py-16 text-white">
  <div class="mx-auto max-w-6xl px-6">
    <div class="grid grid-cols-2 gap-8 sm:grid-cols-${Math.min(s.items.length, 4)}">
      ${s.items
        .map(
          (it) => `
        <div class="text-center">
          <div class="text-4xl font-black sm:text-5xl">${escape(it.value)}</div>
          <div class="mt-2 text-xs uppercase tracking-wider text-white/60">${escape(it.label)}</div>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderPressLogos(
  p: NonNullable<TrustFunnelContent["press_logos"]>
): string {
  return `
<section class="border-y border-slate-200 bg-white py-12">
  <div class="mx-auto max-w-6xl px-6">
    <p class="text-center text-xs uppercase tracking-[0.2em] text-slate-500">${escape(p.headline)}</p>
    <div class="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
      ${p.logos
        .map(
          (l) =>
            `<span class="text-base font-black uppercase tracking-tight text-slate-400">${escape(l)}</span>`
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function renderSolutions(
  s: NonNullable<TrustFunnelContent["solutions"]>
): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-6xl px-6">
    ${
      s.kicker
        ? `<p class="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">${escape(s.kicker)}</p>`
        : ""
    }
    <h2 class="mt-3 font-serif text-3xl font-bold sm:text-4xl">${escape(s.headline)}</h2>
    <div class="mt-12 grid gap-6 lg:grid-cols-${Math.min(s.items.length, 3)}">
      ${s.items
        .map(
          (it) => `
        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-7">
          <h3 class="font-serif text-2xl font-bold">${escape(it.name)}</h3>
          <p class="mt-2 text-sm text-slate-600">${escape(it.tagline)}</p>
          <ul class="mt-5 space-y-1.5 text-sm">
            ${it.highlights
              .map(
                (h) =>
                  `<li class="flex items-start gap-2"><span class="mt-1 h-1 w-1 shrink-0 rounded-full bg-orange-500"></span><span>${escape(h)}</span></li>`
              )
              .join("")}
          </ul>
          <details class="mt-6 group">
            <summary class="cursor-pointer text-sm font-semibold text-orange-600 hover:text-orange-700">
              Comment ça marche →
            </summary>
            <ol class="mt-4 space-y-4">
              ${it.steps
                .map(
                  (st) => `
                <li class="flex gap-4 text-sm">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 font-bold text-white">${escape(st.number)}</span>
                  <div>
                    <div class="font-semibold">${escape(st.title)}</div>
                    <p class="mt-1 text-slate-600">${escape(st.body)}</p>
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

function renderWhyUs(w: NonNullable<TrustFunnelContent["why_us"]>): string {
  return `
<section class="bg-slate-900 py-20 text-white">
  <div class="mx-auto max-w-6xl px-6">
    ${
      w.kicker
        ? `<p class="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">${escape(w.kicker)}</p>`
        : ""
    }
    <h2 class="mt-3 font-serif text-3xl font-bold sm:text-4xl">${escape(w.headline)}</h2>
    ${
      w.intro
        ? `<p class="mt-4 max-w-3xl text-base text-white/70">${escape(w.intro)}</p>`
        : ""
    }
    <div class="mt-12 grid gap-8 sm:grid-cols-2">
      ${w.reasons
        .map(
          (r) => `
        <div class="border-l-2 border-orange-500 pl-5">
          <h3 class="font-serif text-xl font-bold">${escape(r.title)}</h3>
          <p class="mt-2 text-sm text-white/70 leading-relaxed">${escape(r.body)}</p>
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
        ? `<a href="#" class="mt-12 inline-block rounded-2xl bg-orange-500 px-7 py-4 text-base font-bold shadow-lg shadow-orange-500/30 hover:bg-orange-600">${escape(w.cta.label)} →</a>`
        : ""
    }
  </div>
</section>`;
}

function renderOpportunities(
  o: NonNullable<TrustFunnelContent["opportunities"]>
): string {
  return `
<section class="bg-slate-50 py-20">
  <div class="mx-auto max-w-6xl px-6">
    ${
      o.kicker
        ? `<p class="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">${escape(o.kicker)}</p>`
        : ""
    }
    <h2 class="mt-3 font-serif text-3xl font-bold sm:text-4xl">${escape(o.headline)}</h2>
    <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(o.items.length, 3)}">
      ${o.items
        .map(
          (it) => `
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div class="aspect-video w-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-400 text-xs italic">${escape(it.location)}</div>
          <div class="p-5">
            <div class="flex items-center justify-between gap-2">
              <span class="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700">${escape(it.type)}</span>
              <span class="text-[10px] font-medium text-slate-500">${escape(it.status)}</span>
            </div>
            <h3 class="mt-3 font-bold">${escape(it.location)}</h3>
            <p class="text-xs text-slate-500">${escape(it.category)}</p>
            <dl class="mt-4 grid grid-cols-2 gap-3 text-xs">
              ${it.details
                .map(
                  (d) => `
                <div>
                  <dt class="text-slate-500">${escape(d.label)}</dt>
                  <dd class="mt-0.5 font-bold">${escape(d.value)}</dd>
                </div>`
                )
                .join("")}
            </dl>
          </div>
        </div>`
        )
        .join("")}
    </div>
    <div class="mt-10 text-center">
      <a href="#" class="inline-block rounded-2xl bg-orange-500 px-7 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600">${escape(o.cta_label)}</a>
    </div>
  </div>
</section>`;
}

function renderBrandStory(
  b: NonNullable<TrustFunnelContent["brand_story"]>
): string {
  return `
<section class="bg-white py-20">
  <div class="mx-auto max-w-3xl px-6">
    ${
      b.kicker
        ? `<p class="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">${escape(b.kicker)}</p>`
        : ""
    }
    <h2 class="mt-3 font-serif text-3xl font-bold sm:text-4xl">${escape(b.headline)}</h2>
    <p class="mt-5 text-base leading-relaxed text-slate-700">${escape(b.intro)}</p>
    <div class="mt-10 space-y-6">
      ${b.quotes
        .map(
          (q) =>
            `<blockquote class="rounded-2xl border-l-4 border-orange-500 bg-slate-50 px-5 py-4 font-serif text-lg italic text-slate-800">« ${escape(q.text)} »</blockquote>`
        )
        .join("")}
    </div>
    <blockquote class="mt-10 border-t border-slate-200 pt-8">
      <p class="font-serif text-xl italic leading-relaxed text-slate-900">« ${escape(b.closing_quote.text)} »</p>
      <footer class="mt-4 text-sm font-bold text-slate-500">— ${escape(b.closing_quote.author)}</footer>
    </blockquote>
  </div>
</section>`;
}

function renderSimulator(
  s: NonNullable<TrustFunnelContent["simulator"]>
): string {
  // Build the input sliders + interactive output via inline JS.
  const inputsById = s.inputs
    .map(
      (inp, i) => `
      <div class="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">${escape(inp.label)}</span>
          <div class="mt-2 flex items-baseline gap-2">
            <output id="sim-val-${i}" class="font-serif text-3xl font-bold text-slate-900">${formatSimVal(inp.default_value, inp.unit)}</output>
          </div>
          <input id="sim-input-${i}" type="range" min="${inp.min}" max="${inp.max}" value="${inp.default_value}" data-kind="${inp.kind}" data-unit="${escape(inp.unit)}" class="mt-3 w-full accent-orange-500" />
          <div class="mt-1.5 flex justify-between text-[10px] text-slate-400">
            <span>${formatSimVal(inp.min, inp.unit)}</span>
            <span>${formatSimVal(inp.max, inp.unit)}</span>
          </div>
        </label>
      </div>`
    )
    .join("");

  const outputsHtml = s.outputs
    .map(
      (o, i) => `
      <div class="rounded-2xl bg-orange-50 p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-orange-700">${escape(o.label)}</div>
        <div id="sim-out-${i}" data-kind="${o.kind}" class="mt-1 font-serif text-2xl font-bold text-slate-900">—</div>
      </div>`
    )
    .join("");

  return `
<section class="bg-slate-50 py-20">
  <div class="mx-auto max-w-5xl px-6">
    ${
      s.kicker
        ? `<p class="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">${escape(s.kicker)}</p>`
        : ""
    }
    <h2 class="mt-3 font-serif text-3xl font-bold sm:text-4xl">${escape(s.headline)}</h2>
    <div class="mt-10 grid gap-5 md:grid-cols-3">
      ${inputsById}
    </div>
    <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-${Math.min(s.outputs.length, 4)}">
      ${outputsHtml}
    </div>
    <p class="mt-6 text-center text-[10px] italic text-slate-400">${escape(s.disclaimer)}</p>
  </div>
</section>
<script>
  (function() {
    function getInput(i) { return document.getElementById('sim-input-' + i); }
    function getKind(el) { return el.dataset.kind; }
    function findInputByKind(kind) {
      return Array.from(document.querySelectorAll('[id^="sim-input-"]')).find(e => e.dataset.kind === kind);
    }
    function compute() {
      var amountEl = findInputByKind('amount');
      var rateEl = findInputByKind('rate');
      var durEl = findInputByKind('duration');
      var amount = amountEl ? parseFloat(amountEl.value) : 0;
      var rate = rateEl ? parseFloat(rateEl.value) / 100 : 0;
      var dur = durEl ? parseFloat(durEl.value) : 0;
      var annual = amount * rate;
      var quarterly = annual / 4;
      var total = annual * dur;
      var totalValue = amount + total;
      var unitFor = function(el) { return el ? el.dataset.unit : ''; };
      // Update each input value display
      Array.from(document.querySelectorAll('[id^="sim-input-"]')).forEach(function(el, idx) {
        var v = parseFloat(el.value);
        var u = el.dataset.unit;
        document.getElementById('sim-val-' + idx).textContent = formatVal(v, u);
      });
      // Update outputs
      Array.from(document.querySelectorAll('[id^="sim-out-"]')).forEach(function(el) {
        var k = el.dataset.kind;
        var v = 0;
        if (k === 'quarterly_revenue') v = quarterly;
        else if (k === 'annual_revenue') v = annual;
        else if (k === 'total_revenue') v = total;
        else if (k === 'total_value') v = totalValue;
        el.textContent = formatVal(v, unitFor(amountEl) || '€');
      });
    }
    function formatVal(v, unit) {
      var rounded = Math.round(v).toLocaleString('fr-FR');
      if (unit === '%') return v.toFixed(1).replace('.', ',') + ' %';
      if (unit === 'ans' || unit === 'an') return Math.round(v) + ' ' + unit;
      return (unit ? unit + ' ' : '') + rounded;
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

function renderLeadMagnetSection(
  m: NonNullable<TrustFunnelContent["lead_magnet_section"]>
): string {
  return `
<section id="lead-magnet" class="bg-orange-50 py-20">
  <div class="mx-auto grid max-w-5xl gap-10 px-6 lg:grid-cols-12 lg:items-center">
    <div class="lg:col-span-5">
      <div class="mx-auto aspect-[3/4] max-w-xs rounded-2xl bg-gradient-to-br from-orange-200 to-orange-300 shadow-2xl ring-1 ring-orange-300/40 flex items-center justify-center text-orange-700 text-sm font-bold">
        📖 Cover ebook
      </div>
    </div>
    <div class="lg:col-span-7">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">${escape(m.kicker)}</p>
      <h2 class="mt-3 font-serif text-3xl font-bold sm:text-4xl">${escape(m.headline)}</h2>
      <p class="mt-4 text-base text-slate-700">${escape(m.sub)}</p>
      <ul class="mt-6 space-y-2">
        ${m.bullets
          .map(
            (b) =>
              `<li class="flex items-start gap-2 text-sm"><span class="mt-1 text-orange-500">✓</span><span>${escape(b)}</span></li>`
          )
          .join("")}
      </ul>
      <a href="#" class="mt-8 inline-block rounded-2xl bg-orange-500 px-7 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600">
        ${escape(m.cta.label)} →
      </a>
      ${
        m.cta.reassurance
          ? `<p class="mt-3 text-xs text-slate-500">${escape(m.cta.reassurance)}</p>`
          : ""
      }
    </div>
  </div>
</section>`;
}

// ──────────────────────────────────────────────────────────────────────────
// HTML ESCAPE
// ──────────────────────────────────────────────────────────────────────────

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
