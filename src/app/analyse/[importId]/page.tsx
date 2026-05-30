import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteImport, renameImport } from "../actions";
import RenameForm from "./rename-form";
import RunAnalysisButton from "./run-analysis-button";
import SeedBriefModal from "./seed-brief-modal";
import { safeDecode } from "@/lib/safe-decode";

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
  unknown: "Inconnu",
};
const PLATFORM_BADGE: Record<string, string> = {
  meta: "bg-blue-500/15 text-blue-300",
  tiktok: "bg-pink-500/15 text-pink-300",
  google: "bg-amber-500/15 text-amber-300",
  unknown: "bg-[var(--color-background)] text-[var(--color-muted-foreground)]",
};

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<{ sort?: string; dir?: string; error?: string }>;
}) {
  const { importId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: imp } = await supabase
    .from("ad_imports")
    .select(
      "id, name, source_platform, csv_filename, raw_rows, parsed_rows, status, error_message, detected_columns, parsed_at, created_at, campaign_structure, meta_objective, analyst_note"
    )
    .eq("id", importId)
    .maybeSingle();
  if (!imp) notFound();

  const sort = (sp.sort ?? "spend") as
    | "ad_name"
    | "spend"
    | "impressions"
    | "clicks"
    | "ctr"
    | "cpc"
    | "conversions"
    | "cost_per_conversion"
    | "roas";
  const dir = (sp.dir ?? "desc") as "asc" | "desc";

  const { data: rows } = await supabase
    .from("ad_rows")
    .select(
      "id, ad_name, ad_creative_url, campaign, ad_set, impressions, reach, clicks, spend, cpm, cpc, ctr, conversions, cost_per_conversion, conversion_rate, roas, currency, extracted_angle, extracted_promise, extracted_concept, extracted_render_style, performance_tier"
    )
    .eq("import_id", importId)
    .order(sort, { ascending: dir === "asc", nullsFirst: false })
    .limit(500);

  // Load the analysis (synthesis) if it exists
  const { data: analysis } = await supabase
    .from("ad_analyses")
    .select(
      "winning_angles, winning_promises, winning_concepts, losing_patterns, recommendations, created_at"
    )
    .eq("import_id", importId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Projects + brands for the "Seed brief" modal
  const [{ data: projectsList }, { data: brandsList }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name")
      .order("updated_at", { ascending: false }),
    supabase
      .from("brands")
      .select("id, name")
      .order("updated_at", { ascending: false }),
  ]);

  const platform = imp.source_platform ?? "unknown";
  const platformLabel = PLATFORM_LABEL[platform] ?? "Inconnu";
  const badge = PLATFORM_BADGE[platform] ?? PLATFORM_BADGE.unknown;

  // Aggregates
  const totalSpend = (rows ?? []).reduce((s, r) => s + (r.spend ?? 0), 0);
  const totalImpressions = (rows ?? []).reduce(
    (s, r) => s + (r.impressions ?? 0),
    0
  );
  const totalConversions = (rows ?? []).reduce(
    (s, r) => s + (r.conversions ?? 0),
    0
  );
  const currency =
    rows?.find((r) => r.currency)?.currency ?? "EUR";
  const overallCtr =
    totalImpressions > 0
      ? (rows ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0) /
        totalImpressions
      : 0;
  const overallCpa =
    totalConversions > 0 ? totalSpend / totalConversions : 0;

  const detectedCols = (imp.detected_columns ?? {}) as Record<string, string>;

  const renameAction = renameImport.bind(null, importId);
  const deleteAction = deleteImport.bind(null, importId);

  return (
    <main className="mx-auto min-h-screen max-w-[100rem] px-6 py-12">
      <Link
        href="/analyse"
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Analyses
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge}`}
            >
              {platformLabel}
            </span>
            <h1 className="text-3xl font-semibold">{imp.name}</h1>
          </div>
          <RenameForm action={renameAction} initialName={imp.name} />
          <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {imp.parsed_rows ?? 0} ads parsées
            {imp.raw_rows && imp.raw_rows !== imp.parsed_rows && (
              <> · {imp.raw_rows} lignes brutes</>
            )}{" "}
            · {imp.csv_filename}
          </div>
        </div>
        <form action={deleteAction}>
          <button
            type="submit"
            className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          >
            Supprimer l&apos;import
          </button>
        </form>
      </div>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {safeDecode(sp.error)}
        </div>
      )}

      {/* KPIs */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Dépense totale" value={fmtMoney(totalSpend, currency)} />
        <Kpi label="Impressions" value={fmtInt(totalImpressions)} />
        <Kpi label="Conversions" value={fmtInt(totalConversions)} />
        <Kpi
          label="CTR moyen · CPA moyen"
          value={`${fmtPct(overallCtr)} · ${fmtMoney(overallCpa, currency)}`}
        />
      </section>

      {/* Run analysis button + status */}
      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-4">
        <div>
          <h3 className="text-sm font-semibold">
            🧠 Analyse IA — patterns gagnants en CPL
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-[var(--color-muted-foreground)]">
            <b>Étape 1 — Analyse</b> : Claude lit chaque ad (copy uniquement,
            pas de vision), extrait <b>angle / promesse / concept / render
            style</b>, classe en tiers selon le <b>CPL</b> (objectif primaire
            leadgen — plus bas = mieux), et synthétise les patterns récurrents
            dans le top 20% vs bottom 20%.
            <br />
            <span className="text-emerald-300">
              ✓ Étape 2 — Variantes
            </span>{" "}
            (séparée) : une fois l&apos;analyse validée, le bouton{" "}
            <i>« Créer un brief depuis ces learnings »</i> génère un nouveau
            brief avec les angles gagnants reconduits + concepts variés
            (Andrometa).
          </p>
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
            Modèle : <b>Haiku 4.5</b> en batch 10 ads/call (extraction) +{" "}
            <b>Sonnet 4.6</b> (synthèse). ~10× moins cher que la version
            précédente.
          </p>
          {imp.status === "analyzed" && analysis?.created_at && (
            <p className="mt-1 text-[10px] text-emerald-300">
              ✓ Dernière analyse :{" "}
              {new Date(analysis.created_at).toLocaleString("fr-FR")}
            </p>
          )}
          {/* Display the persisted context so the user knows what frame the
              analysis was done with (and can verify before re-running). */}
          {imp.campaign_structure && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <span
                className={`rounded px-1.5 py-0.5 font-bold uppercase tracking-wider ${
                  imp.campaign_structure === "testing"
                    ? "bg-amber-500/15 text-amber-300"
                    : imp.campaign_structure === "scaling"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : imp.campaign_structure === "mixed"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-[var(--color-background)] text-[var(--color-muted-foreground)]"
                }`}
                title="Structure de campagne"
              >
                {imp.campaign_structure === "testing"
                  ? "CBO TESTING"
                  : imp.campaign_structure === "scaling"
                  ? "CBO SCALING"
                  : imp.campaign_structure === "mixed"
                  ? "MIXED"
                  : "UNKNOWN"}
              </span>
              {imp.meta_objective && (
                <span
                  className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[var(--color-muted-foreground)]"
                  title="Objectif Meta"
                >
                  {imp.meta_objective.replace(/_/g, " ")}
                </span>
              )}
              {imp.analyst_note && (
                <span
                  className="line-clamp-1 max-w-md italic text-[var(--color-muted-foreground)]"
                  title={imp.analyst_note}
                >
                  💬 {imp.analyst_note}
                </span>
              )}
            </div>
          )}
          {imp.status === "failed" && imp.error_message && (
            <p className="mt-1 text-[10px] text-red-300">
              ✗ Échec : {imp.error_message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {imp.status === "analyzed" && analysis && (
            <>
              <a
                href={`/analyse/${importId}/print`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-accent)]"
                title="Ouvre la vue rapport et déclenche l'impression — sauvegarde en PDF depuis le dialog du navigateur."
              >
                📄 Exporter le rapport (PDF)
              </a>
              <SeedBriefModal
                importId={importId}
                importName={imp.name}
                projects={(projectsList ?? []).map((p) => ({
                  id: p.id,
                  name: p.name,
                }))}
                brands={(brandsList ?? []).map((b) => ({
                  id: b.id,
                  name: b.name,
                }))}
                hasAnalysis={!!analysis}
              />
            </>
          )}
          <RunAnalysisButton
            importId={importId}
            parsedRows={imp.parsed_rows ?? 0}
            status={imp.status}
            initialCampaignStructure={imp.campaign_structure}
            initialMetaObjective={imp.meta_objective}
            initialAnalystNote={imp.analyst_note}
          />
        </div>
      </section>

      {/* Synthesis — winning patterns */}
      {analysis && (
        <SynthesisDisplay analysis={analysis} />
      )}

      {/* Detected columns */}
      {Object.keys(detectedCols).length > 0 && (
        <details className="mt-6 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs">
          <summary className="cursor-pointer list-none text-[var(--color-muted-foreground)]">
            Colonnes détectées dans le CSV ({Object.keys(detectedCols).length}{" "}
            mappées)
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {Object.entries(detectedCols).map(([norm, src]) => (
              <div key={norm}>
                <span className="text-[var(--color-muted-foreground)]">
                  {norm}
                </span>{" "}
                ← <span className="text-[var(--color-foreground)]">{src}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Table */}
      <section className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-card)]">
            <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="px-3 py-2 text-center font-semibold">Tier</th>
              <Th
                href={`/analyse/${importId}?sort=ad_name&dir=${sort === "ad_name" && dir === "asc" ? "desc" : "asc"}`}
                active={sort === "ad_name"}
                dir={dir}
              >
                Ad
              </Th>
              <th className="px-3 py-2 text-left font-semibold">Angle</th>
              <th className="px-3 py-2 text-left font-semibold">Concept</th>
              <Th
                href={`/analyse/${importId}?sort=spend&dir=${sort === "spend" && dir === "desc" ? "asc" : "desc"}`}
                active={sort === "spend"}
                dir={dir}
                align="right"
              >
                Dépense
              </Th>
              <Th
                href={`/analyse/${importId}?sort=impressions&dir=${sort === "impressions" && dir === "desc" ? "asc" : "desc"}`}
                active={sort === "impressions"}
                dir={dir}
                align="right"
              >
                Impressions
              </Th>
              <Th
                href={`/analyse/${importId}?sort=clicks&dir=${sort === "clicks" && dir === "desc" ? "asc" : "desc"}`}
                active={sort === "clicks"}
                dir={dir}
                align="right"
              >
                Clics
              </Th>
              <Th
                href={`/analyse/${importId}?sort=ctr&dir=${sort === "ctr" && dir === "desc" ? "asc" : "desc"}`}
                active={sort === "ctr"}
                dir={dir}
                align="right"
              >
                CTR
              </Th>
              <Th
                href={`/analyse/${importId}?sort=cpc&dir=${sort === "cpc" && dir === "asc" ? "desc" : "asc"}`}
                active={sort === "cpc"}
                dir={dir}
                align="right"
              >
                CPC
              </Th>
              <Th
                href={`/analyse/${importId}?sort=conversions&dir=${sort === "conversions" && dir === "desc" ? "asc" : "desc"}`}
                active={sort === "conversions"}
                dir={dir}
                align="right"
              >
                Conv.
              </Th>
              <Th
                href={`/analyse/${importId}?sort=cost_per_conversion&dir=${sort === "cost_per_conversion" && dir === "asc" ? "desc" : "asc"}`}
                active={sort === "cost_per_conversion"}
                dir={dir}
                align="right"
              >
                CPA
              </Th>
              <Th
                href={`/analyse/${importId}?sort=roas&dir=${sort === "roas" && dir === "desc" ? "asc" : "desc"}`}
                active={sort === "roas"}
                dir={dir}
                align="right"
              >
                ROAS
              </Th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-background)]/50"
              >
                <td className="px-2 py-2 text-center align-top">
                  <TierBadge tier={r.performance_tier} />
                </td>
                <td className="max-w-[24rem] px-3 py-2 align-top">
                  <div className="truncate font-medium text-[var(--color-foreground)]">
                    {r.ad_name}
                  </div>
                  <div className="truncate text-[10px] text-[var(--color-muted-foreground)]">
                    {[r.campaign, r.ad_set].filter(Boolean).join(" / ")}
                  </div>
                  {r.extracted_promise && (
                    <div
                      className="mt-1 line-clamp-2 text-[10px] italic text-[var(--color-muted-foreground)]/80"
                      title={r.extracted_promise}
                    >
                      « {r.extracted_promise} »
                    </div>
                  )}
                </td>
                <td className="max-w-[12rem] px-3 py-2 align-top text-xs">
                  {r.extracted_angle ? (
                    <span className="rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                      {r.extracted_angle}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted-foreground)]">—</span>
                  )}
                </td>
                <td className="max-w-[14rem] px-3 py-2 align-top text-xs">
                  {r.extracted_concept ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate text-[var(--color-foreground)]">
                        {r.extracted_concept}
                      </span>
                      {r.extracted_render_style && (
                        <span className="self-start rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
                          {r.extracted_render_style}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--color-muted-foreground)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(r.spend, r.currency ?? currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtInt(r.impressions)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtInt(r.clicks)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtPct(r.ctr)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(r.cpc, r.currency ?? currency, 2)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtInt(r.conversions)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(r.cost_per_conversion, r.currency ?? currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.roas !== null && r.roas !== undefined
                    ? `×${r.roas.toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!rows || rows.length === 0) && (
          <div className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Aucune ad parsée — vérifie que le CSV contient bien des colonnes
            « Ad name » et au moins quelques métriques.
          </div>
        )}
      </section>
    </main>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Th({
  href,
  active,
  dir,
  align = "left",
  children,
}: {
  href: string;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th className={`px-3 py-2 text-${align} font-semibold`}>
      <Link
        href={href}
        className={`inline-flex items-center gap-0.5 hover:text-[var(--color-foreground)] ${
          active ? "text-[var(--color-primary)]" : ""
        }`}
      >
        {children}
        {active && (
          <span className="text-[8px]">{dir === "asc" ? "▲" : "▼"}</span>
        )}
      </Link>
    </th>
  );
}

function fmtMoney(
  v: number | null | undefined,
  currency: string,
  digits = 0
): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency}`;
  }
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(v);
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) {
    return (
      <span className="text-[var(--color-muted-foreground)]/40">—</span>
    );
  }
  const map: Record<string, string> = {
    top: "bg-emerald-500 text-black",
    mid: "bg-[var(--color-card)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]",
    bottom: "bg-red-500/80 text-white",
  };
  const cls = map[tier] ?? map.mid;
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}
    >
      {tier === "top" ? "TOP" : tier === "bottom" ? "BAS" : "MID"}
    </span>
  );
}

// =============================================================================
// Synthesis display
// =============================================================================

type SynthesisAnalysis = {
  winning_angles: { name: string; appearances_in_top: number; rationale: string }[] | null;
  winning_promises: { promise: string; appearances_in_top: number; rationale: string }[] | null;
  winning_concepts: { name: string; render_style: string; appearances_in_top: number; rationale: string }[] | null;
  losing_patterns: { pattern: string; rationale: string }[] | null;
  recommendations: { title: string; detail: string }[] | null;
};

function SynthesisDisplay({ analysis }: { analysis: SynthesisAnalysis }) {
  const wAngles = analysis.winning_angles ?? [];
  const wPromises = analysis.winning_promises ?? [];
  const wConcepts = analysis.winning_concepts ?? [];
  const lPatterns = analysis.losing_patterns ?? [];
  const recs = analysis.recommendations ?? [];

  return (
    <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Patterns gagnants vs perdants</h2>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          synthèse Claude
        </span>
      </div>

      {/* Winning angles + promises + concepts */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <SynthList
          title="🎯 Angles gagnants"
          tone="primary"
          items={wAngles.map((a) => ({
            label: a.name,
            count: a.appearances_in_top,
            detail: a.rationale,
          }))}
        />
        <SynthList
          title="💬 Promesses qui résonnent"
          tone="primary"
          items={wPromises.map((p) => ({
            label: p.promise,
            count: p.appearances_in_top,
            detail: p.rationale,
          }))}
        />
        <SynthList
          title="🎨 Concepts qui performent"
          tone="primary"
          items={wConcepts.map((c) => ({
            label: c.name,
            count: c.appearances_in_top,
            badge: c.render_style,
            detail: c.rationale,
          }))}
        />
      </div>

      {/* Losing patterns */}
      {lPatterns.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-red-300">
            ⚠ Patterns perdants
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {lPatterns.map((p, i) => (
              <div
                key={i}
                className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs"
              >
                <div className="font-semibold text-red-200">{p.pattern}</div>
                <div className="mt-1 text-[var(--color-muted-foreground)]">
                  {p.rationale}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-emerald-300">
            ✨ Recommandations actionnables
          </h3>
          <ol className="mt-2 grid gap-2 sm:grid-cols-2">
            {recs.map((r, i) => (
              <li
                key={i}
                className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs"
              >
                <div className="font-semibold text-emerald-200">
                  {i + 1}. {r.title}
                </div>
                <div className="mt-1 text-[var(--color-foreground)]/90">
                  {r.detail}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function SynthList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "primary" | "warning";
  items: { label: string; count: number; badge?: string; detail: string }[];
}) {
  const cls =
    tone === "primary"
      ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5"
      : "border-amber-500/30 bg-amber-500/5";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs italic text-[var(--color-muted-foreground)]">
          Aucun pattern identifié
        </p>
      ) : (
        <ul className="mt-3 space-y-3 text-xs">
          {items.slice(0, 5).map((it, i) => (
            <li
              key={i}
              className="border-b border-[var(--color-border)]/50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[var(--color-foreground)]">
                    {it.label}
                  </div>
                  {it.badge && (
                    <span className="mt-0.5 inline-block rounded bg-[var(--color-card)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                      {it.badge}
                    </span>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-primary-foreground)]">
                  ×{it.count}
                </span>
              </div>
              <div className="mt-1 text-[var(--color-muted-foreground)]">
                {it.detail}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
