"use client";

import { useTransition } from "react";
import { deleteResource } from "./actions";

export default function DeleteResourceButton({
  brandId,
  resourceId,
}: {
  brandId: string;
  resourceId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm("Supprimer cette ressource ?")) return;
        start(() => deleteResource(brandId, resourceId));
      }}
      className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
      title="Supprimer cette ressource"
    >
      {pending ? "…" : "✗"}
    </button>
  );
}
