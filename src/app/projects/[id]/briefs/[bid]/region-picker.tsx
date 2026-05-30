"use client";

import { useTransition } from "react";
import { setBriefRegion } from "./actions";
import { REGIONS_GROUPS, REGIONS } from "@/lib/regions";

type Props = {
  briefId: string;
  currentRegion: string | null;
};

export default function RegionPicker({ briefId, currentRegion }: Props) {
  const [pending, start] = useTransition();
  const region = currentRegion ?? "international";
  const current = REGIONS[region as keyof typeof REGIONS] ?? REGIONS.international;
  const isLocalised = region !== "international";

  return (
    <section
      className={`mt-3 rounded-xl border-2 p-4 ${
        isLocalised
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-[var(--color-border)] bg-[var(--color-card)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-background)] text-lg">
            🌍
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Ciblage géographique
            </div>
            <div className="mt-0.5 text-sm font-semibold">
              {current.label}
            </div>
            {isLocalised && current.adjectives.people.length > 0 && (
              <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                Démonymes : {current.adjectives.people.join(", ")}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto">
          <select
            value={region}
            disabled={pending}
            onChange={(ev) => {
              const next = ev.target.value;
              start(() => setBriefRegion(briefId, next));
            }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
          >
            {REGIONS_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {isLocalised && (
        <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">
          💡 Les angles, copy et descriptions visuelles seront localisés à la
          région sélectionnée. Les concepts visuels intégreront des landmarks
          (
          {current.landmarks.slice(0, 3).join(", ")}
          {current.landmarks.length > 3 ? "…" : ""}) et l&apos;architecture
          locale ; certains headlines pourront utiliser{" "}
          {current.adjectives.people[0]
            ? `« ${current.adjectives.people[0]} »`
            : "les démonymes"}
          .
        </p>
      )}
    </section>
  );
}
