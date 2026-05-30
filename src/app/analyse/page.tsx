import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { uploadCsvImport } from "./actions";
import CsvGuide from "./csv-guide";
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

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: imports } = await supabase
    .from("ad_imports")
    .select(
      "id, name, source_platform, csv_filename, raw_rows, parsed_rows, status, error_message, parsed_at, created_at"
    )
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/projects"
            className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            ← Crea Process · Projets
          </Link>
          <h1 className="mt-1 text-3xl font-semibold">Analyse publicitaire</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Upload tes exports CSV de Meta Ads, TikTok Ads ou Google Ads. Le
            système parse automatiquement, identifie les angles / promesses /
            concepts gagnants, et te permet de générer un brief sur la base
            des learnings — varying concepts façon Andrometa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/brands"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]"
          >
            Marques
          </Link>
          <form action={logout}>
            <button className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm hover:bg-[var(--color-accent)]">
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      {/* Upload CSV — form first, always visible */}
      <section className="mt-10 rounded-2xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            ⬆ Importer un CSV de campagne
          </h2>
          <a
            href="#csv-guide"
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            Pas sûr de comment l&apos;exporter ? → mémo détaillé ↓
          </a>
        </div>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Drag &amp; drop ou sélection de ton CSV exporté depuis Meta Ads /
          TikTok Ads / Google Ads. La plateforme est détectée automatiquement.
        </p>

        {params.error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {safeDecode(params.error)}
          </div>
        )}

        <form
          action={uploadCsvImport}
          className="mt-4 grid gap-3 sm:grid-cols-[2fr_2fr_auto] sm:items-end"
        >
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Nom de l&apos;import (optionnel)
            </label>
            <input
              name="name"
              placeholder="Ex : Campagne Hiver 2024 — Meta"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Fichier CSV
            </label>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv,text/plain,application/csv,application/vnd.ms-excel"
              required
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--color-primary-foreground)] hover:file:opacity-90"
            />
          </div>
          <button className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Uploader &amp; parser
          </button>
        </form>
      </section>

      {/* Memo + step-by-step guide */}
      <div id="csv-guide">
        <CsvGuide />
      </div>

      {/* Imports list */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {imports && imports.length > 0
            ? `${imports.length} import${imports.length > 1 ? "s" : ""}`
            : "Aucun import"}
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {imports?.map((imp) => {
            const platform = imp.source_platform ?? "unknown";
            const platformLabel = PLATFORM_LABEL[platform] ?? "Inconnu";
            const badge = PLATFORM_BADGE[platform] ?? PLATFORM_BADGE.unknown;
            return (
              <Link
                key={imp.id}
                href={`/analyse/${imp.id}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge}`}
                    >
                      {platformLabel}
                    </span>
                    <span className="text-base font-semibold">{imp.name}</span>
                    {imp.status === "failed" && (
                      <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">
                        Échec
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {imp.parsed_rows ?? 0} ad
                    {(imp.parsed_rows ?? 0) > 1 ? "s" : ""} parsée
                    {(imp.parsed_rows ?? 0) > 1 ? "s" : ""}
                    {imp.raw_rows && imp.raw_rows !== imp.parsed_rows && (
                      <> sur {imp.raw_rows} lignes brutes</>
                    )}{" "}
                    · {imp.csv_filename ?? "—"}
                  </div>
                  {imp.error_message && (
                    <div className="mt-1 text-[10px] text-red-300">
                      {imp.error_message}
                    </div>
                  )}
                </div>
                <div className="text-right text-[10px] text-[var(--color-muted-foreground)]">
                  {imp.parsed_at
                    ? new Date(imp.parsed_at).toLocaleString("fr-FR")
                    : new Date(imp.created_at).toLocaleString("fr-FR")}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
