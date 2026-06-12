-- ─────────────────────────────────────────────────────────────────────────
-- P0.2 — Chat itératif par livrable
-- ─────────────────────────────────────────────────────────────────────────
-- Corrige F2 : la page livrable n'offrait qu'un textarea + save. Le besoin
-- métier central est de discuter avec l'IA sur UN livrable (script, angles,
-- LP…) avec le bon contexte injecté, et d'appliquer les itérations comme
-- nouvelles versions.

create table if not exists public.deliverable_messages (
  id uuid primary key default uuid_generate_v4(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- contenu proposé extrait des balises <UPDATED_DELIVERABLE> si présentes
  proposed_content_md text,
  -- renseigné quand l'opérateur applique la proposition (version créée)
  applied_version int,
  created_at timestamptz not null default now()
);

create index if not exists deliverable_messages_idx
  on public.deliverable_messages(deliverable_id, created_at);

alter table public.deliverable_messages enable row level security;
drop policy if exists "deliverable_messages_owner" on public.deliverable_messages;
create policy "deliverable_messages_owner" on public.deliverable_messages
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
