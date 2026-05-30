"use client";

import { useState, useTransition } from "react";

type Props = {
  action: (formData: FormData) => Promise<void> | void;
  initialName: string;
};

export default function RenameForm({ action, initialName }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
      >
        Renommer
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          await action(fd);
          setEditing(false);
        })
      }
      className="mt-1 flex items-center gap-1"
    >
      <input
        name="name"
        value={name}
        autoFocus
        onChange={(ev) => setName(ev.target.value)}
        className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-0.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
      >
        OK
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setName(initialName);
        }}
        className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
      >
        ✗
      </button>
    </form>
  );
}
