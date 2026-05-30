"use client";

import { useTransition } from "react";
import { deleteInspiration } from "./actions";

export default function DeleteInspirationButton({
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
        startTransition(() => deleteInspiration(briefId, inspirationId));
      }}
      className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
    >
      {pending ? "…" : "✕"}
    </button>
  );
}
