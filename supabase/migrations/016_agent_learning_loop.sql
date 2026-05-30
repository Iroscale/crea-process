-- ─────────────────────────────────────────────────────────────────────────
-- Boucle d'apprentissage des agents Agency OS
-- ─────────────────────────────────────────────────────────────────────────
-- Strictement additif. Ne touche à aucune table existante.
--
-- Tables créées :
--   1. agent_knowledge — assets enrichissants injectés au runtime
--      (références, exemples, anti-exemples, règles)
--   2. agent_feedback  — feedback humain sur un agent_run précis
--      (rating, commentaire, version corrigée)
--
-- Boucle :
--   run agent → feedback humain → distillation périodique → agent_memory
--   (chaque nouveau run lit l'agent_memory actualisée)
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. AGENT KNOWLEDGE ───────────────────────────────────────────────────
-- Données dont l'agent doit s'imprégner à chaque appel : exemples de bons
-- livrables à imiter, anti-exemples à éviter, règles métier durables,
-- documents de référence.
create table if not exists public.agent_knowledge (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_key text not null,             -- 'market-research', 'copywriter', etc.
  kind text not null check (kind in (
    'reference',      -- doc de référence (à lire pour s'imprégner)
    'good_example',   -- livrable réussi (à imiter)
    'anti_example',   -- mauvais livrable (à ne pas refaire)
    'rule'            -- règle métier explicite (« toujours faire X »)
  )),
  title text not null,
  content_md text not null,            -- contenu markdown injectable
  tags text[],                         -- ex : {'hook', 'ICP-1', 'lp-hero'}
  weight int not null default 1,       -- priorité 1-5 si on doit filtrer par taille
  is_active boolean not null default true,
  source_note text,                    -- d'où ça vient (« sortie projet X », « brief Thibault 2026-04 »)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_knowledge_user_agent_idx
  on public.agent_knowledge(user_id, agent_key, is_active);
create index if not exists agent_knowledge_kind_idx
  on public.agent_knowledge(agent_key, kind);

alter table public.agent_knowledge enable row level security;
drop policy if exists "agent_knowledge_owner" on public.agent_knowledge;
create policy "agent_knowledge_owner" on public.agent_knowledge
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.agent_knowledge;
create trigger set_updated_at before update on public.agent_knowledge
  for each row execute function public.tg_set_updated_at();


-- ── 2. AGENT FEEDBACK ────────────────────────────────────────────────────
-- Feedback humain sur un agent_run précis. C'est le carburant du
-- refinement. Une fois ingéré dans agent_memory par refineAgent(), on
-- marque `ingested_at` pour ne plus le redonner à manger.
create table if not exists public.agent_feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_key text not null,             -- dénormalisé pour query rapide
  rating smallint check (rating in (-1, 0, 1)),
  -- -1 = mauvais, 0 = neutre, +1 = bon
  tag text,                            -- catégorie courte ex: 'ton-off', 'trop-long', 'manque-verbatim', 'bon-hook'
  comment text,                        -- texte libre explicatif
  corrected_md text,                   -- si l'utilisateur a réécrit, on garde sa version
  ingested_at timestamptz,             -- quand refineAgent() l'a consommé
  ingested_into_version int,           -- version de agent_memory dans laquelle on a intégré
  created_at timestamptz not null default now()
);

create index if not exists agent_feedback_agent_idx
  on public.agent_feedback(user_id, agent_key, created_at desc);
create index if not exists agent_feedback_pending_idx
  on public.agent_feedback(user_id, agent_key)
  where ingested_at is null;
create index if not exists agent_feedback_run_idx
  on public.agent_feedback(run_id);

alter table public.agent_feedback enable row level security;
drop policy if exists "agent_feedback_owner" on public.agent_feedback;
create policy "agent_feedback_owner" on public.agent_feedback
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 3. AGENT MEMORY — historique des versions (sprint 1 a créé la table) ──
-- On enrichit agent_memory créée au sprint 015 pour garder un journal
-- des versions. Pratique pour rollback si une distillation rate.
create table if not exists public.agent_memory_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_key text not null,
  version int not null,
  content_md text not null,
  refined_from_feedback_ids uuid[],    -- IDs de agent_feedback consommés pour cette version
  refined_at timestamptz not null default now(),
  refined_by uuid references auth.users(id),
  notes text                           -- description du changement
);

create index if not exists agent_memory_history_idx
  on public.agent_memory_history(user_id, agent_key, version desc);

alter table public.agent_memory_history enable row level security;
drop policy if exists "agent_memory_history_owner" on public.agent_memory_history;
create policy "agent_memory_history_owner" on public.agent_memory_history
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
