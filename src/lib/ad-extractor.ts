/**
 * Extraction IA structurée par ad + synthèse cross-ads.
 *
 * Pipeline :
 *  1. Pour chaque ad → Claude lit le copy (et optionnellement l'image via
 *     vision si l'URL pointe directement sur une image accessible) et
 *     produit { angle, promise, concept, render_style }
 *  2. On classe les ads par tier de perf (top / mid / bottom)
 *  3. Claude synthétise les patterns : winning angles, promises, concepts,
 *     losing patterns, recommandations actionnables
 */
import { getAnthropic, CLAUDE_MODEL, CLAUDE_LIGHT_MODEL } from "./anthropic";

export type AdInputForExtraction = {
  ad_name: string;
  ad_creative_url: string | null;
  campaign: string | null;
  ad_set: string | null;
  // From raw_data — we hunt these in common header variants
  body: string | null;
  headline: string | null;
  description: string | null;
  cta_text: string | null;
};

export type ExtractedAdMetadata = {
  angle: string;
  promise: string;
  concept: string;
  render_style:
    | "cinematic"
    | "ugc"
    | "screenshot_social"
    | "editorial"
    | "comparison_split"
    | "data_viz"
    | "meme"
    | "unknown";
};

const RENDER_STYLE_VALUES = [
  "cinematic",
  "ugc",
  "screenshot_social",
  "editorial",
  "comparison_split",
  "data_viz",
  "meme",
  "unknown",
] as const;

// =============================================================================
// PUBLIC : batched per-ad extraction (Haiku, 10 ads/call)
// =============================================================================

// Compact system prompt — same constraints, less verbosity to reduce input
// tokens (Haiku still respects this concisely).
const BATCH_EXTRACTION_SYSTEM = `Tu es un ad analyst. On te donne une liste d'ads (chacune avec name, copy, plateforme). Pour CHAQUE ad, tu extrais 4 champs :

- angle : levier marketing en 2-4 mots français (ex: "Sécurité capital", "Performance court terme", "Social proof", "Pédagogie", "Économie", "Urgence", "Statut", "Comparatif"). Sois précis, pas générique.
- promise : la transformation promise en 1 phrase française (max 15 mots, concrète).
- concept : le concept visuel en 2-5 mots français (ex: "Sablier en cristal", "Personne au calme avec téléphone", "Capture SMS famille", "Diptyque avant-après", "Graphique courbe ascendante"). Si pas d'info visuelle, déduis depuis le copy.
- render_style : EXACTEMENT une valeur parmi ["cinematic", "ugc", "screenshot_social", "editorial", "comparison_split", "data_viz", "meme", "unknown"].

FORMAT DE SORTIE — JSON STRICT :
{
  "extractions": [
    { "i": 0, "angle": "...", "promise": "...", "concept": "...", "render_style": "..." },
    { "i": 1, ... }
  ]
}

CRUCIAL : retourne EXACTEMENT autant d'extractions que d'ads en entrée, dans l'ordre, avec l'index "i" qui matche.`;

const BATCH_SIZE = 10;

/**
 * Batch extraction — sends N ads (N <= BATCH_SIZE) in a SINGLE Claude call,
 * uses Haiku for low cost. ~10× cheaper than per-ad Sonnet calls.
 */
export async function batchExtract(
  inputs: { id: string; input: AdInputForExtraction }[],
  _concurrency: number, // ignored — kept for backward compat
  onProgress?: (done: number, total: number) => void
): Promise<{ id: string; result: ExtractedAdMetadata | null; error?: string }[]> {
  const results: {
    id: string;
    result: ExtractedAdMetadata | null;
    error?: string;
  }[] = [];

  // Split inputs into batches of BATCH_SIZE
  const batches: typeof inputs[] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    batches.push(inputs.slice(i, i + BATCH_SIZE));
  }

  let done = 0;
  // Run batches concurrently — 3 in flight to balance throughput vs rate limits
  const BATCH_CONCURRENCY = 3;
  let cursor = 0;
  async function batchWorker() {
    while (cursor < batches.length) {
      const idx = cursor++;
      if (idx >= batches.length) break;
      const batch = batches[idx];
      try {
        const batchResults = await extractBatch(batch);
        for (const r of batchResults) results.push(r);
      } catch (e) {
        // Whole batch failed — push null for each
        for (const item of batch) {
          results.push({
            id: item.id,
            result: null,
            error: (e as Error).message,
          });
        }
      }
      done += batch.length;
      onProgress?.(done, inputs.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, () =>
      batchWorker()
    )
  );
  return results;
}

async function extractBatch(
  batch: { id: string; input: AdInputForExtraction }[]
): Promise<{ id: string; result: ExtractedAdMetadata | null; error?: string }[]> {
  const client = getAnthropic();

  // Build a compact textual list of ads
  const lines: string[] = ["Ads à analyser :", ""];
  batch.forEach((item, i) => {
    const a = item.input;
    lines.push(`### Ad ${i}`);
    lines.push(`Nom : ${a.ad_name}`);
    if (a.campaign) lines.push(`Campagne : ${a.campaign}`);
    if (a.headline) lines.push(`Headline : ${a.headline}`);
    if (a.body) lines.push(`Body : ${a.body}`);
    if (a.description) lines.push(`Description : ${a.description}`);
    if (a.cta_text) lines.push(`CTA : ${a.cta_text}`);
    lines.push("");
  });
  lines.push(
    `Produis le JSON avec EXACTEMENT ${batch.length} extractions, indexées de 0 à ${batch.length - 1}.`
  );

  const response = await client.messages.create({
    model: CLAUDE_LIGHT_MODEL,
    max_tokens: 200 * batch.length, // ~200 tokens per extraction
    system: BATCH_EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const json = extractFirstJsonObject(raw);
  if (!json) {
    throw new Error(`Batch parse error (pas de JSON) : ${raw.slice(0, 200)}`);
  }
  let parsed: { extractions?: Partial<ExtractedAdMetadata & { i: number }>[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Batch parse error : ${json.slice(0, 200)}`);
  }
  const extractions = parsed.extractions ?? [];
  const byIndex = new Map<number, Partial<ExtractedAdMetadata>>();
  for (const e of extractions) {
    if (typeof e.i === "number") byIndex.set(e.i, e);
  }

  return batch.map((item, i) => {
    const e = byIndex.get(i);
    if (!e) {
      return {
        id: item.id,
        result: {
          angle: "Inconnu",
          promise: item.input.ad_name.slice(0, 80),
          concept: "Inconnu",
          render_style: "unknown",
        },
      };
    }
    const renderStyle = (
      RENDER_STYLE_VALUES.includes(
        e.render_style as ExtractedAdMetadata["render_style"]
      )
        ? e.render_style
        : "unknown"
    ) as ExtractedAdMetadata["render_style"];
    return {
      id: item.id,
      result: {
        angle: (e.angle ?? "Inconnu").trim() || "Inconnu",
        promise: (e.promise ?? item.input.ad_name.slice(0, 80)).trim(),
        concept: (e.concept ?? "Inconnu").trim() || "Inconnu",
        render_style: renderStyle,
      },
    };
  });
}

// =============================================================================
// Helper : pull copy fields from raw_data CSV row
// =============================================================================

const HEADER_ALIASES: Record<keyof Pick<AdInputForExtraction, "body" | "headline" | "description" | "cta_text">, string[]> = {
  body: [
    "body",
    "primary text",
    "texte principal",
    "ad creative body",
    "description du texte",
  ],
  headline: ["headline", "titre", "title", "ad creative headline"],
  description: [
    "description",
    "description (link)",
    "description du lien",
    "ad creative link description",
  ],
  cta_text: [
    "call to action",
    "cta",
    "texte du bouton",
    "call to action text",
    "cta button",
  ],
};

export function pullCopyFromRawData(
  raw: Record<string, unknown> | null
): Pick<AdInputForExtraction, "body" | "headline" | "description" | "cta_text"> {
  const out = {
    body: null as string | null,
    headline: null as string | null,
    description: null as string | null,
    cta_text: null as string | null,
  };
  if (!raw) return out;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" || typeof v === "number") {
      lower[k.toLowerCase().trim()] = String(v).trim();
    }
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof typeof out,
    string[],
  ][]) {
    for (const a of aliases) {
      const an = a.toLowerCase().trim();
      const exact = lower[an];
      if (exact) {
        out[field] = exact;
        break;
      }
      const partialKey = Object.keys(lower).find((k) => k.includes(an));
      if (partialKey) {
        out[field] = lower[partialKey];
        break;
      }
    }
  }
  return out;
}

// =============================================================================
// PUBLIC : performance tier calculation
// =============================================================================

export type RowForTier = {
  id: string;
  spend: number | null;
  ctr: number | null;
  cpc: number | null;
  conversions: number | null;
  cost_per_conversion: number | null;
  roas: number | null;
};

export type TieredRow = RowForTier & {
  tier: "top" | "mid" | "bottom";
  tier_metric: "roas" | "cpa" | "cvr_per_spend" | "ctr";
};

/**
 * Rank ads by the best available KPI and assign tiers.
 *  - Top 20% : "top"
 *  - Bottom 20% : "bottom"
 *  - Middle 60% : "mid"
 *
 * For LEADGEN we ALWAYS prioritize CPA. Ads with conversions=0 BUT
 * significant spend are treated as "bottom" automatically (CPL-killers —
 * they spent budget without delivering leads).
 *
 * CTR > 30% is filtered as outliers (auto-play artifacts, carousel quirks,
 * tracking bugs — never real signal).
 */
export function computeTiers(
  rows: RowForTier[],
  minSpendThreshold = 10
): TieredRow[] {
  if (rows.length === 0) return [];

  const SUSPICIOUS_CTR = 0.3; // CTR > 30 % = artefact, ignore for ranking
  const usable = rows.filter((r) => (r.spend ?? 0) >= minSpendThreshold);

  // -------------------------------------------------------------------------
  // Strategy 1 (PREFERRED) — CPL ranking with virtual CPA for no-conv ads
  // -------------------------------------------------------------------------
  // Use this whenever ≥ 3 ads have a real CPA. Ads with conversions=0 BUT
  // significant spend get a virtual_cpa = Infinity → automatic bottom tier.
  // Ads with low spend AND no conversions get "mid" (not enough signal).
  const withRealCpa = usable.filter(
    (r) => r.cost_per_conversion !== null && r.cost_per_conversion! > 0
  );

  if (withRealCpa.length >= 3) {
    const HEAVY_SPEND = minSpendThreshold * 2;
    type Scored = {
      row: RowForTier;
      score: number; // virtual CPA (lower better, Infinity = killer)
      hasSignal: boolean; // false → keep at "mid", outside top/bottom calc
    };
    const scored: Scored[] = usable.map((r) => {
      // Filter out CTR outliers (treat them as having no signal)
      const ctrOutlier = r.ctr !== null && r.ctr! > SUSPICIOUS_CTR;
      if (
        r.cost_per_conversion !== null &&
        r.cost_per_conversion! > 0 &&
        !ctrOutlier
      ) {
        return { row: r, score: r.cost_per_conversion!, hasSignal: true };
      }
      // No conversions but heavy spend → CPL-killer, virtual CPA = Infinity
      if (
        (r.conversions === null || r.conversions === 0) &&
        (r.spend ?? 0) >= HEAVY_SPEND &&
        !ctrOutlier
      ) {
        return { row: r, score: Number.POSITIVE_INFINITY, hasSignal: true };
      }
      // Either low spend, no conversions, or CTR outlier → no signal
      return { row: r, score: 0, hasSignal: false };
    });

    const ranked = scored
      .filter((s) => s.hasSignal)
      .sort((a, b) => a.score - b.score); // ascending = best CPA first

    const total = ranked.length;
    const topCount = Math.max(1, Math.floor(total * 0.2));
    const bottomCount = Math.max(1, Math.floor(total * 0.2));
    const tieredById = new Map<string, TieredRow["tier"]>();
    ranked.forEach((r, i) => {
      let tier: TieredRow["tier"];
      if (i < topCount) tier = "top";
      else if (i >= total - bottomCount || r.score === Number.POSITIVE_INFINITY)
        tier = "bottom";
      else tier = "mid";
      tieredById.set(r.row.id, tier);
    });

    return rows.map((r) => ({
      ...r,
      tier: tieredById.get(r.id) ?? "mid",
      tier_metric: "cpa",
    }));
  }

  // -------------------------------------------------------------------------
  // Strategy 2 — ROAS-based (e-commerce style, when CPA isn't usable)
  // -------------------------------------------------------------------------
  if (usable.filter((r) => r.roas !== null).length >= usable.length * 0.5) {
    const scored = usable
      .filter(
        (r) =>
          r.roas !== null && (r.ctr === null || r.ctr! <= SUSPICIOUS_CTR)
      )
      .map((r) => ({ row: r, score: r.roas as number }))
      .sort((a, b) => b.score - a.score); // higher ROAS = better

    const total = scored.length;
    const topCount = Math.max(1, Math.floor(total * 0.2));
    const bottomCount = Math.max(1, Math.floor(total * 0.2));
    const tieredById = new Map<string, TieredRow["tier"]>();
    scored.forEach((r, i) => {
      let tier: TieredRow["tier"];
      if (i < topCount) tier = "top";
      else if (i >= total - bottomCount) tier = "bottom";
      else tier = "mid";
      tieredById.set(r.row.id, tier);
    });

    return rows.map((r) => ({
      ...r,
      tier: tieredById.get(r.id) ?? "mid",
      tier_metric: "roas",
    }));
  }

  // -------------------------------------------------------------------------
  // Strategy 3 — fallback : conversions/spend (events per €)
  // -------------------------------------------------------------------------
  if (
    usable.filter(
      (r) => r.conversions !== null && r.spend !== null && r.spend > 0
    ).length >= 3
  ) {
    const scored = usable
      .filter(
        (r) =>
          r.conversions !== null &&
          r.spend !== null &&
          r.spend > 0 &&
          (r.ctr === null || r.ctr! <= SUSPICIOUS_CTR)
      )
      .map((r) => ({
        row: r,
        score: (r.conversions as number) / (r.spend as number),
      }))
      .sort((a, b) => b.score - a.score);

    const total = scored.length;
    const topCount = Math.max(1, Math.floor(total * 0.2));
    const bottomCount = Math.max(1, Math.floor(total * 0.2));
    const tieredById = new Map<string, TieredRow["tier"]>();
    scored.forEach((r, i) => {
      let tier: TieredRow["tier"];
      if (i < topCount) tier = "top";
      else if (i >= total - bottomCount) tier = "bottom";
      else tier = "mid";
      tieredById.set(r.row.id, tier);
    });

    return rows.map((r) => ({
      ...r,
      tier: tieredById.get(r.id) ?? "mid",
      tier_metric: "cvr_per_spend",
    }));
  }

  // -------------------------------------------------------------------------
  // Strategy 4 (last resort) — CTR, with outlier filter
  // -------------------------------------------------------------------------
  const scored = usable
    .filter((r) => r.ctr !== null && r.ctr! > 0 && r.ctr! <= SUSPICIOUS_CTR)
    .map((r) => ({ row: r, score: r.ctr as number }))
    .sort((a, b) => b.score - a.score);

  const total = scored.length;
  const topCount = Math.max(1, Math.floor(total * 0.2));
  const bottomCount = Math.max(1, Math.floor(total * 0.2));
  const tieredById = new Map<string, TieredRow["tier"]>();
  scored.forEach((r, i) => {
    let tier: TieredRow["tier"];
    if (i < topCount) tier = "top";
    else if (i >= total - bottomCount) tier = "bottom";
    else tier = "mid";
    tieredById.set(r.row.id, tier);
  });

  return rows.map((r) => ({
    ...r,
    tier: tieredById.get(r.id) ?? "mid",
    tier_metric: "ctr",
  }));
}

// =============================================================================
// PUBLIC : synthesis across ads
// =============================================================================

export type CampaignStructure = "testing" | "scaling" | "mixed" | "unknown";

export type AnalysisContext = {
  campaign_structure: CampaignStructure;
  meta_objective: string | null; // "lead_form" / "conversions" / "traffic" / etc.
  analyst_note: string | null; // free-text from the user
};

export type SynthesisInput = {
  rows: {
    ad_name: string;
    angle: string;
    promise: string;
    concept: string;
    render_style: string;
    tier: "top" | "mid" | "bottom";
    spend: number | null;
    cpa: number | null;
    roas: number | null;
    ctr: number | null;
    conversions: number | null;
  }[];
  metric: TieredRow["tier_metric"];
  currency: string;
  context: AnalysisContext;
};

export type SynthesisOutput = {
  winning_angles: { name: string; appearances_in_top: number; rationale: string }[];
  winning_promises: { promise: string; appearances_in_top: number; rationale: string }[];
  winning_concepts: { name: string; render_style: string; appearances_in_top: number; rationale: string }[];
  losing_patterns: { pattern: string; rationale: string }[];
  recommendations: { title: string; detail: string }[];
};

// =============================================================================
// Andrometa methodology — system prompt for media buying leadgen analysis
// =============================================================================

const ANDROMETA_METHOD = `# MÉTHODOLOGIE ANDROMETA — MEDIA BUYING LEADGEN META

Tu raisonnes selon le framework Andrometa (Tomas Garcia) qui pilote la majorité des comptes leadgen Meta haute perf en France et US :

## 1. STRUCTURE DE COMPTE
- 1 campagne CBO Broad TESTING (toutes les nouvelles créas atterrissent là, audience large, Meta CBO optimise)
- 1 campagne CBO Broad SCALING (winners du testing transférés, mêmes paramètres broad, plus de budget)
- Pas d'audience custom restreinte : on laisse l'algo trouver. Le creative EST le ciblage.

## 2. RÈGLES DE KILL / SCALE (à appliquer dans tes recommandations)
**Kill rule** : ad qui a dépensé 2-3× le CPA target sans 1 conversion → kill immédiat
**Scale rule** : ad qui a converti à CPA target avec spend ≥ 2× CPA target → candidat scaling
**Watch rule** : ad qui a converti à excellent CPA mais low spend → augmenter budget pour avoir plus de signal
**Saturation rule** : en scaling, si CPA monte avec spend qui monte → l'ad sature, la dupliquer ou la rafraîchir

## 3. CONCEPT VARIATION > ANGLE VARIATION
Le coeur d'Andrometa : on test peu d'angles (3-5 max), beaucoup de **render_styles** par angle. Le même hook décliné en cinematic / UGC / screenshot / editorial / data viz / meme. La diversité visuelle bat la diversité d'angles.
- Concept saturé = même concept gagne dans plusieurs ads → temps de varier le render_style
- Angle résilient = même angle gagne à travers plusieurs render_styles → angle fort, doubler dessus
- Format winner = quand un format (video / static / carousel) gagne consistently → biais à respecter

## 4. PHASE D'APPRENTISSAGE
Un ad n'est statistiquement significatif qu'avec :
- ≥ 50 conversions cumulées sur le compte (apprentissage Meta)
- ≥ 10 conversions sur l'ad spécifique pour juger son CPA
- < 10 conversions et low spend = "watch list", pas de jugement définitif

## 5. SIGNALS À DÉTECTER
- **Hook rate** (3s view rate vidéo) > 30% = hook fort
- **CTR > 2%** = hook qui marche (mais sans conversion derrière, c'est un faux signal)
- **CPL bas** = la conversion réelle = la métrique reine
- **Frequency > 3** = audience saturée, refresh créatif urgent`;

const SYSTEM_BASE = `Tu es un media buyer leadgen Meta expert formé à la méthodologie Andrometa. On te donne une liste d'ads d'un compte Meta avec leurs angles, promesses, concepts, render_styles, tier de performance et métriques. Tu produis une synthèse actionnable des patterns gagnants/perdants, avec des recommandations qui s'inscrivent dans le framework Andrometa (Testing → Scaling, kill / scale rules, concept variation).

${ANDROMETA_METHOD}

⚠ RÈGLE ABSOLUE — TU RÉPONDS EXCLUSIVEMENT PAR LE JSON SPÉCIFIÉ ⚠
- AUCUN préambule avant le JSON
- AUCUN commentaire après le JSON
- Si tu détectes des anomalies dans les data (CTR aberrants, ranking suspect, etc.), MENTIONNE-LES DANS "losing_patterns" ou "recommendations" — JAMAIS en dehors du JSON
- Si la metric utilisée n'est pas optimale, commente-le dans la première recommandation`;

const SYNTHESIS_CPL_FOCUS = `

# OBJECTIF PRIMAIRE — MINIMISER LE CPL (CPA)
Le client pilote sur le CPL. ROAS / CTR / CPC sont SECONDAIRES.
1. Trier mentalement par CPL ascendant (plus bas = mieux)
2. Quantifier : "Angle X → CPL ~18€ vs 47€ moyenne globale"
3. Ne pas se laisser berner par un CTR élevé sans conversion
4. CPL-killers : qu'ont en commun les ads avec spend significatif mais 0 conv ?

# CONTRAINTES DE TAILLE (CRITIQUE — sinon JSON tronqué)
- MAX 5 winning_angles, MAX 5 winning_promises, MAX 5 winning_concepts
- MAX 3 losing_patterns
- MAX 5 recommendations
- Chaque "rationale" : 1-2 phrases COURTES (< 25 mots). Va à l'essentiel.
- Chaque "detail" de recommandation : 1-2 phrases (< 30 mots).
- Si tu approches la limite de tokens, PRIORISE les recommendations (plus actionnables) et tronque le reste.

# CONSIGNES TRANSVERSES
- Tout en français
- Sois précis et factuel : "8 top ads partagent l'angle X" = signal fort. "2 sur 10" = anecdotique.
- Recommandations concrètes orientées "réduire le CPL" et adaptées au contexte (testing vs scaling)
- Mentionne les opportunités de variation render_style sur les concepts gagnants (Andrometa core)`;

const SYNTHESIS_SYSTEM = `${SYSTEM_BASE}${SYNTHESIS_CPL_FOCUS}

FORMAT DE SORTIE — JSON STRICT :
{
  "winning_angles": [
    {
      "name": "Nom de l'angle (court, max 4 mots)",
      "appearances_in_top": 5,
      "rationale": "Pourquoi cet angle gagne (1 phrase factuelle)"
    }
  ],
  "winning_promises": [
    {
      "promise": "La promesse en 1 phrase",
      "appearances_in_top": 3,
      "rationale": "Pourquoi cette promesse résonne"
    }
  ],
  "winning_concepts": [
    {
      "name": "Nom du concept visuel",
      "render_style": "cinematic / ugc / etc.",
      "appearances_in_top": 4,
      "rationale": "Pourquoi ce concept performe"
    }
  ],
  "losing_patterns": [
    {
      "pattern": "Description courte du pattern perdant",
      "rationale": "Pourquoi ça ne marche pas (1 phrase)"
    }
  ],
  "recommendations": [
    {
      "title": "Recommandation actionnable courte",
      "detail": "Détail concret de l'action à prendre (1-2 phrases)"
    }
  ]
}`;

export async function synthesizeAnalysis(
  input: SynthesisInput
): Promise<SynthesisOutput> {
  const client = getAnthropic();

  const fmtMoney = (v: number | null) =>
    v === null ? "—" : `${v.toFixed(2)} ${input.currency}`;
  const fmtPct = (v: number | null) =>
    v === null ? "—" : `${(v * 100).toFixed(2)}%`;

  // Cap to top 30 + bottom 20 + 10 random mid to stay within token budget
  const top = input.rows.filter((r) => r.tier === "top").slice(0, 30);
  const bottom = input.rows.filter((r) => r.tier === "bottom").slice(0, 20);
  const mid = input.rows.filter((r) => r.tier === "mid");
  const midSample = mid.length <= 10 ? mid : sampleRandom(mid, 10);
  const subset = [...top, ...midSample, ...bottom];

  const tableLines = [
    "ad_name | tier | angle | promise | concept | style | spend | conv | CPA | ROAS | CTR",
    "---",
    ...subset.map((r) =>
      [
        r.ad_name.slice(0, 60),
        r.tier.toUpperCase(),
        r.angle,
        r.promise.slice(0, 60),
        r.concept,
        r.render_style,
        fmtMoney(r.spend),
        r.conversions !== null ? String(r.conversions) : "—",
        fmtMoney(r.cpa),
        r.roas !== null ? `×${r.roas.toFixed(2)}` : "—",
        fmtPct(r.ctr),
      ].join(" | ")
    ),
  ];

  const ctx = input.context;
  const structureLabel: Record<CampaignStructure, string> = {
    testing: "CBO Broad TESTING (toutes les nouvelles créas)",
    scaling: "CBO Broad SCALING (winners du testing)",
    mixed: "Mixed (testing + scaling dans le même CSV)",
    unknown: "Non précisé",
  };

  // Stage-specific guidance to Claude
  let stageHint = "";
  if (ctx.campaign_structure === "testing") {
    stageHint = `

# CONTEXTE — CAMPAGNE TESTING
Tu analyses des ads en phase de TEST. Lis les données avec ces lentilles :
- BEAUCOUP d'ads avec 0 conv = NORMAL (Meta tue les losers via CBO). Pas un drame.
- Le top 20% = candidats au SCALING. Identifie les ads à fort spend ET bon CPA → "à transférer en scaling".
- Le bottom 20% = candidats au KILL. Identifie les patterns CPL-killers à NE PLUS reproduire.
- Watch list = ads avec excellent CPA mais low spend (< 2-3× CPA target). À pousser pour avoir plus de signal.
- Recommandations attendues : "Scaler ces N concepts", "Kill ces patterns", "Tester ces variantes render_style sur les angles gagnants".`;
  } else if (ctx.campaign_structure === "scaling") {
    stageHint = `

# CONTEXTE — CAMPAGNE SCALING
Tu analyses des ads winners en phase de SCALING. Lis les données différemment :
- Toutes les ads sont déjà passées par le filtre testing. La question n'est plus "kill or scale" mais "comment maintenir la perf à plus de spend ?"
- Cherche les SATURATIONS : ad dont le CPA monte avec le spend qui monte → l'audience est saturée, il faut DUPLIQUER l'ad ou rafraîchir le concept.
- Cherche les LEADERS PERMANENTS : ads stables à fort spend → ce qu'il faut reproduire dans les nouvelles itérations testing.
- Cherche les ÉPUISÉES : ads qui décrochent (CPA en hausse, CTR en baisse) → à retirer du scaling.
- Recommandations attendues : "Dupliquer ces N ads", "Retirer ces ads du scaling", "Refresh créatif sur tel concept", "Lancer ces variantes en testing pour préparer la relève".`;
  } else if (ctx.campaign_structure === "mixed") {
    stageHint = `

# CONTEXTE — CAMPAGNE MIXED (testing + scaling)
Tu analyses un CSV qui mélange ads de testing et de scaling. Distingue mentalement :
- Les ads à fort spend cumulé sont probablement en scaling (passé par le testing)
- Les ads à faible spend sont probablement en testing (pas encore validées)
- Adapte tes recommandations : kill/scale pour les low-spend, saturation/refresh pour les high-spend.`;
  }

  const objectiveHint = ctx.meta_objective
    ? `\nObjectif Meta de la campagne : ${ctx.meta_objective}`
    : "";
  const noteHint = ctx.analyst_note
    ? `\nNote du media buyer : ${ctx.analyst_note}`
    : "";

  const userPayload = `# CONTEXTE
Structure de campagne : ${structureLabel[ctx.campaign_structure]}${objectiveHint}${noteHint}
Tier metric utilisé pour le ranking : ${input.metric.toUpperCase()}
Devise : ${input.currency}
Total ads dans l'analyse : ${input.rows.length} (TOP=${top.length}, MID-sample=${midSample.length}, BOTTOM=${bottom.length})${stageHint}

# DONNÉES

${tableLines.join("\n")}

Produis maintenant la synthèse JSON, adaptée au contexte ci-dessus.`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: SYNTHESIS_SYSTEM,
    messages: [{ role: "user", content: userPayload }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";

  // Defensive logging — if we end up failing parsing, the server logs
  // will show the full raw response so we can diagnose.
  const stopReason = response.stop_reason;

  const json = extractFirstJsonObject(raw);
  if (!json) {
    console.error(
      "[synthesizeAnalysis] extractFirstJsonObject returned null. stop_reason:",
      stopReason,
      "raw length:",
      raw.length,
      "raw preview (first 500 chars):",
      raw.slice(0, 500),
      "raw tail (last 200 chars):",
      raw.slice(-200)
    );
    throw new Error(
      `Synthèse Claude non-JSON (stop_reason=${stopReason}, ${raw.length} chars). Tail : ` +
        raw.slice(-150)
    );
  }
  let parsed: SynthesisOutput;
  try {
    parsed = JSON.parse(json) as SynthesisOutput;
  } catch (e) {
    console.error(
      "[synthesizeAnalysis] JSON.parse failed. stop_reason:",
      stopReason,
      "json length:",
      json.length,
      "json preview:",
      json.slice(0, 300),
      "json tail:",
      json.slice(-200),
      "error:",
      (e as Error).message
    );
    throw new Error(
      `Synthèse Claude JSON invalide après recovery : ${(e as Error).message} (stop_reason=${stopReason}). Tail : ${json.slice(-150)}`
    );
  }
  return parsed;
}

/**
 * Find the first balanced JSON object in a string. Returns null if none.
 * Handles preamble text, code fences, and trailing commentary.
 *
 * If the JSON is truncated mid-stream (Claude hit max_tokens), tries a
 * best-effort recovery : trim back to the last safe boundary (a comma at
 * the same depth as the incomplete token) then auto-close the open
 * structures so the result is parseable. If recovery doesn't produce
 * parseable JSON, the caller's JSON.parse will throw and we surface a
 * clear error.
 */
function extractFirstJsonObject(s: string): string | null {
  const cleaned = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;
  const stack: ("{" | "[")[] = [];
  // Track the index of the last comma at each depth so we can find a safe
  // truncation point if the response is incomplete
  const lastCommaAtDepth: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escapeNext = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
      stack.push("{");
    } else if (c === "[") {
      depth++;
      stack.push("[");
    } else if (c === "}") {
      depth--;
      if (stack[stack.length - 1] === "{") stack.pop();
      // Reset commas at depths > current
      lastCommaAtDepth.length = depth;
      if (depth === 0 && start !== -1) {
        return cleaned.slice(start, i + 1);
      }
    } else if (c === "]") {
      depth--;
      if (stack[stack.length - 1] === "[") stack.pop();
      lastCommaAtDepth.length = depth;
    } else if (c === ",") {
      lastCommaAtDepth[depth] = i;
    }
  }

  // Truncated — try to recover what's parseable so far
  if (start !== -1 && stack.length > 0) {
    // Find the shallowest depth where we saw a comma — that's the safest
    // truncation point (everything before it is well-formed).
    let safeIdx = -1;
    for (let d = 1; d < lastCommaAtDepth.length; d++) {
      if (typeof lastCommaAtDepth[d] === "number") {
        safeIdx = lastCommaAtDepth[d];
        break;
      }
    }
    let body =
      safeIdx > start ? cleaned.slice(start, safeIdx) : cleaned.slice(start);
    // Re-walk to know what's open at the truncation point
    const openStack: ("{" | "[")[] = [];
    let inStr = false;
    let esc = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (inStr) {
        if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") openStack.push("{");
      else if (c === "[") openStack.push("[");
      else if (
        (c === "}" && openStack[openStack.length - 1] === "{") ||
        (c === "]" && openStack[openStack.length - 1] === "[")
      )
        openStack.pop();
    }
    if (inStr) body += '"';
    while (openStack.length > 0) {
      body += openStack.pop() === "{" ? "}" : "]";
    }
    return body;
  }

  return null;
}

function sampleRandom<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// =============================================================================
// Helper : try to fetch the ad creative as an image
// =============================================================================

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Best-effort fetch of an ad creative image. Returns null if the URL is not
 * a direct image (e.g., a Facebook permalink that needs scraping) or if any
 * error occurs.
 */
export async function tryFetchCreativeImage(
  url: string | null
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0 || arr.byteLength > 4_000_000) return null;
    const buf = Buffer.from(arr);
    // Magic byte detection (more reliable than content-type)
    const detected = detectMime(buf);
    return { bytes: buf, mime: detected ?? ct.split(";")[0].trim() };
  } catch {
    return null;
  }
}

function detectMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";
  return null;
}
