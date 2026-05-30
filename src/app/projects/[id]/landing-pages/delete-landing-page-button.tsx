"use client";

import { useTransition } from "react";
import { deleteLandingPage } from "./actions";

export default function DeleteLandingPageButton({
  projectId,
  lpId,
  title,
}: {
  projectId: string;
  lpId: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (
          window.confirm(
            `Supprimer la landing page "${title}" ?\n\nLe brief, les versions A/B, et l'historique du chat seront perdus.`
          )
        ) {
          startTransition(() => deleteLandingPage(projectId, lpId));
        }
      }}
      className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
      title="Supprimer cette LP"
    >
      {pending ? "⏳" : "🗑 Supprimer"}
    </button>
  );
}
