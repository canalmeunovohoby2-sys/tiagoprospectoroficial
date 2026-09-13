// Integração com o mapScraper (christivn/mapScraper) via microserviço HTTP.
// O serviço expõe GET /scrape-get?query=...&max_places=...&lang=pt&country=br
// e devolve um array com os campos do CSV original do mapScraper:
//   id, url_place, title, category, address, phoneNumber, completePhoneNumber,
//   domain, url, coor ("lat,lng"), stars, reviews, source_query
// Aqui esses registros são convertidos para o shape compartilhado
// (GmapsScraperPlace) para reutilizar todo o pipeline de normalização/dedupe.

import { type GmapsScraperPlace } from "./gmaps.ts";

export type MapScraperRecord = {
  id?: string | null;
  url_place?: string | null;
  title?: string | null;
  category?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  completePhoneNumber?: string | null;
  domain?: string | null;
  url?: string | null;
  coor?: string | null;
  stars?: number | string | null;
  reviews?: number | string | null;
  thumbnail?: string | null;
  images?: string[] | string | null;
  source_query?: string | null;
  [key: string]: unknown;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function parseCoords(coor: unknown): { latitude: number; longitude: number } | null {
  if (typeof coor !== "string" || !coor.includes(",")) return null;
  const [latRaw, lngRaw] = coor.split(",", 2).map((s) => Number(s.trim()));
  if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) return null;
  return { latitude: latRaw, longitude: lngRaw };
}

// Converte registros do mapScraper para o shape compartilhado.
export function mapMapScraperRecords(records: MapScraperRecord[]): GmapsScraperPlace[] {
  const out: GmapsScraperPlace[] = [];
  const seen = new Set<string>();
  for (const record of records ?? []) {
    const name = typeof record.title === "string" ? record.title.trim() : "";
    if (name.length < 2) continue;

    const placeId = (typeof record.id === "string" && record.id.trim()) || `${name}|${(record.address ?? "").trim()}`;
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    const coords = parseCoords(record.coor);
    const website = toHttpUrl(record.url) ?? toHttpUrl(record.domain);
    const phone = (record.completePhoneNumber as string | null) || (record.phoneNumber as string | null) || null;

    out.push({
      name,
      place_id: placeId,
      category: (record.category as string | null) ?? null,
      address: (record.address as string | null) ?? null,
      phone,
      website,
      coordinates: coords,
      review_rating: toNumber(record.stars),
      reviews_count: toNumber(record.reviews),
      link: (record.url_place as string | null) ?? null,
      // FOTO real vinda do MESMO scrape do Maps (mesmo motor): a Edge converte
      // em photoUrl via selectLeadImage/normalizeGmapsResults.
      thumbnail: (record.thumbnail as string | null) || null,
      images: (record.images as string[] | string | null) ?? null,
    });
  }
  return out;
}

export type MapScraperCallOpts = {
  baseUrl: string;
  query: string;
  maxPlaces: number;
  lang?: string;
  country?: string;
  apiKey?: string;
  concurrency?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function callMapScraper(opts: MapScraperCallOpts): Promise<{ places: GmapsScraperPlace[]; error?: string; rawCount?: number }> {
  const {
    baseUrl,
    query,
    maxPlaces,
    lang = "pt",
    country = "br",
    apiKey,
    concurrency = 3,
    timeoutMs = 300000,
    fetchImpl = fetch,
  } = opts;
  if (!baseUrl) return { places: [], error: "MAP_SCRAPER_URL não configurada" };

  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/scrape-get?query=${encodeURIComponent(query)}&max_places=${maxPlaces}&lang=${encodeURIComponent(lang)}&country=${encodeURIComponent(country)}&concurrency=${concurrency}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetchImpl(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { places: [], error: `mapScraper HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => ({} as unknown));
    const records: MapScraperRecord[] = Array.isArray(data)
      ? (data as MapScraperRecord[])
      : Array.isArray((data as { results?: unknown })?.results)
        ? ((data as { results: MapScraperRecord[] }).results)
        : [];
    console.info("[mapscraper] response", JSON.stringify({ requested: maxPlaces, rawRecords: records.length, status: res.status }));
    return { places: mapMapScraperRecords(records), rawCount: records.length };
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    return { places: [], error: isAbort ? "mapScraper timeout" : `mapScraper: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

// ── Variantes de query ───────────────────────────────────────────────────
// O mapScraper repete ~os mesmos 20 resultados numa query ampla (a paginação
// não avança além disso). Testado: variantes (sinônimos/singular-plural)
// elevam muito o nº de estabelecimentos DISTINTOS (ex.: pet shops SP: 20 → 89).
const SEGMENT_SYNONYMS: Array<{ re: RegExp; terms: string[] }> = [
  { re: /pet|petshop|banho e tosa|animal/, terms: ["pet shop", "petshop", "banho e tosa", "loja de animais"] },
  { re: /advog|advocacia|juridic/, terms: ["advogado", "advocacia", "escritório de advocacia"] },
  { re: /dentist|odont/, terms: ["dentista", "odontologia", "clínica odontológica"] },
  { re: /restaurant|pizz|lanch|comida|burger/, terms: ["restaurante", "pizzaria", "lanchonete", "hamburgueria"] },
  { re: /academia|fitness|ginastica|crossfit/, terms: ["academia", "academia de ginástica", "crossfit"] },
  { re: /veterin/, terms: ["veterinário", "clínica veterinária"] },
  { re: /salao|cabel|barbear|estetic|beleza/, terms: ["salão de beleza", "cabeleireiro", "barbearia"] },
  { re: /contab|contador/, terms: ["contabilidade", "escritório de contabilidade"] },
  { re: /imobili|corretor|imovel/, terms: ["imobiliária", "corretor de imóveis"] },
  { re: /arquitet/, terms: ["arquiteto", "escritório de arquitetura"] },
  { re: /farmac|drogari/, terms: ["farmácia", "drogaria"] },
  { re: /supermerc|mercado|mercearia/, terms: ["supermercado", "mercado"] },
  { re: /oficina|mecanic|auto ?center|autopec/, terms: ["oficina mecânica", "auto center", "autopeças"] },
  { re: /escola|colegio|curso/, terms: ["escola", "colégio", "curso"] },
];

function normTerm(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Gera variantes de busca determinísticas para ampliar a cobertura (mesmo
 * segmento, termos equivalentes). A 1ª é sempre a query base do app.
 */
export function buildQueryVariants(segment: string, city: string, state: string, max = 8): string[] {
  const seg = String(segment ?? "").trim();
  const c = String(city ?? "").trim();
  const uf = String(state ?? "").trim();
  if (!seg || !c) return [`${seg} em ${c}${uf ? ", " + uf : ""}`.trim()];

  const base = `${seg} em ${c}, ${uf}`;
  const out = [base];
  const seen = new Set([base]);
  const push = (q: string) => {
    const clean = q.replace(/\s+/g, " ").trim();
    if (out.length < max && clean && !seen.has(clean)) { seen.add(clean); out.push(clean); }
  };

  const terms = new Set<string>();
  const n = normTerm(seg);
  for (const entry of SEGMENT_SYNONYMS) if (entry.re.test(n)) for (const t of entry.terms) terms.add(t);
  const singular = /s$/i.test(seg) && seg.length > 3 ? seg.replace(/s$/i, "") : seg;
  const plural = /s$/i.test(seg) ? seg : `${seg}s`;
  terms.add(seg);
  terms.add(singular);
  terms.add(plural);

  // Intercala formatos diferentes (com "em ... UF" e só "cidade") — o Google
  // devolve conjuntos distintos conforme o formato, ampliando a cobertura.
  for (const t of terms) {
    push(`${t} em ${c}, ${uf}`);
    push(`${t} ${c}`);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/**
 * Executa VÁRIAS queries no mapScraper e devolve os resultados mesclados/
 * deduplicados por place_id.
 *
 * As variantes são independentes (cada uma é uma busca completa) e podem ser
 * executadas com concorrência CONTROLADA. O padrão é 3 em paralelo — o mesmo
 * limite que o próprio mapScraper adota para múltiplas queries
 * (`search_multiple_async`, max_concurrent=3) — o que mantém a cobertura
 * IDÊNTICA (todas as variantes são consultadas) reduzindo o tempo total.
 * A ordem das variantes é preservada antes do dedupe, para resultado estável.
 */
export async function callMapScraperVariants(opts: {
  baseUrl: string;
  variants: string[];
  maxPlacesPerVariant: number;
  lang?: string;
  country?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Máximo de variantes simultâneas (default 3). 1 = comportamento serial antigo. */
  concurrency?: number;
}): Promise<{ places: GmapsScraperPlace[]; rawCount: number; errors: string[] }> {
  const variants = opts.variants ?? [];
  const conc = Math.max(1, Math.min(opts.concurrency ?? 3, variants.length || 1));
  const perVariant: Array<{ places: GmapsScraperPlace[]; rawCount: number; error?: string }> = new Array(variants.length);

  let cursor = 0;
  const worker = async () => {
    while (cursor < variants.length) {
      const idx = cursor++;
      perVariant[idx] = await callMapScraper({
        baseUrl: opts.baseUrl,
        query: variants[idx],
        maxPlaces: opts.maxPlacesPerVariant,
        lang: opts.lang,
        country: opts.country,
        apiKey: opts.apiKey,
        timeoutMs: opts.timeoutMs,
        fetchImpl: opts.fetchImpl,
      });
    }
  };
  await Promise.all(Array.from({ length: conc }, () => worker()));

  const errors: string[] = [];
  let rawCount = 0;
  const seen = new Set<string>();
  const out: GmapsScraperPlace[] = [];
  for (const r of perVariant) {
    if (!r) continue;
    if (r.error) errors.push(r.error);
    rawCount += r.rawCount ?? r.places.length;
    for (const p of r.places) {
      const key = String(p.place_id ?? `${p.name ?? ""}|${p.address ?? ""}`);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return { places: out, rawCount, errors };
}
