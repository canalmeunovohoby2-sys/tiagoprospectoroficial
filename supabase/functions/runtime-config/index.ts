// runtime-config — expõe a URL pública do Agent Runtime (editor completo/Cline)
// para o frontend. Não contém segredos (URL pública). Fonte: secret
// AGENT_RUNTIME_URL (server-side), com fallback para variável do build.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const runtimeUrl = (Deno.env.get("AGENT_RUNTIME_URL") ?? "").trim().replace(/\/$/, "");
  return new Response(JSON.stringify({ runtimeUrl }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
