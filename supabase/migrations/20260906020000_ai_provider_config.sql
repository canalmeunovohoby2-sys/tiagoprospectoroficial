-- Configuração de IA por usuário (FASE 5.34).
-- Chaves ficam SOMENTE nesta tabela (server-side). O cliente nunca pode SELECT
-- (sem política de leitura) — todo acesso é via edge function (service role).
create table if not exists public.ai_provider_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('deepseek','nvidia','openai','gemini')),
  api_key text,
  model text,
  enabled boolean not null default true,
  is_default boolean not null default false,
  fallback_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.ai_provider_config enable row level security;

-- Dono pode atualizar/remover suas linhas, mas NÃO ler (chaves nunca chegam ao cliente).
create policy "owner_update_config"
  on public.ai_provider_config for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "owner_delete_config"
  on public.ai_provider_config for delete
  to authenticated
  using (auth.uid() = user_id);
