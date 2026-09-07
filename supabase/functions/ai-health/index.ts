import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText } from "../_shared/ai.ts";
import { runHealthCheck, type HealthConfigOverride, type ProviderName } from "./handler.ts";

function getEnv(key: string): string | undefined {
  const deno = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return deno?.env?.get(key);
}

const isProvider = (v: string): v is ProviderName => v === "deepseek" || v === "nvidia" || v === "openai" || v === "gemini" || v === "ollama" || v === "openrouter";

// Config de IA REAL do usuário (provider validado/ativo via TESTAR). NUNCA sai
// no response — só a config ativa é testada server-side com a chave do usuário.
async function loadUserConfig(token: string): Promise<HealthConfigOverride | null> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !token) return null;
  const admin = createClient(url, key);
  const { data: user, error } = await admin.auth.getUser(token.replace(/^Bearer\s+/i, ""));
  if (error || !user?.user) return null;
  const { data: rows } = await admin.from("ai_provider_config")
    .select("provider,model,enabled,is_default,fallback_provider,api_key")
    .eq("user_id", user.user.id);
  const list = (rows ?? []) as Array<{ provider: string; model: string | null; enabled: boolean; is_default: boolean; fallback_provider: string | null; api_key: string | null }>;
  // Provider ativo: is_default com chave — EXCETO Ollama (local), que ativa sem chave.
  const def = list.find((r) => r.is_default && (r.api_key || r.provider === "ollama"));
  const cfg: HealthConfigOverride = {
    activeProvider: def && isProvider(def.provider) ? def.provider : null,
    activeModel: def?.model ?? null,
    activeApiKey: def?.api_key ?? undefined,
    fallbackProvider: (def?.fallback_provider && isProvider(def.fallback_provider) && def.provider !== "ollama" ? def.fallback_provider : null) ?? null,
    providers: {},
  };
  for (const r of list) {
    if (!isProvider(r.provider)) continue;
    cfg.providers![r.provider] = {
      hasKey: !!r.api_key,
      // Ollama local é validado pelo TESTE real mesmo sem chave armazenada.
      validated: r.is_default && (!!r.api_key || r.provider === "ollama"),
      model: r.model,
    };
  }
  return cfg;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const config = await loadUserConfig(req.headers.get("Authorization") ?? "");
    const payload = await runHealthCheck({
      getEnv,
      config,
      runProvider: async (provider, model, apiKey) => {
        const result = await generateText({
          provider,
          model,
          apiKey,
          user: "Respond only with OK.",
          maxOutputTokens: 8,
          timeoutMs: 20_000,
          reasoningEffort: undefined,
        });
        return { model: result.model };
      },
    });
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
