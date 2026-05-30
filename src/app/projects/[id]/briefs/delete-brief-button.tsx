"use client";

import { useTransition } from "react";
import { deleteBrief } from "./actions";

/**
 * Delete a brief with a confirm() dialog. Stops propagation so clicking the
 * button doesn't navigate to the brief page (the parent row is a link).
 * Cascades server-side : messages, inspirations, generations, generated_images
 * all removed via SQL ON DELETE CASCADE + best-effort storage cleanup.
 */
export default function DeleteBriefButton({
  projectId,
  briefId,
  briefTitle,
}: {
  projectId: string;
  briefId: string;
  briefTitle: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const ok = window.confirm(
          `Supprimer le brief "${briefTitle}" ?\n\nToutes les générations, inspirations et messages seront perdus définitivement.`
        );
        if (!ok) return;
        startTransition(() => deleteBrief(projectId, briefId));
      }}
      className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
      title="Supprimer ce brief et toutes ses données"
    >
      {pending ? "⏳" : "🗑 Supprimer"}
    </button>
  );
}
