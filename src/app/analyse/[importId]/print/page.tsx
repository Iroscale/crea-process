import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AutoPrint from "./auto-print";

/**
 * Print-optimized dashboard for client deliverable.
 * Layout : white background, dark text, no chrome / nav / buttons. Auto-
 * triggers the browser's print dialog on load → user saves as PDF natively.
 *
 * Style strategy : light theme overrides via inline classes, page-break hints
 * with `print:break-before-page` Tailwind utilities.
 */
export default async function PrintDashboardPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: imp } = await supabase
    .from("ad_imports")
    .select(
      "id, name, source_platform, csv_filename, raw_rows, parsed_rows, status, parsed_at, analyzed_at"
    )
    .eq("id", importId)
    .maybeSingle();
  if (!imp) notFound();

  const { data: rows } = await supabase
    .from("ad_rows")
    .select(
      "id, ad_name, campaign, ad_set, spend, ctr, conversions, cost_per_conversion, roas, currency, extracted_angle, extracted_promise, extracted_concept, extracted_render_style, performance_tier"
    )
    .eq("import_id", importId)
    .order("spend", { ascending: false, nullsFirst: false })
    .limit(500);

  const { data: analysis } = await supabase
    .from("ad_analyses")
    .select(
      "winning_angles, winning_promises, winning_concepts, losing_patterns, recommendations, created_at"
    )
    .eq("import_id", importId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const totalSpend = (rows ?? []).reduce((s, r) => s + (r.spend ?? 0), 0);
  const totalConv = (rows ?? []).reduce(
    (s, r) => s + (r.conversions ?? 0),
    0
  );
  const currency = rows?.find((r) => r.currency)?.currency ?? "EUR";
  const cpa = totalConv > 0 ? totalSpend / totalConv : 0;

  // Top 10 ads
  const top10 = (rows ?? [])
    .filter((r) => r.performance_tier === "top")
    .slice(0, 10);

  type WinningAngle = { name: string; appearances_in_top: number; rationale: string };
  type WinningPromise = { promise: string; appearances_in_top: number; rationale: string };
  type WinningConcept = { name: string; render_style: string; appearances_in_top: number; rationale: string };
  type LosingPattern = { pattern: string; rationale: string };
  type Recommendation = { title: string; detail: string };

  const a = (analysis ?? {}) as {
    winning_angles?: WinningAngle[];
    winning_promises?: WinningPromise[];
    winning_concepts?: WinningConcept[];
    losing_patterns?: LosingPattern[];
    recommendations?: Recommendation[];
  };

  return (
    <main
      className="mx-auto max-w-4xl bg-white px-10 py-12 text-neutral-900"
      style={{ fontFamily: "Inter, -apple-system, sans-serif" }}
    >
      <AutoPrint />

      {/* Cover */}
      <header className="border-b-4 border-neutral-900 pb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
          Rapport d&apos;analyse publicitaire
        </div>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-neutral-900">
          {imp.name}
        </h1>
        <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-neutral-700">
          <div>
            <div className="font-semibold uppercase tracking-wider text-neutral-400">
              Plateforme
            </div>
            <div className="mt-0.5">{imp.source_platform.toUpperCase()}</div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-wider text-neutral-400">
              Ads analysées
            </div>
            <div className="mt-0.5">{imp.parsed_rows ?? 0}</div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-wider text-neutral-400">
              Date du rapport
            </div>
            <div className="mt-0.5">
              {new Date().toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Top KPIs */}
      <section className="mt-8 grid grid-cols-4 gap-3">
        <Kpi label="Dépense totale" value={fmtMoney(totalSpend, currency)} />
        <Kpi label="Conversions" value={fmtInt(totalConv)} />
        <Kpi label="CPA moyen" value={fmtMoney(cpa, currency)} />
        <Kpi
          label="Top performers"
          value={`${top10.length} / ${imp.parsed_rows ?? 0}`}
        />
      </section>

      {/* Recommandations en priorité */}
      {(a.recommendations ?? []).length > 0 && (
        <section className="mt-10 rounded-xl border-2 border-emerald-600 bg-emerald-50 p-6">
          <h2 className="text-xl font-bold text-emerald-900">
            ✨ Recommandations actionnables
          </h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {(a.recommendations ?? []).map((r, i) => (
              <li key={i} className="text-sm">
                <div className="font-bold text-emerald-900">
                  {i + 1}. {r.title}
                </div>
                <div className="mt-1 text-neutral-700">{r.detail}</div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Winning angles */}
      {(a.winning_angles ?? []).length > 0 && (
        <section className="mt-8 print:break-before-page">
          <h2 className="text-2xl font-bold text-neutral-900">
            🎯 Angles gagnants
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Les angles marketing qui reviennent le plus souvent dans le top 20%
            des ads.
          </p>
          <div className="mt-4 space-y-2">
            {(a.winning_angles ?? []).map((ang, i) => (
              <Row
                key={i}
                rank={i + 1}
                title={ang.name}
                count={ang.appearances_in_top}
                rationale={ang.rationale}
              />
            ))}
          </div>
        </section>
      )}

      {/* Winning promises */}
      {(a.winning_promises ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-neutral-900">
            💬 Promesses qui résonnent
          </h2>
          <div className="mt-4 space-y-2">
            {(a.winning_promises ?? []).map((p, i) => (
              <Row
                key={i}
                rank={i + 1}
                title={p.promise}
                count={p.appearances_in_top}
                rationale={p.rationale}
              />
            ))}
          </div>
        </section>
      )}

      {/* Winning concepts */}
      {(a.winning_concepts ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-neutral-900">
            🎨 Concepts visuels qui performent
          </h2>
          <div className="mt-4 space-y-2">
            {(a.winning_concepts ?? []).map((c, i) => (
              <Row
                key={i}
                rank={i + 1}
                title={c.name}
                count={c.appearances_in_top}
                rationale={c.rationale}
                tag={c.render_style}
              />
            ))}
          </div>
        </section>
      )}

      {/* Losing patterns */}
      {(a.losing_patterns ?? []).length > 0 && (
        <section className="mt-8 print:break-before-page">
          <h2 className="text-2xl font-bold text-neutral-900">
            ⚠ Patterns à éviter
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Ce qu&apos;on retrouve dans le bottom 20% des performers.
          </p>
          <div className="mt-4 space-y-2">
            {(a.losing_patterns ?? []).map((p, i) => (
              <div
                key={i}
                className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3"
              >
                <div className="text-sm font-bold text-red-900">{p.pattern}</div>
                <div className="mt-1 text-sm text-neutral-700">
                  {p.rationale}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top 10 ads */}
      {top10.length > 0 && (
        <section className="mt-8 print:break-before-page">
          <h2 className="text-2xl font-bold text-neutral-900">
            🏆 Top 10 des publicités
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Triées par dépense (au sein du top 20% par performance).
          </p>
          <table className="mt-4 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-900 text-left">
                <th className="py-2 font-bold uppercase">#</th>
                <th className="py-2 font-bold uppercase">Ad</th>
                <th className="py-2 font-bold uppercase">Angle</th>
                <th className="py-2 text-right font-bold uppercase">Dépense</th>
                <th className="py-2 text-right font-bold uppercase">CTR</th>
                <th className="py-2 text-right font-bold uppercase">CPA</th>
                <th className="py-2 text-right font-bold uppercase">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-b border-neutral-200 align-top"
                >
                  <td className="py-2 font-bold text-emerald-700">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-neutral-900">
                      {r.ad_name}
                    </div>
                    {r.extracted_promise && (
                      <div className="mt-0.5 text-[10px] italic text-neutral-500">
                        « {r.extracted_promise} »
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-neutral-700">
                    {r.extracted_angle ?? "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtMoney(r.spend, r.currency ?? currency)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtPct(r.ctr)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtMoney(r.cost_per_conversion, r.currency ?? currency)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.roas !== null && r.roas !== undefined
                      ? `×${r.roas.toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-12 border-t border-neutral-300 pt-6 text-[10px] text-neutral-500">
        Généré par Crea Process · {new Date().toLocaleDateString("fr-FR")} ·
        Source : {imp.csv_filename ?? "—"}
      </footer>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-300 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-neutral-900">
        {value}
      </div>
    </div>
  );
}

function Row({
  rank,
  title,
  count,
  rationale,
  tag,
}: {
  rank: number;
  title: string;
  count: number;
  rationale: string;
  tag?: string;
}) {
  return (
    <div className="flex items-start gap-4 border-l-4 border-emerald-600 bg-neutral-50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="text-base font-bold text-neutral-900">{title}</div>
          {tag && (
            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-700">
              {tag}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-neutral-700">{rationale}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-2xl font-bold tabular-nums text-emerald-700">
          ×{count}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">
          dans le top
        </div>
      </div>
    </div>
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
