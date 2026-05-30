-- ============================================================================
-- Brief : ciblage régional (France) pour adapter angles + concepts visuels
-- ============================================================================
-- Permet de cibler une région française (Île-de-France, PACA, Bretagne…) ou
-- de rester en mode international (par défaut, comportement existant).
-- Une fois la région choisie, les prompts d'image et de finalisation Claude
-- s'enrichissent de landmarks, démonymes, architecture, atmosphère locaux.
-- ============================================================================

alter table public.briefs
  add column if not exists region text default 'international';
