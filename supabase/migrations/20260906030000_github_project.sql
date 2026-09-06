-- GitHub por projeto (FASE 5.36) — conexão, vínculo e estado de sincronização.
-- Tokens de acesso ficam SOMENTE em github_connections (service role).
-- Nenhuma política de SELECT para o dono (cliente nunca lê tokens).

create table if not exists public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_login text not null,
  access_token text not null,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.github_connections enable row level security;
create policy "owner_update_github_connection" on public.github_connections
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner_delete_github_connection" on public.github_connections
  for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.github_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.github_oauth_states enable row level security;

create table if not exists public.site_project_github (
  site_project_id uuid primary key references public.site_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  owner text not null,
  repo text not null,
  repo_id bigint,
  branch text not null default 'main',
  synced_commit text,
  synced_at timestamptz,
  status text not null default 'linked', -- linked | conflict | error
  error text,
  synced_files jsonb not null default '{}'::jsonb, -- {path: {sha, updated_at}}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, owner, repo)
);
alter table public.site_project_github enable row level security;
-- Dono vê APENAS metadados (colunas sem token estão nesta tabela; sem chaves aqui).
create policy "owner_select_site_project_github" on public.site_project_github
  for select to authenticated using (auth.uid() = user_id);
create policy "owner_insert_site_project_github" on public.site_project_github
  for insert to authenticated with check (auth.uid() = user_id);
create policy "owner_update_site_project_github" on public.site_project_github
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner_delete_site_project_github" on public.site_project_github
  for delete to authenticated using (auth.uid() = user_id);
