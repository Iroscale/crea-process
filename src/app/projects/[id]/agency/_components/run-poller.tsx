"use client";

/**
 * P0.6 — Poller de statut de run.
 *
 * Affiché quand un run est en cours sur l'étape : interroge
 * /api/agency/run-status toutes les 3 s, affiche la durée écoulée, et
 * recharge la page (router.refresh) quand le run se termine.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function RunPoller({
  projectId,
  stepKey,
  startedAt,
}: {
  projectId: string;
  stepKey: string;
  /** ISO date du démarrage du run (pour la durée écoulée). */
  startedAt: string | null;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string>("running");
  const startRef = useRef<number>(
    startedAt ? new Date(startedAt).getTime() : Date.now()
  );

  // Compteur de durée écoulée (1 s)
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Poll du statut (3 s)
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/agency/run-status?projectId=${encodeURIComponent(projectId)}&stepKey=${encodeURIComponent(stepKey)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (cancelled) return;
        if (data.status && data.status !== "running") {
          setStatus(data.status);
          // Laisse 300 ms pour que les writes secondaires (items,
          // pipeline_steps) soient visibles, puis recharge.
          setTimeout(() => router.refresh(), 300);
        }
      } catch {
        // erreur réseau transitoire — on retentera au tick suivant
      }
    };
    const t = setInterval(poll, 3000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [projectId, stepKey, router]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  if (status === "done") {
    return (
      <div className="mt-6 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
        ✅ Agent terminé — actualisation…
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="mt-6 rounded-xl border-2 border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
        ❌ Le run a échoué — actualisation…
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-center gap-3 rounded-xl border-2 border-sky-500/40 bg-sky-500/10 p-4">
      <span className="inline-block h-3 w-3 animate-ping rounded-full bg-sky-400" />
      <div>
        <p className="text-sm font-semibold text-sky-300">
          🤖 Agent au travail…{" "}
          <span className="font-mono">
            {mins > 0 ? `${mins}m ` : ""}
            {secs}s
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
          La page se mettra à jour automatiquement à la fin du run. Tu peux
          naviguer ailleurs et revenir — le run continue côté serveur.
        </p>
      </div>
    </div>
  );
}
