import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { runFirecrawlSearch, runFirecrawlScrape } from "./handler.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    // Modo scrape: body { url } → abre a página e devolve conteúdo.
    if (typeof body?.url === "string" && body.url.trim()) {
      const url = body.url.trim();
      if (!/^https?:\/\//i.test(url) || url.length > 1000) {
        return new Response(JSON.stringify({ error: "url inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await runFirecrawlScrape(url);
      if (result.error) {
        return new Response(JSON.stringify({ provider: "firecrawl", kind: "scrape", error: result.error }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ provider: "firecrawl", kind: "scrape", keyIndex: result.keyIndex, content: result.content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo busca: body { query, limit }
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      return new Response(JSON.stringify({ error: "query ou url é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (query.length > 500) {
      return new Response(JSON.stringify({ error: "query muito longa (máx. 500 caracteres)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const limit = typeof body?.limit === "number" ? body.limit : 10;

    const result = await runFirecrawlSearch(query, limit);
    if (result.error) {
      return new Response(JSON.stringify({ provider: "firecrawl", error: result.error }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ provider: "firecrawl", keyIndex: result.keyIndex, results: result.results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
