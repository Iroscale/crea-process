-- ─────────────────────────────────────────────────────────────────────────
-- Ressources (fichiers) attachées au knowledge d'un agent
-- ─────────────────────────────────────────────────────────────────────────
-- Strictement additif. Étend agent_knowledge avec des colonnes file_*
-- pour permettre l'upload de PDF/DOCX/images en complément du markdown
-- saisi à la main. Le contenu effectif injecté à l'agent reste content_md
-- (rempli automatiquement avec le parsed_text quand un fichier est uploadé).

alter table public.agent_knowledge
  add column if not exists file_path text,    -- chemin dans bucket agent-knowledge
  add column if not exists file_name text,    -- nom original lisible
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists parse_status text default 'n/a'
    check (parse_status in ('n/a', 'done', 'skipped', 'failed'));

-- Index pour query "knowledge avec fichier"
create index if not exists agent_knowledge_files_idx
  on public.agent_knowledge(user_id, agent_key)
  where file_path is not null;
