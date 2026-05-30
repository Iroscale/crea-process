"use client";

import Link from "next/link";
import { useTransition } from "react";
import { clearBriefSelection } from "./selection-actions";

type Props = {
  briefId: string;
  projectId: string;
  selectedCount: number;
  totalCount: number;
};

/**
 * Sticky bar at the top of the brief workspace that summarises the current
 * selection and offers a single primary CTA → Phase 3 (refine workspace).
 *
 * The bulk actions (correct text / legal mentions / 9:16 conversion / export)
 * live on the dedicated /refine page so the user can focus on a small list
 * of winners without the noise of unselected drafts.
 */
export default function SelectionBar({
  briefId,
  projectId,
  selectedCount,
  totalCount,
}: Props) {
  const [pendingClear, startClear] = useTransition();

  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-2 z-40 mx-auto mt-4 flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-card)]/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-primary)] px-2 text-xs font-bold text-[var(--color-primary-foreground)]">
          {selectedCount}
        </span>
        <span className="text-sm">
          <b>{selectedCount}</b>
          <span className="text-[var(--color-muted-foreground)]">
            {" "}
            / {totalCount} ad{totalCount > 1 ? "s" : ""} sélectionnée
            {selectedCount > 1 ? "s" : ""}
          </span>
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={pendingClear}
          onClick={() =>
            startClear(() => clearBriefSelection(briefId, projectId))
          }
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          {pendingClear ? "…" : "✗ Désélectionner"}
        </button>

        <Link
          href={`/projects/${projectId}/briefs/${briefId}/refine`}
          className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-[var(--color-primary-foreground)] transition hover:opacity-90"
        >
          → Phase 3 — Raffiner ({selectedCount})
        </Link>
      </div>
    </div>
  );
}
