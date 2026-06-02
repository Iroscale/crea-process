import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  AGENT_KEYS,
  MODEL_BY_AGENT,
  loadAgent,
  loadSkill,
  listKnowledge,
  createKnowledgeFileSignedUrl,
  countPendingFeedback,
  loadAgentMemory,
  type AgentKey,
} from "@/lib/agents";
import {
  addKnowledgeAction,
  deleteKnowledgeAction,
  toggleKnowledgeAction,
  recordFeedbackAction,
  startRefineAction,
} from "./actions";
import SubmitButton from "../../../projects/[id]/briefs/[bid]/submit-button";

const KIND_LABELS = {
  rule: { emoji: "📐", label: "Règles métier" },
  good_example: { emoji: "✅", label: "Bons exemples" },
  anti_example: { emoji: "❌", label: "Anti-exemples" },
  reference: { emoji: "📚", label: "Références" },
} as const;
type Kind = keyof typeof KIND_LABELS;

const KIND_ORDER: Kind[] = ["rule", "good_example", "anti_example", "reference"];

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ error?: string; refined?: string; rejected?: string }>;
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

  // Charge en parallèle : définition agent, knowledge, mémoire, feedback
  // count, runs récents.
  const [agent, knowledge, agentMem, pending, runsRes] = await Promise.all([
    loadAgent(agentKey),
    listKnowledge(supabase, { userId: user.id, agentKey, onlyActive: false }),
    loadAgentMemory(supabase, { userId: user.id, agentKey }),
    countPendingFeedback(supabase, { userId: user.id, agentKey }),
    supabase
      .from("agent_runs")
      .select(
        "id, step_key, status, model, started_at, finished_at, prompt_tokens, completion_tokens, cost_estimate_usd, output, input_snapshot, project_id"
      )
      .eq("user_id", user.id)
      .eq("agent_key", agentKey)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  // Charge le contenu des skills mobilisés pour les afficher
  const skillNames: string[] = [
    ...(agent.frontmatter.skill ? [agent.frontmatter.skill] : []),
    ...(agent.frontmatter.skills ?? []),
  ];
  const skillsLoaded = await Promise.all(
    skillNames.map(async (name) => {
      const body = await loadSkill(name);
      return { name, body, available: body !== null };
    })
  );

  // Signed URLs pour les knowledge avec fichier attaché
  const knowledgeSignedUrls = new Map<string, string>();
  for (const k of knowledge) {
    if (k.file_path) {
      const url = await createKnowledgeFileSignedUrl(supabase, {
        filePath: k.file_path,
        expiresIn: 60 * 30,
      });
      if (url) knowledgeSignedUrls.set(k.id, url);
    }
  }

  const runs = runsRes.data ?? [];
  const runIds = runs.map((r) => r.id as string);
  const { data: existingFeedback } = await supabase
    .from("agent_feedback")
    .select("run_id, rating, tag, comment, corrected_md, ingested_at")
    .eq("user_id", user.id)
    .in("run_id", runIds.length > 0 ? runIds : ["00000000-0000-0000-0000-000000000000"]);
  const feedbackByRun = new Map<
    string,
    { rating: number | null; tag: string | null; comment: string | null; ingested: boolean }
  >();
  for (const f of existingFeedback ?? []) {
    feedbackByRun.set(f.run_id as string, {
      rating: (f.rating as number) ?? null,
      tag: (f.tag as string) ?? null,
      comment: (f.comment as string) ?? null,
      ingested: !!f.ingested_at,
    });
  }

  const groupedKnowledge: Record<Kind, typeof knowledge> = {
    rule: [],
    good_example: [],
    anti_example: [],
    reference: [],
  };
  for (const k of knowledge) {
    const kk = k.kind as Kind;
    if (groupedKnowledge[kk]) groupedKnowledge[kk].push(k);
  }

  const startRefine = startRefineAction.bind(null, agentKey);
  const addKnowAction = addKnowledgeAction.bind(null, agentKey);
  const recordFb = recordFeedbackAction.bind(null, agentKey);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href="/agency/agents"
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Agents
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {agentKey}
          </div>
          <h1 className="mt-1 text-3xl font-semibold">{agent.frontmatter.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            modèle <span className="font-mono">{MODEL_BY_AGENT[agentKey]}</span>
            {agent.frontmatter.skill && (
              <>
                {" "}
                · skill <span className="font-mono">{agent.frontmatter.skill}</span>
              </>
            )}
            {agent.frontmatter.gate && (
              <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                gate humain
              </span>
            )}
          </p>
        </div>
        <form action={startRefine}>
          <SubmitButton
            disabled={pending === 0}
            pendingLabel="Distillation en cours…"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            🧪 Affiner ({pending} feedback{pending > 1 ? "s" : ""} en attente)
          </SubmitButton>
        </form>
      </div>

      {sp.error && <Banner kind="error">{decodeURIComponent(sp.error)}</Banner>}
      {sp.refined && <Banner kind="success">{decodeURIComponent(sp.refined)}</Banner>}
      {sp.rejected && <Banner kind="info">{decodeURIComponent(sp.rejected)}</Banner>}

      {/* ── Skills mobilisés ────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          🛠 Skills mobilisés
          {skillsLoaded.length > 0 && (
            <span className="ml-2 text-sm font-normal text-[var(--color-muted-foreground)]">
              ({skillsLoaded.length})
            </span>
          )}
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Méthodes et signatures stylistiques injectées dans le contexte de
          l&apos;agent à chaque appel. Définis dans le frontmatter de{" "}
          <span className="font-mono">.claude/agents/{agentKey}.md</span> et
          chargés depuis{" "}
          <span className="font-mono">.claude/skills/&lt;name&gt;/SKILL.md</span>.
        </p>
        <div className="mt-4 grid gap-3">
          {skillsLoaded.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
              Aucun skill déclaré pour cet agent.
            </p>
          )}
          {skillsLoaded.map((s) => (
            <div
              key={s.name}
              className={`rounded-xl border p-4 ${
                s.available
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        s.available
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {s.available ? "✓ actif" : "✗ fichier manquant"}
                    </span>
                    <h3 className="text-sm font-semibold font-mono">{s.name}</h3>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                    {s.available ? (
                      <>
                        {s.body!.length.toLocaleString("fr-FR")} caractères ·
                        injecté dans le bloc identité (cacheable) à chaque run.
                      </>
                    ) : (
                      <>
                        Le fichier{" "}
                        <span className="font-mono">
                          .claude/skills/{s.name}/SKILL.md
                        </span>{" "}
                        est introuvable. Le skill est déclaré dans le
                        frontmatter mais le fichier manque.
                      </>
                    )}
                  </p>
                </div>
              </div>
              {s.available && s.body && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
                    Voir le contenu du skill
                  </summary>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px] leading-relaxed">
                    {s.body}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Mémoire long terme ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          🧠 Mémoire long terme {agentMem ? `· v${agentMem.version}` : "· vide"}
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Distillée depuis les feedbacks accumulés. Injectée à chaque appel de
          l&apos;agent.
        </p>
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          {agentMem && agentMem.contentMd.trim() ? (
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[var(--color-foreground)]">
              {agentMem.contentMd}
            </pre>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Aucune mémoire long terme pour l&apos;instant. Donne du feedback
              sur les runs ci-dessous, puis clique « Affiner » pour générer la
              première version.
            </p>
          )}
        </div>
      </section>

      {/* ── Knowledge enrichi & Ressources ──────────────────────────────── */}
      <section className="mt-10">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">📚 Ressources & Knowledge</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Règles, bons exemples, anti-exemples, références — **et fichiers
              uploadés** (PDF, DOCX, images, scripts). Tout est injecté dans le
              contexte de l&apos;agent à chaque appel, en complément de ses skills.
            </p>
          </div>
        </div>

        {/* Formulaire d'ajout */}
        <details className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            + Ajouter une ressource ou un knowledge
          </summary>
          <form
            action={addKnowAction}
            className="mt-4 flex flex-col gap-3"
            encType="multipart/form-data"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Type
                </span>
                <select
                  name="kind"
                  defaultValue="reference"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                >
                  <option value="rule">📐 Règle métier</option>
                  <option value="good_example">✅ Bon exemple</option>
                  <option value="anti_example">❌ Anti-exemple</option>
                  <option value="reference">📚 Référence / ressource</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Titre *
                </span>
                <input
                  name="title"
                  required
                  placeholder="Ex : Anciennes pubs gagnantes Q1 2026"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                📎 Fichier (PDF · DOCX · TXT · MD · CSV · image · …) — optionnel
              </span>
              <input
                type="file"
                name="file"
                className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-3 py-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--color-primary-foreground)]"
              />
              <span className="text-[10px] text-[var(--color-muted-foreground)]">
                Le texte est extrait automatiquement (PDF/DOCX/TXT) et lu par
                l&apos;agent. Images conservées sans extraction.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Contenu (markdown) — optionnel si fichier fourni
              </span>
              <textarea
                name="content_md"
                rows={4}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                placeholder="Ex (règle) : « Toujours ouvrir un script founder par un chiffre concret. » Ou commentaire libre qui accompagne le fichier."
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Tags (séparés par ,)
                </span>
                <input
                  name="tags"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Source / contexte
                </span>
                <input
                  name="source_note"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Poids (1-5)
                </span>
                <input
                  name="weight"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={1}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <SubmitButton pendingLabel="Ajout…">Ajouter</SubmitButton>
            </div>
          </form>
        </details>

        {/* Liste regroupée par kind */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {KIND_ORDER.map((kind) => {
            const items = groupedKnowledge[kind];
            const info = KIND_LABELS[kind];
            return (
              <div
                key={kind}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <h3 className="text-sm font-semibold">
                  {info.emoji} {info.label}{" "}
                  <span className="text-[var(--color-muted-foreground)]">
                    ({items.length})
                  </span>
                </h3>
                {items.length === 0 ? (
                  <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
                    aucun pour l&apos;instant
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {items.map((k) => (
                      <li
                        key={k.id}
                        className={`rounded-md border border-[var(--color-border)] p-3 ${
                          k.is_active ? "" : "opacity-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-1.5">
                              <div className="text-sm font-medium">
                                {k.title}
                              </div>
                              {k.file_path && (
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                    k.parse_status === "done"
                                      ? "bg-emerald-500/15 text-emerald-300"
                                      : k.parse_status === "skipped"
                                        ? "bg-zinc-500/15 text-zinc-400"
                                        : k.parse_status === "failed"
                                          ? "bg-red-500/15 text-red-300"
                                          : "bg-sky-500/15 text-sky-300"
                                  }`}
                                  title={`Fichier ${k.file_name ?? ""}${
                                    k.size_bytes
                                      ? ` · ${(k.size_bytes / 1024).toFixed(1)} ko`
                                      : ""
                                  }`}
                                >
                                  📎{" "}
                                  {k.parse_status === "done"
                                    ? "fichier parsé"
                                    : k.parse_status === "skipped"
                                      ? "fichier joint"
                                      : k.parse_status === "failed"
                                        ? "parse échoué"
                                        : "fichier"}
                                </span>
                              )}
                            </div>
                            {k.tags && k.tags.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {k.tags.map((t, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {k.file_path && knowledgeSignedUrls.get(k.id) && (
                              <a
                                href={knowledgeSignedUrls.get(k.id)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent)]"
                              >
                                ⬇
                              </a>
                            )}
                            <form
                              action={toggleKnowledgeAction.bind(
                                null,
                                agentKey,
                                k.id,
                                !k.is_active
                              )}
                            >
                              <button className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent)]">
                                {k.is_active ? "désactiver" : "activer"}
                              </button>
                            </form>
                            <form
                              action={deleteKnowledgeAction.bind(
                                null,
                                agentKey,
                                k.id
                              )}
                            >
                              <button className="rounded border border-red-500/30 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10">
                                supprimer
                              </button>
                            </form>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[11px] text-[var(--color-muted-foreground)]">
                          {k.content_md}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Runs récents avec feedback ─────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">⚡ Runs récents</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Donne un feedback inline. Une fois assez de feedbacks accumulés,
          clique « Affiner » en haut de page.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {runs.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Aucun run pour l&apos;instant. Quand tu lanceras cet agent
              depuis un projet, les exécutions apparaîtront ici.
            </p>
          )}
          {runs.map((r) => {
            const fb = feedbackByRun.get(r.id as string);
            const task =
              ((r.input_snapshot as { task?: string } | null)?.task ?? "")
                .toString()
                .slice(0, 250);
            const out =
              ((r.output as { text?: string } | null)?.text ?? "")
                .toString()
                .slice(0, 400);
            const startedAt = new Date(r.started_at as string).toLocaleString(
              "fr-FR"
            );
            return (
              <div
                key={r.id as string}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
                  <div>
                    {startedAt} · étape{" "}
                    <span className="font-mono">{r.step_key as string}</span> ·{" "}
                    <span
                      className={
                        r.status === "done"
                          ? "text-emerald-300"
                          : r.status === "failed"
                            ? "text-red-300"
                            : ""
                      }
                    >
                      {r.status as string}
                    </span>
                  </div>
                  <div>
                    {r.completion_tokens
                      ? `${r.completion_tokens} tok · `
                      : ""}
                    {typeof r.cost_estimate_usd === "number"
                      ? `~$${r.cost_estimate_usd}`
                      : ""}
                  </div>
                </div>
                {task && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-[var(--color-muted-foreground)]">
                      tâche envoyée à l&apos;agent
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] text-[var(--color-muted-foreground)]">
                      {task}
                    </pre>
                  </details>
                )}
                {out && (
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                      Output (extrait)
                    </div>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[12px]">
                      {out}
                    </pre>
                  </div>
                )}
                {fb ? (
                  <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs">
                    Feedback enregistré · rating{" "}
                    {fb.rating === 1
                      ? "👍"
                      : fb.rating === -1
                        ? "👎"
                        : fb.rating === 0
                          ? "neutre"
                          : "—"}
                    {fb.tag && ` · ${fb.tag}`}
                    {fb.ingested && (
                      <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        ingéré
                      </span>
                    )}
                    {fb.comment && (
                      <div className="mt-1 text-[var(--color-muted-foreground)]">
                        « {fb.comment} »
                      </div>
                    )}
                  </div>
                ) : (
                  <form action={recordFb} className="mt-3 flex flex-col gap-2">
                    <input type="hidden" name="run_id" value={r.id as string} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        rating
                      </span>
                      <RatingRadio name="rating" value="1" label="👍 bon" />
                      <RatingRadio name="rating" value="0" label="🤷 neutre" />
                      <RatingRadio name="rating" value="-1" label="👎 mauvais" />
                      <input
                        name="tag"
                        placeholder="tag (ex: ton-off, manque-verbatim)"
                        className="ml-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs"
                      />
                    </div>
                    <textarea
                      name="comment"
                      rows={2}
                      placeholder="Commentaire (qu'est-ce qui marche, qu'est-ce qui rate ?)"
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs"
                    />
                    <details>
                      <summary className="cursor-pointer text-[11px] text-[var(--color-muted-foreground)]">
                        + version corrigée (optionnel)
                      </summary>
                      <textarea
                        name="corrected_md"
                        rows={4}
                        placeholder="Ta version réécrite, telle que tu l'aurais voulue."
                        className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs"
                      />
                    </details>
                    <div className="flex justify-end">
                      <SubmitButton
                        pendingLabel="Enregistrement…"
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-xs hover:bg-[var(--color-accent)]"
                      >
                        Envoyer le feedback
                      </SubmitButton>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const cls =
    kind === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : kind === "success"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : "border-sky-500/30 bg-sky-500/10 text-sky-300";
  return (
    <div className={`mt-6 rounded-md border p-3 text-sm ${cls}`}>{children}</div>
  );
}

function RatingRadio({
  name,
  value,
  label,
}: {
  name: string;
  value: string;
  label: string;
}) {
  return (
    <label className="cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs hover:bg-[var(--color-accent)]">
      <input type="radio" name={name} value={value} className="mr-1" />
      {label}
    </label>
  );
}
