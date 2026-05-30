-- ============================================================================
-- Brand logos — table dédiée avec variantes multiples (couleur / monochrome /
-- carré / wordmark / etc.) et un défaut.
-- ============================================================================
-- Au moment du brief on pourra choisir QUELLE variante embed dans le visuel
-- (ex : logo carré sur fond foncé pour un visuel sombre, wordmark pour un
-- éditorial, monochrome blanc sur fond sombre, etc.).
-- ============================================================================

create table if not exists public.brand_logos (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  label text,                       -- ex : "Logo couleur", "Monochrome blanc"
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists brand_logos_brand_id_idx
  on public.brand_logos(brand_id);
create unique index if not exists brand_logos_default_unique
  on public.brand_logos(brand_id) where is_default = true;

-- RLS — owner via parent brand
alter table public.brand_logos enable row level security;

drop policy if exists "brand_logos_owner" on public.brand_logos;
create policy "brand_logos_owner" on public.brand_logos
  for all using (
    exists (select 1 from public.brands b where b.id = brand_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = brand_id and b.user_id = auth.uid())
  );

-- =============================================================================
-- Migrer les logos existants (scrapés via extractFromUrl) vers brand_logos
-- =============================================================================
insert into public.brand_logos (brand_id, label, storage_path, mime_type, is_default)
select
  id,
  'Logo principal',
  logo_storage_path,
  logo_mime_type,
  true
from public.brands b
where logo_storage_path is not null
  and not exists (
    select 1 from public.brand_logos l where l.brand_id = b.id
  );
