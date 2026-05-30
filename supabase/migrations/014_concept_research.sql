-- Concept research module
-- ─────────────────────────────────────────────────────────────────────────
-- "Recherche de nouveaux concepts" : pour ne jamais manquer d'angles
-- marketing. Une recherche lance Claude + web_search sur une niche / produit
-- et produit des angles, pain points, questions Reddit/forums, sujets de
-- contenu, tendances marché et angles concurrents — avec sources citées.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.concept_research (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  niche text not null,            -- sujet recherché
  region text default 'international',
  status text not null default 'pending'
    check (status in ('pending', 'researching', 'done', 'failed')),
  result jsonb,                   -- output structuré (voir concept-research.ts)
  sources jsonb,                  -- URLs citées par le web search
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists concept_research_project_id_idx
  on public.concept_research(project_id, created_at desc);

alter table public.concept_research enable row level security;
drop policy if exists "concept_research_owner" on public.concept_research;
create policy "concept_research_owner" on public.concept_research
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
