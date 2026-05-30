"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  generate916Variant,
  applyLegalMentions,
  embedLogo,
  autoCorrectImage,
  boostCopyForConversion,
} from "../post-actions";
import { setImageSelection } from "../selection-actions";
import { EditForm, VariantForm } from "../image-actions-panel";
import {
  RENDER_STYLE_LABELS,
  type RenderStyle,
} from "@/lib/brief-schema";

const RENDER_STYLE_PILL_CLASS: Record<RenderStyle, string> = {
  cinematic: "bg-violet-500 text-white",
  ugc: "bg-orange-500 text-black",
  screenshot_social: "bg-sky-500 text-black",
  editorial: "bg-stone-300 text-black",
  comparison_split: "bg-teal-500 text-black",
  data_viz: "bg-indigo-500 text-white",
  meme: "bg-pink-500 text-white",
};

type Variant916 = {
  id: string;
  signed_url: string | null;
  download_url: string | null;
  status: string;
  storage_path: string | null;
};

type MasterImage = {
  id: string;
  storage_path: string | null;
  signed_url: string | null;
  download_url: string | null;
  image_url: string | null;
  model_label: string | null;
  status: string;
  error_message: string | null;
  params: {
    mode?: "full" | "composite";
    angle_name?: string;
    concept_name?: string;
    render_style?: RenderStyle;
    slide?: number;
    carousel?: boolean;
    carousel_role?: "hook" | "insight" | "application";
    auto_corrected?: boolean;
    legal_applied?: boolean;
    logo_embedded?: boolean;
    copy_boosted?: boolean;
    copy_boost_rationale?: string;
  } | null;
  variants: Variant916[];
};

type Props = {
  briefId: string;
  master: MasterImage;
  defaultHeadline: string;
  defaultBody: string;
  defaultCta: string;
};

export default function RefineCard({
  briefId,
  master,
  defaultHeadline,
  defaultBody,
  defaultCta,
}: Props) {
  const [open, setOpen] = useState<null | "edit" | "variant" | "lightbox">(
    null
  );
  const [pending916, start916] = useTransition();
  const [pendingLegal, startLegal] = useTransition();
  const [pendingLogo, startLogo] = useTransition();
  const [pendingAutoCorrect, startAutoCorrect] = useTransition();
  const [pendingBoost, startBoost] = useTransition();
  const [pendingDeselect, startDeselect] = useTransition();

  const displayUrl = master.signed_url ?? master.image_url;
  const angle = master.params?.angle_name;
  const concept = master.params?.concept_name;
  const corrected = !!master.params?.auto_corrected;
  const legaled = !!master.params?.legal_applied;
  const logoed = !!master.params?.logo_embedded;
  const boosted = !!master.params?.copy_boosted;
  const boostRationale = master.params?.copy_boost_rationale ?? null;
  const variant916 = master.variants.find((v) => v.status === "done");
  const has916 = !!variant916;
  const isCarousel = master.params?.carousel === true;
  const slide = master.params?.slide;
  const role = master.params?.carousel_role;
  const renderStyle = master.params?.render_style;
  const roleLabel =
    role === "hook"
      ? "HOOK"
      : role === "insight"
      ? "INSIGHT"
      : role === "application"
      ? "APPLI"
      : null;
  const roleClass =
    role === "hook"
      ? "bg-rose-500 text-white"
      : role === "insight"
      ? "bg-cyan-500 text-black"
      : role === "application"
      ? "bg-emerald-500 text-black"
      : "";

  // The card spans the full grid row when a heavy form is open so the
  // textareas have enough space.
  const isExpanded = open === "edit" || open === "variant";

  return (
    <article
      data-open={isExpanded || undefined}
      className="group flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] data-[open=true]:col-span-full"
    >
      {/* IMAGE — full bleed, with minimal overlays */}
      <div
        className="relative aspect-square w-full cursor-zoom-in bg-[var(--color-background)]"
        onClick={() => setOpen("lightbox")}
      >
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={master.model_label ?? "ad"}
            width={1024}
            height={1024}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-muted-foreground)]">
            Image indisponible
          </div>
        )}

        {/* Top-left — render_style + carousel role + angle/concept badges */}
        <div className="absolute left-1.5 top-1.5 flex flex-wrap items-center gap-1">
          {renderStyle && (
            <span
              className={`rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider ${RENDER_STYLE_PILL_CLASS[renderStyle]}`}
              title={`Style : ${RENDER_STYLE_LABELS[renderStyle]}`}
            >
              {styleShort(renderStyle)}
            </span>
          )}
          {isCarousel && slide && roleLabel && (
            <span
              className={`rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider ${roleClass}`}
              title={`Slide ${slide}/3 du carrousel`}
            >
              {slide}/3·{roleLabel}
            </span>
          )}
          {angle && (
            <span
              className="rounded bg-[var(--color-primary)] px-1 py-px text-[9px] font-bold uppercase text-[var(--color-primary-foreground)]"
              title={`Angle : ${angle}`}
            >
              {truncate(angle, 14)}
            </span>
          )}
          {concept && (
            <span
              className="rounded bg-amber-500 px-1 py-px text-[9px] font-bold uppercase text-black"
              title={`Concept : ${concept}`}
            >
              {truncate(concept, 14)}
            </span>
          )}
        </div>

        {/* Top-right — status dots + deselect */}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1.5 rounded-full bg-black/60 px-1.5 py-1 backdrop-blur">
          <StatusDot
            ok={boosted}
            title={
              boosted && boostRationale
                ? `Copy boosté — ${boostRationale}`
                : "Copy boosté pour la conversion"
            }
            symbol="🚀"
          />
          <StatusDot ok={corrected} title="Texte corrigé" symbol="✎" />
          <StatusDot ok={legaled} title="Mentions légales" symbol="⚖" />
          <StatusDot ok={logoed} title="Logo intégré" symbol="🏷" />
          <StatusDot ok={has916} title="Variante 9:16" symbol="📐" />
          <button
            type="button"
            disabled={pendingDeselect}
            onClick={(ev) => {
              ev.stopPropagation();
              if (!confirm("Retirer cette ad de la sélection ?")) return;
              startDeselect(() =>
                setImageSelection(briefId, master.id, false)
              );
            }}
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] text-white transition hover:bg-red-500 disabled:opacity-50"
            title="Retirer de la sélection"
          >
            ✗
          </button>
        </div>

        {/* Bottom-right — 9:16 floating thumbnail (clickable to open) */}
        {variant916?.signed_url && (
          <a
            href={variant916.signed_url}
            target="_blank"
            rel="noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            className="absolute bottom-1.5 right-1.5 group/thumb flex items-end gap-1 rounded border border-purple-500/60 bg-black/70 p-1 backdrop-blur transition hover:border-purple-400"
            title="Ouvrir la variante 9:16"
          >
            <div className="relative h-12 w-[27px] overflow-hidden rounded-sm bg-black">
              <Image
                src={variant916.signed_url}
                alt="9:16"
                width={54}
                height={96}
                unoptimized
                className="h-full w-full object-cover"
              />
            </div>
            <span className="text-[8px] font-bold uppercase tracking-wider text-purple-300">
              9:16
            </span>
          </a>
        )}
      </div>

      {/* COMPACT ACTION BAR — 6 icon-led buttons. Auto-correct first because
          it's the most frequent gesture in leadgen (kill copy typos). */}
      <div className="flex divide-x divide-[var(--color-border)] border-t border-[var(--color-border)] text-[10px]">
        <ActionBtn
          active={false}
          disabled={
            pendingAutoCorrect ||
            corrected ||
            master.params?.mode === "composite"
          }
          onClick={() => {
            if (master.params?.mode === "composite") {
              alert(
                "Auto-correction inutile pour ce visuel : son texte est posé en overlay (Sharp + SVG), il est déjà pixel-perfect."
              );
              return;
            }
            if (
              !confirm(
                "Auto-corriger le texte de cette image ?\n\nOCR vision Claude → comparaison vs copy attendu → si fautes détectées, Gemini ré-édite l'image avec le bon texte (~30s, 1 appel Gemini)."
              )
            )
              return;
            startAutoCorrect(() => autoCorrectImage(master.id));
          }}
          label={
            pendingAutoCorrect
              ? "Corr…"
              : corrected
              ? "Corr ✓"
              : "Corriger"
          }
          symbol="✨"
        />
        <ActionBtn
          active={open === "edit"}
          onClick={() => setOpen(open === "edit" ? null : "edit")}
          label="Modifier"
          symbol="✎"
        />
        <ActionBtn
          active={false}
          disabled={pendingBoost || boosted}
          onClick={() => {
            if (
              !confirm(
                "Booster le copy pour la conversion ?\n\nClaude réécrit headline + body + CTA en mode CPL-optimisé (Andrometa : hook plus serré, promesse plus spécifique, CTA soft), puis Gemini ré-édite l'image avec le nouveau texte (~30s, 1 appel Sonnet + 1 appel Gemini)."
              )
            )
              return;
            startBoost(() => boostCopyForConversion(master.id));
          }}
          label={pendingBoost ? "Boost…" : boosted ? "Boost ✓" : "Booster"}
          symbol="🚀"
        />
        <ActionBtn
          active={open === "variant"}
          onClick={() => setOpen(open === "variant" ? null : "variant")}
          label="Variante"
          symbol="🎲"
        />
        <ActionBtn
          active={false}
          disabled={pendingLogo || logoed}
          onClick={() => {
            if (
              !confirm(
                "Intégrer le logo de la marque sur cette image ? Gemini va le placer discrètement (~25s). Une marque doit être associée au brief."
              )
            )
              return;
            startLogo(() => embedLogo(master.id));
          }}
          label={pendingLogo ? "Logo…" : logoed ? "Logo ✓" : "Logo"}
          symbol="🏷"
        />
        <ActionBtn
          active={false}
          disabled={pending916 || has916}
          onClick={() => {
            if (
              !confirm(
                "Convertir en 9:16 ? ~30s + 1 appel Gemini supplémentaire."
              )
            )
              return;
            start916(() => generate916Variant(master.id));
          }}
          label={pending916 ? "9:16…" : has916 ? "9:16 ✓" : "9:16"}
          symbol="📐"
        />
        <ActionBtn
          active={false}
          disabled={pendingLegal || legaled}
          onClick={() => {
            if (
              !confirm(
                "Ajouter les mentions légales en bas de l'image ? Cela remplace l'image actuelle."
              )
            )
              return;
            startLegal(() => applyLegalMentions(master.id));
          }}
          label={pendingLegal ? "Légal…" : legaled ? "Légal ✓" : "Légal"}
          symbol="⚖"
        />
      </div>

      {/* BOTTOM TEXT — quick actions: open / download (small, two-line max) */}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[10px]">
        <span
          className="truncate text-[var(--color-muted-foreground)]"
          title={master.model_label ?? ""}
        >
          {master.model_label}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {master.signed_url && (
            <a
              href={master.signed_url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-primary)] hover:underline"
              onClick={(ev) => ev.stopPropagation()}
            >
              Ouvrir
            </a>
          )}
          {master.download_url && (
            <a
              href={master.download_url}
              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
              onClick={(ev) => ev.stopPropagation()}
            >
              ↓
            </a>
          )}
        </div>
      </div>

      {/* EXPANDED FORMS — only shown when open */}
      {open === "edit" && (
        <EditForm
          imageId={master.id}
          briefHeadline={defaultHeadline}
          briefBody={defaultBody}
          briefCta={defaultCta}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "variant" && (
        <VariantForm
          imageId={master.id}
          onClose={() => setOpen(null)}
        />
      )}

      {/* LIGHTBOX — click on image to zoom in for quick visual check */}
      {open === "lightbox" && displayUrl && (
        <Lightbox
          src={displayUrl}
          alt={master.model_label ?? "ad"}
          onClose={() => setOpen(null)}
        />
      )}
    </article>
  );
}

function StatusDot({
  ok,
  title,
  symbol,
}: {
  ok: boolean;
  title: string;
  symbol: string;
}) {
  return (
    <span
      title={`${title}${ok ? " (✓)" : ""}`}
      className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${
        ok ? "bg-emerald-500 text-black" : "bg-white/15 text-white/50"
      }`}
    >
      {ok ? "✓" : symbol}
    </span>
  );
}

function ActionBtn({
  active,
  disabled,
  onClick,
  label,
  symbol,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  symbol: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 py-1.5 transition ${
        active
          ? "bg-[var(--color-accent)] text-[var(--color-foreground)]"
          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      title={label}
    >
      <span aria-hidden>{symbol}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 backdrop-blur"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
      >
        ✗ Fermer (esc)
      </button>
      <div
        className="relative max-h-[88vh] max-w-[88vw]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          width={1080}
          height={1080}
          unoptimized
          className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain"
        />
      </div>
    </div>
  );
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

const RENDER_STYLE_SHORT: Record<RenderStyle, string> = {
  cinematic: "CINE",
  ugc: "UGC",
  screenshot_social: "SCRN",
  editorial: "EDITO",
  comparison_split: "VS",
  data_viz: "DATA",
  meme: "MEME",
};

function styleShort(s: RenderStyle): string {
  return RENDER_STYLE_SHORT[s];
}
