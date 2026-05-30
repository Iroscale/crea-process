/**
 * Stepper horizontal sticky affiché sur chaque page d'étape.
 *
 * - 13 pilules cliquables (toutes les étapes du pipeline + onboarding + extra)
 * - Statut par étape (badge couleur)
 * - L'étape courante est mise en exergue
 * - 1-clic pour sauter vers n'importe quelle étape sans repasser par le hub
 *
 * Props :
 *   projectId    — id du projet
 *   currentKey   — clé de l'étape active (pour highlight)
 *   statusByStep — Map<stepKey, status> chargée côté serveur
 */
import Link from "next/link";
import { STEPS } from "@/lib/agency";

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-500/15 text-slate-300",
  in_progress: "bg-sky-500/15 text-sky-300 animate-pulse",
  gate_pending: "bg-amber-500/15 text-amber-300",
  validated: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-red-500/15 text-red-300",
  skipped: "bg-zinc-500/15 text-zinc-400",
};

const STATUS_DOT: Record<string, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-sky-400",
  gate_pending: "bg-amber-400",
  validated: "bg-emerald-400",
  failed: "bg-red-400",
  skipped: "bg-zinc-500",
};

export default function StepStepper({
  projectId,
  currentKey,
  statusByStep,
}: {
  projectId: string;
  currentKey: string;
  statusByStep: Map<string, string>;
}) {
  const ordered = [...STEPS].sort((a, b) => a.order - b.order);
  return (
    <div className="sticky top-0 z-10 -mx-6 mb-6 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {ordered.map((s, idx) => {
          const status = statusByStep.get(s.key) ?? "todo";
          const isActive = s.key === currentKey;
          const isExport = s.key === "export-memory";
          const href = isExport
            ? `/projects/${projectId}/agency/export`
            : s.key === "retrospective"
              ? `/projects/${projectId}/agency/retrospective`
              : s.key === "onboarding"
                ? `/projects/${projectId}/agency/onboarding`
                : `/projects/${projectId}/agency/steps/${s.key}`;
          const dot = STATUS_DOT[status] ?? STATUS_DOT.todo;
          const badge = STATUS_BADGE[status] ?? STATUS_BADGE.todo;
          return (
            <div key={s.key} className="flex items-center gap-1 shrink-0">
              <Link
                href={href}
                title={`${s.title} · ${status}`}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition ${
                  isActive
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold"
                    : `${badge} hover:bg-[var(--color-accent)]`
                }`}
              >
                <span className="text-sm leading-none">{s.emoji}</span>
                <span className="hidden sm:inline whitespace-nowrap">
                  {s.title}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isActive ? "bg-white" : dot
                  }`}
                  aria-hidden
                />
              </Link>
              {idx < ordered.length - 1 && (
                <span className="text-[var(--color-muted-foreground)] text-[10px]">
                  ›
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
