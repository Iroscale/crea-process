"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  sendLandingPageChatMessage,
  resetLandingPageChat,
} from "../actions";

type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

export default function LandingPageChat({
  projectId,
  lpId,
  initialMessages,
  hasContent,
}: {
  projectId: string;
  lpId: string;
  initialMessages: Message[];
  hasContent: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [resetting, startReset] = useTransition();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [initialMessages.length, pending]);

  const sendAction = sendLandingPageChatMessage.bind(null, projectId, lpId);

  return (
    <div className="mt-4 flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          💬 Refine via chat
        </span>
        {initialMessages.length > 0 && (
          <button
            type="button"
            disabled={resetting}
            onClick={() => {
              if (window.confirm("Vider l'historique du chat ?")) {
                startReset(() => resetLandingPageChat(projectId, lpId));
              }
            }}
            className="text-[10px] text-[var(--color-muted-foreground)] hover:text-red-300 disabled:opacity-50"
          >
            {resetting ? "Reset…" : "🗑 Vider"}
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex h-[360px] flex-col gap-3 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-4"
      >
        {initialMessages.length === 0 && !pending && (
          <div className="m-auto max-w-md text-center text-xs text-[var(--color-muted-foreground)]">
            {hasContent
              ? "💬 Envoie une correction ou un ajout. La LP sera régénérée pour intégrer ton retour."
              : "Génère d'abord la LP pour activer le chat."}
          </div>
        )}
        {initialMessages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}
        {pending && <Bubble role="assistant" content="…" pulse />}
      </div>

      <form
        className="mt-3 flex flex-col gap-2"
        action={(fd) => {
          startTransition(async () => {
            await sendAction(fd);
            setDraft("");
          });
        }}
      >
        <textarea
          name="content"
          rows={2}
          required
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={pending || !hasContent}
          placeholder={
            hasContent
              ? "Correction ou ajout… (Ctrl+Entrée pour envoyer)"
              : "Génère d'abord la LP."
          }
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
        />
        <div className="flex justify-end">
          <button
            disabled={pending || !draft.trim() || !hasContent}
            className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({
  role,
  content,
  pulse,
}: {
  role: string;
  content: string;
  pulse?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div
      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
        isUser
          ? "self-end bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
          : "self-start bg-[var(--color-card)] border border-[var(--color-border)]"
      } ${pulse ? "animate-pulse" : ""}`}
    >
      {content}
    </div>
  );
}
