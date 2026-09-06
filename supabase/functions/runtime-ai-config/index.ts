// runtime-ai-config — resolução segura de execução para o Agent Runtime (Node).
// Autentica o runtime via RUNTIME_GATEWAY_SECRET; resolve provider/model/baseUrl/
// apiKey do usuário a partir de ai_provider_config (service role). Nunca expõe a
// chave ao frontend; nunca loga secrets. Gemini → erro explícito (edge-only).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveExecutionConfig } from "../_shared/ai-routing.ts";

const BASE: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
};
const ENV_KEY: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  nvidia: "NVIDIA_API_KEY",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!auth || auth !== Deno.env.get("RUNTIME_GATEWAY_SECRET")) {
      return json({ error: "runtime não autorizado" }, 403);
    }
    const body = await req.json().catch(() => ({})) as { user_id?: string; execution?: { provider?: string; model?: string; fallback?: string } };
    const userId = String(body.user_id ?? "").trim();
    if (!userId) return json({ error: "user_id obrigatório" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Supabase não configurado" }, 500);
    const admin = createClient(url, key);

    const { data: rows } = await admin.from("ai_provider_config").select("provider,api_key,model,enabled,is_default,fallback_provider").eq("user_id", userId);
    const list = Array.isArray(rows) ? rows : [];
    const def = list.find((r) => r.is_default) ?? list.find((r) => r.enabled);
    const global = def
      ? { provider: def.provider ?? undefined, model: def.model ?? undefined, fallback: def.fallback_provider ?? undefined }
      : undefined;
    const projectExec = (body.execution ?? null) as Parameters<typeof resolveExecutionConfig>[0]["project"] ?? undefined;

    const cfg = resolveExecutionConfig({ project: projectExec, global });
    if (!cfg.ok) return json({ error: cfg.error ?? "configuração inválida", provider: cfg.provider, model: cfg.model }, 400);
    if (cfg.provider === "gemini") return json({ error: "Gemini é suportado apenas no fluxo edge (sem adaptador Cline nesta fase).", provider: "gemini" }, 400);

    const row = list.find((r) => r.provider === cfg.provider && r.enabled);
    const apiKey = row?.api_key || Deno.env.get(ENV_KEY[cfg.provider]) || "";
    if (!apiKey) return json({ error: `Chave de API não configurada para ${cfg.provider}.`, provider: cfg.provider, model: cfg.model }, 400);

    return json({ provider: cfg.provider, model: cfg.model, baseUrl: BASE[cfg.provider], apiKey });
  } catch (e) {
    console.error("[runtime-ai-config] error", e instanceof Error ? e.message : String(e));
    return json({ error: "erro interno" }, 500);
  }
});
