-- ─────────────────────────────────────────────────────────────────────────
-- Agency OS — couche pipeline + agents spécialisés + mémoire client
-- ─────────────────────────────────────────────────────────────────────────
-- Cette migration est STRICTEMENT ADDITIVE : aucune table existante de la
-- partie créa (projects, briefs, generations, landing_pages, concept_research,
-- brands, etc.) n'est modifiée. Tout vit dans des tables neuves liées aux
-- projects par FK.
--
-- Tables créées :
--   1. client_agency_profile   — extension 1:1 de projects (onboarding, vertical)
--   2. pipeline_steps          — état kanban : 1 ligne par (client, étape)
--   3. agent_runs              — chaque exécution d'un agent
--   4. deliverables            — livrables horodatés par étape
--   5. client_memory           — les 7 fichiers mémoire client (1 ligne = 1 fichier)
--   6. agency_playbooks        — savoir cross-client anonymisé
--   7. agent_memory            — méta-apprentissage par agent (transverse)
--   8. compliance_checks       — exécutions à la demande de legal-compliance
--   9. retro_imports           — exports Datablaster ingérés
--
-- RLS : owner-based pour ce sprint (team_members + rôles arriveront plus tard).
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. CLIENT AGENCY PROFILE ─────────────────────────────────────────────
-- Extension 1:1 du projet, dédiée Agency OS. On NE modifie PAS la table
-- projects. Un projet n'est "client agency" que s'il a une ligne ici.
create table if not exists public.client_agency_profile (
  project_id uuid primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vertical text,                       -- assurance-vie-lux | scpi | defisc | banque-privee | autre
  onboarding_data jsonb default '{}'::jsonb,
  -- ↑ shape libre : { fathom_recap, lp_urls[], access:{page,bm,google_ads},
  --                   contraintes_legales, contact_client, … }
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_agency_profile_user_idx
  on public.client_agency_profile(user_id);

alter table public.client_agency_profile enable row level security;
drop policy if exists "client_agency_profile_owner" on public.client_agency_profile;
create policy "client_agency_profile_owner" on public.client_agency_profile
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 2. PIPELINE STEPS ────────────────────────────────────────────────────
-- Une ligne par (projet, étape). C'est l'état du kanban.
-- step_key ∈ {
--   'onboarding',
--   '01-market-research', '02-angles-promesses', '03-broad-mix',
--   '04-video-founder-ads', '05-image-concepts', '06-landing-page',
--   '07-quiz-funnel', '08-video-brief', '09-tracking',
--   '10-campaign-setup', 'retrospective', 'export-memory'
-- }
-- status :
--   todo          — pas encore lancée
--   in_progress   — agent en train de tourner
--   gate_pending  — livrable produit, en attente du Loom client + validation
--   validated     — validée (passage à l'étape suivante autorisé)
--   skipped       — étape sautée volontairement
--   failed        — l'agent a échoué
create table if not exists public.pipeline_steps (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_key text not null,
  status text not null default 'todo'
    check (status in ('todo','in_progress','gate_pending','validated','skipped','failed')),
  current_run_id uuid,                 -- → agent_runs.id (sans FK pour éviter cycle)
  has_gate boolean not null default false,
  validated_at timestamptz,
  validated_by uuid references auth.users(id),
  notes text,
  updated_at timestamptz not null default now(),
  unique (project_id, step_key)
);

create index if not exists pipeline_steps_project_idx
  on public.pipeline_steps(project_id, step_key);
create index if not exists pipeline_steps_status_idx
  on public.pipeline_steps(status, updated_at desc);

alter table public.pipeline_steps enable row level security;
drop policy if exists "pipeline_steps_owner" on public.pipeline_steps;
create policy "pipeline_steps_owner" on public.pipeline_steps
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 3. AGENT RUNS ────────────────────────────────────────────────────────
-- Chaque exécution d'un agent (un appel à l'API Anthropic).
create table if not exists public.agent_runs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_key text not null,              -- même domaine que pipeline_steps.step_key
  agent_key text not null,             -- ex: 'market-research', 'creative-strategist'
  model text not null,                 -- modèle utilisé (ex: 'claude-opus-4-8')
  status text not null default 'running'
    check (status in ('running','done','failed','cancelled')),
  input_snapshot jsonb,                -- mémoire + paramètres au moment de l'appel (debug/audit)
  output jsonb,                        -- réponse structurée (texte + blocs typés)
  deliverable_id uuid,                 -- → deliverables.id (FK ajoutée plus bas)
  prompt_tokens int,
  completion_tokens int,
  cache_read_tokens int,
  cache_creation_tokens int,
  cost_estimate_usd numeric(10,4),     -- estimation calculée par le routing serveur
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_runs_project_idx
  on public.agent_runs(project_id, started_at desc);
create index if not exists agent_runs_step_idx
  on public.agent_runs(project_id, step_key, started_at desc);

alter table public.agent_runs enable row level security;
drop policy if exists "agent_runs_owner" on public.agent_runs;
create policy "agent_runs_owner" on public.agent_runs
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 4. DELIVERABLES ──────────────────────────────────────────────────────
-- Livrables horodatés produits par les agents. content_md est la source
-- d'export "mémoire markdown pure" du projet.
create table if not exists public.deliverables (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_key text not null,
  agent_key text not null,
  kind text not null,                  -- ex: 'icp', 'broad-mix', 'founder-script', 'shot-list', 'tracking-plan'
  title text not null,
  content_md text not null,            -- livrable markdown (source de vérité, exportable)
  structured jsonb,                    -- version structurée (optionnel, ex: JSON Schema)
  file_paths jsonb,                    -- pièces jointes Storage (optionnel)
  run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists deliverables_project_idx
  on public.deliverables(project_id, step_key, created_at desc);

alter table public.deliverables enable row level security;
drop policy if exists "deliverables_owner" on public.deliverables;
create policy "deliverables_owner" on public.deliverables
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- FK différée agent_runs.deliverable_id → deliverables.id
alter table public.agent_runs
  drop constraint if exists agent_runs_deliverable_id_fkey;
alter table public.agent_runs
  add constraint agent_runs_deliverable_id_fkey
  foreign key (deliverable_id) references public.deliverables(id) on delete set null;


-- ── 5. CLIENT MEMORY ─────────────────────────────────────────────────────
-- Les 7 fichiers mémoire du client, persistés en DB (1 ligne = 1 fichier).
-- Export markdown pur via /export-memory : on concatène le content_md.
-- slug ∈ {
--   'client-profile', 'brand-voice', 'icp', 'angles-promesses',
--   'creative-learnings', 'compliance-notes', 'decisions-log'
-- }
create table if not exists public.client_memory (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  content_md text not null default '',
  version int not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create index if not exists client_memory_project_idx
  on public.client_memory(project_id);

alter table public.client_memory enable row level security;
drop policy if exists "client_memory_owner" on public.client_memory;
create policy "client_memory_owner" on public.client_memory
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 6. AGENCY PLAYBOOKS ──────────────────────────────────────────────────
-- Savoir cross-client anonymisé : hooks gagnants, structures de campagne,
-- fiches par verticale. Accessible à tous les membres (user_id = owner du
-- workspace pour l'instant — sera ouvert à la team plus tard via RLS).
create table if not exists public.agency_playbooks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,                  -- 'winning-hooks-bank' | 'vertical-assurance-vie-lux' | …
  title text not null,
  content_md text not null default '',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

alter table public.agency_playbooks enable row level security;
drop policy if exists "agency_playbooks_owner" on public.agency_playbooks;
create policy "agency_playbooks_owner" on public.agency_playbooks
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 7. AGENT MEMORY ──────────────────────────────────────────────────────
-- Méta-apprentissage par agent : ce qui marche / ne marche pas dans la
-- pratique de cet agent, raffinements transverses. Alimenté par learning-curator.
create table if not exists public.agent_memory (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_key text not null,
  content_md text not null default '',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, agent_key)
);

alter table public.agent_memory enable row level security;
drop policy if exists "agent_memory_owner" on public.agent_memory;
create policy "agent_memory_owner" on public.agent_memory
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 8. COMPLIANCE CHECKS ─────────────────────────────────────────────────
-- Exécutions à la demande de legal-compliance. JAMAIS automatique : c'est
-- l'utilisateur qui déclenche, l'agent rend un verdict ✅/❌ avec corrections.
create table if not exists public.compliance_checks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_kind text not null,            -- 'copy-video' | 'copy-image' | 'landing-page' | 'quiz' | 'script'
  asset_ref text,                      -- id du brief / deliverable / lp source, libre
  asset_content_md text not null,      -- ce qui a été vérifié (snapshot)
  verdict text not null check (verdict in ('ok','nok','partial')),
  issues jsonb,                        -- liste structurée des points relevés
  corrections_md text,                 -- corrections proposées
  corrected_version_md text,           -- version corrigée prête à utiliser
  references_used jsonb,               -- ACPR 2019-R-01, ARPP, AMF, Code assurances, etc.
  run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists compliance_checks_project_idx
  on public.compliance_checks(project_id, created_at desc);

alter table public.compliance_checks enable row level security;
drop policy if exists "compliance_checks_owner" on public.compliance_checks;
create policy "compliance_checks_owner" on public.compliance_checks
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 9. RETRO IMPORTS ─────────────────────────────────────────────────────
-- Exports Datablaster (ou autres) ingérés pour la rétrospective.
-- learning-curator les lit et met à jour creative-learnings + playbooks.
create table if not exists public.retro_imports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'datablaster',
  file_path text,                      -- bucket Supabase Storage (uploadé par l'UI)
  raw_csv text,                        -- ou contenu collé en brut
  parsed jsonb,                        -- normalisation : lignes {ad, hook, cpl, ctr, hook_rate, roas, status}
  period_start date,
  period_end date,
  status text not null default 'pending'
    check (status in ('pending','parsed','analysed','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists retro_imports_project_idx
  on public.retro_imports(project_id, created_at desc);

alter table public.retro_imports enable row level security;
drop policy if exists "retro_imports_owner" on public.retro_imports;
create policy "retro_imports_owner" on public.retro_imports
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 10. TRIGGERS updated_at ──────────────────────────────────────────────
-- Fonction générique réutilisable.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.client_agency_profile;
create trigger set_updated_at before update on public.client_agency_profile
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.pipeline_steps;
create trigger set_updated_at before update on public.pipeline_steps
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.client_memory;
create trigger set_updated_at before update on public.client_memory
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.agency_playbooks;
create trigger set_updated_at before update on public.agency_playbooks
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.agent_memory;
create trigger set_updated_at before update on public.agent_memory
  for each row execute function public.tg_set_updated_at();
