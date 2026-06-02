/**
 * Parsing texte de fichiers uploadés — partagé entre documents client
 * (`lib/agency/documents.ts`) et knowledge agent (`lib/agents/knowledge.ts`).
 *
 * Formats supportés :
 *   - TXT / MD / CSV / JSON / HTML        → lecture brute UTF-8
 *   - PDF (.pdf, application/pdf)          → pdf-parse v2 (PDFParse class)
 *   - DOCX (.docx, wordprocessingml)        → mammoth
 *   - Autres (images, audio, etc.)          → null (pas d'extraction)
 *
 * Retourne null pour les formats non parsables (l'appelant marque alors
 * parse_status='skipped' et garde le fichier brut accessible).
 */
import "server-only";

export async function parseFileToText(args: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<string | null> {
  const { fileName, mimeType, buffer } = args;
  const ext = fileName.toLowerCase().split(".").pop();
  const mime = (mimeType || "").toLowerCase();

  // TXT / MD / CSV / JSON / HTML
  if (
    mime.startsWith("text/") ||
    ["txt", "md", "csv", "json", "html"].includes(ext ?? "")
  ) {
    return buffer.toString("utf8").slice(0, 100_000);
  }

  // PDF
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

  return null;
}

/** Slugifie un nom de fichier pour le stockage Storage. */
export function safeStorageName(name: string, maxLen = 120): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, maxLen);
}
