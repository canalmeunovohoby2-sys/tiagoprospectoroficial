import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizeImageList } from "../_shared/image-assets.ts";

const PEXELS_ENDPOINT = "https://api.pexels.com/v1/search";
const MAX_PER_PAGE = 30;
const VALID_ORIENTATIONS = ["landscape", "portrait", "square"];

function getEnv(key: string): string | undefined {
  const deno = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return deno?.env?.get(key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      return new Response(JSON.stringify({ error: "query é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (query.length > 120) {
      return new Response(JSON.stringify({ error: "query muito longa (máx. 120)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const count = Math.max(1, Math.min(MAX_PER_PAGE, typeof body?.count === "number" ? body.count : 8));
    const orientation = typeof body?.orientation === "string" && VALID_ORIENTATIONS.includes(body.orientation) ? body.orientation : undefined;

    const apiKey = getEnv("PEXELS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "PEXELS_API_KEY ausente. Configure o secret nas Edge Functions do Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(PEXELS_ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(Math.min(count, MAX_PER_PAGE)));
    url.searchParams.set("locale", "pt-BR");
    if (orientation) url.searchParams.set("orientation", orientation);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: apiKey },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return new Response(JSON.stringify({ error: `Pexels HTTP ${res.status}`, detail }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json().catch(() => null);
    const raw = Array.isArray((data as { photos?: unknown })?.photos) ? (data as { photos: unknown[] }).photos : [];
    const assets = normalizeImageList(raw, "pexels").slice(0, count);
    console.info("[get-images] ok", { query, count: assets.length });

    return new Response(JSON.stringify({ provider: "pexels", assets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
