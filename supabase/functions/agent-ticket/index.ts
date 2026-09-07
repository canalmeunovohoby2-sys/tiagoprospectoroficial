// agent-ticket — emite um ticket curto de EXECUÇÃO para o Agent Runtime.
// Autentica o usuário via Supabase JWT e valida ownership do projeto ANTES de
// assinar. O Runtime NUNCA confia em user_id/projectId do body: ele confia no
// ticket (HMAC assinado, expira em minutos).
// RUNTIME_GATEWAY_SECRET continua sendo só serviço↔serviço (runtime-ai-config);
// este ticket é a autorização do USUÁRIO para o Railway.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// HMAC-SHA256 sobre payload canônico (claims ordenados). Segredo: AGENT_TICKET_SECRET
// (mesmo valor no Railway e aqui). Nunca é exposto em respostas.
async function sign(secret: string, payload: { uid: string; pid?: string | null; exp: number }): Promise<string> {
  const claims = { uid: payload.uid, pid: payload.pid ?? null, exp: payload.exp };
  const body = `${claims.uid}|${claims.pid ?? ""}|${claims.exp}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return `${btoa(JSON.stringify(claims))}.${b64(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const secret = Deno.env.get("AGENT_TICKET_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || !supabaseUrl || !serviceKey) return json({ error: "agente-ticket não configurado" }, 500);

    const rawAuth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: user, error: userErr } = await admin.auth.getUser(rawAuth);
    if (userErr || !user?.user) return json({ error: "autenticação necessária" }, 401);
    const uid = String(user.user.id);

    const body = await req.json().catch(() => ({})) as { projectId?: string };
    const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;

    // Ownership real: se informou projectId, ele TEM que pertencer ao usuário.
    if (projectId) {
      const { data: project, error: pErr } = await admin.from("site_projects").select("user_id").eq("id", projectId).maybeSingle();
      if (pErr) return json({ error: "erro ao verificar projeto" }, 500);
      if (!project) return json({ error: "projeto não encontrado" }, 404);
      if (String(project.user_id ?? "") !== uid) return json({ error: "sem permissão neste projeto" }, 403);
    }

    const token = await sign(secret, { uid, pid: projectId, exp: Date.now() + 5 * 60_000 });
    return json({ ok: true, token, expiresIn: 300 });
  } catch (e) {
    console.error("[agent-ticket]", e instanceof Error ? e.message : String(e));
    return json({ error: "erro interno" }, 500);
  }
});
