/**
 * Helper for loading the optional brand context attached to a brief.
 * Used both by finalizeBrief (Claude system prompt enrichment) and by
 * triggerGeneration (image prompt DA injection) — same source of truth.
 */
import type { createClient } from "./supabase/server";

export type BrandContext = {
  id: string;
  name: string;
  description: string | null;
  mission: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  visual_principles: string | null;
  typography: string | null;
  primary_colors: string[];
  do_say: string[];
  dont_say: string[];
};

export async function loadBrandContextForBrief(
  supabase: Awaited<ReturnType<typeof createClient>>,
  briefId: string
): Promise<BrandContext | null> {
  const { data: brief } = await supabase
    .from("briefs")
    .select("brand_id")
    .eq("id", briefId)
    .maybeSingle();
  if (!brief?.brand_id) return null;
  return loadBrandContext(supabase, brief.brand_id);
}

export async function loadBrandContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string
): Promise<BrandContext | null> {
  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, name, description, mission, target_audience, brand_voice, visual_principles, typography, primary_colors, do_say, dont_say"
    )
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) return null;

  return {
    id: brand.id,
    name: brand.name,
    description: brand.description,
    mission: brand.mission,
    target_audience: brand.target_audience,
    brand_voice: brand.brand_voice,
    visual_principles: brand.visual_principles,
    typography: brand.typography,
    primary_colors: (brand.primary_colors as string[] | null) ?? [],
    do_say: (brand.do_say as string[] | null) ?? [],
    dont_say: (brand.dont_say as string[] | null) ?? [],
  };
}

/**
 * Format the brand context as a French paragraph injected into the
 * system prompt of finalizeBrief. Tells Claude to respect this DA when
 * generating angles, concepts, and visual descriptions.
 */
export function formatBrandForBriefSystemPrompt(b: BrandContext): string {
  const lines: string[] = [];
  lines.push("# 🪪 MARQUE — DA À RESPECTER ABSOLUMENT");
  lines.push(
    `Ce brief est créé pour la marque **${b.name}**. Tous les angles, concepts et descriptions visuelles que tu produis doivent respecter strictement la DA de cette marque ci-dessous.`
  );
  lines.push("");
  if (b.description) lines.push(`**Description** : ${b.description}`);
  if (b.mission) lines.push(`**Mission** : ${b.mission}`);
  if (b.target_audience) lines.push(`**Cible** : ${b.target_audience}`);
  if (b.brand_voice) lines.push(`**Tone of voice** : ${b.brand_voice}`);
  if (b.visual_principles)
    lines.push(`**Principes visuels** : ${b.visual_principles}`);
  if (b.typography) lines.push(`**Typographie** : ${b.typography}`);
  if (b.primary_colors.length > 0)
    lines.push(
      `**Couleurs primaires** : ${b.primary_colors.join(", ")} — utilise ces couleurs précises dans les descriptions de concepts (couleur de typo, accent, scrim, fond, accent du CTA, etc.).`
    );
  if (b.do_say.length > 0)
    lines.push(
      `**À DIRE / formulations bienvenues** : ${b.do_say.join(", ")}`
    );
  if (b.dont_say.length > 0)
    lines.push(
      `**À NE PAS DIRE / anti-patterns** : ${b.dont_say.join(", ")}`
    );
  lines.push("");
  lines.push(
    "Quand tu rempliras `text_overlay.theme.text_color`, `accent_color`, `accent_text_color`, choisis-les EN COHÉRENCE avec les couleurs primaires ci-dessus. Quand tu écriras les `concepts[].description`, mentionne explicitement ces couleurs hex et la typographie. Quand tu écriras les `angles[].headline`, applique le tone of voice et évite les anti-patterns."
  );
  return lines.join("\n");
}

/**
 * Format the brand context as an English block injected at the TOP of the
 * image prompt. Forceful : tells the model that brand colors OVERRIDE any
 * other color mentioned later in the prompt (concept description, theme,
 * style header). This is critical because Claude-generated concept
 * descriptions often mention specific colors that conflict with the brand.
 */
export function formatBrandForImagePrompt(b: BrandContext): string {
  const lines: string[] = [];
  lines.push(
    "══════════════════════════════════════════════════════════════════"
  );
  lines.push(
    `🪪 BRAND IDENTITY — ${b.name.toUpperCase()} (HARD CONSTRAINT, OVERRIDES EVERYTHING BELOW)`
  );
  lines.push(
    "══════════════════════════════════════════════════════════════════"
  );
  if (b.primary_colors.length > 0) {
    lines.push("");
    lines.push(`▸ BRAND PALETTE — ${b.primary_colors.join(" / ")}`);
    lines.push(
      "  These hex values are the ONLY colors allowed in the final visual. They"
    );
    lines.push(
      "  apply to : backgrounds, accent surfaces, typography color, scrim/overlay,"
    );
    lines.push(
      "  CTA pill background, CTA text, lighting tints, glow / particles, gradients."
    );
    lines.push(
      "  If the concept description below mentions a color (e.g. 'cobalt blue',"
    );
    lines.push(
      "  '#1E40AF', 'emerald gradient') that is NOT in this palette, IGNORE that"
    );
    lines.push(
      "  color and substitute the closest brand palette color. The brand palette"
    );
    lines.push("  WINS over any color reference elsewhere in the prompt.");
  }
  lines.push("");
  if (b.typography)
    lines.push(`▸ BRAND TYPOGRAPHY — ${b.typography}`);
  if (b.visual_principles)
    lines.push(`▸ VISUAL PRINCIPLES — ${b.visual_principles}`);
  if (b.brand_voice) lines.push(`▸ BRAND VOICE — ${b.brand_voice}`);
  if (b.do_say.length > 0)
    lines.push(`▸ TONE keywords (welcome) — ${b.do_say.slice(0, 8).join(", ")}`);
  if (b.dont_say.length > 0)
    lines.push(
      `▸ TONE anti-patterns (forbid in copy AND visual mood) — ${b.dont_say.slice(0, 8).join(", ")}`
    );
  lines.push("");
  lines.push(
    "══════════════════════════════════════════════════════════════════"
  );
  return lines.join("\n");
}

/**
 * Pick a (text_color, accent_color, accent_text_color) triplet from the
 * brand's palette to override the brief's text_overlay.theme. Used when the
 * brief was finalized before the brand was associated, so the theme is stale.
 *
 * Heuristic :
 *   - accent_color  : most "vibrant" non-neutral palette color
 *   - text_color    : if the visual is dark, use white-ish ; else use a dark
 *                     color from the palette. Default to white.
 *   - accent_text_color : black if accent is light, white if accent is dark.
 */
export function deriveThemeFromBrand(b: BrandContext): {
  text_color: string;
  accent_color: string;
  accent_text_color: string;
} | null {
  if (b.primary_colors.length === 0) return null;

  const lumaOf = (hex: string): number => {
    const m = hex.match(/^#([0-9a-fA-F]{6})$/);
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const bb = n & 0xff;
    // Rec.709 perceived luminance, normalised
    return (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255;
  };
  const saturationOf = (hex: string): number => {
    const m = hex.match(/^#([0-9a-fA-F]{6})$/);
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 0xff) / 255;
    const g = ((n >> 8) & 0xff) / 255;
    const bb = (n & 0xff) / 255;
    const max = Math.max(r, g, bb);
    const min = Math.min(r, g, bb);
    return max === 0 ? 0 : (max - min) / max;
  };

  // Accent : highest saturation, fallback to first non-neutral
  const ranked = [...b.primary_colors].sort(
    (a, c) => saturationOf(c) - saturationOf(a)
  );
  const accent = ranked[0] ?? "#000000";
  const accent_text = lumaOf(accent) > 0.55 ? "#0A0A0A" : "#FFFFFF";

  // Text color : prefer a light brand color (white-ish) for headlines on
  // typically darker ad backgrounds. Fallback : pure white if none available.
  const candidates = b.primary_colors.filter((c) => c !== accent);
  const light = candidates.find((c) => lumaOf(c) > 0.85);
  const text_color = light ?? "#FFFFFF";

  return { text_color, accent_color: accent, accent_text_color: accent_text };
}
