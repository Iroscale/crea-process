"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { sendChatMessage } from "./actions";

type Attachment = {
  inspiration_id: string;
  signed_url: string | null;
  mime_type: string;
};

type Message = {
  id: string;
  role: string;
  content: string;
  attachments?: Attachment[];
  created_at: string;
};

export default function ChatPanel({
  briefId,
  initialMessages,
}: {
  briefId: string;
  initialMessages: Message[];
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [initialMessages.length, pending]);

  // Generate object URLs for preview thumbnails ; revoke on cleanup so
  // we don't leak browser memory if the user cycles many files.
  useEffect(() => {
    const urls = pendingFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pendingFiles]);

  const action = sendChatMessage.bind(null, briefId);

  function onPickFiles(ev: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(ev.target.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    setPendingFiles((prev) => [...prev, ...list]);
    // Allow re-picking the same file later
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(fd: FormData) {
    // Append the staged files into the FormData under the "attachments" key
    pendingFiles.forEach((f) => fd.append("attachments", f));
    startTransition(async () => {
      await action(fd);
      setDraft("");
      setPendingFiles([]);
    });
  }

  const canSubmit = !pending && (draft.trim().length > 0 || pendingFiles.length > 0);

  return (
    <div className="mt-4 flex flex-col">
      <div
        ref={scrollRef}
        className="flex h-[400px] flex-col gap-3 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-4"
      >
        {initialMessages.length === 0 && !pending && (
          <div className="m-auto text-center text-xs text-[var(--color-muted-foreground)]">
            Pas encore de messages — démarre la conversation, joins des images
            de référence si tu veux montrer un style.
          </div>
        )}
        {initialMessages.map((m) => (
          <Bubble
            key={m.id}
            role={m.role}
            content={m.content}
            attachments={m.attachments}
          />
        ))}
        {pending && <Bubble role="assistant" content="…" pulse />}
      </div>

      <form
        className="mt-3 flex flex-col gap-2"
        action={onSubmit}
      >
        {/* Pending attachments preview */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-2">
            {pendingFiles.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="group relative h-16 w-16 overflow-hidden rounded-md border border-[var(--color-border)]"
              >
                {previewUrls[i] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrls[i]}
                    alt={f.name}
                    className="h-full w-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                  title="Retirer"
                >
                  ✕
                </button>
              </div>
            ))}
            <span className="self-center text-[10px] text-[var(--color-muted-foreground)]">
              {pendingFiles.length} image
              {pendingFiles.length > 1 ? "s" : ""} prête
              {pendingFiles.length > 1 ? "s" : ""} — analysées par Claude vision à l&apos;envoi
            </span>
          </div>
        )}

        <textarea
          name="content"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={pending}
          placeholder={
            pendingFiles.length > 0
              ? "Décris ce que tu veux faire avec ces images… (optionnel)"
              : "Écris ta réponse… (Ctrl+Entrée pour envoyer)"
          }
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPickFiles}
          className="hidden"
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-foreground)] disabled:opacity-50"
            title="Joindre des images de référence (analysées par Claude vision)"
          >
            📎 Joindre des images
          </button>
          <button
            disabled={!canSubmit}
            className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? pendingFiles.length > 0
                ? "Upload + envoi…"
                : "Envoi…"
              : pendingFiles.length > 0
              ? `Envoyer (${pendingFiles.length} image${pendingFiles.length > 1 ? "s" : ""})`
              : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({
  role,
  content,
  attachments,
  pulse,
}: {
  role: string;
  content: string;
  attachments?: Attachment[];
  pulse?: boolean;
}) {
  const isUser = role === "user";
  const hasAttachments = attachments && attachments.length > 0;
  return (
    <div
      className={`flex max-w-[85%] flex-col gap-2 rounded-2xl px-3 py-2 text-sm ${
        isUser
          ? "self-end bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
          : "self-start border border-[var(--color-border)] bg-[var(--color-card)]"
      } ${pulse ? "animate-pulse" : ""}`}
    >
      {hasAttachments && (
        <div className="grid grid-cols-2 gap-1.5">
          {attachments.map((a) =>
            a.signed_url ? (
              <a
                key={a.inspiration_id}
                href={a.signed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md ring-1 ring-white/20 transition hover:ring-white/50"
                title="Ouvrir en grand"
              >
                <Image
                  src={a.signed_url}
                  alt="attachment"
                  width={140}
                  height={140}
                  className="h-32 w-full object-cover"
                  unoptimized
                />
              </a>
            ) : (
              <div
                key={a.inspiration_id}
                className="flex h-32 items-center justify-center rounded-md bg-black/20 text-[10px] opacity-60"
              >
                ⚠ image expirée
              </div>
            )
          )}
        </div>
      )}
      {content && <span className="whitespace-pre-wrap">{content}</span>}
    </div>
  );
}
