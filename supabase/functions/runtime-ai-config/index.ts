// runtime-ai-config — resolução segura de execução para o Agent Runtime (Node).
// Autentica o runtime via RUNTIME_GATEWAY_SECRET; devolve EXCLUSIVAMENTE a IA
// VALIDADA do usuário (ai_provider_config.is_default + api_key, definida por um
// TESTE real). SEM IA validada → ok:false (NUNCA fallback para env/DeepSeek).
// Nunca expõe a chave ao frontend; nunca loga secrets.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  ollama: "http://localhost:11434",
};
const DEFAULT_MODEL: Record<string, string> = {
  deepseek: "deepseek-chat",
  openai: "gpt-4o-mini",
  nvidia: "deepseek-ai/deepseek-v4-flash-0731",
  openrouter: "openrouter/auto",
  gemini: "gemini-2.5-flash",
  ollama: "qwen2.5-coder:3b-instruct",
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
    const body = await req.json().catch(() => ({})) as { user_id?: string; execution?: unknown; projectId?: string; conversationId?: string };
    const userId = String(body.user_id ?? "").trim();
    if (!userId) return json({ error: "user_id obrigatório" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Supabase não configurado" }, 500);
    const admin = createClient(url, key);

    // Carrega histórico da conversa (se conversationId informado) para initialMessages.
    let initialMessages: unknown[] | null = null;
    if (body.conversationId && body.projectId) {
      const { data: conv } = await admin
        .from("agent_conversation_memory")
        .select("messages")
        .eq("user_id", userId)
        .eq("project_id", body.projectId)
        .eq("conversation_id", body.conversationId)
        .maybeSingle();
      if (conv?.messages && Array.isArray(conv.messages)) {
        initialMessages = conv.messages;
      }
    }

    const { data: rows } = await admin.from("ai_provider_config").select("provider,api_key,model,is_default,fallback_provider").eq("user_id", userId);
    const list = Array.isArray(rows) ? rows : [];
    // SOMENTE a IA validada (is_default) com chave é ativo. Sem ela → NÃO executa.
    // Exceção: Ollama local (sem chave) — is_default + provider válido basta.
    const def = list.find((r) => r.is_default && (r.api_key || r.provider === "ollama"));
    if (!def || !def.provider || !["deepseek", "openai", "nvidia", "openrouter", "gemini", "ollama"].includes(def.provider)) {
      return json({ ok: false, code: "no_validated_ai", provider: null, model: null });
    }

    const provider = def.provider as "deepseek" | "openai" | "nvidia" | "openrouter" | "gemini" | "ollama";
    const model = (def.model ?? "").trim() || DEFAULT_MODEL[provider];
    // Ollama é local e NÃO usa API Key: sem chave exigida, sem chave fictícia.
    const apiKey = provider === "ollama"
      ? ""
      : String(def.api_key ?? "");
    if (!apiKey && provider !== "ollama") return json({ ok: false, code: "no_key", provider, model });

    return json({
      ok: true,
      provider,
      model,
      baseUrl: BASE[provider],
      apiKey,
      fallback: typeof def.fallback_provider === "string" && def.fallback_provider.trim() ? def.fallback_provider.trim() : null,
      initialMessages: initialMessages ?? [],
    });
  } catch (e) {
    console.error("[runtime-ai-config] error", e instanceof Error ? e.message : String(e));
    return json({ error: "erro interno" }, 500);
  }
});
