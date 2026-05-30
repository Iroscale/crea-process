/**
 * Scrape une landing page et synthétise une DA (couleurs, typo, voice, mission,
 * audience, principes, do_say / dont_say) via Claude.
 *
 * Pipeline :
 *   1. fetch HTML avec User-Agent réaliste + timeout 15s
 *   2. cheerio extrait : title, meta, headings, body text, font-families,
 *                        colors inline + dans <style>, og:image / logo / favicon
 *   3. Claude synthétise la DA structurée à partir de tout ça
 *   4. (optionnel) télécharge le logo en bytes pour stockage
 */
import * as cheerio from "cheerio";
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";

export type ScrapedLanding = {
  url: string;
  finalUrl: string; // après redirections
  title: string;
  description: string;
  textBody: string;
  headings: string[];
  fontFamilies: string[];
  colorsHex: string[]; // déduplié, ordre d'apparition
  logoCandidates: string[]; // urls absolues triées par pertinence
  ogImage: string | null;
};

export type ExtractedDA = {
  description?: string;
  brand_voice?: string;
  mission?: string;
  target_audience?: string;
  typography?: string;
  visual_principles?: string;
  primary_colors?: string[];
  do_say?: string[];
  dont_say?: string[];
};

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// =============================================================================
// SCRAPING
// =============================================================================

export async function scrapeLandingPage(rawUrl: string): Promise<ScrapedLanding> {
  let url: URL;
  try {
    url = new URL(
      rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
        ? rawUrl
        : "https://" + rawUrl
    );
  } catch {
    throw new Error(`URL invalide : ${rawUrl}`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") {
      throw new Error(`Timeout après ${FETCH_TIMEOUT_MS / 1000}s sur ${url}`);
    }
    throw new Error(`Échec fetch ${url} : ${(e as Error).message}`);
  }
  clearTimeout(timer);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} sur ${url}`);
  }
  const html = await res.text();
  const finalUrl = res.url;

  return parseHtml(html, finalUrl);
}

function parseHtml(html: string, finalUrl: string): ScrapedLanding {
  const $ = cheerio.load(html);
  const baseUrl = new URL(finalUrl);

  const title = ($("title").first().text() || "").trim();
  const description =
    $('meta[name="description"]').attr("content") ??
    $('meta[property="og:description"]').attr("content") ??
    "";

  // Headings hierarchy — first 30 to give Claude the structure
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const t = $(el).text().trim();
    if (t && headings.length < 30) headings.push(t);
  });

  // Body text — strip scripts / styles / nav / footer chrome to focus on
  // the actual content. Truncated to ~12k chars to stay within Claude's budget.
  $("script, style, noscript, svg, iframe").remove();
  const textBody = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);

  // Fonts : look for font-family in inline styles + <style> blocks
  const fontFamilies = collectFontFamilies($, html);

  // Colors : hex + rgb() in inline styles + <style> blocks + meta theme-color
  const colorsHex = collectColors($, html);

  // Logo candidates : sorted by likelihood (header img, alt~="logo", src~="logo", og:image)
  const logoCandidates = collectLogoCandidates($, baseUrl);
  const ogImage =
    absoluteUrl($('meta[property="og:image"]').attr("content"), baseUrl) ??
    null;

  return {
    url: finalUrl,
    finalUrl,
    title,
    description: description.trim(),
    textBody,
    headings,
    fontFamilies,
    colorsHex,
    logoCandidates,
    ogImage,
  };
}

// =============================================================================
// CSS extractors
// =============================================================================

function collectFontFamilies($: cheerio.CheerioAPI, rawHtml: string): string[] {
  const set = new Set<string>();

  // From inline styles
  $("[style]").each((_, el) => {
    const s = String($(el).attr("style") ?? "");
    extractFonts(s, set);
  });

  // From <style> blocks (cheerio strips them via $ but the rawHtml still has them)
  for (const m of rawHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    extractFonts(m[1], set);
  }

  return Array.from(set).slice(0, 12);
}

function extractFonts(css: string, out: Set<string>) {
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const list = m[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));
    for (const f of list) {
      const cleaned = f.replace(/!important/i, "").trim();
      if (
        cleaned &&
        cleaned.length < 60 &&
        !["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "system-ui"].includes(
          cleaned.toLowerCase()
        )
      ) {
        out.add(cleaned);
      }
    }
  }
}

function collectColors($: cheerio.CheerioAPI, rawHtml: string): string[] {
  const counts = new Map<string, number>();
  const bump = (raw: string) => {
    const hex = normalizeColor(raw);
    if (!hex) return;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };

  // From inline styles
  $("[style]").each((_, el) => {
    const s = String($(el).attr("style") ?? "");
    extractColors(s, bump);
  });

  // From <style> blocks via raw HTML
  for (const m of rawHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    extractColors(m[1], bump);
  }

  // theme-color meta
  const meta = $('meta[name="theme-color"]').attr("content");
  if (meta) bump(meta);

  // Sort by count desc, take top ~10 distinct (filter neutrals if too many)
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)
    .filter((c) => !isLikelyNeutral(c) || counts.size < 10)
    .slice(0, 10);
}

function extractColors(css: string, bump: (raw: string) => void) {
  for (const m of css.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)) {
    bump("#" + m[1]);
  }
  for (const m of css.matchAll(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/g
  )) {
    bump(`rgb(${m[1]},${m[2]},${m[3]})`);
  }
}

function normalizeColor(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  // hex 3
  let m = trimmed.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const [r, g, b] = m[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  // hex 6 (drop alpha if 8)
  m = trimmed.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return "#" + m[1];
  // rgb()
  m = trimmed.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
  if (m) {
    const [, r, g, b] = m;
    return (
      "#" +
      [r, g, b]
        .map((n) => Math.max(0, Math.min(255, parseInt(n, 10))))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return null;
}

function isLikelyNeutral(hex: string): boolean {
  // Pure white, pure black, dead-greys — not interesting for a brand palette
  if (hex === "#000000" || hex === "#ffffff") return true;
  // grayscale near pure
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 6;
}

// =============================================================================
// Logo candidates
// =============================================================================

function collectLogoCandidates(
  $: cheerio.CheerioAPI,
  baseUrl: URL
): string[] {
  const candidates: { url: string; score: number }[] = [];

  $("img").each((_, el) => {
    const src =
      $(el).attr("src") ??
      $(el).attr("data-src") ??
      $(el).attr("data-original");
    if (!src) return;
    const abs = absoluteUrl(src, baseUrl);
    if (!abs) return;

    const alt = String($(el).attr("alt") ?? "").toLowerCase();
    const className = String($(el).attr("class") ?? "").toLowerCase();
    const idAttr = String($(el).attr("id") ?? "").toLowerCase();
    const lowerSrc = abs.toLowerCase();

    let score = 0;
    if (/logo/.test(alt)) score += 10;
    if (/logo/.test(className)) score += 8;
    if (/logo/.test(idAttr)) score += 8;
    if (/logo/.test(lowerSrc)) score += 6;
    // header img tends to be the logo
    if ($(el).parents("header").length > 0) score += 4;
    if ($(el).parents("nav").length > 0) score += 3;
    // skip icons, 16px favicons, etc.
    const w = parseInt($(el).attr("width") ?? "0", 10);
    const h = parseInt($(el).attr("height") ?? "0", 10);
    if ((w > 0 && w < 24) || (h > 0 && h < 24)) score -= 3;

    if (score > 0) candidates.push({ url: abs, score });
  });

  // Add favicons / link rel="icon" as low-priority fallback
  $('link[rel*="icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = absoluteUrl(href, baseUrl);
    if (abs)
      candidates.push({
        url: abs,
        score: /apple-touch/i.test(href) ? 2 : 1,
      });
  });

  return Array.from(
    new Set(
      candidates.sort((a, b) => b.score - a.score).map((c) => c.url)
    )
  ).slice(0, 6);
}

function absoluteUrl(maybeUrl: string | undefined, base: URL): string | null {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

// =============================================================================
// Logo download
// =============================================================================

export async function downloadLogo(
  logoUrl: string
): Promise<{ bytes: Buffer; mime: string; ext: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(logoUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0 || arr.byteLength > 5_000_000) return null; // 5 MB max
    const buf = Buffer.from(arr);
    const mime = detectImageMime(buf, res.headers.get("content-type"));
    const ext = mimeToExt(mime);
    return { bytes: buf, mime, ext };
  } catch {
    return null;
  }
}

function detectImageMime(buf: Buffer, contentType: string | null): string {
  // Magic bytes first (more reliable than Content-Type)
  if (buf.length >= 12) {
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return "image/jpeg";
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
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
      return "image/gif";
  }
  // SVG : check for "<svg" early
  const head = buf.slice(0, 200).toString("utf8").toLowerCase();
  if (head.includes("<svg")) return "image/svg+xml";
  // Fallback to Content-Type
  if (contentType) {
    const ct = contentType.split(";")[0].trim();
    if (ct.startsWith("image/")) return ct;
  }
  return "application/octet-stream";
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

// =============================================================================
// Claude synthesis — produces structured DA from scraped data
// =============================================================================

export async function extractBrandDA(
  scraped: ScrapedLanding
): Promise<ExtractedDA> {
  const client = getAnthropic();

  const SYSTEM = `Tu es un brand analyst expert. On te donne le contenu scrapé d'une landing page d'une marque. Tu produis une synthèse structurée de la DA (direction artistique) et de l'identité de marque, prête à être utilisée pour générer des publicités cohérentes avec cette marque.

CONSIGNES :
- Lis tout le contenu (title, headings, body text, fonts, colors)
- Déduis la mission, l'audience, le tone of voice à partir du COPY effectif
- Pour les couleurs primaires : choisis 2 à 5 hex parmi celles fournies, en gardant celles qui ont le plus d'impact identitaire (couleurs marquées de la marque, pas les noirs/blancs/gris purs neutres)
- Pour la typo : déduis depuis fontFamilies — distingue typo de titre vs typo de body si possible
- Pour visual_principles : un descriptif court "minimal premium, dark mode, generous space, géométrique" — basé sur ce que tu lis et sur les couleurs/typo
- Pour do_say : 5-8 mots / formulations qui reviennent dans le copy de la marque
- Pour dont_say : 4-6 anti-patterns qui contredisent le ton (typiquement de l'urgence factice si la marque est calme, du jargon corporate si elle est accessible, etc.)
- TOUT en français
- Formulations courtes et factuelles — pas de marketing fluff

FORMAT DE SORTIE — JSON STRICT, RIEN D'AUTRE :
{
  "description": "1-2 phrases sur ce que vend la marque",
  "mission": "1-2 phrases sur la mission de la marque",
  "target_audience": "1-2 phrases sur la cible",
  "brand_voice": "1-2 phrases sur le ton",
  "typography": "format 'Tiempos Headline (titres) + Inter (body)' ou similaire",
  "visual_principles": "descriptif court 'minimal premium, dark mode...'",
  "primary_colors": ["#FF0000", "#000000"],
  "do_say": ["mot1", "mot2", "expression"],
  "dont_say": ["mot1", "expression à éviter"]
}`;

  const userPayload = `URL : ${scraped.url}
Title : ${scraped.title}
Meta description : ${scraped.description}

Headings (h1/h2/h3) :
${scraped.headings.map((h) => `- ${h}`).join("\n") || "(aucun)"}

Font-families détectées :
${scraped.fontFamilies.map((f) => `- ${f}`).join("\n") || "(aucune)"}

Couleurs détectées (par ordre d'importance) :
${scraped.colorsHex.map((c) => `- ${c}`).join("\n") || "(aucune)"}

Body text (extrait) :
${scraped.textBody.slice(0, 8_000)}

Produis maintenant la synthèse JSON.`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: userPayload }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: ExtractedDA;
  try {
    parsed = JSON.parse(cleaned) as ExtractedDA;
  } catch {
    throw new Error("Synthèse Claude non-JSON : " + cleaned.slice(0, 300));
  }

  // Validate colors hex format and re-filter
  if (Array.isArray(parsed.primary_colors)) {
    parsed.primary_colors = parsed.primary_colors
      .map((c) => c.trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
  }
  return parsed;
}
