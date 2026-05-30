"use client";

import { useOptimistic, useTransition } from "react";
import { setImageSelection } from "./selection-actions";

/**
 * A checkbox overlay on top of an image that toggles its `selected` flag.
 * Optimistic update for instant feedback, then syncs to the server.
 */
export default function SelectCheckbox({
  briefId,
  imageId,
  initial,
}: {
  briefId: string;
  imageId: string;
  initial: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    initial,
    (_prev: boolean, next: boolean) => next
  );
  const [, startTransition] = useTransition();

  return (
    <label
      className={`
        absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1.5
        rounded-md border-2 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide
        transition backdrop-blur-sm
        ${
          optimistic
            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "border-white/30 bg-black/40 text-white hover:border-white/60"
        }
      `}
      onClick={(ev) => ev.stopPropagation()}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={optimistic}
        onChange={(ev) => {
          const next = ev.target.checked;
          startTransition(() => {
            setOptimistic(next);
            setImageSelection(briefId, imageId, next).catch(() => {
              // server error — no-op for now, the next render will resync from DB
            });
          });
        }}
      />
      <span
        aria-hidden
        className={`flex h-4 w-4 items-center justify-center rounded-sm border-2 ${
          optimistic
            ? "border-[var(--color-primary-foreground)] bg-[var(--color-primary-foreground)]/20"
            : "border-white/70"
        }`}
      >
        {optimistic && (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <polyline points="4 10 8 14 16 6" />
          </svg>
        )}
      </span>
      {optimistic ? "Sélectionnée" : "Sélectionner"}
    </label>
  );
}
