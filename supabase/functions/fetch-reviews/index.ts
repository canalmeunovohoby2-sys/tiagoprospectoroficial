// Fetch public Google reviews for a business and select the best ones
// to be used as social proof on AI-generated landing pages.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GOOGLE_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

interface ReviewIn {
  name?: string;
  authorName?: string;
  author_name?: string;
  text?: string | { text?: string };
  originalText?: string | { text?: string };
  rating?: number;
  publishTime?: string;
  time?: number;
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string; photoUri?: string };
  profile_photo_url?: string;
}

interface SelectedReview {
  author: string;
  text: string;
  rating: number;
  date: string | null;
  photo: string | null;
}

// Padrões de elogio priorizados (alto valor comercial)
const PRIORITY_PATTERNS: Array<{ key: string; weight: number; matches: RegExp }> = [
  { key: "agilidade",       weight: 12, matches: /\b(rapid|ágil|agil|rápid|express|na hora|pontual)/i },
  { key: "atendimento",     weight: 12, matches: /\b(atend|atencios|educad|cordial|simpát|simpat|gentil|receptiv)/i },
  { key: "qualidade",       weight: 12, matches: /\b(qualidade|caprich|impec|perfeit|excelent|ótim|otim|excepcional)/i },
  { key: "profissionalismo",weight: 10, matches: /\b(profission|equipe|especialista|expert|competent|qualificad)/i },
  { key: "confianca",       weight: 10, matches: /\b(confian|credibilidade|seguran[çc]a|honest|sério|serio|transparen)/i },
  { key: "recomendacao",    weight:  8, matches: /\b(recomend|indico|indica|voltarei|sempre volto|nota 10)/i },
  { key: "resultado",       weight:  6, matches: /\b(resultado|entrega|cumpriu|superou)/i },
];

// Termos que indicam crítica, ressalva ou texto problemático — descarta o review
const NEGATIVE_PATTERNS = /\b(porém|porem|mas |entretanto|contudo|infeliz|demor|atrasad|atrasou|ruim|péssim|pessim|horrível|horrivel|decep|reclam|problema|defeito|sujo|caro demais|não recomendo|nao recomendo|estorn|cancel|esperando|aguardando|enrolad|grosseir|mal educad|maleducad)/i;

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isLowQuality(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return true;
  const words = normalize(t).split(/\s+/).filter(Boolean);
  if (words.length < 6) return true;
  if (/(.)\1{5,}/.test(t)) return true;
  if (t === t.toUpperCase() && t.length > 30) return true;
  if (/^(bom|otimo|ótimo|excelente|top|legal|gostei|recomendo|show|nota 10|perfeito)\.?$/i.test(t)) return true;
  return false;
}

function scoreReview(text: string, rating: number) {
  let score = 0;
  if (rating === 5) score += 20;
  else if (rating === 4) score += 10;
  const len = text.trim().length;
  if (len >= 200) score += 18;
  else if (len >= 120) score += 12;
  else if (len >= 80) score += 6;
  else if (len >= 50) score += 3;
  for (const p of PRIORITY_PATTERNS) if (p.matches.test(text)) score += p.weight;
  return score;
}

function dedupeAndSelect(reviews: SelectedReview[], max = 6): { selected: SelectedReview[]; stats: Record<string, number> } {
  const stats = { total: reviews.length, after_rating: 0, after_negative: 0, after_quality: 0, after_dedupe: 0 };
  const byRating = reviews.filter((r) => r.rating >= 4);
  stats.after_rating = byRating.length;
  const byNeg = byRating.filter((r) => !NEGATIVE_PATTERNS.test(r.text));
  stats.after_negative = byNeg.length;
  const byQual = byNeg.filter((r) => !isLowQuality(r.text));
  stats.after_quality = byQual.length;

  const ranked = [...byQual].sort(
    (a, b) => scoreReview(b.text, b.rating) - scoreReview(a.text, a.rating),
  );
  const seen: string[] = [];
  const out: SelectedReview[] = [];
  for (const r of ranked) {
    const sig = normalize(r.text).slice(0, 60);
    if (seen.some((s) => s === sig || (sig.length > 20 && s.includes(sig.slice(0, 25))))) continue;
    seen.push(sig);
    out.push(r);
    if (out.length >= max) break;
  }
  stats.after_dedupe = out.length;
  return { selected: out, stats };
}

function extractDifferentials(allReviews: SelectedReview[]): string[] {
  const eligible = allReviews.filter(
    (r) => r.rating >= 4 && !NEGATIVE_PATTERNS.test(r.text),
  );
  const labelByKey: Record<string, string> = {
    agilidade: "Atendimento rápido",
    atendimento: "Atendimento excepcional",
    qualidade: "Serviço de alta qualidade",
    profissionalismo: "Equipe especializada",
    confianca: "Confiança e credibilidade",
    recomendacao: "Clientes que recomendam espontaneamente",
    resultado: "Resultados que superam expectativas",
  };
  const counts: Record<string, number> = {};
  for (const r of eligible) {
    for (const p of PRIORITY_PATTERNS) {
      if (p.matches.test(r.text)) counts[p.key] = (counts[p.key] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => labelByKey[k] ?? k);
}

async function searchPlaceId(query: string): Promise<string | null> {
  if (!GOOGLE_KEY) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", regionCode: "BR", maxResultCount: 1 }),
    });
    if (!res.ok) {
      console.warn(`[searchPlaceId] HTTP ${res.status} for "${query}":`, await res.text());
      return null;
    }
    const data = await res.json();
    const id = data?.places?.[0]?.id ?? null;
    console.log(`[searchPlaceId] "${query}" -> ${id ?? "no match"}`);
    return id;
  } catch (e) {
    console.warn(`[searchPlaceId] error for "${query}":`, (e as Error).message);
    return null;
  }
}

async function findPlaceId(name: string, city: string, state: string, googleUrl?: string | null): Promise<{ id: string | null; source: string }> {
  // Extract ChIJ-style place_id from google_url if present (only valid format for Places API v1)
  if (googleUrl) {
    const m = googleUrl.match(/place_id=([A-Za-z0-9_-]+)/);
    if (m && m[1]) {
      console.log(`[findPlaceId] extracted place_id from url: ${m[1]}`);
      return { id: m[1], source: "google_url" };
    }
  }
  // Try multiple progressively-broader queries
  const queries = [
    [name, city, state, "Brasil"].filter(Boolean).join(", "),
    [name, city, state].filter(Boolean).join(" "),
    [name, city].filter(Boolean).join(", "),
    name,
  ].filter((q, i, a) => q && a.indexOf(q) === i);

  for (const q of queries) {
    const id = await searchPlaceId(q);
    if (id) return { id, source: `text_search:${q}` };
  }
  return { id: null, source: "none" };
}

async function fetchPlaceReviews(placeId: string): Promise<{ reviews: SelectedReview[]; rating?: number; userRatingCount?: number }> {
  if (!GOOGLE_KEY) return { reviews: [] };
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=pt-BR&regionCode=BR`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "reviews,rating,userRatingCount,displayName",
    },
  });
  if (!res.ok) {
    console.warn(`[fetchPlaceReviews] HTTP ${res.status} for ${placeId}:`, await res.text());
    return { reviews: [] };
  }
  const data = await res.json();
  const raw: ReviewIn[] = data?.reviews ?? [];
  console.log(`[fetchPlaceReviews] place=${data?.displayName?.text ?? placeId} rating=${data?.rating} count=${data?.userRatingCount} reviews=${raw.length}`);
  const reviews = raw
    .map((r) => {
      const textNode = r.originalText ?? r.text;
      const text = typeof textNode === "string" ? textNode : (textNode?.text ?? "");
      return {
        author: r.authorAttribution?.displayName ?? r.author_name ?? "Cliente Google",
        text: (text || "").trim(),
        rating: typeof r.rating === "number" ? r.rating : 5,
        date: r.publishTime ?? null,
        photo: r.authorAttribution?.photoUri ?? r.profile_photo_url ?? null,
      };
    })
    .filter((r) => r.text.length > 0);
  return { reviews, rating: data?.rating, userRatingCount: data?.userRatingCount };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const body = await req.json();
    const name: string = body?.name ?? "";
    const city: string = body?.city ?? "";
    const state: string = body?.state ?? "";
    const googleUrl: string | null = body?.google_url ?? null;

    console.log("==========================================");
    console.log("[fetch-reviews] Iniciando coleta de avaliações...");
    console.log(`  Empresa: ${name}`);
    console.log(`  Cidade : ${city}`);
    console.log(`  Estado : ${state}`);
    console.log(`  google_url: ${googleUrl ?? "(nenhum)"}`);
    console.log(`  GOOGLE_PLACES_API_KEY: ${GOOGLE_KEY ? "presente" : "AUSENTE"}`);

    if (!name) {
      return new Response(JSON.stringify({ error: "name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!GOOGLE_KEY) {
      const elapsed = Date.now() - t0;
      console.warn(`[fetch-reviews] Sem API key. tempo=${elapsed}ms`);
      return new Response(JSON.stringify({
        reviews: [], differentials: [], reason: "missing_api_key",
        debug: { elapsed_ms: elapsed },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { id: placeId, source } = await findPlaceId(name, city, state, googleUrl);
    console.log(`  Fonte place_id: ${source} -> ${placeId ?? "NÃO ENCONTRADO"}`);

    if (!placeId) {
      const elapsed = Date.now() - t0;
      console.warn(`[fetch-reviews] place_not_found tempo=${elapsed}ms`);
      return new Response(JSON.stringify({
        reviews: [], differentials: [], reason: "place_not_found",
        debug: { place_source: source, elapsed_ms: elapsed },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { reviews: all, rating, userRatingCount } = await fetchPlaceReviews(placeId);
    const { selected, stats } = dedupeAndSelect(all, 6);
    const differentials = extractDifferentials(all);
    const elapsed = Date.now() - t0;

    console.log(`  Busca executada: SIM`);
    console.log(`  Avaliações encontradas: ${stats.total}`);
    console.log(`    -> após filtro 4-5★ : ${stats.after_rating}`);
    console.log(`    -> sem críticas     : ${stats.after_negative}`);
    console.log(`    -> qualidade ok     : ${stats.after_quality}`);
    console.log(`    -> após dedupe      : ${stats.after_dedupe}`);
    console.log(`  Selecionadas: ${selected.length}`);
    console.log(`  Diferenciais: ${differentials.join(", ") || "(nenhum)"}`);
    console.log(`  Tempo total: ${elapsed}ms`);
    console.log("==========================================");

    return new Response(JSON.stringify({
      reviews: selected,
      differentials,
      total_fetched: all.length,
      place_id: placeId,
      rating,
      user_rating_count: userRatingCount,
      debug: { stats, place_source: source, elapsed_ms: elapsed },
      reason: selected.length > 0 ? "ok" : (all.length === 0 ? "no_reviews_returned" : "all_filtered_out"),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.error(`[fetch-reviews] EXCEPTION tempo=${elapsed}ms`, e);
    return new Response(JSON.stringify({ error: (e as Error).message, debug: { elapsed_ms: elapsed } }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
