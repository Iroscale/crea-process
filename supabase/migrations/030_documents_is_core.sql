-- ─────────────────────────────────────────────────────────────────────────
-- P0.7 — Documents cœur (is_core) injectés en entier
-- ─────────────────────────────────────────────────────────────────────────
-- Corrige F6 : le document ICP uploadé — l'input fondateur du système —
-- arrivait amputé à 1 500 caractères chez les agents.
--
-- Les documents marqués is_core (ICP, brief client) sont injectés EN
-- ENTIER (cap 80 000 chars chacun) ; les autres en extrait (30 000).
-- Cap total : 150 000 chars (le prompt caching absorbe le coût).

alter table public.client_documents
  add column if not exists is_core boolean not null default false;
