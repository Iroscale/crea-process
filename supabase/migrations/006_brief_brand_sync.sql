-- ============================================================================
-- Trace which brand_id was associated to a brief at the moment of its last
-- finalization. If briefs.brand_id != briefs.brand_id_at_finalize, the brief
-- was re-tagged AFTER finalize → the brief_data (angles + concepts) doesn't
-- reflect the current brand → UI shows a "re-finalize" hint.
-- ============================================================================

alter table public.briefs
  add column if not exists brand_id_at_finalize uuid;
