/**
 * Page livrable — split view (P0.2 + P0.4) :
 *   - Gauche : contenu du livrable (rendu), éditeur manuel, historique
 *     des versions avec restauration.
 *   - Droite : chat itératif avec l'agent de l'étape. Quand l'agent propose
 *     une mise à jour (<UPDATED_DELIVERABLE>), un bouton « Appliquer cette
 *     version » crée une nouvelle version (choix explicite).
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAgencyActivated,
  STEP_BY_KEY,
  listDeliverableVersions,
  type StepKey,
} from "@/lib/agency";
import { listDeliverableMessages } from "@/lib/agents";
import AgencyNav from "../../_components/agency-nav";
import {
  saveDeliverableAction,
  deleteDeliverableAction,
  restoreVersionAction,
  sendChatMessageAction,
  applyProposalAction,
} from "./actions";
import SubmitButton from "../../../briefs/[bid]/submit-button";

const DELIV_STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-300",
  validated: "bg-emerald-500/15 text-emerald-300",
  delivered: "bg-sky-500/15 text-sky-300",
  archived: "bg-zinc-500/15 text-zinc-400",
};

export default async function DeliverablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; did: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id, did } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const profile = await isAgencyActivated(supabase, id);
  if (!profile) redirect(`/projects/${id}/agency`);

  const { data: deliv } = await supabase
    .from("deliverables")
    .select(
      "id, kind, title, content_md, step_key, agent_key, created_at, run_id, version, status"
    )
    .eq("id", did)
    .eq("project_id", id)
    .maybeSingle();
  if (!deliv) notFound();

  const [versions, messages] = await Promise.all([
    listDeliverableVersions(supabase, did),
    listDeliverableMessages(supabase, did),
  ]);

  const stepCfg = STEP_BY_KEY[deliv.step_key as StepKey];
  const save = saveDeliverableAction.bind(null, id, did);
  const del = deleteDeliverableAction.bind(null, id, did);
  const sendChat = sendChatMessageAction.bind(null, id, did);
  const delivStatus = (deliv.status as string) ?? "draft";
  const delivVersion = (deliv.version as number) ?? 1;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="" />

      <div className="flex flex-wrap items-baseline gap-2 text-xs text-[var(--color-muted-foreground)]">
        <Link
          href={
            stepCfg
              ? `/projects/${id}/agency/steps/${stepCfg.key}`
              : `/projects/${id}/agency`
          }
          className="uppercase tracking-wider hover:text-[var(--color-foreground)]"
        >
          ← {stepCfg?.emoji} {stepCfg?.title ?? deliv.step_key}
        </Link>
      </div>

      <h1 className="mt-3 flex flex-wrap items-center gap-2 text-2xl font-semibold">
        {deliv.title as string}
        <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-bold text-[var(--color-primary)]">
          v{delivVersion}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            DELIV_STATUS_BADGE[delivStatus] ?? DELIV_STATUS_BADGE.draft
          }`}
        >
          {delivStatus}
        </span>
      </h1>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        <span className="font-mono">{deliv.kind as string}</span> · produit le{" "}
        {new Date(deliv.created_at as string).toLocaleString("fr-FR")} · agent{" "}
        <span className="font-mono">{deliv.agent_key as string}</span>
      </p>

      {sp.saved && (
        <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          ✅ Nouvelle version enregistrée (v{delivVersion}).
        </div>
      )}
      {sp.error && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* ─── Split view : livrable | chat ──────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ── Colonne gauche : contenu + édition + versions ── */}
        <div className="min-w-0">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
              📄 Contenu (version courante)
            </h2>
            <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed">
              {deliv.content_md as string}
            </pre>
          </section>

          <details className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-4">
            <summary className="cursor-pointer text-sm font-medium">
              ✏️ Éditer manuellement
            </summary>
            <form action={save} className="mt-4 flex flex-col gap-3">
              <input
                name="title"
                defaultValue={deliv.title as string}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              <textarea
                name="content_md"
                defaultValue={deliv.content_md as string}
                rows={18}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-[13px] leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  Snapshot automatique de la version actuelle avant
                  remplacement.
                </p>
                <SubmitButton pendingLabel="Enregistrement…">
                  💾 Enregistrer (v{delivVersion + 1})
                </SubmitButton>
              </div>
            </form>
          </details>

          {/* Historique des versions */}
          <section className="mt-4">
            <h2 className="text-sm font-semibold">
              🕘 Versions précédentes ({versions.length})
            </h2>
            {versions.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                Aucune version archivée.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-semibold">v{v.version}</span>
                        <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                          {v.source === "agent"
                            ? "🤖 agent"
                            : v.source === "chat"
                              ? "💬 chat"
                              : "✏️ manuel"}
                        </span>
                        <span className="ml-2 text-[var(--color-muted-foreground)]">
                          {new Date(v.created_at).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <form
                        action={restoreVersionAction.bind(null, id, did, v.id)}
                      >
                        <SubmitButton
                          pendingLabel="Restauration…"
                          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] hover:bg-[var(--color-accent)]"
                        >
                          ↩ Restaurer
                        </SubmitButton>
                      </form>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-[var(--color-muted-foreground)]">
                        Voir ({v.content_md.length} chars)
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px]">
                        {v.content_md}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 flex justify-end border-t border-[var(--color-border)] pt-4">
            <form action={del}>
              <SubmitButton
                pendingLabel="Suppression…"
                className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
              >
                🗑 Supprimer ce livrable
              </SubmitButton>
            </form>
          </section>
        </div>

        {/* ── Colonne droite : chat itératif ── */}
        <div className="min-w-0">
          <section className="flex h-full flex-col rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              💬 Itérer avec l&apos;agent{" "}
              <span className="font-mono">{deliv.agent_key as string}</span>
            </h2>
            <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
              Pose une question ou demande une modification. L&apos;agent a le
              livrable + la mémoire client + ses skills en contexte. Quand il
              propose une mise à jour, tu choisis de l&apos;appliquer (nouvelle
              version) ou non.
            </p>

            {/* Messages */}
            <div className="mt-4 flex max-h-[560px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <p className="rounded-md border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
                  Pas encore de conversation. Exemples : « Raccourcis le hook
                  d&apos;ouverture », « Le ton est trop agressif pour cette
                  cible, adoucis », « Pourquoi avoir choisi cet angle ? »
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-3 text-sm ${
                    m.role === "user"
                      ? "ml-6 bg-[var(--color-primary)]/10"
                      : "mr-6 border border-[var(--color-border)] bg-[var(--color-background)]"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {m.role === "user" ? "Toi" : "Agent"} ·{" "}
                    {new Date(m.created_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">
                    {m.content}
                  </div>
                  {m.proposed_content_md && (
                    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-emerald-300">
                          📝 Proposition de mise à jour
                          {m.applied_version
                            ? ` — appliquée (v${m.applied_version})`
                            : ""}
                        </span>
                        {!m.applied_version && (
                          <form
                            action={applyProposalAction.bind(
                              null,
                              id,
                              did,
                              m.id
                            )}
                          >
                            <SubmitButton
                              pendingLabel="Application…"
                              className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90"
                            >
                              ✅ Appliquer cette version
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-[var(--color-muted-foreground)]">
                          Voir la proposition (
                          {m.proposed_content_md.length} chars)
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px]">
                          {m.proposed_content_md}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              ))}
              <div id="chat-end" />
            </div>

            {/* Input */}
            <form action={sendChat} className="mt-4 flex flex-col gap-2">
              <textarea
                name="message"
                rows={3}
                required
                placeholder="Ex : « Raccourcis l'intro et rends le CTA plus direct »"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[var(--color-muted-foreground)]">
                  ⏱ 10-30 s — l&apos;agent relit tout le contexte
                </p>
                <SubmitButton
                  pendingLabel="L'agent réfléchit…"
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
                >
                  Envoyer
                </SubmitButton>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
