-- Image attachments on brief messages
-- ─────────────────────────────────────────────────────────────────────────
-- Lets the user drop image references directly inside the chat (not just
-- via the standalone Inspirations zone). Each attachment is also persisted
-- as a brief_inspiration row so the agent picks up the vision analysis
-- automatically via chatTurn — the chat just gets a visual handle on top.
--
-- Shape : { inspiration_id, storage_path, mime_type }[]
-- ─────────────────────────────────────────────────────────────────────────

alter table public.brief_messages
  add column if not exists attachments jsonb;
