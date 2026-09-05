// ai-proxy — ponte OpenAI-compatível para o Cline Agent SDK (ProspectorClineProvider).
// O runtime Node do agente não possui a chave; ele aponta baseUrl para esta edge
// function, que repassa para a DeepSeek usando a secret do Supabase.
// Suporta streaming (SSE) e tool calls (chat/completions OpenAI).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEEPSEEK_BASE = "https://api.deepseek.com";
const ALLOWED_PATHS = ["/v1/chat/completions", "/chat/completions"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // O pathname real no edge pode variar (ex.: /functions/v1/ai-proxy/v1/... ).
  const path = url.pathname.split("ai-proxy").pop() ?? "";
  if (!ALLOWED_PATHS.includes(path)) {
    return new Response(JSON.stringify({ error: "rota não permitida", path }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "DEEPSEEK_API_KEY não configurada no projeto" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const body = await req.text();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // Encaminha para a DeepSeek com streaming preservado.
  const upstream = await fetch(`${DEEPSEEK_BASE}${path}`, {
    method: "POST",
    headers,
    body,
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  const isStream = contentType.includes("text/event-stream");

  if (isStream) {
    // Re-emite o SSE para o cliente (Cline lê stream).
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": contentType || "application/json" },
  });
});
