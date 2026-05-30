-- ============================================================================
-- Crea Process — Supabase schema
-- Run this in: Supabase Dashboard > SQL Editor > New query > paste & Run
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================
do $$ begin
  create type knowledge_kind as enum ('product_doc', 'copywriting_doc', 'past_ad', 'script', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type brief_mode as enum ('upload', 'chat', 'hybrid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type brief_status as enum ('draft', 'ready', 'generating', 'done', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type generation_status as enum ('queued', 'running', 'done', 'failed');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Projects (one per product / brand)
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  brand_voice text,                -- short tone-of-voice summary
  system_prompt text,              -- compiled system prompt for the agent (built from knowledge files)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_id_idx on public.projects(user_id);

-- Knowledge files attached to a project (the "training" data)
create table if not exists public.knowledge_files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  storage_path text not null,      -- path in the "knowledge" bucket
  mime_type text,
  size_bytes bigint,
  kind knowledge_kind not null default 'other',
  extracted_text text,             -- text content extracted from the file (for prompt assembly)
  created_at timestamptz not null default now()
);
create index if not exists knowledge_files_project_id_idx on public.knowledge_files(project_id);

-- Briefs (each brief = one creative request, going through steps 2 + 3)
create table if not exists public.briefs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  mode brief_mode not null,
  status brief_status not null default 'draft',
  user_input text,                 -- short brief written by the user
  brief_data jsonb,                -- structured brief produced by the agent (DA, copy, hooks, …)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists briefs_project_id_idx on public.briefs(project_id);
create index if not exists briefs_user_id_idx on public.briefs(user_id);

-- Inspiration images (mode A or hybrid) — competitor/reference creatives
create table if not exists public.brief_inspirations (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  analysis jsonb,                  -- vision-extracted DA: composition, palette, style, hooks
  created_at timestamptz not null default now()
);
create index if not exists brief_inspirations_brief_id_idx on public.brief_inspirations(brief_id);

-- Chat messages for mode B / hybrid (conversation with the agent)
create table if not exists public.brief_messages (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists brief_messages_brief_id_idx on public.brief_messages(brief_id);

-- Generation runs (one brief can trigger multiple runs across models)
create table if not exists public.generations (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  copy_headline text,
  copy_body text,
  copy_cta text,
  image_prompt text not null,
  status generation_status not null default 'queued',
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists generations_brief_id_idx on public.generations(brief_id);

-- Individual generated images (one row per model output)
create table if not exists public.generated_images (
  id uuid primary key default uuid_generate_v4(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  model_id text not null,           -- e.g. "fal-ai/flux-pro/v1.1", "fal-ai/imagen4", "fal-ai/ideogram-v3"
  model_label text,                 -- friendly name shown in UI
  image_url text,                   -- public/temporary URL from fal.ai
  storage_path text,                -- path once mirrored to our Supabase Storage
  params jsonb,                     -- request params (size, steps, seed, …)
  status generation_status not null default 'queued',
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists generated_images_generation_id_idx on public.generated_images(generation_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists briefs_updated_at on public.briefs;
create trigger briefs_updated_at before update on public.briefs
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.projects             enable row level security;
alter table public.knowledge_files      enable row level security;
alter table public.briefs               enable row level security;
alter table public.brief_inspirations   enable row level security;
alter table public.brief_messages       enable row level security;
alter table public.generations          enable row level security;
alter table public.generated_images     enable row level security;

-- projects: owner only
drop policy if exists "projects_owner" on public.projects;
create policy "projects_owner" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- knowledge_files: via parent project ownership
drop policy if exists "knowledge_files_owner" on public.knowledge_files;
create policy "knowledge_files_owner" on public.knowledge_files
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- briefs: owner only
drop policy if exists "briefs_owner" on public.briefs;
create policy "briefs_owner" on public.briefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- brief_inspirations: via parent brief
drop policy if exists "brief_inspirations_owner" on public.brief_inspirations;
create policy "brief_inspirations_owner" on public.brief_inspirations
  for all using (
    exists (select 1 from public.briefs b where b.id = brief_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.briefs b where b.id = brief_id and b.user_id = auth.uid())
  );

-- brief_messages: via parent brief
drop policy if exists "brief_messages_owner" on public.brief_messages;
create policy "brief_messages_owner" on public.brief_messages
  for all using (
    exists (select 1 from public.briefs b where b.id = brief_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.briefs b where b.id = brief_id and b.user_id = auth.uid())
  );

-- generations: owner only
drop policy if exists "generations_owner" on public.generations;
create policy "generations_owner" on public.generations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generated_images: via parent generation
drop policy if exists "generated_images_owner" on public.generated_images;
create policy "generated_images_owner" on public.generated_images
  for all using (
    exists (select 1 from public.generations g where g.id = generation_id and g.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.generations g where g.id = generation_id and g.user_id = auth.uid())
  );

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
insert into storage.buckets (id, name, public)
values
  ('knowledge',    'knowledge',    false),
  ('inspirations', 'inspirations', false),
  ('generated',    'generated',    false)
on conflict (id) do nothing;

-- Storage RLS: users can only access objects under a folder named with their user_id.
-- Convention: storage_path = "<user_id>/<project_id>/<filename>"
drop policy if exists "knowledge_owner_select" on storage.objects;
create policy "knowledge_owner_select" on storage.objects for select
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "knowledge_owner_insert" on storage.objects;
create policy "knowledge_owner_insert" on storage.objects for insert
  with check (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "knowledge_owner_update" on storage.objects;
create policy "knowledge_owner_update" on storage.objects for update
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "knowledge_owner_delete" on storage.objects;
create policy "knowledge_owner_delete" on storage.objects for delete
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "inspirations_owner_select" on storage.objects;
create policy "inspirations_owner_select" on storage.objects for select
  using (bucket_id = 'inspirations' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "inspirations_owner_insert" on storage.objects;
create policy "inspirations_owner_insert" on storage.objects for insert
  with check (bucket_id = 'inspirations' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "inspirations_owner_update" on storage.objects;
create policy "inspirations_owner_update" on storage.objects for update
  using (bucket_id = 'inspirations' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "inspirations_owner_delete" on storage.objects;
create policy "inspirations_owner_delete" on storage.objects for delete
  using (bucket_id = 'inspirations' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "generated_owner_select" on storage.objects;
create policy "generated_owner_select" on storage.objects for select
  using (bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "generated_owner_insert" on storage.objects;
create policy "generated_owner_insert" on storage.objects for insert
  with check (bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "generated_owner_update" on storage.objects;
create policy "generated_owner_update" on storage.objects for update
  using (bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "generated_owner_delete" on storage.objects;
create policy "generated_owner_delete" on storage.objects for delete
  using (bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text);
