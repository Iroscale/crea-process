-- Landing pages module
-- ─────────────────────────────────────────────────────────────────────────
-- Each landing_page record = one LP campaign tied to a project. The user
-- picks ONE of 3 templates (trust-funnel / story-pivot / quiz-lead), Claude
-- produces both an A and a B copy variant, the user can refine via chat,
-- and eventually publishes via Unbounce API (later phase).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.landing_pages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  region text default 'international',

  title text,
  user_input text, -- short brief from user (objective, audience, offer)
  template_id text not null default 'trust-funnel'
    check (template_id in ('trust-funnel', 'story-pivot', 'quiz-lead')),
  status text not null default 'draft'
    check (status in ('draft', 'generating', 'ready', 'published', 'archived')),

  -- Claude output ---------------------------------------------------------
  brief jsonb,        -- { product, audience, objective, hook_angle, cta_destination }
  content_a jsonb,    -- full structured LP content — variant A
  content_b jsonb,    -- full structured LP content — variant B (A/B test)

  -- Optional Unbounce binding ---------------------------------------------
  unbounce_page_id text,
  unbounce_published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists landing_pages_project_id_idx
  on public.landing_pages(project_id, updated_at desc);
create index if not exists landing_pages_user_id_idx
  on public.landing_pages(user_id, updated_at desc);

alter table public.landing_pages enable row level security;
drop policy if exists "landing_pages_owner" on public.landing_pages;
create policy "landing_pages_owner" on public.landing_pages
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Chat history per landing page (refinement conversation, similar to brief_messages)
create table if not exists public.landing_page_messages (
  id uuid primary key default uuid_generate_v4(),
  landing_page_id uuid not null references public.landing_pages(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists landing_page_messages_lp_id_idx
  on public.landing_page_messages(landing_page_id, created_at);

alter table public.landing_page_messages enable row level security;
drop policy if exists "landing_page_messages_owner" on public.landing_page_messages;
create policy "landing_page_messages_owner" on public.landing_page_messages
  for all using (
    exists (
      select 1 from public.landing_pages lp
      where lp.id = landing_page_id and lp.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.landing_pages lp
      where lp.id = landing_page_id and lp.user_id = auth.uid()
    )
  );
