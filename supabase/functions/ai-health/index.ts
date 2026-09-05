import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText } from "../_shared/ai.ts";
import { runHealthCheck } from "./handler.ts";

function getEnv(key: string): string | undefined {
  const deno = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return deno?.env?.get(key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await runHealthCheck({
      getEnv,
      runProvider: async (provider, model) => {
        const result = await generateText({
          provider,
          model,
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
