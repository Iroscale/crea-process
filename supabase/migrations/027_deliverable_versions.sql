-- ─────────────────────────────────────────────────────────────────────────
-- P0.4 — Versioning des livrables
-- ─────────────────────────────────────────────────────────────────────────
-- Corrige F4 : saveDeliverableAction écrasait content_md sans historique,
-- chaque relance d'étape créait une nouvelle ligne sans lien avec la
-- précédente, et aucun statut par livrable n'existait.
--
-- Additif uniquement.

-- 1. Version, statut et lineage sur les livrables
alter table public.deliverables
  add column if not exists version int not null default 1,
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'validated', 'delivered', 'archived')),
  add column if not exists parent_deliverable_id uuid
    references public.deliverables(id) on delete set null;

create index if not exists deliverables_status_idx
  on public.deliverables(project_id, status);

-- 2. Snapshots des versions précédentes
create table if not exists public.deliverable_versions (
  id uuid primary key default uuid_generate_v4(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null,
  content_md text not null,
  structured jsonb,
  -- d'où vient la modification qui a remplacé cette version
  source text not null check (source in ('agent', 'chat', 'manual')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (deliverable_id, version)
);

create index if not exists deliverable_versions_idx
  on public.deliverable_versions(deliverable_id, version desc);

alter table public.deliverable_versions enable row level security;
drop policy if exists "deliverable_versions_owner" on public.deliverable_versions;
create policy "deliverable_versions_owner" on public.deliverable_versions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
