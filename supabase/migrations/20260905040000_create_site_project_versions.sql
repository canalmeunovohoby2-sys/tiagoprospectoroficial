-- Histórico de versões (snapshots completos) dos Site Projects.
create table if not exists public.site_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.site_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null,
  spec jsonb not null,
  change_summary text,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create index if not exists site_project_versions_project_idx on public.site_project_versions (project_id, version_number);

alter table public.site_project_versions enable row level security;

drop policy if exists "site_project_versions_select_own" on public.site_project_versions;
create policy "site_project_versions_select_own"
  on public.site_project_versions for select
  using (auth.uid() = user_id);

drop policy if exists "site_project_versions_insert_own" on public.site_project_versions;
create policy "site_project_versions_insert_own"
  on public.site_project_versions for insert
  with check (auth.uid() = user_id);
