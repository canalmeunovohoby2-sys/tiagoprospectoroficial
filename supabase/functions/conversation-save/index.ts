// conversation-save — persiste o transcript completo da conversa do Cline Agent.
// Autentica o runtime via RUNTIME_GATEWAY_SECRET (serviço↔serviço).
// Nunca expõe chaves/secrets. Apenas salva o histórico estruturado.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

    const body = await req.json().catch(() => ({})) as {
      user_id?: string;
      project_id?: string;
      conversation_id?: string;
      messages?: unknown;
      files_changed?: string[];
      model?: string;
      provider?: string;
    };

    if (!body.user_id || !body.project_id || !body.conversation_id) {
      return json({ error: "user_id, project_id e conversation_id são obrigatórios" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Supabase não configurado" }, 500);
    const admin = createClient(url, key);

    const { error } = await admin.from("agent_conversation_memory").upsert({
      user_id: body.user_id,
      project_id: body.project_id,
      conversation_id: body.conversation_id,
      messages: body.messages ?? [],
      files_changed: body.files_changed ?? [],
      model: body.model ?? null,
      provider: body.provider ?? null,
      updated_at: new Date().toISOString(),
    });

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    console.error("[conversation-save]", e instanceof Error ? e.message : String(e));
    return json({ error: "erro interno" }, 500);
  }
});
