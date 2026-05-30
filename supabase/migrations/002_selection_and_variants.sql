-- ============================================================================
-- Phase 2 + 3 — selection state + variant linkage on generated_images
-- ============================================================================
-- Adds:
--   - selected      : whether the user picked this image after the 1:1 batch
--   - parent_image_id : when a row is a derived variant (e.g. 9:16 redesign
--                       of a master 1:1), this points back to the master.
--
-- Phase 3 corrections (text edit, legal mentions) modify the master row IN
-- PLACE and store the previous storage_path in params.history[]. Only the
-- 9:16 conversion creates a NEW row (with parent_image_id = master.id) so we
-- can keep the 1:1 master untouched.
-- ============================================================================

alter table public.generated_images
  add column if not exists selected boolean not null default false;

alter table public.generated_images
  add column if not exists parent_image_id uuid
    references public.generated_images(id) on delete cascade;

create index if not exists generated_images_parent_idx
  on public.generated_images(parent_image_id);

create index if not exists generated_images_selected_idx
  on public.generated_images(selected) where selected = true;
