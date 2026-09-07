-- Adiciona 'ollama' ao CHECK constraint de provider
ALTER TABLE public.ai_provider_config DROP CONSTRAINT IF EXISTS ai_provider_config_provider_check;
ALTER TABLE public.ai_provider_config ADD CONSTRAINT ai_provider_config_provider_check CHECK (provider IN ('deepseek', 'nvidia', 'openai', 'gemini', 'openrouter', 'ollama'));
