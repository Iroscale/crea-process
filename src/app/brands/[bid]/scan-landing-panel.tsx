"use client";

import { useTransition, useState } from "react";

type Props = {
  action: (formData: FormData) => Promise<void> | void;
  existingUrl: string | null;
};

export default function ScanLandingPanel({ action, existingUrl }: Props) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(existingUrl ?? "");

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await action(fd);
        })
      }
      className="mt-4 flex flex-col gap-2"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          name="url"
          required
          value={url}
          onChange={(ev) => setUrl(ev.target.value)}
          placeholder="https://www.exemple.com — homepage ou landing produit"
          disabled={pending}
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !url.trim()}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "🔄 Scan en cours… (~15-25s)" : "⚡ Scanner & extraire"}
        </button>
      </div>

      {pending && (
        <div className="rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3 text-xs text-[var(--color-foreground)]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
            <span className="font-semibold">Scan en cours</span>
          </div>
          <ul className="mt-2 ml-4 list-disc space-y-0.5 text-[var(--color-muted-foreground)]">
            <li>Téléchargement du HTML de la landing page</li>
            <li>Extraction des couleurs, typographies, copy, headings</li>
            <li>Recherche du logo + téléchargement</li>
            <li>Synthèse Claude (mission, audience, voice, principes…)</li>
            <li>Mise à jour du brief de marque</li>
          </ul>
        </div>
      )}

      <p className="text-[10px] text-[var(--color-muted-foreground)]">
        💡 Le scan{" "}
        <b>écrase</b> les champs DA (description, mission, voice, etc.) avec
        ceux extraits par Claude. Les couleurs et le do/dont-say sont{" "}
        <b>fusionnés</b> avec ce qui était déjà saisi (déduplication, max 8/12).
        Tu peux ajuster manuellement après.
      </p>
    </form>
  );
}
