-- Project knowledge structuring
-- ─────────────────────────────────────────────────────────────────────────
-- The user uploads documents (PDF, DOCX, scripts, past ads…) to the project's
-- knowledge base. Once they hit "Structurer", Claude reads everything and
-- produces a condensed structured product brief stored on the project. The
-- user can then refine it via a chat (corrections, additions) — each turn
-- updates the structured_knowledge AND appends to the chat history.
-- ─────────────────────────────────────────────────────────────────────────

-- Structured product brief produced by Claude from the knowledge files.
-- See src/lib/structured-knowledge-schema.ts for the JSON shape.
alter table public.projects
  add column if not exists structured_knowledge jsonb;

-- Chat history for the knowledge structuring conversation. Same shape as
-- brief_messages but scoped to the project (no brief involved).
create table if not exists public.project_knowledge_messages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_knowledge_messages_project_id_idx
  on public.project_knowledge_messages(project_id, created_at);

alter table public.project_knowledge_messages enable row level security;

drop policy if exists "project_knowledge_messages_owner"
  on public.project_knowledge_messages;
create policy "project_knowledge_messages_owner"
  on public.project_knowledge_messages
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );
