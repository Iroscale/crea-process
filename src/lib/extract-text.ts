/**
 * Extract plain text from a variety of file formats so it can be included
 * in the agent's system prompt.
 *
 * Supported:
 *  - text/plain, text/markdown, text/csv, text/html  → raw read
 *  - application/json                                → pretty print
 *  - application/pdf                                 → pdf-parse
 *  - application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx)
 *                                                    → mammoth
 *  - image/*                                         → null (caller can use vision separately)
 */
import mammoth from "mammoth";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type ExtractResult = {
  text: string | null;
  truncated: boolean;
};

const MAX_CHARS = 200_000; // ~50k tokens — generous, can be tuned later

/**
 * Resolve pdf-parse's worker mjs as a file:// URL pointing at node_modules so
 * that pdfjs's `await import(workerSrc)` doesn't try to load a bundled-relative
 * path that doesn't exist (the "Setting up fake worker failed" bug). We do
 * this lazily on first PDF parse and cache the result.
 */
let pdfWorkerConfigured = false;
async function ensurePdfWorker() {
  if (pdfWorkerConfigured) return;
  pdfWorkerConfigured = true;
  try {
    const { PDFParse } = await import("pdf-parse");
    const workerPath = path.join(
      process.cwd(),
      "node_modules",
      "pdf-parse",
      "dist",
      "worker",
      "pdf.worker.mjs"
    );
    PDFParse.setWorker(pathToFileURL(workerPath).href);
  } catch {
    // If setWorker isn't available or the file is missing, silently fall back
    // to pdfjs's default resolution. The serverExternalPackages config in
    // next.config.ts is the primary fix anyway.
  }
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractResult> {
  const lowerName = fileName.toLowerCase();

  // PDF
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    await ensurePdfWorker();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      const text =
        result.text ??
        result.pages?.map((p) => p.text).join("\n\n") ??
        "";
      return clip(text);
    } finally {
      await parser.destroy();
    }
  }

  // DOCX
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return clip(result.value);
  }

  // Plain text variants
  if (
    mimeType.startsWith("text/") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm")
  ) {
    return clip(buffer.toString("utf8"));
  }

  // JSON
  if (mimeType === "application/json" || lowerName.endsWith(".json")) {
    try {
      const obj = JSON.parse(buffer.toString("utf8"));
      return clip(JSON.stringify(obj, null, 2));
    } catch {
      return clip(buffer.toString("utf8"));
    }
  }

  // Image — caller should run vision analysis separately
  if (mimeType.startsWith("image/")) {
    return { text: null, truncated: false };
  }

  // Unknown — try utf8, but expect garbage
  try {
    const txt = buffer.toString("utf8");
    if (/^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]+$/.test(txt)) {
      return clip(txt);
    }
  } catch {}
  return { text: null, truncated: false };
}

function clip(text: string): ExtractResult {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (trimmed.length > MAX_CHARS) {
    return { text: trimmed.slice(0, MAX_CHARS), truncated: true };
  }
  return { text: trimmed, truncated: false };
}
