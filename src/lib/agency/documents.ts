/**
 * Documents client — upload, parse, et injection dans le contexte des
 * agents Agency OS.
 *
 * Stockage :
 *   - Fichier brut : bucket Storage `agency-docs/<projectId>/<filename>`
 *   - Métadonnées + parsed_text : table `client_documents`
 *
 * Parsing :
 *   - PDF       → pdf-parse (déjà installé)
 *   - DOCX      → mammoth (déjà installé)
 *   - TXT / MD  → lecture brute UTF-8
 *   - Images / autres → pas de parse, juste le nom dans le contexte
 *
 * Injection (P0.7) :
 *   buildDocumentsContextMd(projectId) retourne un bloc markdown avec les
 *   documents actifs. Les documents CŒUR (is_core — ICP, brief client)
 *   sont injectés EN ENTIER (cap 80 000 chars chacun) ; les autres en
 *   extrait (30 000 chars). Cap total 150 000 chars : en cas de
 *   dépassement, les non-core sont tronqués d'abord et la troncature est
 *   signalée explicitement dans le contexte. Le prompt caching absorbe
 *   le coût (bloc mémoire client cacheable).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "agency-docs";
const MAX_CHARS_CORE_DOC = 80_000;
const MAX_CHARS_STANDARD_DOC = 30_000;
const MAX_CONTEXT_CHARS_TOTAL = 150_000;

export interface ClientDocumentRow {
  id: string;
  project_id: string;
  user_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  parsed_text: string | null;
  parse_status: "pending" | "done" | "skipped" | "failed";
  parse_error: string | null;
  is_active: boolean;
  is_core: boolean;
  category: string | null;
  uploaded_at: string;
}

// ── Upload + parse ────────────────────────────────────────────────────────
export async function uploadDocument(
  supabase: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    file: File;
    description?: string;
    category?: string;
  }
): Promise<{ id: string } | { error: string }> {
  const { userId, projectId, file, description, category } = args;

  // Sécurise le nom de fichier
  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
  const ts = Date.now();
  // Le premier segment du path DOIT être l'uid (policies RLS Storage,
  // pattern identique aux buckets knowledge/inspirations/generated).
  const path = `${userId}/${projectId}/${ts}-${safeName}`;

  // Upload vers Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) return { error: `upload : ${upErr.message}` };

  // Parse texte selon le type
  let parsedText: string | null = null;
  let parseStatus: "done" | "skipped" | "failed" = "skipped";
  let parseError: string | null = null;
  try {
    const text = await tryParse(file, buffer);
    if (text !== null) {
      parsedText = text;
      parseStatus = "done";
    }
  } catch (e) {
    parseStatus = "failed";
    parseError = (e as Error).message;
  }

  // Insert métadonnées
  const { data, error: insErr } = await supabase
    .from("client_documents")
    .insert({
      project_id: projectId,
      user_id: userId,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      description: description ?? null,
      parsed_text: parsedText,
      parse_status: parseStatus,
      parse_error: parseError,
      category: category ?? null,
    })
    .select("id")
    .single();

  if (insErr || !data) {
    // Rollback le fichier
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return { error: insErr?.message ?? "insert failed" };
  }
  return { id: data.id as string };
}

async function tryParse(file: File, buffer: Buffer): Promise<string | null> {
  const ext = file.name.toLowerCase().split(".").pop();
  const mime = (file.type || "").toLowerCase();

  // TXT / MD / CSV / JSON
  if (
    mime.startsWith("text/") ||
    ["txt", "md", "csv", "json", "html"].includes(ext ?? "")
  ) {
    return buffer.toString("utf8").slice(0, 100_000);
  }

  // PDF (pdf-parse v2 expose la classe PDFParse)
  if (mime === "application/pdf" || ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    type TextLike = { text?: string; pages?: Array<{ text?: string }> };
    const r = result as unknown as TextLike;
    if (r.text) return r.text.slice(0, 100_000);
    if (Array.isArray(r.pages)) {
      return r.pages
        .map((p) => p.text ?? "")
        .join("\n\n")
        .slice(0, 100_000);
    }
    return null;
  }

  // DOCX
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return (value ?? "").slice(0, 100_000);
  }

  return null; // image / autre = pas de parse
}

// ── CRUD ───────────────────────────────────────────────────────────────────
export async function listDocuments(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; onlyActive?: boolean }
): Promise<ClientDocumentRow[]> {
  let q = supabase
    .from("client_documents")
    .select("*")
    .eq("user_id", args.userId)
    .eq("project_id", args.projectId)
    .order("uploaded_at", { ascending: false });
  if (args.onlyActive !== false) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientDocumentRow[];
}

export async function deleteDocument(
  supabase: SupabaseClient,
  args: { userId: string; id: string }
): Promise<{ error?: string }> {
  // Récupère file_path avant suppression pour cleanup Storage
  const { data: row } = await supabase
    .from("client_documents")
    .select("file_path")
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (row?.file_path) {
    await supabase.storage.from(BUCKET).remove([row.file_path as string]).catch(() => {});
  }
  const { error } = await supabase
    .from("client_documents")
    .delete()
    .eq("id", args.id)
    .eq("user_id", args.userId);
  return error ? { error: error.message } : {};
}

export async function updateDocumentMeta(
  supabase: SupabaseClient,
  args: {
    userId: string;
    id: string;
    description?: string;
    category?: string;
    isActive?: boolean;
    isCore?: boolean;
  }
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (args.description !== undefined) patch.description = args.description;
  if (args.category !== undefined) patch.category = args.category;
  if (args.isActive !== undefined) patch.is_active = args.isActive;
  if (args.isCore !== undefined) patch.is_core = args.isCore;
  if (Object.keys(patch).length === 0) return;
  await supabase
    .from("client_documents")
    .update(patch)
    .eq("id", args.id)
    .eq("user_id", args.userId);
}

export async function createSignedUrl(
  supabase: SupabaseClient,
  args: { filePath: string; expiresIn?: number }
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(args.filePath, args.expiresIn ?? 60 * 10);
  return data?.signedUrl ?? null;
}

// ── Injection contexte agents (P0.7) ─────────────────────────────────────
/**
 * Construit un bloc markdown à injecter dans `extraMemoryMarkdown` de runAgent.
 *
 * Stratégie de budget (cap total 150 000 chars) :
 *   1. Les documents CŒUR (is_core) d'abord, en entier (cap 80 000 chacun).
 *   2. Puis les autres, en extrait (cap 30 000 chacun).
 *   3. Toute troncature est signalée explicitement dans le contexte
 *      (« ⚠ document X tronqué à N caractères ») pour que l'agent sache
 *      qu'il ne voit pas tout.
 *
 * Retourne "" si aucun document actif.
 */
export async function buildDocumentsContextMd(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string }
): Promise<string> {
  const docs = await listDocuments(supabase, {
    userId: args.userId,
    projectId: args.projectId,
    onlyActive: true,
  });
  if (docs.length === 0) return "";

  // Cœur d'abord (injectés en entier), puis les autres
  const ordered = [
    ...docs.filter((d) => d.is_core),
    ...docs.filter((d) => !d.is_core),
  ];

  const lines: string[] = [
    "# Documents client (transmis à l'onboarding)",
    "",
    "> Ces documents ont été uploadés par l'équipe humaine et sont la matière première du client. Cite-les explicitement quand tu les mobilises. Les documents marqués CŒUR sont la source de vérité prioritaire.",
    "",
  ];
  let totalChars = lines.reduce((a, l) => a + l.length, 0);
  const skipped: string[] = [];

  for (const d of ordered) {
    const perDocCap = d.is_core ? MAX_CHARS_CORE_DOC : MAX_CHARS_STANDARD_DOC;
    const remaining = MAX_CONTEXT_CHARS_TOTAL - totalChars;
    if (remaining < 500) {
      skipped.push(d.file_name);
      continue;
    }
    const docBudget = Math.min(perDocCap, remaining);

    lines.push(`## ${d.is_core ? "⭐ [CŒUR] " : ""}${d.file_name}`);
    if (d.category) lines.push(`_Catégorie : ${d.category}_`);
    if (d.description) lines.push(`_Description équipe : ${d.description}_`);
    if (d.parse_status === "done" && d.parsed_text) {
      const full = d.parsed_text.trim();
      const excerpt = full.slice(0, docBudget);
      lines.push("\n```");
      lines.push(excerpt);
      lines.push("```");
      if (full.length > excerpt.length) {
        lines.push(
          `\n⚠ Document tronqué : ${excerpt.length.toLocaleString("fr-FR")} caractères affichés sur ${full.length.toLocaleString("fr-FR")}. Signale-le si la partie manquante te semble nécessaire.`
        );
      }
    } else if (d.parse_status === "skipped") {
      lines.push(`_(format non texte — pas d'extraction. Le fichier est conservé.)_`);
    } else if (d.parse_status === "failed") {
      lines.push(`_(parse échoué : ${d.parse_error ?? "—"})_`);
    }
    lines.push("");
    totalChars = lines.reduce((a, l) => a + l.length, 0);
  }

  if (skipped.length > 0) {
    lines.push(
      `\n⚠ Budget de contexte atteint — documents NON inclus : ${skipped.join(", ")}. Demande à l'opérateur de les marquer CŒUR s'ils sont essentiels.`
    );
  }
  return lines.join("\n");
}
