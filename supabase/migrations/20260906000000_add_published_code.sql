-- Publicação code-first: guarda o CÓDIGO REAL publicado do projeto (snapshot
-- imutável de generated_code no momento da publicação) além da published_spec
-- (mantida p/ compatibilidade/metadados). A URL pública renderiza o código.
alter table public.site_projects
  add column if not exists published_code jsonb;

-- PostgreSQL exige drop antes de mudar o tipo de retorno.
drop function if exists public.get_public_site(text);

-- Acesso público: também retorna o código publicado.
create function public.get_public_site(p_slug text)
returns table (slug text, name text, published_spec jsonb, published_code jsonb, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select sp.slug, sp.name, sp.published_spec, sp.published_code, sp.published_at
  from public.site_projects sp
  where sp.slug = p_slug and sp.published_status = 'published'
  limit 1;
$$;

revoke all on function public.get_public_site(text) from public;
grant execute on function public.get_public_site(text) to anon, authenticated;
