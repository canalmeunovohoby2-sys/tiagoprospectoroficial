-- Autosave 5.24: versões passam a guardar também o snapshot real do workspace
-- (código), para restauração verdadeira do estado — não só a spec.
alter table public.site_project_versions
  add column if not exists files jsonb;
