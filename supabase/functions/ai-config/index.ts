// AI Config (5.34) — Configurações seguras de IA por usuário (server-side).
// As chaves ficam SOMENTE nesta função/tabela (service role). Nenhuma resposta
// devolve a chave; o cliente vê apenas maskedLast4/estado.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError, DEFAULT_DEEPSEEK_MODEL, DEFAULT_GEMINI_MODEL, DEFAULT_NVIDIA_MODEL, DEFAULT_OPENAI_MODEL, DEFAULT_OPENROUTER_MODEL, type ProviderName } from "../_shared/ai.ts";

const PROVIDERS: Array<{ id: ProviderName; label: string; defaultModel: string }> = [
  { id: "deepseek", label: "DeepSeek", defaultModel: DEFAULT_DEEPSEEK_MODEL },
  { id: "nvidia", label: "NVIDIA NIM", defaultModel: DEFAULT_NVIDIA_MODEL },
  { id: "openai", label: "OpenAI", defaultModel: DEFAULT_OPENAI_MODEL },
  { id: "gemini", label: "Gemini", defaultModel: DEFAULT_GEMINI_MODEL },
  { id: "openrouter", label: "OpenRouter", defaultModel: DEFAULT_OPENROUTER_MODEL },
];

const ENV_KEYS: Record<ProviderName, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function isProvider(v: string): v is ProviderName {
  return v === "deepseek" || v === "nvidia" || v === "openai" || v === "gemini" || v === "openrouter";
}
function mask(key: string | null | undefined): string | null {
  if (!key) return null;
  const tail = key.slice(-4);
  return `••••••••••••${tail}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!supabaseUrl || !supabaseKey || !token) return json({ error: "autenticação necessária" }, 401);

    // Quem é o usuário autenticado (via service role + token do usuário).
    // IMPORTANTE: NÃO sobrescrever o header Authorization do client admin —
    // se sobrescrever com o token do usuário, TODAS as operações de banco
    // passam a rodar no papel `authenticated` (sujeitas a RLS), e o upsert de
    // chave nova quebra (a tabela não tem política de INSERT). getUser(token)
    // já envia o token do usuário na chamada /auth/v1/user por parâmetro.
    const admin = createClient(supabaseUrl, supabaseKey);
    const { data: user, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user?.user) return json({ error: "autenticação inválida" }, 401);
    const userId = user.user.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "list");

    const table = admin.from("ai_provider_config");

    // --- LIST (estado seguro, nunca a chave) ---
    if (action === "list") {
      const { data: rows } = await table.select("provider,model,enabled,is_default,fallback_provider,api_key,updated_at").eq("user_id", userId);
      const seen = new Set<string>();
      const items = (rows ?? []).map((r) => {
        seen.add(r.provider);
        return {
          provider: r.provider,
          label: PROVIDERS.find((p) => p.id === r.provider)?.label ?? r.provider,
          hasKey: !!r.api_key,
          maskedKey: mask(r.api_key),
          model: r.model,
          enabled: !!r.enabled,
          isDefault: !!r.is_default,
          validated: !!r.is_default,
          fallbackProvider: r.fallback_provider ?? null,
          updatedAt: r.updated_at,
        };
      });
      for (const p of PROVIDERS) {
        if (!seen.has(p.id)) items.push({ provider: p.id, label: p.label, hasKey: false, maskedKey: null, model: p.defaultModel, enabled: false, isDefault: false, validated: false, fallbackProvider: null, updatedAt: null });
      }
      return json({ providers: items });
    }

    // --- SET (gravar chave/modelo/estado; nunca retorna a chave) ---
    // SET grava chave/modelo/estado. NÃO ativa o provider: "salvo no banco"
    // nunca é igual a "provider ativo". A ativação (is_default) só acontece
    // quando um TESTE REAL ao provider retorna com sucesso (action "test").
    if (action === "set") {
      const provider = String(body.provider ?? "").toLowerCase();
      if (!isProvider(provider)) return json({ error: `Provedor desconhecido: ${provider}` }, 400);
      const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : PROVIDERS.find((p) => p.id === provider)!.defaultModel;
      const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;
      const enabled = body.enabled !== false;
      const fallbackProvider = typeof body.fallbackProvider === "string" && body.fallbackProvider.trim() && body.fallbackProvider !== provider ? body.fallbackProvider.trim() : null;
      if (fallbackProvider && !isProvider(fallbackProvider)) return json({ error: `Fallback desconhecido: ${fallbackProvider}` }, 400);

      const { data: existingRows } = await table.select("id,is_default").eq("user_id", userId).eq("provider", provider).limit(1);
      const existing = Array.isArray(existingRows) ? existingRows[0] : undefined;
      // Mantém o provider ativo (default) apenas se já estava ativo E continuar
      // ativado. Desativar remove o posto de ativo (sem derrubar os demais).
      const keepDefault = Boolean(existing?.is_default) && enabled;

      const patch: Record<string, unknown> = {
        model,
        enabled,
        is_default: keepDefault,
        fallback_provider: fallbackProvider,
        updated_at: new Date().toISOString(),
      };
      if (apiKey) patch.api_key = apiKey;

      const { error: upsErr } = await table.upsert({ user_id: userId, provider, ...patch }, { onConflict: "user_id,provider" });
      if (upsErr) return json({ error: upsErr.message }, 500);
      return json({ ok: true, enabled, is_default: keepDefault, activated: false, message: "Configuração salva. Clique em TESTAR para validar e ativar este provedor." });
    }

    // --- REMOVE KEY (mantém provider configurado mas sem chave) ---
    if (action === "remove_key") {
      const provider = String(body.provider ?? "").toLowerCase();
      if (!isProvider(provider)) return json({ error: "provedor inválido" }, 400);
      await table.update({ api_key: null, enabled: false, is_default: false }).eq("user_id", userId).eq("provider", provider);
      return json({ ok: true });
    }

    // --- TEST (chamada REAL à API do provider/modelo configurado) ---
    // Só uma chamada bem-sucedida com a CHAVE SALVA do usuário ativa o provider
    // (is_default=true, derrubando o default anterior). Falha → nada muda.
    if (action === "test") {
      const provider = String(body.provider ?? "").toLowerCase();
      if (!isProvider(provider)) return json({ error: "provedor inválido" }, 400);
      const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : PROVIDERS.find((p) => p.id === provider)!.defaultModel;
      const { data: rows } = await table.select("api_key").eq("user_id", userId).eq("provider", provider);
      const storedKey = rows?.[0]?.api_key ?? undefined;
      // Chave do usuário salva OU (fallback de diagnóstico) chave do ambiente.
      const apiKey = storedKey ?? Deno.env.get(ENV_KEYS[provider]) ?? undefined;
      if (!apiKey) {
        return json({ ok: false, kind: "missing_key", message: "Chave ausente. Adicione a API Key antes de testar." });
      }
      const started = Date.now();
      try {
        // Prompt curto + sem thinking (NIM) + tokens suficientes: garante que a
        // resposta venha no campo "content" e sirva como PROVA real de conexão.
        const res = await generateText({
          user: "Responda exatamente com a palavra: OK",
          model,
          provider,
          apiKey,
          maxOutputTokens: 256,
          temperature: 0,
          noThinking: true,
          timeoutMs: 60_000,
        });
        const reply = (res.text ?? "").trim().slice(0, 120);
        const latencyMs = Date.now() - started;
        const usingStored = !!storedKey;

        // Ativa SOMENTE se a chave salva do usuário respondeu (chamada real).
        let activated = false;
        let isDefaultNow = false;
        if (usingStored) {
          const { error: actErr } = await table.update({ is_default: true }).eq("user_id", userId).eq("provider", provider);
          if (!actErr) {
            await table.update({ is_default: false }).eq("user_id", userId).neq("provider", provider);
            activated = true;
            isDefaultNow = true;
          }
        }
        return json({
          ok: true,
          provider: res.provider,
          model: res.model,
          latencyMs,
          reply,
          activated,
          isDefault: isDefaultNow,
          message: reply
            ? `Conexão válida — resposta: "${reply}" (${(latencyMs / 1000).toFixed(1)}s).${activated ? " Provedor validado e ATIVO (uso global)." : " Conexão ok via chave do ambiente (sem chave salva deste usuário — salve a chave e teste de novo para ativar)."}`
            : `Conexão estabelecida, mas o provedor não retornou texto.${activated ? " Provedor ATIVO." : ""}`,
        });
      } catch (e) {
        const err = e instanceof AiError ? e : new Error(String(e));
        const kind = (e instanceof AiError ? e.kind : "upstream") ?? "upstream";
        const map: Record<string, { label: string; kind: string }> = {
          auth: { label: "Chave inválida ou sem autorização.", kind: "invalid_key" },
          bad_request: { label: "Modelo inválido ou requisição rejeitada.", kind: "invalid_model" },
          rate_limit: { label: "Limite de uso atingido.", kind: "rate_limit" },
          timeout: { label: "Timeout — provedor não respondeu.", kind: "timeout" },
          upstream: { label: "Provedor indisponível.", kind: "provider_unavailable" },
          config: { label: "Configuração inválida.", kind: "config" },
          empty: { label: "Resposta vazia — o provedor respondeu sem texto. Confira o modelo e a chave.", kind: "empty" },
          missing_key: { label: "Chave ausente.", kind: "missing_key" },
        };
        const info = map[kind] ?? map.upstream!;
        // Falha no teste → NÃO ativa; o provider ativo anterior permanece.
        console.warn("[ai-config] test falhou (sem ativar)", { provider, model, kind, status: e instanceof AiError ? e.status : undefined });
        return json({ ok: false, kind: info.kind, message: info.label, latencyMs: Date.now() - started });
      }
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    console.error("[ai-config] error", e instanceof Error ? e.message : String(e));
    return json({ error: "erro interno" }, 500);
  }
});
