-- ─────────────────────────────────────────────────────────────────────────
-- P0.3 — Livrables structurés par items + lineage
-- ─────────────────────────────────────────────────────────────────────────
-- Corrige F3 : angles, scripts, concepts sortaient en un blob markdown
-- unique. Impossible de valider l'angle 3 et rejeter le 5, de choisir le
-- nombre de scripts, de rattacher script → angle de façon vérifiée, ou de
-- régénérer un seul item.
--
-- Chaque livrable « structuré » (angles, scripts, primary texts, concepts
-- image) est désormais décomposé en items individuellement validables.
-- L'aval consomme les items VALIDÉS (status='validated'), pas du markdown
-- libre.

create table if not exists public.deliverable_items (
  id uuid primary key default uuid_generate_v4(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,              -- slug stable, ex: 'angle-fiscalite-claire'
  kind text not null,                  -- 'angle' | 'script' | 'primary-text' | 'image-concept'
  title text not null,
  content_md text not null,            -- rendu markdown de l'item
  structured jsonb,                    -- champs typés selon kind (hook, lever, cta, visual_prompt…)
  status text not null default 'proposed'
    check (status in ('proposed', 'validated', 'rejected', 'archived')),
  parent_item_id uuid references public.deliverable_items(id) on delete set null,
  -- ↑ script → angle, primary-text → angle (ou script), concept → angle
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, item_key)
);

create index if not exists deliverable_items_deliv_idx
  on public.deliverable_items(deliverable_id, position);
create index if not exists deliverable_items_kind_idx
  on public.deliverable_items(project_id, kind, status);

alter table public.deliverable_items enable row level security;
drop policy if exists "deliverable_items_owner" on public.deliverable_items;
create policy "deliverable_items_owner" on public.deliverable_items
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.deliverable_items;
create trigger set_updated_at before update on public.deliverable_items
  for each row execute function public.tg_set_updated_at();
