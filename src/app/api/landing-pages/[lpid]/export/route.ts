import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { renderLandingPageHtml } from "@/app/projects/[id]/landing-pages/[lpid]/render-landing-page-html";
import { renderPremiumLandingPageHtml } from "@/app/projects/[id]/landing-pages/[lpid]/render-premium-html";
import {
  TEMPLATES,
  type LandingPageBrief,
  type LandingPageContent,
  type TemplateId,
} from "@/lib/landing-page-schema";
import type { DesignDirectives } from "@/lib/landing-page-design-schema";

/**
 * GET /api/landing-pages/[lpid]/export
 *
 * Returns a ZIP package ready to hand to a developer or to import into
 * Unbounce. Contents :
 *   - version_A.html      (production-mode HTML, both Tailwind CDN + fonts)
 *   - version_B.html
 *   - spec.json           (brief + raw structured content for cross-reference)
 *   - README.md           (handoff notes for the dev / Unbounce import)
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ lpid: string }> }
) {
  const { lpid } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: lp, error } = await supabase
    .from("landing_pages")
    .select(
      "id, project_id, user_id, title, template_id, region, brand_id, brief, content_a, content_b, design_directives, updated_at"
    )
    .eq("id", lpid)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!lp || lp.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!lp.brief || !lp.content_a || !lp.content_b) {
    return NextResponse.json(
      {
        error:
          "La LP n'a pas encore été générée. Clique sur « ✨ Générer la LP » avant d'exporter.",
      },
      { status: 400 }
    );
  }

  const templateId = lp.template_id as TemplateId;
  const tmpl = TEMPLATES[templateId];
  const brief = lp.brief as LandingPageBrief;
  const contentA = lp.content_a as LandingPageContent;
  const contentB = lp.content_b as LandingPageContent;
  const directives = (lp.design_directives ?? null) as DesignDirectives | null;

  const htmlA = renderLandingPageHtml(contentA, "A", "production");
  const htmlB = renderLandingPageHtml(contentB, "B", "production");
  const htmlPremiumA = directives
    ? renderPremiumLandingPageHtml(contentA, directives, "A", "production")
    : null;
  const htmlPremiumB = directives
    ? renderPremiumLandingPageHtml(contentB, directives, "B", "production")
    : null;

  const readme = buildReadme({
    title: lp.title || "Landing page",
    template: tmpl.label,
    templateId,
    region: lp.region ?? "international",
    updatedAt: lp.updated_at as string,
    brief,
    contentA,
    contentB,
    directives,
  });

  const spec = {
    title: lp.title || null,
    template_id: templateId,
    region: lp.region,
    brand_id: lp.brand_id,
    updated_at: lp.updated_at,
    brief,
    content_a: contentA,
    content_b: contentB,
    design_directives: directives,
  };

  const zip = new JSZip();
  zip.file("README.md", readme);
  zip.file("version_A.html", htmlA);
  zip.file("version_B.html", htmlB);
  if (htmlPremiumA) zip.file("version_A.premium.html", htmlPremiumA);
  if (htmlPremiumB) zip.file("version_B.premium.html", htmlPremiumB);
  zip.file("spec.json", JSON.stringify(spec, null, 2));

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const filename = `lp-${slug(lp.title || "untitled")}-${Date.now()}.zip`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "lp";
}

function buildReadme(args: {
  title: string;
  template: string;
  templateId: TemplateId;
  region: string;
  updatedAt: string;
  brief: LandingPageBrief;
  contentA: LandingPageContent;
  contentB: LandingPageContent;
  directives: DesignDirectives | null;
}): string {
  const updated = new Date(args.updatedAt).toLocaleString("fr-FR");
  const heroA = args.contentA.hero;
  const heroB = args.contentB.hero;
  const ctaA = args.contentA.cta_final;
  const ctaB = args.contentB.cta_final;

  return `# ${args.title}

Landing page Meta Ads finance — exportée le ${updated}.

## Spécification

| Champ | Valeur |
|---|---|
| **Template** | ${args.template} (\`${args.templateId}\`) |
| **Région cible** | ${args.region} |
| **Produit** | ${args.brief.product} |
| **Cible** | ${args.brief.audience} |
| **Objectif** | ${args.brief.objective} |
| **Hook angle** | ${args.brief.hook_angle} |
| **Promesse** | ${args.brief.promise} |
| **CTA destination** | ${args.brief.cta_destination} |

## Proof points

${args.brief.proof_points.map((p) => `- ${p}`).join("\n")}

## A/B test — 80/20 agency style

Seuls le **hero** et le **CTA final** varient entre les deux versions. Le reste
des sections (problème, features, social proof, comparator, FAQ, etc.) est
**identique** : c'est ce qui isole la variable testée et permet d'attribuer
proprement les performances.

### Hero — Version A
- **Headline** : ${heroA.headline}
- **Sub** : ${heroA.sub}
- **CTA** : ${heroA.form?.cta.label ?? heroA.cta?.label ?? "—"}

### Hero — Version B
- **Headline** : ${heroB.headline}
- **Sub** : ${heroB.sub}
- **CTA** : ${heroB.form?.cta.label ?? heroB.cta?.label ?? "—"}

### CTA final — Version A
- **Headline** : ${ctaA.headline}
- **Sub** : ${ctaA.sub}
- **Bouton** : ${ctaA.cta.label}

### CTA final — Version B
- **Headline** : ${ctaB.headline}
- **Sub** : ${ctaB.sub}
- **Bouton** : ${ctaB.cta.label}

## Fichiers

| Fichier | Description |
|---|---|
| \`version_A.html\` | Landing page version A — rendu standard |
| \`version_B.html\` | Landing page version B — rendu standard |
${
  args.directives
    ? `| \`version_A.premium.html\` | Version A avec **design + CRO premium** (typography custom, sticky CTA, animations, urgency, etc.) — recommandé pour la prod |
| \`version_B.premium.html\` | Version B avec design + CRO premium |
`
    : ""
}| \`spec.json\` | Brief + contenu structuré + design_directives (utile pour back-office, traduction, intégration CMS) |
| \`README.md\` | Ce fichier |${
      args.directives
        ? `

## Audit design + CRO

> ${args.directives.rationale}

**Lift estimé** : ${args.directives.expected_lift}

| Levier | Choix |
|---|---|
| Typo display | ${args.directives.typography.display} |
| Typo body | ${args.directives.typography.body} |
| Échelle | ${args.directives.typography.scale} |
| Personnalité | ${args.directives.visual_personality} |
| Densité | ${args.directives.density} |
| Sticky CTA mobile | ${args.directives.cro.sticky_cta_mobile ? "✓" : "—"} |
| Sticky header | ${args.directives.cro.sticky_header ? "✓" : "—"} |
| Above-fold priority | ${args.directives.cro.above_fold_priority} |
| Form optimization | ${args.directives.cro.form_optimization} |
| Trust cluster near CTA | ${args.directives.cro.trust_cluster_near_cta ? "✓" : "—"} |
| Counter animations | ${args.directives.cro.counter_animation ? "✓" : "—"} |
| Reveal on scroll | ${args.directives.animations.reveal_on_scroll ? "✓" : "—"} |
| Urgency marker | ${args.directives.cro.urgency_marker?.enabled ? `« ${args.directives.cro.urgency_marker.text} »` : "—"} |
| Exit-intent modal | ${args.directives.cro.exit_intent_modal?.enabled ? "✓" : "—"} |`
        : ""
    }

## Notes pour le développeur

- Les deux fichiers HTML embarquent Tailwind via CDN (\`https://cdn.tailwindcss.com\`). Pour la prod, **compile Tailwind localement** (rechercher \`cdn.tailwindcss.com\` et remplacer par le CSS compilé) afin d'éviter le 50 KB+ de runtime JIT côté client.
- Polices : Inter + Source Serif 4 chargées depuis Google Fonts. Self-host pour de meilleures perfs.
- Le **hero contient un placeholder visuel** (gradient + texte d'instruction). Remplace par le vrai visuel du brief (\`spec.json/content_a/hero/visual_hint\` est le prompt qu'on passe à Gemini en interne).
- **Formulaire** : les champs sont rendus mais sans target / handler. Branche-les sur ton ESP / CRM.
- **Mentions légales** dans le footer : adapte-les à ta réalité réglementaire.
- Le \`<html data-variant="A|B">\` permet de wirer un tracking variant côté GA / Plausible.

## Notes pour l'import Unbounce (à venir)

L'import direct via API Unbounce sera fait depuis Crea Process une fois la
clé API configurée. En attendant, tu peux :

1. Créer un nouveau projet Unbounce avec un page builder
2. Copier-coller chaque section depuis \`spec.json\` (champ par champ) ou depuis le HTML
3. Ou utiliser l'option "Import HTML" d'Unbounce et déposer \`version_A.html\` / \`version_B.html\` directement
4. Configurer la rotation A/B dans Unbounce (50/50 par défaut)
`;
}
