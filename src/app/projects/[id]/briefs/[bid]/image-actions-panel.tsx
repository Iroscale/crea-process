"use client";

import { useEffect, useState, useTransition } from "react";
import {
  editImageText,
  generate916Variant,
  applyLegalMentions,
  extractImageText,
  regenerateVariant,
  type ExtractedImageText,
} from "./post-actions";

type Props = {
  imageId: string;
  defaultHeadline: string;
  defaultBody: string;
  defaultCta: string;
};

export default function ImageActionsPanel({
  imageId,
  defaultHeadline,
  defaultBody,
  defaultCta,
}: Props) {
  const [open, setOpen] = useState<null | "edit" | "variant">(null);
  const [pending916, start916] = useTransition();
  const [pendingLegal, startLegal] = useTransition();

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="flex divide-x divide-[var(--color-border)] text-[10px]">
        <button
          onClick={() => setOpen(open === "edit" ? null : "edit")}
          className={`flex-1 py-1.5 transition hover:bg-[var(--color-accent)] ${
            open === "edit"
              ? "bg-[var(--color-accent)] text-[var(--color-foreground)]"
              : "text-[var(--color-muted-foreground)]"
          }`}
        >
          ✎ Modifier
        </button>
        <button
          onClick={() => setOpen(open === "variant" ? null : "variant")}
          className={`flex-1 py-1.5 transition hover:bg-[var(--color-accent)] ${
            open === "variant"
              ? "bg-[var(--color-accent)] text-[var(--color-foreground)]"
              : "text-[var(--color-muted-foreground)]"
          }`}
        >
          🎲 Variante
        </button>
        <button
          disabled={pending916}
          onClick={() => {
            if (
              !confirm(
                "Convertir en 9:16 ? ~30s + 1 appel Gemini supplémentaire."
              )
            )
              return;
            start916(() => generate916Variant(imageId));
          }}
          className="flex-1 py-1.5 text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          {pending916 ? "Génération…" : "📐 9:16"}
        </button>
        <button
          disabled={pendingLegal}
          onClick={() => {
            if (
              !confirm(
                "Ajouter les mentions légales en bas de l'image ? Cela remplace l'image actuelle."
              )
            )
              return;
            startLegal(() => applyLegalMentions(imageId));
          }}
          className="flex-1 py-1.5 text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          {pendingLegal ? "Application…" : "⚖️ Légales"}
        </button>
      </div>

      {open === "edit" && (
        <EditForm
          imageId={imageId}
          briefHeadline={defaultHeadline}
          briefBody={defaultBody}
          briefCta={defaultCta}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "variant" && (
        <VariantForm
          imageId={imageId}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

export function EditForm({
  imageId,
  briefHeadline,
  briefBody,
  briefCta,
  onClose,
}: {
  imageId: string;
  briefHeadline: string;
  briefBody: string;
  briefCta: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [extracted, setExtracted] = useState<ExtractedImageText | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Read the actual text rendered in the image when the form opens
  useEffect(() => {
    let cancelled = false;
    extractImageText(imageId)
      .then((r) => {
        if (!cancelled) setExtracted(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setExtractError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  if (!extracted && !extractError) {
    return (
      <div className="border-t border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs text-[var(--color-muted-foreground)]">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[var(--color-primary)]" />
          📖 Lecture du texte dans l&apos;image (vision Claude)…
        </div>
      </div>
    );
  }

  if (extractError) {
    return (
      <div className="border-t border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs text-red-400">
        Erreur OCR : {extractError}
      </div>
    );
  }

  const e = extracted!;

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await editImageText(imageId, fd);
          onClose();
        });
      }}
      className="flex flex-col gap-3 border-t border-[var(--color-border)] bg-[var(--color-background)] p-3"
    >
      <p className="text-[10px] text-[var(--color-muted-foreground)]">
        Texte lu dans l&apos;image (avec ses fautes éventuelles). Corrige
        directement les fautes — Gemini va recevoir l&apos;image + tes
        corrections et reproduire le visuel avec le bon texte. Tu peux aussi
        donner des indications pour modifier le visuel lui-même (en bas).
      </p>

      <PairField
        label="Headline"
        name="headline"
        actual={e.headline}
        intended={briefHeadline}
      />
      <PairField
        label="Body"
        name="body"
        actual={e.body}
        intended={briefBody}
      />
      <PairField
        label="CTA"
        name="cta"
        actual={e.cta}
        intended={briefCta}
      />

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Autres textes (labels, mentions, vertices…)
        </label>
        <textarea
          name="additional_corrections"
          rows={3}
          defaultValue={e.additional_text}
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
      </div>

      {/* NEW — visual modifications */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Indications visuelles (optionnel)
        </label>
        <textarea
          name="visual_instructions"
          rows={3}
          placeholder="Exemples : 'remplace le coffre par un bouclier en acier brossé', 'éclairage plus chaud type golden hour', 'ajoute un fond bokeh légèrement plus sombre', 'supprime l'élément en haut à droite'…"
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--color-muted-foreground)]/60"
        />
        <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
          Si vide → seul le texte sera modifié. Si rempli → Gemini va aussi
          appliquer les changements visuels en gardant l&apos;identité de
          marque.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[var(--color-border)] px-3 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-[10px] font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Régénération… (~25s)" : "Appliquer"}
        </button>
      </div>
    </form>
  );
}

export function VariantForm({
  imageId,
  onClose,
}: {
  imageId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [hint, setHint] = useState("");

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <p className="text-[10px] text-[var(--color-muted-foreground)]">
        Génère une <b>variante</b> de cette image — même angle, même concept,
        même copy, mais une autre interprétation visuelle (autre cadrage,
        autre lumière, autre composition). La variante apparaîtra à côté de
        l&apos;originale dans le grid.
      </p>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Indication libre (optionnel)
        </label>
        <textarea
          rows={3}
          value={hint}
          onChange={(ev) => setHint(ev.target.value)}
          placeholder="Exemples : 'plus minimaliste', 'avec une personne au centre', 'lumière plus dramatique', 'vue de dessus', 'dans un environnement extérieur'… Laisse vide pour une variante au hasard."
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--color-muted-foreground)]/60"
        />
        <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
          Vide = autre interprétation libre. Rempli = variante dirigée selon
          ton indication.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[var(--color-border)] px-3 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await regenerateVariant(imageId, hint.trim() || undefined);
              onClose();
            });
          }}
          className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-[10px] font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {pending
            ? "Génération… (~30s)"
            : hint.trim()
            ? "Lancer variante dirigée"
            : "Lancer variante libre"}
        </button>
      </div>
    </div>
  );
}

/**
 * A field that shows the actual text from the image (editable) and
 * proposes the brief's intended text as a quick-fill button below.
 */
function PairField({
  label,
  name,
  actual,
  intended,
}: {
  label: string;
  name: string;
  actual: string;
  intended: string;
}) {
  const [value, setValue] = useState(actual);
  const showSuggestion =
    intended && intended.trim() && intended.trim() !== actual.trim();
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <input
        name={name}
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
      />
      {showSuggestion && (
        <button
          type="button"
          onClick={() => setValue(intended)}
          className="mt-1 text-[10px] text-[var(--color-primary)] hover:underline"
        >
          ↳ Proposer le texte du brief : « {intended} »
        </button>
      )}
    </div>
  );
}
