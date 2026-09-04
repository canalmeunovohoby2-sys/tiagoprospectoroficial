ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS money_score integer,
  ADD COLUMN IF NOT EXISTS pain_score integer,
  ADD COLUMN IF NOT EXISTS final_score integer;

CREATE INDEX IF NOT EXISTS leads_final_score_idx ON public.leads (final_score DESC NULLS LAST);