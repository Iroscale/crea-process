-- ─────────────────────────────────────────────────────────────────────────
-- P0.1 — Synchronisation livrables validés → mémoire client
-- ─────────────────────────────────────────────────────────────────────────
-- Corrige la faille F1 : le pipeline promettait que chaque étape lit la
-- mémoire produite par l'étape précédente, mais la validation d'un gate ne
-- faisait qu'un UPDATE de statut. Le contenu du livrable n'atterrissait
-- jamais dans client_memory.
--
-- Additif uniquement. Numérotation : 020-025 sont prises par le module
-- motion-design (en local), on continue à 026.

-- 1. Lien livrable → fichier mémoire cible
alter table public.deliverables
  add column if not exists memory_slug text,           -- slug client_memory cible (nullable)
  add column if not exists applied_to_memory_at timestamptz;

-- 2. Historique des versions de la mémoire client (snapshot avant chaque
--    application). Même pattern que agent_memory_history.
create table if not exists public.client_memory_history (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  version int not null,
  content_md text not null,
  -- d'où vient la nouvelle version qui a remplacé celle-ci
  replaced_by_deliverable_id uuid references public.deliverables(id) on delete set null,
  archived_at timestamptz not null default now()
);

create index if not exists client_memory_history_idx
  on public.client_memory_history(project_id, slug, version desc);

alter table public.client_memory_history enable row level security;
drop policy if exists "client_memory_history_owner" on public.client_memory_history;
create policy "client_memory_history_owner" on public.client_memory_history
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
