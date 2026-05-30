-- ============================================================================
-- Brands : enrichissement pour scan de landing page
-- ============================================================================
-- Ajoute :
--   - landing_page_url    : l'URL source scannée (pour traçabilité + re-scan)
--   - logo_storage_path   : chemin du logo téléchargé dans le bucket
--                            "brand_resources" (convention <user_id>/<brand_id>/logo.{ext})
--   - logo_mime_type      : pour signed URL avec bonne content-type
-- ============================================================================

alter table public.brands
  add column if not exists landing_page_url text;

alter table public.brands
  add column if not exists logo_storage_path text;

alter table public.brands
  add column if not exists logo_mime_type text;
