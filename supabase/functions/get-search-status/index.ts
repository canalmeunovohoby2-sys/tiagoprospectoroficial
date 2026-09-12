// Consulta o status de uma busca assíncrona criada por `search-places`.
// Retorna { search_id, status, counters, leads, error }.
// Aceita search_id por path (/get-search-status/{id}), query (?search_id=)
// ou body JSON em POST ({ search_id }).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const TERMINAL = new Set(["SUCCESS", "EMPTY_REAL", "EMPTY_WITH_LIMITATIONS", "EXTERNAL_FAILURE", "PARTIAL_RESULTS"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rowToLead(r: Record<string, unknown>): Record<string, unknown> {
  return {
    external_id: r.external_id ?? r.id ?? null,
    name: r.name ?? "",
    category: r.category ?? null,
    address: r.address ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    phone: r.phone ?? null,
    whatsapp: r.whatsapp ?? null,
    website: r.website ?? null,
    email: r.email ?? null,
    photo_name: r.photo_name ?? null,
    google_url: r.google_url ?? null,
    instagram: r.instagram ?? null,
    facebook: r.facebook ?? null,
    rating: r.rating ?? null,
    reviews_count: r.reviews_count ?? 0,
    has_website: !!r.has_website,
    score: r.score ?? 0,
    score_reasons: r.score_reasons ?? [],
    opening_hours: r.opening_hours ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    confidence: r.confidence ?? null,
    city_matches: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let searchId = (url.searchParams.get("search_id") ?? "").trim();

    if (!searchId) {
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? "";
      if (last && last !== "get-search-status" && UUID.test(last)) searchId = last;
    }

    if (!searchId && req.method !== "GET") {
      const body = await req.json().catch(() => ({}));
      searchId = String(body?.search_id ?? "").trim();
    }

    if (!searchId) return json({ error: "search_id obrigatório" }, 400);

    const supaUrl = Deno.env.get("SUPABASE_URL");
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supaUrl || !supaKey || !anonKey) return json({ error: "Backend indisponível" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(supaUrl, supaKey);
    const { data: search, error: searchErr } = await admin
      .from("searches")
      .select("*")
      .eq("id", searchId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (searchErr) return json({ error: searchErr.message }, 500);
    if (!search) return json({ error: "Busca não encontrada" }, 404);

    const status = String(search.status ?? "PROCESSING");
    const counters = search.counters ?? {};
    const warnings = search.warnings ?? [];

    let leads: Record<string, unknown>[] = [];
    if (status !== "PROCESSING" || TERMINAL.has(status)) {
      const { data: rows, error: leadsErr } = await admin
        .from("leads")
        .select("*")
        .eq("search_id", searchId)
        .order("score", { ascending: false });
      if (leadsErr) return json({ error: leadsErr.message }, 500);
      leads = (rows ?? []).map((r) => rowToLead(r as Record<string, unknown>));
    }

    return json({
      search_id: searchId,
      status,
      source: search.source ?? null,
      counters,
      warnings,
      leads,
      error: search.error ?? null,
    });
  } catch (e) {
    console.error("[get-search-status] fatal", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
