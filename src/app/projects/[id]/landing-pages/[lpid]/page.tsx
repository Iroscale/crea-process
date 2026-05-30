import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeDecode } from "@/lib/safe-decode";
import {
  generateLandingPageContent,
  updateLandingPageMeta,
  enhanceLandingPageDesign,
} from "../actions";
import {
  TEMPLATES,
  type TemplateId,
  type LandingPageContent,
  type LandingPageBrief,
} from "@/lib/landing-page-schema";
import type { DesignDirectives } from "@/lib/landing-page-design-schema";
import LandingPageChat from "./landing-page-chat";
import LandingPagePreview from "./landing-page-preview";
import SubmitButton from "../../briefs/[bid]/submit-button";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  generating: "Génération en cours…",
  ready: "Prêt",
  published: "Publié",
  archived: "Archivé",
};

export default async function LandingPageDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lpid: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, lpid } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lp } = await supabase
    .from("landing_pages")
    .select(
      "id, project_id, title, template_id, status, region, brand_id, user_input, brief, content_a, content_b, design_directives, updated_at"
    )
    .eq("id", lpid)
    .maybeSingle();
  if (!lp || lp.project_id !== id) notFound();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const { data: messages } = await supabase
    .from("landing_page_messages")
    .select("id, role, content, created_at")
    .eq("landing_page_id", lpid)
    .order("created_at", { ascending: true });

  const tmpl = TEMPLATES[lp.template_id as TemplateId];
  const brief = (lp.brief ?? null) as LandingPageBrief | null;
  const contentA = (lp.content_a ?? null) as LandingPageContent | null;
  const contentB = (lp.content_b ?? null) as LandingPageContent | null;
  const directives = (lp.design_directives ?? null) as DesignDirectives | null;

  const generateAction = generateLandingPageContent.bind(null, id, lpid);
  const updateMetaAction = updateLandingPageMeta.bind(null, id, lpid);
  const enhanceAction = enhanceLandingPageDesign.bind(null, id, lpid);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
      <Link
        href={`/projects/${id}/landing-pages`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Landing pages
      </Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">
            {lp.title || "LP sans titre"}
          </h1>
          <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            <span className="rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--color-primary)]">
              {tmpl.label}
            </span>{" "}
            • {STATUS_LABELS[lp.status] ?? lp.status} • Région :{" "}
            {lp.region ?? "international"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {brief && (
            <>
              <form action={enhanceAction}>
                <SubmitButton
                  pendingLabel="🎨 Designer audit (~30-60s)…"
                  className={`rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    directives
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      : "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20"
                  }`}
                >
                  {directives
                    ? "🔄 Re-auditer design / CRO"
                    : "🎨 Optimiser CRO + design premium"}
                </SubmitButton>
              </form>
              <a
                href={`/api/landing-pages/${lpid}/export`}
                download
                className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/20"
                title="Télécharger un ZIP avec version_A.html, version_B.html, spec.json, README"
              >
                📥 Exporter (ZIP)
              </a>
            </>
          )}
          <form action={generateAction}>
            <SubmitButton
              pendingLabel="⏳ Claude rédige (60-120s)…"
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {brief ? "🔄 Régénérer" : "✨ Générer la LP"}
            </SubmitButton>
          </form>
        </div>
      </div>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {safeDecode(sp.error)}
        </div>
      )}

      {/* Brief court éditable */}
      <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Brief utilisateur
        </h2>
        <form action={updateMetaAction} className="mt-3 flex flex-col gap-3">
          <input
            name="title"
            defaultValue={lp.title ?? ""}
            placeholder="Titre LP"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <textarea
            name="user_input"
            rows={3}
            defaultValue={lp.user_input ?? ""}
            placeholder="Brief court — objectif, audience, offre"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <div className="flex justify-end">
            <button className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-xs hover:bg-white/5">
              Enregistrer
            </button>
          </div>
        </form>
      </section>

      {/* Brief stratégique généré + Preview A/B */}
      {!brief ? (
        <section className="mt-8 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Aucun contenu généré. Clique sur <b>« ✨ Générer la LP »</b> en haut
            pour produire le brief stratégique + 2 versions A/B.
          </p>
        </section>
      ) : (
        <>
          {/* Brief stratégique */}
          <section className="mt-8 rounded-2xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-6">
            <h2 className="text-lg font-semibold">
              ✨ Brief stratégique (synthèse Claude)
            </h2>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <BriefBlock label="Produit" value={brief.product} />
              <BriefBlock label="Cible" value={brief.audience} />
              <BriefBlock label="Objectif" value={brief.objective} />
              <BriefBlock label="Hook angle" value={brief.hook_angle} />
              <BriefBlock label="Promesse" value={brief.promise} />
              <BriefBlock
                label="CTA destination"
                value={brief.cta_destination}
              />
              <div className="sm:col-span-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                  Proof points
                </div>
                <ul className="mt-1 space-y-1 text-xs">
                  {brief.proof_points.map((p, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--color-primary)]" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Design directives — if the agent designer has run */}
          {directives && (
            <section className="mt-8 rounded-2xl border-2 border-fuchsia-500/30 bg-[var(--color-card)] p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  🎨 Audit design + CRO (Claude designer)
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-fuchsia-300">
                  Lift estimé : {directives.expected_lift}
                </span>
              </div>
              <p className="mt-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-sm italic text-fuchsia-200">
                « {directives.rationale} »
              </p>
              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                <DirBlock label="Typo">
                  Display : <b>{directives.typography.display}</b>
                  <br />
                  Body : <b>{directives.typography.body}</b>
                  <br />
                  Échelle : <b>{directives.typography.scale}</b>
                </DirBlock>
                <DirBlock label="Palette">
                  <span
                    className="mr-1 inline-block h-3 w-3 rounded"
                    style={{ background: directives.palette.primary }}
                  />
                  Primary {directives.palette.primary}
                  <br />
                  <span
                    className="mr-1 inline-block h-3 w-3 rounded"
                    style={{ background: directives.palette.accent }}
                  />
                  Accent {directives.palette.accent}
                  <br />
                  Bg : <b>{directives.palette.bg}</b>
                </DirBlock>
                <DirBlock label="Personnalité">
                  <b>{directives.visual_personality}</b>
                  <br />
                  Densité : <b>{directives.density}</b>
                </DirBlock>
                <DirBlock label="CRO — Form">
                  Stratégie : <b>{directives.cro.form_optimization}</b>
                  <br />
                  Above-fold : <b>{directives.cro.above_fold_priority}</b>
                  <br />
                  Trust cluster :{" "}
                  <b>{directives.cro.trust_cluster_near_cta ? "✓" : "—"}</b>
                </DirBlock>
                <DirBlock label="CRO — Sticky">
                  CTA mobile :{" "}
                  <b>{directives.cro.sticky_cta_mobile ? "✓" : "—"}</b>
                  <br />
                  Header : <b>{directives.cro.sticky_header ? "✓" : "—"}</b>
                  <br />
                  Counter anim :{" "}
                  <b>{directives.cro.counter_animation ? "✓" : "—"}</b>
                </DirBlock>
                <DirBlock label="Urgence / Modal">
                  Urgency :{" "}
                  <b>
                    {directives.cro.urgency_marker?.enabled
                      ? `« ${directives.cro.urgency_marker.text} »`
                      : "—"}
                  </b>
                  <br />
                  Exit intent :{" "}
                  <b>
                    {directives.cro.exit_intent_modal?.enabled ? "✓" : "—"}
                  </b>
                </DirBlock>
              </div>
            </section>
          )}

          {/* Preview A/B */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold">
              🅰 / 🅱 Preview des deux versions
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Les sections en commun (problème, features, comparator, FAQ…)
              sont identiques. Seuls le hero + le CTA final changent — méthode
              80/20 d&apos;agence pour isoler la variable testée.
              {directives
                ? " Toggle « Premium » pour voir le rendu avec les directives design + CRO appliquées."
                : ""}
            </p>
            {contentA && contentB && (
              <LandingPagePreview
                contentA={contentA}
                contentB={contentB}
                directives={directives}
              />
            )}
          </section>

          {/* Chat refine */}
          <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <h2 className="text-lg font-semibold">💬 Affiner via chat</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Exemples : « renforce le hook A vers la peur de manquer », « ajoute
              une FAQ sur la fiscalité », « les 2 hooks sont trop proches,
              oppose-les plus », « change la 3e ligne du comparator ».
            </p>
            <LandingPageChat
              projectId={id}
              lpId={lpid}
              initialMessages={messages ?? []}
              hasContent={!!brief}
            />
          </section>
        </>
      )}
    </main>
  );
}

function BriefBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function DirBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">
        {label}
      </div>
      <div className="mt-1.5 leading-relaxed">{children}</div>
    </div>
  );
}
