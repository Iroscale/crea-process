"use client";

import { useTransition } from "react";
import { reanalyzeInspiration } from "./actions";

/**
 * Re-run vision analysis on an inspiration whose first pass failed (e.g.
 * uploaded BEFORE the sharp downscale was added → Claude rejected with
 * 5 MB cap). One click and the existing storage object gets re-analyzed.
 */
export default function ReanalyzeInspirationButton({
  briefId,
  inspirationId,
}: {
  briefId: string;
  inspirationId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        startTransition(() => reanalyzeInspiration(briefId, inspirationId));
      }}
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
      title="Relancer l'analyse vision sur cette image"
    >
      {pending ? "⏳ Analyse…" : "🔄 Re-analyser"}
    </button>
  );
}
