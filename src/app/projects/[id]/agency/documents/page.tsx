import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAgencyActivated,
  listDocuments,
  createSignedUrl,
} from "@/lib/agency";
import AgencyNav from "../_components/agency-nav";
import {
  uploadDocumentsAction,
  deleteDocumentAction,
  toggleDocumentActiveAction,
} from "./actions";
import SubmitButton from "../../briefs/[bid]/submit-button";

const PARSE_BADGE: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-300",
  skipped: "bg-zinc-500/15 text-zinc-400",
  pending: "bg-sky-500/15 text-sky-300",
  failed: "bg-red-500/15 text-red-300",
};

const PARSE_LABEL: Record<string, string> = {
  done: "✓ parsé",
  skipped: "non-texte",
  pending: "en attente",
  failed: "parse échoué",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
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

  const docs = await listDocuments(supabase, {
    userId: user.id,
    projectId: id,
    onlyActive: false,
  });

  // Pré-génère des signed URLs pour téléchargement
  const signedByPath = new Map<string, string>();
  for (const d of docs) {
    const url = await createSignedUrl(supabase, {
      filePath: d.file_path,
      expiresIn: 60 * 30,
    });
    if (url) signedByPath.set(d.file_path, url);
  }

  const upload = uploadDocumentsAction.bind(null, id);
  const totalSize = docs.reduce((acc, d) => acc + (d.size_bytes ?? 0), 0);
  const activeCount = docs.filter((d) => d.is_active).length;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <AgencyNav projectId={id} projectName={project.name} active="/documents" />
      <h1 className="text-3xl font-semibold">📎 Documents client</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
        Pièces transmises par le client (fiche produit, plaquette, anciennes
        ads, transcripts, screenshots LP). Conservées tout au long du projet et
        injectées automatiquement dans le contexte des agents.
      </p>

      <div className="mt-4 flex gap-3 text-xs">
        <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1">
          {docs.length} doc{docs.length > 1 ? "s" : ""}
        </span>
        <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1">
          {activeCount} actif{activeCount > 1 ? "s" : ""} (injectés au contexte)
        </span>
        <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1">
          {formatSize(totalSize)} total
        </span>
      </div>

      {sp.error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {decodeURIComponent(sp.error)}
        </div>
      )}
      {sp.ok && (
        <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {decodeURIComponent(sp.ok)}
        </div>
      )}

      {/* Upload */}
      <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-sm font-semibold">📤 Ajouter des documents</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Formats supportés : PDF, DOCX, TXT, MD, CSV, JSON, HTML, images.
          Le texte est extrait automatiquement (PDF/DOCX/TXT) et lu par les
          agents.
        </p>
        <form action={upload} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Catégorie
              </span>
              <select
                name="category"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="">— libre —</option>
                <option value="fiche-produit">📄 Fiche produit</option>
                <option value="plaquette">📑 Plaquette commerciale</option>
                <option value="old-ad">🎬 Ancienne ad</option>
                <option value="transcript">🎙️ Transcript / call</option>
                <option value="screenshot-lp">🖼️ Screenshot LP</option>
                <option value="contrat">📋 Contrat / docs régu</option>
                <option value="autre">📎 Autre</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Description (contexte)
              </span>
              <input
                name="description"
                placeholder="Ex : Fiche produit V3 — reçue par mail le 12 juin"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Fichier(s) *
            </span>
            <input
              type="file"
              name="files"
              multiple
              required
              className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-3 py-4 text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--color-primary-foreground)]"
            />
          </label>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Upload en cours…">
              📤 Uploader
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* Liste */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          📦 Documents ({docs.length})
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {docs.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Aucun document encore. Uploade les pièces du client ci-dessus.
            </p>
          )}
          {docs.map((d) => (
            <div
              key={d.id}
              className={`rounded-xl border p-4 ${
                d.is_active
                  ? "border-[var(--color-border)] bg-[var(--color-card)]"
                  : "border-[var(--color-border)] bg-[var(--color-background)] opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-sm font-semibold truncate">
                      {d.file_name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        PARSE_BADGE[d.parse_status]
                      }`}
                    >
                      {PARSE_LABEL[d.parse_status]}
                    </span>
                    {d.category && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                        {d.category}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                    {d.mime_type ?? "—"} · {formatSize(d.size_bytes)} · uploadé
                    le{" "}
                    {new Date(d.uploaded_at).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {d.description && (
                    <p className="mt-1 text-xs italic text-[var(--color-muted-foreground)]">
                      « {d.description} »
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {signedByPath.get(d.file_path) && (
                    <a
                      href={signedByPath.get(d.file_path)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] hover:bg-[var(--color-accent)]"
                    >
                      ⬇ Télécharger
                    </a>
                  )}
                  <form
                    action={toggleDocumentActiveAction.bind(
                      null,
                      id,
                      d.id,
                      !d.is_active
                    )}
                  >
                    <button className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] hover:bg-[var(--color-accent)]">
                      {d.is_active ? "🔕 désactiver" : "🔔 activer"}
                    </button>
                  </form>
                  <form action={deleteDocumentAction.bind(null, id, d.id)}>
                    <button className="rounded-md border border-red-500/30 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10">
                      🗑 supprimer
                    </button>
                  </form>
                </div>
              </div>

              {d.parse_status === "done" && d.parsed_text && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-[var(--color-muted-foreground)]">
                    Voir le texte extrait ({d.parsed_text.length} chars)
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-background)] p-3 text-[11px]">
                    {d.parsed_text}
                  </pre>
                </details>
              )}
              {d.parse_status === "failed" && d.parse_error && (
                <p className="mt-2 text-[11px] text-red-300">
                  Erreur parse : {d.parse_error}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
