-- Foto real do estabelecimento (Google Places Photo resource name).
-- Formato: places/{place_id}/photos/{photo_reference}
-- A imagem é servida via Edge Function proxy (place-photo), sem expor a API key.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS photo_name TEXT;
