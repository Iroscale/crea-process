"use client";

import Image from "next/image";
import { useTransition } from "react";
import { setBriefBrand } from "./actions";

export type BrandOption = {
  id: string;
  name: string;
  description: string | null;
  primary_colors: string[];
  defaultLogoSignedUrl: string | null;
  defaultLogoIsSvg: boolean;
};

type Props = {
  briefId: string;
  brands: BrandOption[];
  currentBrandId: string | null;
};

export default function BrandPicker({
  briefId,
  brands,
  currentBrandId,
}: Props) {
  const [pending, start] = useTransition();
  const current = brands.find((b) => b.id === currentBrandId) ?? null;

  return (
    <section className="mt-6 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          {current?.defaultLogoSignedUrl ? (
            <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border)] bg-white p-1.5">
              {current.defaultLogoIsSvg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.defaultLogoSignedUrl}
                  alt="logo"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <Image
                  src={current.defaultLogoSignedUrl}
                  alt="logo"
                  width={80}
                  height={48}
                  unoptimized
                  className="max-h-full max-w-full object-contain"
                />
              )}
            </div>
          ) : (
            <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-background)] text-[10px] text-[var(--color-muted-foreground)]">
              {current ? "Pas de logo" : "Aucune"}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Marque
            </div>
            <div className="mt-0.5 text-sm font-semibold">
              {current ? (
                current.name
              ) : (
                <span className="text-[var(--color-muted-foreground)]">
                  Aucune marque associée
                </span>
              )}
            </div>
            {current?.description && (
              <div className="line-clamp-1 text-[10px] text-[var(--color-muted-foreground)]">
                {current.description}
              </div>
            )}
            {current && current.primary_colors.length > 0 && (
              <div className="mt-1 flex items-center gap-1">
                {current.primary_colors.slice(0, 5).map((c, i) => (
                  <span
                    key={i}
                    className="h-3 w-3 rounded-full border border-[var(--color-border)]"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={currentBrandId ?? ""}
            disabled={pending || brands.length === 0}
            onChange={(ev) => {
              const next = ev.target.value || null;
              start(() => setBriefBrand(briefId, next));
            }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
          >
            <option value="">— Aucune marque —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {brands.length === 0 && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href="/brands"
              className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
            >
              Créer une marque →
            </a>
          )}
          {brands.length > 0 && current && (
            <a
              href={`/brands/${current.id}`}
              className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
              title="Éditer la DA de cette marque"
            >
              Éditer →
            </a>
          )}
        </div>
      </div>

      <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">
        💡 Quand une marque est associée, sa DA (couleurs, typo, voice,
        do/dont-say) est injectée à <b>chaque finalisation du brief</b> ET à{" "}
        <b>chaque génération d&apos;image</b>. Les visuels respecteront les
        couleurs primaires et le ton.
      </p>
    </section>
  );
}
