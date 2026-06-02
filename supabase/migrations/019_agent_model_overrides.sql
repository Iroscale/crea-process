-- ─────────────────────────────────────────────────────────────────────────
-- Surcharge du modèle LLM par agent et par utilisateur.
-- ─────────────────────────────────────────────────────────────────────────
-- Strictement additif. Permet à un utilisateur de remplacer le modèle
-- déclaré dans le frontmatter d'un agent (.claude/agents/<key>.md) sans
-- toucher au fichier. Si pas de ligne ici : on retombe sur le frontmatter,
-- puis sur MODEL_BY_AGENT (model-routing.ts).
--
-- Multi-provider : la colonne `provider` est dénormalisée pour query
-- rapide (cocktail dashboard), mais la source de vérité reste le
-- catalogue côté code (src/lib/llm/catalog.ts).

create table if not exists public.agent_model_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_key text not null,
  model text not null,                      -- ex: 'claude-opus-4-8', 'gpt-5', 'gemini-2.5-pro'
  provider text not null,                   -- 'anthropic' | 'openai' | 'google'
  updated_at timestamptz not null default now(),
  primary key (user_id, agent_key)
);

alter table public.agent_model_overrides enable row level security;
drop policy if exists "agent_model_overrides_owner" on public.agent_model_overrides;
create policy "agent_model_overrides_owner" on public.agent_model_overrides
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.agent_model_overrides;
create trigger set_updated_at before update on public.agent_model_overrides
  for each row execute function public.tg_set_updated_at();
