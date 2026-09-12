-- Async Google Maps scraper pipeline.
-- Adiciona status/counters/warnings/module às buscas e campos de contato
-- (email/raw/source) aos leads. Tudo idempotente.

ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PROCESSING';
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS counters JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS warnings JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS raw JSONB;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS searches_status_idx ON public.searches(status);
CREATE INDEX IF NOT EXISTS searches_user_status_idx ON public.searches(user_id, status, created_at DESC);
