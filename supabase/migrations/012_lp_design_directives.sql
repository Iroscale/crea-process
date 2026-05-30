-- Premium design / CRO directives for landing pages
-- ─────────────────────────────────────────────────────────────────────────
-- Output of the Claude "designer" agent : an opinionated design system +
-- CRO directives (sticky CTA, urgency markers, social proof placement,
-- animations…) applied on top of content_a / content_b at render time.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.landing_pages
  add column if not exists design_directives jsonb;
