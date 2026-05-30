"use client";

import Image from "next/image";
import { useTransition, useState, useRef } from "react";
import {
  addLogo,
  setDefaultLogo,
  deleteLogo,
  updateLogoLabel,
} from "./actions";

export type LogoEntry = {
  id: string;
  label: string | null;
  storage_path: string;
  mime_type: string | null;
  is_default: boolean;
  signed_url: string | null;
};

type Props = {
  brandId: string;
  logos: LogoEntry[];
};

export default function LogoManager({ brandId, logos }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [draftLabel, setDraftLabel] = useState("");

  return (
    <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Logos de la marque{" "}
          <span className="ml-1 text-xs font-normal text-[var(--color-muted-foreground)]">
            ({logos.length})
          </span>
        </h2>
        <span className="text-[10px] text-[var(--color-muted-foreground)]">
          PNG / JPEG / WebP / SVG / GIF — max 5 MB
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        Ajoute toutes les variantes de logo (couleur / monochrome / carré /
        wordmark…). Tu choisiras laquelle embed dans chaque visuel au moment
        de créer le brief. Le logo marqué <b>Défaut</b> est utilisé partout où
        rien n&apos;est précisé.
      </p>

      {/* Upload form */}
      <form
        action={(fd) =>
          startTransition(async () => {
            await addLogo(brandId, fd);
            setDraftLabel("");
            if (fileInputRef.current) fileInputRef.current.value = "";
          })
        }
        className="mt-4 flex flex-col gap-2 rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Fichier logo
          </label>
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            required
            disabled={pending}
            className="mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--color-primary-foreground)] hover:file:opacity-90"
          />
        </div>
        <div className="sm:w-56">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Label (optionnel)
          </label>
          <input
            name="label"
            value={draftLabel}
            onChange={(ev) => setDraftLabel(ev.target.value)}
            placeholder="Ex : Couleur, Monochrome, Carré, Wordmark"
            disabled={pending}
            className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Upload…" : "Ajouter"}
        </button>
      </form>

      {/* Grid of logos */}
      {logos.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted-foreground)]">
          Aucun logo. Scanne une landing page (panel violet en haut) ou upload
          un fichier ci-dessus.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {logos.map((l) => (
            <LogoCard key={l.id} brandId={brandId} logo={l} />
          ))}
        </div>
      )}
    </section>
  );
}

function LogoCard({
  brandId,
  logo,
}: {
  brandId: string;
  logo: LogoEntry;
}) {
  const [pending, start] = useTransition();
  const [editingLabel, setEditingLabel] = useState(false);
  const [bgDark, setBgDark] = useState(false);
  const [labelDraft, setLabelDraft] = useState(logo.label ?? "");

  const isSvg = logo.mime_type === "image/svg+xml";

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-lg border-2 transition ${
        logo.is_default
          ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30"
          : "border-[var(--color-border)] hover:border-white/30"
      }`}
    >
      {/* Preview area — toggleable bg to test the logo on light AND dark */}
      <div
        className={`relative flex h-32 items-center justify-center p-4 transition ${
          bgDark ? "bg-black" : "bg-white"
        }`}
      >
        {logo.signed_url ? (
          isSvg ? (
            // Use plain <img> for SVG — Next/Image rasterizes which loses the
            // crispness for vector logos.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo.signed_url}
              alt={logo.label ?? "logo"}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <Image
              src={logo.signed_url}
              alt={logo.label ?? "logo"}
              width={240}
              height={120}
              unoptimized
              className="max-h-full max-w-full object-contain"
            />
          )
        ) : (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Indisponible
          </span>
        )}

        {/* Light/Dark bg toggle */}
        <button
          type="button"
          onClick={() => setBgDark((b) => !b)}
          title={bgDark ? "Tester sur fond clair" : "Tester sur fond foncé"}
          className="absolute right-1 top-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/80 px-1.5 py-0.5 text-[10px] text-[var(--color-foreground)] opacity-0 backdrop-blur transition group-hover:opacity-100"
        >
          {bgDark ? "☀" : "☾"}
        </button>

        {logo.is_default && (
          <span className="absolute left-2 top-2 rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--color-primary-foreground)]">
            Défaut
          </span>
        )}
      </div>

      {/* Label + actions */}
      <div className="flex flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-card)] p-2 text-xs">
        {editingLabel ? (
          <form
            action={(fd) =>
              start(async () => {
                await updateLogoLabel(brandId, logo.id, fd);
                setEditingLabel(false);
              })
            }
            className="flex gap-1"
          >
            <input
              name="label"
              value={labelDraft}
              autoFocus
              onChange={(ev) => setLabelDraft(ev.target.value)}
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
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
                setEditingLabel(false);
                setLabelDraft(logo.label ?? "");
              }}
              className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              ✗
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingLabel(true);
              setLabelDraft(logo.label ?? "");
            }}
            className="text-left text-[var(--color-foreground)] hover:underline"
            title="Cliquer pour renommer"
          >
            {logo.label || <span className="italic text-[var(--color-muted-foreground)]">Sans label</span>}
          </button>
        )}

        <div className="flex items-center justify-between gap-2 text-[10px]">
          {!logo.is_default ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => setDefaultLogo(brandId, logo.id))}
              className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
            >
              Définir par défaut
            </button>
          ) : (
            <span className="text-[var(--color-muted-foreground)]">
              Logo par défaut
            </span>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Supprimer "${logo.label ?? "ce logo"}" ?`)) return;
              start(() => deleteLogo(brandId, logo.id));
            }}
            className="rounded-md border border-red-500/30 px-2 py-0.5 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
