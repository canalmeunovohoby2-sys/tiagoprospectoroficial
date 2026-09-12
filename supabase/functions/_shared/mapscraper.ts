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

export async function callMapScraper(opts: MapScraperCallOpts): Promise<{ places: GmapsScraperPlace[]; error?: string }> {
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
    return { places: mapMapScraperRecords(records) };
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    return { places: [], error: isAbort ? "mapScraper timeout" : `mapScraper: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}
