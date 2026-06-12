-- ─────────────────────────────────────────────────────────────────────────
-- Policies Storage pour les buckets agency-docs et agent-knowledge
-- ─────────────────────────────────────────────────────────────────────────
-- Fix : les buckets ont été créés via l'API admin (service role) mais sans
-- policies sur storage.objects → tout upload par un utilisateur authentifié
-- violait la RLS (« new row violates row-level security policy »).
--
-- Pattern identique aux buckets existants (knowledge, inspirations,
-- generated) : le premier dossier du path est l'uid de l'utilisateur.
--   agency-docs     : <userId>/<projectId>/<ts>-<filename>
--   agent-knowledge : <userId>/<agentKey>/<ts>-<filename>

-- ── agency-docs ──────────────────────────────────────────────────────────
drop policy if exists "agency_docs_owner_select" on storage.objects;
create policy "agency_docs_owner_select" on storage.objects for select
  using (bucket_id = 'agency-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agency_docs_owner_insert" on storage.objects;
create policy "agency_docs_owner_insert" on storage.objects for insert
  with check (bucket_id = 'agency-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agency_docs_owner_update" on storage.objects;
create policy "agency_docs_owner_update" on storage.objects for update
  using (bucket_id = 'agency-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agency_docs_owner_delete" on storage.objects;
create policy "agency_docs_owner_delete" on storage.objects for delete
  using (bucket_id = 'agency-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── agent-knowledge ──────────────────────────────────────────────────────
drop policy if exists "agent_knowledge_owner_select" on storage.objects;
create policy "agent_knowledge_owner_select" on storage.objects for select
  using (bucket_id = 'agent-knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agent_knowledge_owner_insert" on storage.objects;
create policy "agent_knowledge_owner_insert" on storage.objects for insert
  with check (bucket_id = 'agent-knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agent_knowledge_owner_update" on storage.objects;
create policy "agent_knowledge_owner_update" on storage.objects for update
  using (bucket_id = 'agent-knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agent_knowledge_owner_delete" on storage.objects;
create policy "agent_knowledge_owner_delete" on storage.objects for delete
  using (bucket_id = 'agent-knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── generated : autorise le préfixe agency/ (visuels concepts P1.2) ──────
-- Les policies existantes du bucket generated exigent <userId> en premier
-- segment ; la génération agency écrit sous agency/<projectId>/… avec le
-- client user → on aligne le path applicatif sur le pattern (fait côté
-- code), pas besoin de policy supplémentaire ici.
