-- Publicação pública dos Site Projects (URL estável por slug).
alter table public.site_projects
  add column if not exists slug text,
  add column if not exists published_status text not null default 'unpublished'
    check (published_status in ('unpublished', 'published')),
  add column if not exists published_spec jsonb,
  add column if not exists published_at timestamptz;

create unique index if not exists site_projects_slug_key on public.site_projects (slug);

-- Acesso público seguro: retorna apenas campos públicos de projetos publicados.
-- Security definer + busca por slug. Nenhum dado de draft/chat/lead é exposto.
create or replace function public.get_public_site(p_slug text)
returns table (slug text, name text, published_spec jsonb, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select sp.slug, sp.name, sp.published_spec, sp.published_at
  from public.site_projects sp
  where sp.slug = p_slug and sp.published_status = 'published'
  limit 1;
$$;

revoke all on function public.get_public_site(text) from public;
grant execute on function public.get_public_site(text) to anon, authenticated;
