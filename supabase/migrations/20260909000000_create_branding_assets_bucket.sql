-- Artifacts de Branding/Mockup (10.11) — bucket PRIVADO para PSD/PNGs/SVGs de
-- identidade e mockup, isolado por projeto (path branding/<projectId>/...) e por
-- dono (RLS: apenas o usuário proprietário acessa). Estrutura organizada por
-- projeto e com versões preservadas:
--   branding/<projectId>/identity/*.svg
--   branding/<projectId>/mockups/current/...
--   branding/<projectId>/mockups/versions/<versionId>/...
insert into storage.buckets (id, name, public)
values ('branding-assets', 'branding-assets', false)
on conflict (id) do nothing;

-- Acesso restrito ao proprietário: o runtime autentica pela identidade do usuário;
-- o upload registra o owner (auth.uid()) → isolamento por cliente.
drop policy if exists "branding_assets_owner_all" on storage.objects;
create policy "branding_assets_owner_all"
  on storage.objects for all
  using ( bucket_id = 'branding-assets' and owner = auth.uid() )
  with check ( bucket_id = 'branding-assets' and owner = auth.uid() );
