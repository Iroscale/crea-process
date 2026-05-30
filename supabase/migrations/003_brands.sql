-- ============================================================================
-- Phase Brands — DA système pour réutilisation cross-briefs
-- ============================================================================
-- Une "marque" = ensemble cohérent de DA (couleurs, typo, principes, ton, mission)
-- + ressources (uploads, URLs scrapées, texte manuel) qui alimentent un
-- system_prompt compilé. Quand un brief est créé, on choisit une marque ;
-- son system_prompt est injecté dans la finalisation et les prompts d'image
-- pour que TOUS les visuels respectent la même DA.
-- ============================================================================

create extension if not exists "uuid-ossp";

do $$ begin
  create type brand_resource_kind as enum ('manual', 'upload', 'url');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- TABLES
-- =============================================================================

create table if not exists public.brands (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  slug text,                      -- slug auto-généré pour les exports / urls
  description text,               -- pitch en 1-2 phrases
  brand_voice text,               -- tone of voice
  mission text,
  target_audience text,

  -- Direction artistique structurée
  primary_colors text[] default '{}'::text[],   -- ex: ['#1a1a1a', '#FFD700']
  typography text,                              -- ex: "Tiempos Headline + Inter"
  visual_principles text,                       -- ex: "minimal premium dark mode"
  do_say text[] default '{}'::text[],           -- choses à dire
  dont_say text[] default '{}'::text[],         -- choses à éviter

  -- System prompt compilé par Claude depuis brand fields + brand_resources
  system_prompt text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brands_user_id_idx on public.brands(user_id);

create table if not exists public.brand_resources (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,

  kind brand_resource_kind not null,

  -- Pour kind='url' : l'URL fournie + le contenu scrapé
  source_url text,
  scraped_text text,
  scraped_at timestamptz,

  -- Pour kind='upload' : nom de fichier + chemin storage + texte extrait
  source_filename text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  extracted_text text,

  -- Pour kind='manual' : texte saisi par l'utilisateur
  manual_text text,
  -- Optionnel pour les 3 kinds : titre court visible dans la liste
  label text,

  -- Résumé Claude de la ressource (pour compilation system_prompt)
  ai_summary text,

  created_at timestamptz not null default now()
);
create index if not exists brand_resources_brand_id_idx
  on public.brand_resources(brand_id);

-- =============================================================================
-- updated_at trigger
-- =============================================================================
drop trigger if exists brands_updated_at on public.brands;
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.brands enable row level security;
alter table public.brand_resources enable row level security;

drop policy if exists "brands_owner" on public.brands;
create policy "brands_owner" on public.brands
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "brand_resources_owner" on public.brand_resources;
create policy "brand_resources_owner" on public.brand_resources
  for all using (
    exists (select 1 from public.brands b where b.id = brand_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = brand_id and b.user_id = auth.uid())
  );

-- =============================================================================
-- STORAGE BUCKET
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('brand_resources', 'brand_resources', false)
on conflict (id) do nothing;

-- Owner-folder convention : "<user_id>/<brand_id>/<filename>"
drop policy if exists "brand_resources_owner_select" on storage.objects;
create policy "brand_resources_owner_select" on storage.objects for select
  using (bucket_id = 'brand_resources' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_resources_owner_insert" on storage.objects;
create policy "brand_resources_owner_insert" on storage.objects for insert
  with check (bucket_id = 'brand_resources' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_resources_owner_update" on storage.objects;
create policy "brand_resources_owner_update" on storage.objects for update
  using (bucket_id = 'brand_resources' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_resources_owner_delete" on storage.objects;
create policy "brand_resources_owner_delete" on storage.objects for delete
  using (bucket_id = 'brand_resources' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- BRIEFS — colonne brand_id (nullable, pour ne pas casser les briefs existants)
-- =============================================================================
alter table public.briefs
  add column if not exists brand_id uuid references public.brands(id) on delete set null;
create index if not exists briefs_brand_id_idx on public.briefs(brand_id);
