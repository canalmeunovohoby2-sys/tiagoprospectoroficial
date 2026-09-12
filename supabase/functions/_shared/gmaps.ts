// Integração com o Google Maps scraper self-hosted
// (conor-is-my-name/google-maps-scraper), exposto como REST `/scrape-get`.
// Funções puras + cliente HTTP — testáveis isoladamente.

export type GmapsScraperPlace = {
  title?: string | null;
  name?: string | null;
  category?: string | null;
  categories?: string[] | string | null;
  review_rating?: number | string | null;
  rating?: number | string | null;
  review_count?: number | string | null;
  reviews_count?: number | string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  emails?: string[] | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  coordinates?: { latitude?: number | string | null; longitude?: number | string | null } | null;
  place_id?: string | null;
  cid?: string | null;
  hours?: string[] | string | null;
  link?: string | null;
  [key: string]: unknown;
};

export type GmapsNormalizedLead = {
  source: "google_maps_scraper";
  sourceId: string;
  name: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  rating: number | null;
  reviews: number;
  priority: number;
  reasons: string[];
  raw: GmapsScraperPlace;
};

export function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Somente dígitos; valida comprimento BR (10/11) e devolve o original
// formatado quando plausível (a UI usa o número como veio do Google).
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  let national = digits;
  if (national.startsWith("55") && national.length >= 12) national = national.slice(2);
  if (national.length !== 10 && national.length !== 11) return null;
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  return raw;
}

export function inferWhatsapp(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, "");
  let m = digits.match(/^55(\d{2})(\d{8,9})$/);
  if (m) return `55${m[1]}${m[2]}`;
  m = digits.match(/^(\d{2})(\d{8,9})$/);
  if (m) return `55${m[1]}${m[2]}`;
  return null;
}

export function parseEmail(value: GmapsScraperPlace["emails"]): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value.find((e) => typeof e === "string" && e.includes("@"));
    return first ? String(first).trim() : null;
  }
  const str = String(value);
  const match = str.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

// Score de prioridade 0-100 conforme especificação.
export function priorityScore(lead: Pick<GmapsNormalizedLead, "phone" | "website" | "rating" | "reviews" | "address" | "lat" | "lng">): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = ["Fonte: Google Maps (scraper)"];
  let s = 0;
  if (lead.phone) { s += 25; reasons.push("Telefone disponível (+25)"); }
  if (lead.website) { s += 15; reasons.push("Website disponível (+15)"); }
  if (lead.rating !== null && lead.rating >= 4.0) { s += 20; reasons.push(`Nota ${lead.rating} ≥ 4.0 (+20)`); }
  if (lead.reviews > 50) { s += 15; reasons.push(`${lead.reviews} avaliações (+15)`); }
  if (lead.address) { s += 10; reasons.push("Endereço completo (+10)"); }
  if (lead.lat !== null && lead.lng !== null) { s += 5; reasons.push("Coordenadas (+5)"); }
  return { score: Math.max(0, Math.min(100, s)), reasons };
}

export function normalizeGmapsResults(
  results: GmapsScraperPlace[],
  city: string,
  state: string,
): GmapsNormalizedLead[] {
  const out: GmapsNormalizedLead[] = [];
  const seen = new Set<string>();
  for (const place of results ?? []) {
    const name = firstNonEmpty(place.title, place.name);
    if (!name || name.length < 2) continue;

    const sourceId = firstNonEmpty(
      place.place_id,
      place.cid,
      `${normalizeText(name)}|${normalizeText(place.address ?? "")}`,
    )!;
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);

    const phone = normalizePhone(place.phone);
    const website = firstNonEmpty(place.website);
    const email = parseEmail(place.emails);
    const address = firstNonEmpty(place.address);
    const lat = toNumber(place.latitude ?? place.coordinates?.latitude);
    const lng = toNumber(place.longitude ?? place.coordinates?.longitude);
    const rating = toNumber(place.review_rating ?? place.rating);
    const reviews = toNumber(place.review_count ?? place.reviews_count) ?? 0;
    const category = firstNonEmpty(
      place.category,
      Array.isArray(place.categories) ? place.categories[0] : place.categories,
    );

    const base = { phone, website, rating, reviews, address, lat, lng };
    const { score, reasons } = priorityScore(base);

    out.push({
      source: "google_maps_scraper",
      sourceId,
      name,
      phone,
      website,
      email,
      address,
      city: city || null,
      state: state || null,
      lat,
      lng,
      category,
      rating,
      reviews,
      priority: score,
      reasons,
      raw: place,
    });
  }
  return out;
}

function filledCount(lead: GmapsNormalizedLead): number {
  return [lead.phone, lead.website, lead.email, lead.address, lead.category, lead.rating, lead.lat].filter(
    (v) => v !== null && v !== undefined && v !== "",
  ).length;
}

function phoneKey(lead: GmapsNormalizedLead): string | null {
  if (!lead.phone) return null;
  const digits = lead.phone.replace(/\D+/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

function streetOf(address: string | null): string {
  if (!address) return "";
  return normalizeText(address.split(/[,\-|]/)[0] ?? "").replace(/\s+/g, " ").trim();
}

// Melhor registro em caso de colisão: mais campos preenchidos; empate →
// whatsapp implícito (phone) > email > website.
function betterLead(a: GmapsNormalizedLead, b: GmapsNormalizedLead): GmapsNormalizedLead {
  const fa = filledCount(a);
  const fb = filledCount(b);
  if (fa !== fb) return fa >= fb ? a : b;
  const wa = a.phone ? 1 : 0;
  const wb = b.phone ? 1 : 0;
  if (wa !== wb) return wa > wb ? a : b;
  if (!!a.email !== !!b.email) return a.email ? a : b;
  if (!!a.website !== !!b.website) return a.website ? a : b;
  return a;
}

export type DedupeResult = {
  leads: GmapsNormalizedLead[];
  removed: Array<{ dropped: string; kept: string; reason: string }>;
};

// Ordem exata: ID → telefone → nome+rua → nome+cidade → coordenadas.
export function dedupeGmapsLeads(input: GmapsNormalizedLead[]): DedupeResult {
  const removed: DedupeResult["removed"] = [];
  const byId = new Map<string, GmapsNormalizedLead>();
  const byPhone = new Map<string, string>();
  const byNameStreet = new Map<string, string>();
  const byNameCity = new Map<string, string>();
  const byGeo = new Map<string, string>();

  const leads: GmapsNormalizedLead[] = [];

  const replace = (index: number, incoming: GmapsNormalizedLead, reason: string) => {
    if (index < 0) {
      leads.push(incoming);
      return;
    }
    const current = leads[index];
    const winner = betterLead(current, incoming);
    const loser = winner === current ? incoming : current;
    removed.push({ dropped: loser.sourceId, kept: winner.sourceId, reason });
    if (winner !== current) leads[index] = winner;
  };

  for (const lead of input) {
    const idKey = lead.sourceId;
    if (byId.has(idKey)) {
      replace(leads.findIndex((l) => l.sourceId === byId.get(idKey)), lead, "source_id");
      continue;
    }

    const pk = phoneKey(lead);
    if (pk && byPhone.has(pk)) {
      replace(leads.findIndex((l) => l.sourceId === byPhone.get(pk)), lead, "phone");
      continue;
    }

    const ns = `${normalizeText(lead.name)}|${streetOf(lead.address)}`;
    if (streetOf(lead.address) && byNameStreet.has(ns)) {
      replace(leads.findIndex((l) => l.sourceId === byNameStreet.get(ns)), lead, "name+street");
      continue;
    }

    const nc = `${normalizeText(lead.name)}|${normalizeText(lead.city ?? "")}`;
    if (lead.city && byNameCity.has(nc)) {
      replace(leads.findIndex((l) => l.sourceId === byNameCity.get(nc)), lead, "name+city");
      continue;
    }

    const geo = lead.lat !== null && lead.lng !== null ? `${lead.lat.toFixed(4)},${lead.lng.toFixed(4)}` : null;
    if (geo && byGeo.has(geo)) {
      replace(leads.findIndex((l) => l.sourceId === byGeo.get(geo)), lead, "coordinates");
      continue;
    }

    leads.push(lead);
    byId.set(idKey, lead.sourceId);
    if (pk) byPhone.set(pk, lead.sourceId);
    if (streetOf(lead.address)) byNameStreet.set(ns, lead.sourceId);
    if (lead.city) byNameCity.set(nc, lead.sourceId);
    if (geo) byGeo.set(geo, lead.sourceId);
  }

  return { leads, removed };
}

const CLOSED_MARKERS = ["encerrad", "fechad", "inativ", "falencia", "falência", "recuperacao judicial", "recuperação judicial"];

export type ValidationResult = {
  leads: GmapsNormalizedLead[];
  rejected: Array<{ name: string; reason: string }>;
};

// Descarta não operacionais, sem nome/sourceId e fora da cidade solicitada.
export function validateGmapsLeads(
  input: GmapsNormalizedLead[],
  city: string,
  state: string,
): ValidationResult {
  const rejected: ValidationResult["rejected"] = [];
  const cityNorm = normalizeText(city);
  const stateNorm = normalizeText(state);
  const leads: GmapsNormalizedLead[] = [];

  for (const lead of input) {
    const nameNorm = normalizeText(lead.name);
    if (!lead.name || !lead.sourceId) {
      rejected.push({ name: lead.name, reason: "sem nome/sourceId" });
      continue;
    }
    if (CLOSED_MARKERS.some((m) => nameNorm.includes(m))) {
      rejected.push({ name: lead.name, reason: "empresa não operacional" });
      continue;
    }
    if (lead.state && normalizeText(lead.state) !== stateNorm && lead.city && normalizeText(lead.city) !== cityNorm) {
      rejected.push({ name: lead.name, reason: "cidade/estado divergente" });
      continue;
    }
    if (lead.city && cityNorm && !normalizeText(lead.city).includes(cityNorm) && !cityNorm.includes(normalizeText(lead.city))) {
      rejected.push({ name: lead.name, reason: "cidade divergente" });
      continue;
    }
    leads.push(lead);
  }
  return { leads, rejected };
}

export function sortGmapsByPriority(leads: GmapsNormalizedLead[]): GmapsNormalizedLead[] {
  return [...leads].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (!!b.phone !== !!a.phone) return b.phone ? 1 : -1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

// Shape compatível com o front (PublicLead usado pelo LeadSearchForm).
export function toPublicLeadShape(lead: GmapsNormalizedLead): Record<string, unknown> {
  const lat = lead.lat;
  const lng = lead.lng;
  return {
    external_id: lead.sourceId,
    name: lead.name,
    category: lead.category,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    phone: lead.phone,
    whatsapp: inferWhatsapp(lead.phone),
    website: lead.website,
    email: lead.email,
    google_url: lat !== null && lng !== null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null,
    instagram: null,
    facebook: null,
    rating: lead.rating,
    reviews_count: lead.reviews,
    has_website: !!lead.website,
    score: lead.priority,
    score_reasons: lead.reasons,
    opening_hours: null,
    latitude: lat,
    longitude: lng,
    confidence: lead.priority >= 60 ? "high" : lead.priority >= 30 ? "medium" : "low",
    city_matches: true,
  };
}

export type ScraperCallOpts = {
  baseUrl: string;
  query: string;
  maxPlaces: number;
  apiKey?: string;
  lang?: string;
  concurrency?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function callGmapsScraper(opts: ScraperCallOpts): Promise<{ results: GmapsScraperPlace[]; error?: string }> {
  const {
    baseUrl,
    query,
    maxPlaces,
    apiKey,
    lang = "pt",
    concurrency = 5,
    timeoutMs = 300000,
    fetchImpl = fetch,
  } = opts;
  if (!baseUrl) return { results: [], error: "GMAPS_SCRAPER_URL não configurada" };

  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/scrape-get?query=${encodeURIComponent(query)}&max_places=${maxPlaces}&lang=${encodeURIComponent(lang)}&headless=true&concurrency=${concurrency}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetchImpl(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { results: [], error: `Scraper HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => ({}));
    const results = Array.isArray((data as { results?: unknown })?.results)
      ? ((data as { results: GmapsScraperPlace[] }).results)
      : [];
    return { results };
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    return { results: [], error: isAbort ? "Scraper timeout" : `Scraper: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}
