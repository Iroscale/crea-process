import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  uploadKnowledgeFiles,
  deleteKnowledgeFile,
  updateBrandVoice,
  structureProjectKnowledge,
} from "./actions";
import { safeDecode } from "@/lib/safe-decode";
import KnowledgeChat from "./knowledge-chat";
import type { StructuredKnowledge } from "@/lib/structured-knowledge-schema";

const KIND_LABELS: Record<string, string> = {
  product_doc: "Doc produit",
  copywriting_doc: "Copywriting / framework",
  past_ad: "Ad existante",
  script: "Script vidéo / VSL",
  other: "Autre",
};

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Base query — works regardless of whether migration 010 has been applied.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand_voice")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  // Migration 010 adds `structured_knowledge` + `project_knowledge_messages`.
  // If the migration hasn't been applied yet, both queries below fail silently
  // and the new section degrades gracefully to "not yet structured" mode.
  let structured: StructuredKnowledge | null = null;
  let migrationApplied = true;
  {
    const { data, error } = await supabase
      .from("projects")
      .select("structured_knowledge")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      migrationApplied = false;
    } else {
      structured =
        ((data?.structured_knowledge ?? null) as StructuredKnowledge | null) ??
        null;
    }
  }

  let chatMessages: {
    id: string;
    role: string;
    content: string;
    created_at: string;
  }[] = [];
  if (migrationApplied) {
    const { data, error } = await supabase
      .from("project_knowledge_messages")
      .select("id, role, content, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true });
    if (error) {
      migrationApplied = false;
    } else {
      chatMessages = data ?? [];
    }
  }

  const { data: files } = await supabase
    .from("knowledge_files")
    .select("id, file_name, mime_type, size_bytes, kind, extracted_text, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const totalChars =
    files?.reduce((sum, f) => sum + (f.extracted_text?.length ?? 0), 0) ?? 0;

  const hasExtractableFiles = (files ?? []).some(
    (f) => (f.extracted_text?.length ?? 0) > 0
  );

  const uploadAction = uploadKnowledgeFiles.bind(null, id);
  const brandVoiceAction = updateBrandVoice.bind(null, id);
  const structureAction = structureProjectKnowledge.bind(null, id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href={`/projects/${id}`}
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← {project.name}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">Knowledge base</h1>
      <p className="mt-1 text-[var(--color-muted-foreground)]">
        Plus tu donnes de contexte, plus l&apos;agent comprendra ton produit et
        ton style.
      </p>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {safeDecode(sp.error)}
        </div>
      )}

      {/* Brand voice */}
      <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Tone of voice / Brand voice</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Décris la personnalité de ta marque, ton ton (formel, fun, direct…),
          tes mots-clés et tes interdits. Utilisé en tête du system prompt.
        </p>
        <form action={brandVoiceAction} className="mt-4 flex flex-col gap-3">
          <textarea
            name="brand_voice"
            rows={5}
            defaultValue={project.brand_voice ?? ""}
            placeholder="Ex : ton direct et confiant, tutoiement, vocabulaire premium mais accessible. Éviter le jargon. Hooks pattern interrupt."
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <div className="flex justify-end">
            <button className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
              Enregistrer
            </button>
          </div>
        </form>
      </section>

      {/* Upload */}
      <section className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Uploader des fichiers</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          PDF, MD, TXT, DOCX, JSON, ou images d&apos;ads (PNG/JPG). Le texte
          sera extrait automatiquement pour les formats texte.
        </p>
        <form action={uploadAction} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Catégorie
              </label>
              <select
                name="kind"
                defaultValue="product_doc"
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                {Object.entries(KIND_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Fichiers
              </label>
              <input
                type="file"
                name="files"
                multiple
                required
                className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--color-primary-foreground)] hover:file:opacity-90"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
              Uploader
            </button>
          </div>
        </form>
      </section>

      {/* Structured product brief — main consumer of the knowledge files */}
      <section className="mt-10 rounded-2xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-6">
        {!migrationApplied && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
            ⚠ La fonctionnalité « Brief structuré » nécessite une migration
            Supabase. Lance{" "}
            <code className="rounded bg-black/20 px-1">supabase db push</code>{" "}
            (ou applique manuellement{" "}
            <code className="rounded bg-black/20 px-1">
              supabase/migrations/010_project_knowledge_structure.sql
            </code>
            ) pour l&apos;activer.
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              ✨ Brief produit structuré
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {structured
                ? "Synthèse condensée de tous tes documents. Affine-la via le chat ci-dessous — chaque message met le brief à jour. Re-structure pour repartir des fichiers actuels."
                : "Dépose un ou plusieurs documents puis clique « Structurer » : l'IA en extraira un brief produit complet (cible, promesses, preuves, ton, tabous légaux…)."}
            </p>
          </div>
          <form action={structureAction} className="shrink-0">
            <button
              disabled={!hasExtractableFiles || !migrationApplied}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
              title={
                !migrationApplied
                  ? "Migration Supabase non appliquée"
                  : !hasExtractableFiles
                  ? "Dépose au moins un document texte exploitable"
                  : structured
                  ? "Re-générer le brief depuis les fichiers actuels"
                  : "Générer le brief structuré"
              }
            >
              {structured ? "🔄 Re-structurer" : "✨ Structurer"}
            </button>
          </form>
        </div>

        {structured && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <KnowledgeBlock title="Produit" content={structured.product_summary} />
            <KnowledgeBlock title="Cible" content={structured.target_audience} />
            <KnowledgeList title="Pain points" items={structured.pain_points} />
            <KnowledgeList
              title="Value propositions"
              items={structured.value_propositions}
            />
            <KnowledgeList
              title="Différenciateurs"
              items={structured.differentiators}
            />
            <KnowledgeList
              title="Proof points"
              items={structured.proof_points}
            />
            {structured.pricing && (
              <KnowledgeBlock title="Pricing" content={structured.pricing} />
            )}
            <KnowledgeList title="Objections" items={structured.objections} />
            <KnowledgeBlock
              title={`Brand voice — ${structured.brand_voice.tone}`}
              content=""
              extra={
                <div className="space-y-1">
                  <KnowledgeInline
                    label="À dire"
                    items={structured.brand_voice.do_say}
                  />
                  <KnowledgeInline
                    label="À éviter"
                    items={structured.brand_voice.dont_say}
                  />
                </div>
              }
            />
            <KnowledgeList
              title="Hooks à utiliser"
              items={structured.hooks_to_use}
            />
            <KnowledgeList
              title="Hooks à éviter"
              items={structured.hooks_to_avoid}
            />
            {structured.legal_constraints && (
              <KnowledgeBlock
                title="Contraintes légales"
                content={structured.legal_constraints}
              />
            )}
            {structured.notes && (
              <KnowledgeBlock title="Notes / changelog" content={structured.notes} />
            )}
            <p className="col-span-full text-[10px] text-[var(--color-muted-foreground)]">
              Mis à jour : {new Date(structured.updated_at).toLocaleString("fr-FR")}
            </p>
          </div>
        )}

        {/* Refinement chat */}
        <KnowledgeChat
          projectId={id}
          initialMessages={chatMessages ?? []}
          hasStructuredKnowledge={!!structured}
        />
      </section>

      {/* Files */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            {files && files.length > 0
              ? `${files.length} fichier${files.length > 1 ? "s" : ""}`
              : "Aucun fichier"}
          </h2>
          {totalChars > 0 && (
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {totalChars.toLocaleString("fr-FR")} caractères extraits
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {files?.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              projectId={id}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function KnowledgeBlock({
  title,
  content,
  extra,
}: {
  title: string;
  content: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
        {title}
      </div>
      {content && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-foreground)]">
          {content}
        </p>
      )}
      {extra && <div className="mt-2 text-xs">{extra}</div>}
    </div>
  );
}

function KnowledgeList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
        {title}
      </div>
      <ul className="mt-1.5 space-y-1 text-xs text-[var(--color-foreground)]">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--color-primary)]" />
            <span className="flex-1">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KnowledgeInline({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="text-xs">
      <span className="font-semibold text-[var(--color-muted-foreground)]">
        {label} :
      </span>{" "}
      <span className="text-[var(--color-foreground)]">
        {items.join(" · ")}
      </span>
    </div>
  );
}

function FileRow({
  file,
  projectId,
}: {
  file: {
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    kind: string;
    extracted_text: string | null;
    created_at: string;
  };
  projectId: string;
}) {
  const sizeKb = file.size_bytes
    ? (file.size_bytes / 1024).toFixed(1) + " KB"
    : "";
  const charCount = file.extracted_text?.length ?? 0;
  const deleteAction = deleteKnowledgeFile.bind(null, projectId, file.id);

  return (
    <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[var(--color-accent)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
              {KIND_LABELS[file.kind] ?? file.kind}
            </span>
            <span className="truncate text-sm font-medium">
              {file.file_name}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {sizeKb} • {file.mime_type ?? "?"} •{" "}
            {charCount > 0
              ? `${charCount.toLocaleString("fr-FR")} chars extraits`
              : "pas de texte extrait"}
            {charCount > 0 && (
              <span className="ml-2 text-[var(--color-primary)] group-open:hidden">
                voir le contenu →
              </span>
            )}
          </div>
        </div>
      </summary>
      {file.extracted_text && (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs text-[var(--color-muted-foreground)]">
          {file.extracted_text}
        </pre>
      )}
      <div className="mt-3 flex justify-end">
        <form action={deleteAction}>
          <button className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]">
            Supprimer
          </button>
        </form>
      </div>
    </details>
  );
}
