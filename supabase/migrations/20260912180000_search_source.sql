-- Fonte real usada na busca (ex.: google_maps_scraper, geoapify).
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS source TEXT;
