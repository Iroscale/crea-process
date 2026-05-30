"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkAutoCorrect,
  bulkApplyLegal,
  bulkGenerate916,
  bulkEmbedLogo,
} from "../refine-actions";

const PROGRESS_POLL_MS = 5_000;
const TOAST_DURATION_MS = 8_000;

type Toast = { kind: "success" | "error"; message: string } | null;

type Props = {
  briefId: string;
  projectId: string;
  masterCount: number;
  corrected: number;
  legaled: number;
  with916: number;
  logoed: number;
  hasBrand: boolean;
};

export default function RefineToolbar({
  briefId,
  projectId,
  masterCount,
  corrected,
  legaled,
  with916,
  logoed,
  hasBrand,
}: Props) {
  const router = useRouter();
  const [pendingCorrect, startCorrect] = useTransition();
  const [pendingLegal, startLegal] = useTransition();
  const [pending916, start916] = useTransition();
  const [pendingLogo, startLogo] = useTransition();
  const [toast, setToast] = useState<Toast>(null);

  const correctRemaining = masterCount - corrected;
  const legalRemaining = masterCount - legaled;
  const remaining916 = masterCount - with916;
  const logoRemaining = masterCount - logoed;
  const anyPending =
    pendingCorrect || pendingLegal || pending916 || pendingLogo;

  // While any bulk action is running, poll the server every 5s to refresh
  // the displayed counters (corrected / legaled / with916 / logoed).
  // Each loop : router.refresh() re-runs the page's server fetch, the
  // toolbar receives updated props, the user sees the count tick down.
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(() => {
      router.refresh();
    }, PROGRESS_POLL_MS);
    return () => clearInterval(id);
  }, [anyPending, router]);

  // Auto-dismiss the toast after a few seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const showSuccess = (msg: string) =>
    setToast({ kind: "success", message: msg });

  return (
    <>
      {/* Toast — completion banner that auto-dismisses after 8s */}
      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-[60] -translate-x-1/2 animate-in fade-in slide-in-from-top rounded-lg border-2 px-4 py-3 text-sm shadow-2xl backdrop-blur ${
            toast.kind === "success"
              ? "border-emerald-400 bg-emerald-500/95 text-black"
              : "border-red-500 bg-red-500/95 text-white"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-semibold">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="rounded-md border border-current px-2 py-0.5 text-[10px] opacity-70 hover:opacity-100"
            >
              ✗
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-2 z-30 mt-6 flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-card)]/95 p-3 shadow-lg backdrop-blur">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        Actions sur la sélection
      </span>
      {anyPending && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)]/15 px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
          Action en cours · refresh auto toutes les 5s
        </span>
      )}

      <ActionButton
        label="✎ Corriger les textes"
        sublabel={
          pendingCorrect
            ? `${corrected}/${masterCount} traitées · live`
            : correctRemaining > 0
            ? `${correctRemaining} restant${correctRemaining > 1 ? "s" : ""}`
            : "tout corrigé"
        }
        running={pendingCorrect}
        runningLabel={`OCR + Gemini · ${corrected}/${masterCount}…`}
        disabled={correctRemaining === 0 || pendingLegal || pending916 || pendingLogo}
        onClick={() => {
          const before = correctRemaining;
          if (
            !confirm(
              `Lancer l'OCR + correction Gemini sur ${before} ad${before > 1 ? "s" : ""} ? (~30s par image, séquentiel — la barre affiche la progression en live).`
            )
          )
            return;
          startCorrect(async () => {
            await bulkAutoCorrect(briefId);
            showSuccess(
              `✎ Auto-correction terminée — ${before} ad${before > 1 ? "s" : ""} traitée${before > 1 ? "s" : ""}`
            );
          });
        }}
      />

      <ActionButton
        label="⚖️ Mentions légales"
        sublabel={
          pendingLegal
            ? `${legaled}/${masterCount} traitées · live`
            : legalRemaining > 0
            ? `${legalRemaining} restant${legalRemaining > 1 ? "s" : ""}`
            : "tout appliqué"
        }
        running={pendingLegal}
        runningLabel={`Application · ${legaled}/${masterCount}…`}
        disabled={legalRemaining === 0 || pendingCorrect || pending916 || pendingLogo}
        onClick={() => {
          const before = legalRemaining;
          if (
            !confirm(
              `Ajouter les mentions légales en bas de ${before} ad${before > 1 ? "s" : ""} ?`
            )
          )
            return;
          startLegal(async () => {
            await bulkApplyLegal(briefId);
            showSuccess(
              `⚖️ Mentions légales appliquées — ${before} ad${before > 1 ? "s" : ""}`
            );
          });
        }}
      />

      <ActionButton
        label="🏷 Intégrer le logo"
        sublabel={
          !hasBrand
            ? "aucune marque"
            : pendingLogo
            ? `${logoed}/${masterCount} traitées · live`
            : logoRemaining > 0
            ? `${logoRemaining} restant${logoRemaining > 1 ? "s" : ""}`
            : "tout intégré"
        }
        running={pendingLogo}
        runningLabel={`Embed Gemini · ${logoed}/${masterCount}…`}
        disabled={
          !hasBrand || logoRemaining === 0 || anyPending
        }
        onClick={() => {
          const before = logoRemaining;
          if (
            !confirm(
              `Intégrer le logo de la marque sur ${before} ad${before > 1 ? "s" : ""} ? (~25s par image, Gemini place le logo discrètement)`
            )
          )
            return;
          startLogo(async () => {
            await bulkEmbedLogo(briefId);
            showSuccess(
              `🏷 Logo intégré — ${before} ad${before > 1 ? "s" : ""}`
            );
          });
        }}
      />

      <ActionButton
        label="📐 Générer les 9:16"
        sublabel={
          pending916
            ? `${with916}/${masterCount} générées · live`
            : remaining916 > 0
            ? `${remaining916} restant${remaining916 > 1 ? "s" : ""}`
            : "tout généré"
        }
        running={pending916}
        runningLabel={`Redesign Gemini · ${with916}/${masterCount}…`}
        disabled={remaining916 === 0 || pendingCorrect || pendingLegal || pendingLogo}
        onClick={() => {
          const before = remaining916;
          if (
            !confirm(
              `Générer la version 9:16 pour ${before} ad${before > 1 ? "s" : ""} ? (~45s par image, redesign Gemini)`
            )
          )
            return;
          start916(async () => {
            await bulkGenerate916(briefId);
            showSuccess(
              `📐 Versions 9:16 générées — ${before} ad${before > 1 ? "s" : ""}`
            );
          });
        }}
      />

      <div className="ml-auto flex items-center gap-2">
        <DownloadButton briefId={briefId} projectId={projectId} count={masterCount} />
        <Link
          href={`/projects/${projectId}/briefs/${briefId}`}
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
        >
          ← Retour
        </Link>
      </div>
    </div>
    </>
  );
}

function DownloadButton({
  briefId,
  projectId,
  count,
}: {
  briefId: string;
  projectId: string;
  count: number;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(
        `/projects/${projectId}/briefs/${briefId}/refine/download`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const msg = await res.text().catch(() => "Erreur inconnue");
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      // Pull filename from Content-Disposition header
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const fname = match?.[1] ?? "export.zip";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span
          className="max-w-[180px] truncate text-[10px] text-red-400"
          title={error}
        >
          ⚠ {error}
        </span>
      )}
      <button
        type="button"
        disabled={downloading || count === 0}
        onClick={handle}
        className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
        title={`Télécharger ${count} ad${count > 1 ? "s" : ""} en ZIP avec leurs variantes 9:16`}
      >
        {downloading
          ? "⏳ Préparation du ZIP…"
          : `↓ Exporter le batch (${count})`}
      </button>
    </div>
  );
}

function ActionButton({
  label,
  sublabel,
  running,
  runningLabel,
  disabled,
  onClick,
}: {
  label: string;
  sublabel: string;
  running: boolean;
  runningLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || running}
      className="flex flex-col items-start rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-left transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-40 disabled:hover:border-[var(--color-border)] disabled:hover:bg-[var(--color-background)]"
    >
      <span className="text-xs font-semibold text-[var(--color-foreground)]">
        {running ? runningLabel : label}
      </span>
      <span className="text-[10px] text-[var(--color-muted-foreground)]">
        {sublabel}
      </span>
    </button>
  );
}
