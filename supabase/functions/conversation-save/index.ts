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
    if (!auth) return json({ error: "runtime não autorizado" }, 403);

    const body = await req.json().catch(() => ({})) as {
      user_id?: string;
      project_id?: string;
      conversation_id?: string;
      messages?: unknown;
      files_changed?: string[];
      model?: string;
      provider?: string;
      /** "context" = salvar memória+histórico do projeto | "context_load" = ler. */
      kind?: string;
      memory?: unknown;
      changes?: unknown;
    };

    // conversation_id reservado ao CONTEXTO persistente do projeto (não é conversa).
    const PROJECT_CONTEXT_CONV = "00000000-0000-0000-0000-0000000000c7";
    const contextConvId = body.kind === "context_load" || body.kind === "context"
      ? PROJECT_CONTEXT_CONV
      : (body.conversation_id ?? "");

    if (!body.project_id || !contextConvId) {
      return json({ error: "project_id e conversation_id são obrigatórios" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Supabase não configurado" }, 500);
    const admin = createClient(url, key);

    // userId é SEMPRE derivado do token: secret do runtime (Railway) → user_id do
    // body; JWT do usuário (runtime local) → id do usuário autenticado.
    let userId = "";
    if (auth === Deno.env.get("RUNTIME_GATEWAY_SECRET")) {
      userId = String(body.user_id ?? "").trim();
    } else {
      const { data: { user }, error } = await admin.auth.getUser(auth);
      if (error || !user?.id) return json({ error: "runtime não autorizado" }, 403);
      userId = user.id;
    }
    if (!userId) return json({ error: "user_id obrigatório" }, 400);

    // LER o contexto persistente do projeto (memória + histórico de alterações).
    if (body.kind === "context_load") {
      const { data, error } = await admin
        .from("agent_conversation_memory")
        .select("messages")
        .eq("user_id", userId)
        .eq("project_id", body.project_id)
        .eq("conversation_id", PROJECT_CONTEXT_CONV)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      const first = Array.isArray(data?.messages) ? (data?.messages as unknown[])[0] : null;
      const ctx = (first && typeof first === "object" ? first : {}) as { memory?: unknown; changes?: unknown };
      return json({
        ok: true,
        memory: Array.isArray(ctx.memory) ? ctx.memory : [],
        changes: Array.isArray(ctx.changes) ? ctx.changes : [],
      });
    }

    // GRAVAR contexto (memória+alterações) ou transcript da conversa.
    const isContext = body.kind === "context";
    const payload = isContext
      ? {
          user_id: userId,
          project_id: body.project_id,
          conversation_id: PROJECT_CONTEXT_CONV,
          messages: [{ __project_context: true, memory: body.memory ?? [], changes: body.changes ?? [] }],
          files_changed: [] as string[],
          model: body.model ?? null,
          provider: body.provider ?? null,
          updated_at: new Date().toISOString(),
        }
      : {
          user_id: userId,
          project_id: body.project_id,
          conversation_id: body.conversation_id,
          messages: body.messages ?? [],
          files_changed: body.files_changed ?? [],
          model: body.model ?? null,
          provider: body.provider ?? null,
          updated_at: new Date().toISOString(),
        };

    const { error } = await admin
      .from("agent_conversation_memory")
      .upsert(payload, { onConflict: "user_id,project_id,conversation_id" });

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    console.error("[conversation-save]", e instanceof Error ? e.message : String(e));
    return json({ error: "erro interno" }, 500);
  }
});
