-- ============================================================================
-- Ad imports : contexte de campagne pour analyse pertinente Andrometa-style
-- ============================================================================
-- Permet de persister :
--  - campaign_structure : Testing CBO / Scaling CBO / Mixed
--  - meta_objective     : Lead form / Conversions website / Trafic / Autre
--  - analyst_note       : note libre (audience, période, événements)
-- Ces 3 champs sont injectés dans le system prompt de synthèse pour produire
-- une analyse adaptée (testing = chercher les next winners, scaling = chercher
-- saturations).
-- ============================================================================

do $$ begin
  create type ad_campaign_structure as enum (
    'testing',     -- CBO Broad Testing — toutes les nouvelles ads
    'scaling',     -- CBO Broad Scaling — winners transférés
    'mixed',       -- les deux dans le même CSV
    'unknown'      -- non précisé
  );
exception when duplicate_object then null; end $$;

alter table public.ad_imports
  add column if not exists campaign_structure ad_campaign_structure;

alter table public.ad_imports
  add column if not exists meta_objective text;

alter table public.ad_imports
  add column if not exists analyst_note text;
