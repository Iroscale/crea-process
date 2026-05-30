/**
 * CSV parser pour rapports Meta Ads / TikTok Ads / Google Ads.
 *
 * Stratégie : auto-détecte la plateforme depuis les headers, puis applique
 * un mapping de colonnes vers un schéma normalisé. Tolérant aux variations
 * EN / FR / casse / espaces. Quand on n'arrive pas à décider, on tag
 * "unknown" et on parse en best-effort avec des heuristiques génériques.
 */
import Papa from "papaparse";

export type Platform = "meta" | "tiktok" | "google" | "unknown";

export type ParsedAdRow = {
  ad_name: string;
  ad_creative_url: string | null;
  campaign: string | null;
  ad_set: string | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  spend: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null; // 0..1 (e.g. 0.0234 = 2.34 %)
  conversions: number | null;
  cost_per_conversion: number | null;
  conversion_rate: number | null;
  roas: number | null;
  currency: string | null;
  raw_data: Record<string, unknown>;
};

export type ParseResult = {
  platform: Platform;
  rawRowCount: number;
  rows: ParsedAdRow[];
  detectedColumns: Record<string, string>; // mapping normalised -> source column found
  warnings: string[];
};

// =============================================================================
// PUBLIC API
// =============================================================================

export function parseAdCsv(csvText: string): ParseResult {
  // Papa autodetects delimiter, but force header parsing
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false, // we type-coerce ourselves with locale-aware logic
  });

  const headers = result.meta.fields ?? [];
  const platform = detectPlatform(headers);

  // Build a header→canonical map for THIS file
  const map = mapHeaders(headers);

  const rows: ParsedAdRow[] = [];
  const warnings: string[] = [];
  const seenNames = new Set<string>();

  for (const raw of result.data) {
    if (!raw || typeof raw !== "object") continue;
    const adName = pick(raw, map.ad_name) ?? "";
    if (!adName.trim()) continue; // skip totals / empty rows
    // Skip "Total" / "Grand total" rows that ad platforms append
    if (/^total\b|^grand total/i.test(adName)) continue;

    // Dedup : if the same ad_name shows up multiple times (date-split rows),
    // we keep the first occurrence and AGGREGATE metrics on top
    const dedupKey = adName.trim().toLowerCase();
    if (seenNames.has(dedupKey)) {
      // Add metrics into the existing row
      const existing = rows.find(
        (r) => r.ad_name.toLowerCase() === dedupKey
      );
      if (existing) aggregateInto(existing, raw, map);
      continue;
    }
    seenNames.add(dedupKey);

    rows.push({
      ad_name: adName.trim(),
      ad_creative_url: pick(raw, map.ad_creative_url) ?? null,
      campaign: pick(raw, map.campaign) ?? null,
      ad_set: pick(raw, map.ad_set) ?? null,
      impressions: parseInt(pick(raw, map.impressions)),
      reach: parseInt(pick(raw, map.reach)),
      clicks: parseInt(pick(raw, map.clicks)),
      spend: parseNumber(pick(raw, map.spend)),
      cpm: parseNumber(pick(raw, map.cpm)),
      cpc: parseNumber(pick(raw, map.cpc)),
      ctr: parseRatio(pick(raw, map.ctr)),
      conversions: parseInt(pick(raw, map.conversions)),
      cost_per_conversion: parseNumber(pick(raw, map.cost_per_conversion)),
      conversion_rate: parseRatio(pick(raw, map.conversion_rate)),
      roas: parseNumber(pick(raw, map.roas)),
      currency: pick(raw, map.currency) ?? detectCurrencyFromRow(raw),
      raw_data: raw,
    });
  }

  // Recompute derived metrics post-aggregation (CPC, CPM, CTR, conv rate, CPA)
  for (const r of rows) {
    if (r.clicks && r.spend && !r.cpc) r.cpc = r.spend / r.clicks;
    if (r.impressions && r.spend && !r.cpm)
      r.cpm = (r.spend / r.impressions) * 1000;
    if (r.impressions && r.clicks && !r.ctr) r.ctr = r.clicks / r.impressions;
    if (r.clicks && r.conversions && !r.conversion_rate)
      r.conversion_rate = r.conversions / r.clicks;
    if (r.spend && r.conversions && !r.cost_per_conversion)
      r.cost_per_conversion = r.spend / r.conversions;
  }

  if (platform === "unknown") {
    warnings.push(
      "Plateforme non détectée — parsing en best-effort. Vérifie le mapping des colonnes."
    );
  }

  return {
    platform,
    rawRowCount: result.data.length,
    rows,
    detectedColumns: Object.fromEntries(
      Object.entries(map).filter(([, v]) => v !== null) as [string, string][]
    ),
    warnings,
  };
}

// =============================================================================
// Platform detection
// =============================================================================

function detectPlatform(headers: string[]): Platform {
  const hs = headers.map((h) => h.toLowerCase().trim());
  const hasAny = (...needles: string[]) =>
    needles.some((n) => hs.some((h) => h.includes(n)));

  // Meta / Facebook : "ad set name" or "adset", "amount spent", "results"
  if (
    hasAny("ad set name", "adset name", "nom de l'ensemble", "ensemble de pub") ||
    hasAny("amount spent", "montant dépensé") ||
    hasAny("cost per result", "coût par résultat")
  )
    return "meta";

  // TikTok : "ad group name" + "video play" + "thruplay"
  if (
    (hasAny("ad group name", "groupe de publicités") &&
      hasAny("clicks (destination)", "clics (destination)", "video views", "vues de la vidéo")) ||
    hasAny("thruplay", "video play actions")
  )
    return "tiktok";

  // Google : "headline 1" or "ad group" without ad set
  if (
    hasAny("headline 1", "titre 1") ||
    (hasAny("ad group", "groupe d'annonces") &&
      !hasAny("ad set", "ensemble de pub")) ||
    hasAny("avg. cpc", "cpc moy", "ad strength")
  )
    return "google";

  return "unknown";
}

// =============================================================================
// Column mapping — for each canonical field, find the matching CSV header
// =============================================================================

type HeaderMap = {
  ad_name: string | null;
  ad_creative_url: string | null;
  campaign: string | null;
  ad_set: string | null;
  impressions: string | null;
  reach: string | null;
  clicks: string | null;
  spend: string | null;
  cpm: string | null;
  cpc: string | null;
  ctr: string | null;
  conversions: string | null;
  cost_per_conversion: string | null;
  conversion_rate: string | null;
  roas: string | null;
  currency: string | null;
};

const FIELD_ALIASES: Record<keyof HeaderMap, string[]> = {
  ad_name: [
    "ad name",
    "nom de la publicité",
    "nom de la pub",
    "nom de l'annonce",
    "creative name",
    "ad",
  ],
  ad_creative_url: [
    "ad creative url",
    "creative url",
    "image url",
    "video url",
    "permalink",
    "ad link",
    "lien de l'annonce",
  ],
  campaign: ["campaign name", "campaign", "campagne", "nom de la campagne"],
  ad_set: [
    "ad set name",
    "adset name",
    "ad set",
    "adset",
    "ensemble de publicités",
    "nom de l'ensemble",
    "ad group name",
    "ad group",
    "groupe d'annonces",
    "groupe de publicités",
  ],
  impressions: ["impressions"],
  reach: ["reach", "couverture", "portée"],
  clicks: [
    "link clicks",
    "clicks (all)",
    "clicks",
    "clics (tous)",
    "clics sur le lien",
    "clics",
  ],
  spend: [
    "amount spent",
    "amount spent (eur)",
    "amount spent (usd)",
    "montant dépensé",
    "cost",
    "coût",
    "spend",
    "dépenses",
  ],
  cpm: ["cpm (cost per 1,000 impressions)", "cpm", "coût par mille"],
  cpc: [
    "cpc (cost per link click)",
    "cpc",
    "avg. cpc",
    "cpc moyen",
    "cpc moy.",
    "cpc (all)",
    "cpc (tous)",
  ],
  ctr: [
    "ctr (link click-through rate)",
    "ctr (all)",
    "ctr",
    "taux de clic",
    "ctr (tous)",
    "ctr (lien)",
  ],
  conversions: [
    "results",
    "résultats",
    "conversions",
    "purchases",
    "achats",
    "leads",
  ],
  cost_per_conversion: [
    "cost per result",
    "coût par résultat",
    "cost / conv.",
    "cost per conv.",
    "coût par conversion",
    "cpa",
  ],
  conversion_rate: [
    "conversion rate",
    "conv. rate",
    "taux de conversion",
    "conversion rate (lead)",
  ],
  roas: [
    "purchase roas (return on ad spend)",
    "roas",
    "website purchase roas",
    "all conversions value / cost",
    "valeur de conversion / coût",
  ],
  currency: ["currency", "devise"],
};

function mapHeaders(headers: string[]): HeaderMap {
  const lower = headers.map((h) => ({
    raw: h,
    norm: h.toLowerCase().trim().replace(/\s+/g, " "),
  }));
  const find = (aliases: string[]): string | null => {
    for (const a of aliases) {
      const an = a.toLowerCase().trim();
      // Exact match first
      const exact = lower.find((h) => h.norm === an);
      if (exact) return exact.raw;
    }
    for (const a of aliases) {
      const an = a.toLowerCase().trim();
      const partial = lower.find((h) => h.norm.includes(an));
      if (partial) return partial.raw;
    }
    return null;
  };

  const map: Partial<HeaderMap> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
    keyof HeaderMap,
    string[],
  ][]) {
    map[field] = find(aliases);
  }
  return map as HeaderMap;
}

// =============================================================================
// Value parsers — locale-aware (FR uses comma decimals)
// =============================================================================

function pick(
  raw: Record<string, string | undefined>,
  key: string | null
): string | undefined {
  if (!key) return undefined;
  const v = raw[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function parseNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  // Strip currency symbols, spaces, thousands separators
  let s = v.replace(/[€$£¥]/g, "").replace(/\s/g, "").trim();
  // Detect FR format ("1.234,56") vs EN ("1,234.56")
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot > lastComma) {
    // EN : remove thousands "," keep "."
    s = s.replace(/,/g, "");
  } else if (lastComma > lastDot) {
    // FR : remove thousands "." then swap "," -> "."
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Negative parens "(123)" => "-123"
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseInt(v: string | undefined): number | null {
  const n = parseNumber(v);
  if (n === null) return null;
  return Math.round(n);
}

/**
 * Parse a CTR-like ratio. Handles "2.34 %", "0.0234", "2,34 %", "2.34".
 * Returns a 0..1 ratio.
 */
function parseRatio(v: string | undefined): number | null {
  if (v === undefined) return null;
  const isPercentString = /%/.test(v);
  const n = parseNumber(v);
  if (n === null) return null;
  if (isPercentString) return n / 100;
  // Heuristic : if > 1, it was likely "2.34" meaning 2.34 % already
  if (n > 1) return n / 100;
  return n;
}

function detectCurrencyFromRow(raw: Record<string, unknown>): string | null {
  // Look for any value that contains a currency symbol
  for (const v of Object.values(raw)) {
    if (typeof v !== "string") continue;
    if (/€|\beur\b/i.test(v)) return "EUR";
    if (/\$|\busd\b/i.test(v)) return "USD";
    if (/£|\bgbp\b/i.test(v)) return "GBP";
  }
  return null;
}

// =============================================================================
// Aggregation — when the same ad_name appears on multiple date rows
// =============================================================================

function aggregateInto(
  target: ParsedAdRow,
  raw: Record<string, string | undefined>,
  map: HeaderMap
) {
  const sumInto = (field: keyof ParsedAdRow, key: string | null) => {
    const v = parseInt(pick(raw, key));
    if (v !== null) {
      const cur = target[field];
      if (typeof cur === "number") {
        (target as Record<string, unknown>)[field] = cur + v;
      } else {
        (target as Record<string, unknown>)[field] = v;
      }
    }
  };
  const sumNumIn = (field: keyof ParsedAdRow, key: string | null) => {
    const v = parseNumber(pick(raw, key));
    if (v !== null) {
      const cur = target[field];
      if (typeof cur === "number") {
        (target as Record<string, unknown>)[field] = cur + v;
      } else {
        (target as Record<string, unknown>)[field] = v;
      }
    }
  };

  sumInto("impressions", map.impressions);
  sumInto("reach", map.reach);
  sumInto("clicks", map.clicks);
  sumInto("conversions", map.conversions);
  sumNumIn("spend", map.spend);
  // CPC, CPM, CTR, ROAS recomputed at end from totals
}
