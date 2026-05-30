-- ─────────────────────────────────────────────────────────────────────────
-- Documents client — pièces transmises à l'onboarding, conservées tout
-- au long du projet et injectées dans le contexte des agents.
-- ─────────────────────────────────────────────────────────────────────────
-- Strictement additif. Une ligne = 1 fichier uploadé. Le fichier brut vit
-- dans le bucket Storage `agency-docs`. parsed_text contient le texte
-- extrait (PDF/DOCX/TXT) qu'on injecte dans le contexte des agents.

create table if not exists public.client_documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,            -- chemin dans le bucket agency-docs
  file_name text not null,            -- nom original lisible
  mime_type text,
  size_bytes bigint,
  description text,                   -- contexte humain ("Fiche produit V3 reçue le 12 juin")
  parsed_text text,                   -- texte extrait (PDF/DOCX/TXT)
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'done', 'skipped', 'failed')),
  parse_error text,
  is_active boolean not null default true,  -- false = caché du contexte agents sans suppression
  category text,                      -- libre : 'fiche-produit', 'old-ad', 'transcript', 'screenshot-lp'…
  uploaded_at timestamptz not null default now()
);

create index if not exists client_documents_project_idx
  on public.client_documents(project_id, uploaded_at desc);
create index if not exists client_documents_active_idx
  on public.client_documents(project_id, is_active);

alter table public.client_documents enable row level security;
drop policy if exists "client_documents_owner" on public.client_documents;
create policy "client_documents_owner" on public.client_documents
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Bucket Supabase Storage `agency-docs` ───────────────────────────────
-- Le bucket lui-même est créé via le script JS (l'API SQL Storage est
-- limitée). On documente ici les RLS Storage pour rappel humain.
-- Voir scripts/setup-agency-docs-bucket.mjs.
