-- TiagoProspector — Fundação do Gerador de Sites
-- Tabela de projetos de site independentes, com campos estruturados
-- (não um único texto gigante) para edição futura por área.

create table if not exists public.site_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  name text not null default 'Novo site',
  company_name text not null default '',
  segment text,
  city text,
  state text,
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'error')),
  briefing jsonb not null default '{}'::jsonb,
  design_system jsonb not null default '{}'::jsonb,
  site_structure jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  calls_to_action jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  generated_code jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  spec jsonb not null default '{}'::jsonb,
  ai_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_projects_user_idx on public.site_projects (user_id);
create index if not exists site_projects_lead_idx on public.site_projects (lead_id);

alter table public.site_projects enable row level security;

drop policy if exists "site_projects_select_own" on public.site_projects;
create policy "site_projects_select_own"
  on public.site_projects for select
  using (auth.uid() = user_id);

drop policy if exists "site_projects_insert_own" on public.site_projects;
create policy "site_projects_insert_own"
  on public.site_projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "site_projects_update_own" on public.site_projects;
create policy "site_projects_update_own"
  on public.site_projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "site_projects_delete_own" on public.site_projects;
create policy "site_projects_delete_own"
  on public.site_projects for delete
  using (auth.uid() = user_id);

-- Atualiza updated_at automaticamente.
create or replace function public.set_site_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_projects_updated_at on public.site_projects;
create trigger site_projects_updated_at
  before update on public.site_projects
  for each row
  execute function public.set_site_projects_updated_at();
