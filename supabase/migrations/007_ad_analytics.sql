-- ============================================================================
-- Phase Analytics — analyse de pubs Meta / TikTok / Google ads
-- ============================================================================
-- Workflow :
--   1. user upload un CSV → ad_imports row
--   2. parser détecte plateforme + extrait lignes → ad_rows
--   3. (futur) Claude extrait angle/promise/concept par ligne + tag perf
--   4. (futur) synthèse → ad_analyses (winning_angles[], etc.)
--   5. (futur) dashboard PDF + "create brief from learnings"
-- ============================================================================

create extension if not exists "uuid-ossp";

do $$ begin
  create type ad_platform as enum ('meta', 'tiktok', 'google', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ad_import_status as enum ('uploaded', 'parsing', 'parsed', 'analyzing', 'analyzed', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ad_perf_tier as enum ('top', 'mid', 'bottom');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- TABLES
-- =============================================================================

create table if not exists public.ad_imports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,                              -- "Campagne Hiver 2024"
  source_platform ad_platform not null default 'unknown',
  csv_storage_path text,                           -- path in 'ad_imports' bucket
  csv_filename text,
  raw_rows int default 0,                          -- count of rows in the source CSV
  parsed_rows int default 0,                       -- count after dedup / cleaning

  status ad_import_status not null default 'uploaded',
  error_message text,

  -- Hints detected by the parser (currency, date range, KPI columns found)
  detected_columns jsonb,

  parsed_at timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ad_imports_user_id_idx on public.ad_imports(user_id);

create table if not exists public.ad_rows (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid not null references public.ad_imports(id) on delete cascade,

  -- Normalized fields (filled during parse, all optional except ad_name)
  ad_name text not null,
  ad_creative_url text,                            -- if available in CSV
  campaign text,
  ad_set text,                                     -- "ad set" Meta / "ad group" TikTok-Google

  -- Metrics — all nullable since not every CSV has every column
  impressions bigint,
  reach bigint,
  clicks bigint,
  spend numeric(14, 4),                            -- cost / amount spent
  cpm numeric(14, 4),
  cpc numeric(14, 4),
  ctr numeric(8, 5),                               -- 0.0234 = 2.34 %
  conversions bigint,                              -- "Results" / "Conversions"
  cost_per_conversion numeric(14, 4),
  conversion_rate numeric(8, 5),
  roas numeric(12, 4),                             -- when present
  currency text,

  -- AI extraction (Phase 2)
  extracted_angle text,
  extracted_promise text,
  extracted_concept text,
  extracted_render_style text,
  performance_tier ad_perf_tier,

  -- Full original row for traceability / re-extraction
  raw_data jsonb,

  created_at timestamptz not null default now()
);
create index if not exists ad_rows_import_id_idx on public.ad_rows(import_id);
create index if not exists ad_rows_perf_tier_idx
  on public.ad_rows(import_id, performance_tier);

create table if not exists public.ad_analyses (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid not null references public.ad_imports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Claude-produced synthesis (jsonb so structure can evolve)
  winning_angles jsonb,
  winning_promises jsonb,
  winning_concepts jsonb,
  losing_patterns jsonb,
  recommendations jsonb,

  dashboard_pdf_path text,

  created_at timestamptz not null default now()
);
create index if not exists ad_analyses_import_id_idx
  on public.ad_analyses(import_id);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.ad_imports enable row level security;
alter table public.ad_rows enable row level security;
alter table public.ad_analyses enable row level security;

drop policy if exists "ad_imports_owner" on public.ad_imports;
create policy "ad_imports_owner" on public.ad_imports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ad_rows_owner" on public.ad_rows;
create policy "ad_rows_owner" on public.ad_rows
  for all using (
    exists (select 1 from public.ad_imports i where i.id = import_id and i.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.ad_imports i where i.id = import_id and i.user_id = auth.uid())
  );

drop policy if exists "ad_analyses_owner" on public.ad_analyses;
create policy "ad_analyses_owner" on public.ad_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- STORAGE BUCKET
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('ad_imports', 'ad_imports', false)
on conflict (id) do nothing;

drop policy if exists "ad_imports_owner_select" on storage.objects;
create policy "ad_imports_owner_select" on storage.objects for select
  using (bucket_id = 'ad_imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ad_imports_owner_insert" on storage.objects;
create policy "ad_imports_owner_insert" on storage.objects for insert
  with check (bucket_id = 'ad_imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ad_imports_owner_update" on storage.objects;
create policy "ad_imports_owner_update" on storage.objects for update
  using (bucket_id = 'ad_imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ad_imports_owner_delete" on storage.objects;
create policy "ad_imports_owner_delete" on storage.objects for delete
  using (bucket_id = 'ad_imports' and (storage.foldername(name))[1] = auth.uid()::text);
