import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AGENT_KEYS, generateRefineProposal, type AgentKey } from "@/lib/agents";
import { commitRefineAction, rejectRefineAction } from "../actions";
import SubmitButton from "../../../../projects/[id]/briefs/[bid]/submit-button";

export const dynamic = "force-dynamic";

export default async function AgentRefinePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  if (!(AGENT_KEYS as readonly string[]).includes(key)) notFound();
  const agentKey = key as AgentKey;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Distillation Claude (peut prendre 5-15s).
  const proposalOrError = await generateRefineProposal({
    supabase,
    userId: user.id,
    agentKey,
  });

  const commitAction = commitRefineAction.bind(null, agentKey);
  const rejectAction = rejectRefineAction.bind(null, agentKey);

  if ("error" in proposalOrError) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
        <BackLink agentKey={agentKey} />
        <h1 className="mt-3 text-2xl font-semibold">🧪 Affinage — erreur</h1>
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {proposalOrError.error}
        </div>
      </main>
    );
  }

  const proposal = proposalOrError;
  const unchanged =
    proposal.proposedContentMd.trim() === proposal.currentContentMd.trim();
  const newVersion = unchanged ? proposal.currentVersion : proposal.currentVersion + 1;
  const proposalJson = JSON.stringify(proposal);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <BackLink agentKey={agentKey} />
      <h1 className="mt-3 text-2xl font-semibold">
        🧪 Affinage — <span className="font-mono">{agentKey}</span>
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Distillé à partir de <strong>{proposal.feedbackCount}</strong> feedback
        {proposal.feedbackCount > 1 ? "s" : ""} en attente · version actuelle{" "}
        <strong>v{proposal.currentVersion}</strong> → proposée{" "}
        <strong>v{newVersion}</strong>
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Résumé du changement */}
      <section className="mt-8 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Résumé des changements
        </h2>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {proposal.changeSummary}
        </pre>
      </section>

      {/* Diff côte à côte */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">
            Avant — v{proposal.currentVersion}
          </h2>
          <pre className="mt-2 max-h-[600px] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-[12px] leading-relaxed whitespace-pre-wrap">
            {proposal.currentContentMd.trim() || "(vide)"}
          </pre>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-primary)]">
            Après — v{newVersion}
          </h2>
          <pre className="mt-2 max-h-[600px] overflow-auto rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-card)] p-4 text-[12px] leading-relaxed whitespace-pre-wrap">
            {proposal.proposedContentMd.trim() || "(vide)"}
          </pre>
        </div>
      </section>

      {/* Actions */}
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <form action={commitAction} className="flex flex-1 items-center gap-3">
          <input type="hidden" name="proposal_json" value={proposalJson} />
          <input
            name="notes"
            placeholder="Notes optionnelles sur ce refinement"
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
          <SubmitButton
            pendingLabel="Commit en cours…"
            disabled={unchanged && proposal.feedbackCount === 0}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✓ Commit{unchanged ? " (marquer feedbacks examinés)" : ` v${newVersion}`}
          </SubmitButton>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="proposal_json" value={proposalJson} />
          <SubmitButton
            pendingLabel="Rejet…"
            className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
          >
            ✗ Rejeter (marque feedbacks examinés sans changement)
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}

function BackLink({ agentKey }: { agentKey: AgentKey }) {
  return (
    <Link
      href={`/agency/agents/${agentKey}`}
      className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
    >
      ← Retour à l&apos;agent
    </Link>
  );
}
