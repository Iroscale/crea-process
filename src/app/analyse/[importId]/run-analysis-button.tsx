"use client";

import { useState, useTransition } from "react";
import { runAnalysis } from "../actions";

type Props = {
  importId: string;
  parsedRows: number;
  status: string;
  // Pre-fill with previously stored context for re-runs
  initialCampaignStructure?: string | null;
  initialMetaObjective?: string | null;
  initialAnalystNote?: string | null;
};

export default function RunAnalysisButton({
  importId,
  parsedRows,
  status,
  initialCampaignStructure,
  initialMetaObjective,
  initialAnalystNote,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [campaignStructure, setCampaignStructure] = useState(
    initialCampaignStructure || "testing"
  );
  const [metaObjective, setMetaObjective] = useState(
    initialMetaObjective || "lead_form"
  );
  const [analystNote, setAnalystNote] = useState(initialAnalystNote || "");

  const isAnalyzing = status === "analyzing" || pending;
  const isAnalyzed = status === "analyzed";

  const batches = Math.ceil(parsedRows / 10);
  const estSec = Math.max(15, Math.ceil(batches * 4));
  const estCost = (parsedRows * 0.0015 + 0.05).toFixed(2);

  return (
    <>
      <button
        type="button"
        disabled={isAnalyzing || parsedRows === 0}
        onClick={() => setOpen(true)}
        className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isAnalyzing
          ? "🧠 Analyse en cours…"
          : isAnalyzed
          ? "🔄 Re-lancer l'analyse"
          : `🧠 Lancer l'analyse IA (${parsedRows})`}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              🧠 Contexte de la campagne avant analyse
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Pour produire des recommandations Andrometa-style{" "}
              <b>vraiment pertinentes</b>, j&apos;ai besoin de savoir d&apos;où
              viennent ces ads. Le même CSV se lit très différemment en
              testing (chercher les next winners) vs en scaling (chercher
              les saturations).
            </p>

            <form
              action={(fd) =>
                start(async () => {
                  await runAnalysis(importId, fd);
                  setOpen(false);
                })
              }
              className="mt-5 flex flex-col gap-5"
            >
              {/* Campaign structure */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Structure de campagne
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <RadioCard
                    name="campaign_structure"
                    value="testing"
                    checked={campaignStructure === "testing"}
                    onChange={() => setCampaignStructure("testing")}
                    title="CBO Testing"
                    desc="Toutes les nouvelles créas, audience broad. Beaucoup d'ads, beaucoup de losers, quelques émerging winners."
                  />
                  <RadioCard
                    name="campaign_structure"
                    value="scaling"
                    checked={campaignStructure === "scaling"}
                    onChange={() => setCampaignStructure("scaling")}
                    title="CBO Scaling"
                    desc="Winners du testing transférés. On cherche les saturations, leaders permanents, ads à dupliquer."
                  />
                  <RadioCard
                    name="campaign_structure"
                    value="mixed"
                    checked={campaignStructure === "mixed"}
                    onChange={() => setCampaignStructure("mixed")}
                    title="Mixed"
                    desc="Les 2 dans le même CSV. L'analyse distingue automatiquement low vs high-spend."
                  />
                </div>
              </div>

              {/* Meta objective */}
              <div>
                <label
                  htmlFor="meta_objective"
                  className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                >
                  Objectif Meta de la campagne
                </label>
                <select
                  id="meta_objective"
                  name="meta_objective"
                  value={metaObjective}
                  onChange={(ev) => setMetaObjective(ev.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="lead_form">
                    Lead form on-platform (formulaire Meta)
                  </option>
                  <option value="conversions">
                    Conversions website (lead via Pixel)
                  </option>
                  <option value="traffic">Trafic (clics sur lien)</option>
                  <option value="other">Autre</option>
                </select>
              </div>

              {/* Free-text note */}
              <div>
                <label
                  htmlFor="analyst_note"
                  className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                >
                  Note du media buyer (optionnel)
                </label>
                <textarea
                  id="analyst_note"
                  name="analyst_note"
                  rows={3}
                  value={analystNote}
                  onChange={(ev) => setAnalystNote(ev.target.value)}
                  placeholder="Ex : période avec promo Black Friday, audience FR+BE+CH, lancement compte 0-30j, refonte LP en cours…"
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                  Tout contexte qui aide Claude à ne pas tirer des conclusions
                  hâtives (ex : un CPA élevé est normal sur un compte qui
                  vient de démarrer car Meta n&apos;a pas encore convergé).
                </p>
              </div>

              <div className="rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3 text-xs">
                <div className="font-semibold">
                  Estimation : ~{estSec}s · ~$
                  {estCost} (Haiku batch + Sonnet synthèse)
                </div>
                <p className="mt-1 text-[var(--color-muted-foreground)]">
                  La création de variantes (brief depuis learnings) reste une
                  étape SÉPARÉE après que tu aies validé les insights.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {pending
                    ? "🧠 Analyse en cours…"
                    : `🧠 Lancer l'analyse (${parsedRows} ads)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  desc,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={`cursor-pointer rounded-lg border-2 p-3 transition ${
        checked
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/40"
          : "border-white/15 bg-[var(--color-background)] hover:border-white/30"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div className="text-sm font-semibold text-[var(--color-foreground)]">
        {title}
      </div>
      <div className="mt-1 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">
        {desc}
      </div>
    </label>
  );
}
