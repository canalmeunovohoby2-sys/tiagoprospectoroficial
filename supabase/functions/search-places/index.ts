// Real-time lead search via Google Places API.
// Returns only verified public data. No mock, no invented fields.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runWebSources, enrichLeadsWithWeb } from "../_shared/lead-web.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
const GOOGLE_KEY_LOADED = typeof GOOGLE_KEY === "string" && GOOGLE_KEY.trim().length > 0;

// Chamada interna às edge functions search-tavily / search-firecrawl (que usam
// o Provider Key Pool com failover sequencial). Falhas nunca derrubam a busca.
async function callWebFunction(
  provider: "tavily" | "firecrawl",
  payload: { query?: string; url?: string; limit?: number },
): Promise<{ ok: boolean; results?: unknown[]; content?: string | null }> {
  const baseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const fnName = provider === "tavily" ? "search-tavily" : "search-firecrawl";
  if (!baseUrl || !anonKey) return { ok: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${baseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return { ok: false };
    if (payload.url) {
      return { ok: true, content: typeof (data as { content?: unknown }).content === "string" ? (data as { content: string }).content : null };
    }
    return { ok: true, results: Array.isArray((data as { results?: unknown }).results) ? (data as { results: unknown[] }).results : [] };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function scrapePageContent(url: string): Promise<string | null> {
  const result = await callWebFunction("firecrawl", { url });
  return result.ok ? (result.content ?? null) : null;
}

const SOURCE_LABELS = {
  googleNew: "google_places_new",
  googleLegacy: "google_places_legacy",
  nominatim: "openstreetmap_nominatim",
  overpass: "openstreetmap_overpass",
  overpassRecovery: "openstreetmap_overpass_recovery",
} as const;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.primaryTypeDisplayName",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.currentOpeningHours",
].join(",");

type PlaceRaw = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  currentOpeningHours?: { weekdayDescriptions?: string[] };
};

type LegacyTextSearchResult = {
  place_id: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
};

type LegacyDetailsResult = LegacyTextSearchResult & {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  opening_hours?: { weekday_text?: string[] };
};

type PublicLead = {
  external_id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string;
  state: string;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  google_url: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: number | null;
  reviews_count: number;
  has_website: boolean;
  score: number;
  score_reasons: string[];
  opening_hours: string[] | null;
  latitude: number | null;
  longitude: number | null;
  confidence: "high" | "medium" | "low";
  city_matches: boolean;
};

type OsmTagFilter = { key: string; value?: string; regex?: string };

type GoogleErrorCode =
  | "GOOGLE_KEY_MISSING"
  | "GOOGLE_API_KEY_INVALID"
  | "GOOGLE_PLACES_NEW_DISABLED"
  | "GOOGLE_LEGACY_DISABLED"
  | "GOOGLE_BILLING_DISABLED"
  | "GOOGLE_QUOTA_EXCEEDED"
  | "GOOGLE_API_KEY_RESTRICTED"
  | "GOOGLE_PERMISSION_DENIED"
  | "GOOGLE_INVALID_REQUEST"
  | "GOOGLE_REQUEST_DENIED"
  | "GOOGLE_OVER_QUERY_LIMIT"
  | "GOOGLE_ZERO_RESULTS"
  | "GOOGLE_NETWORK_ERROR"
  | "GOOGLE_TIMEOUT"
  | "GOOGLE_PLACES_ERROR";

type SearchError = { status: number; text: string; endpoint: string; durationMs?: number };

const OSM_SEGMENT_FILTERS: Array<{ match: string[]; filters: OsmTagFilter[] }> = [
  { match: ["dentista", "dentistas", "odontologia", "odontologico", "odontológica", "odontologica"], filters: [{ key: "amenity", value: "dentist" }, { key: "healthcare", value: "dentist" }] },
  { match: ["medico", "médico", "medicos", "médicos", "clinica", "clínica", "clinicas", "clínicas"], filters: [{ key: "amenity", value: "clinic" }, { key: "healthcare", value: "clinic" }, { key: "healthcare", value: "doctor" }] },
  { match: ["advogado", "advogados", "advocacia"], filters: [{ key: "office", value: "lawyer" }, { key: "amenity", value: "lawyer" }, { key: "name", regex: "advogad|advocaci|lawyer|oab" }] },
  { match: ["contador", "contadores", "contabilidade"], filters: [{ key: "office", value: "accountant" }, { key: "name", regex: "contabil|contador" }] },
  { match: ["imobiliaria", "imobiliária", "imobiliarias", "imobiliárias"], filters: [{ key: "office", value: "estate_agent" }, { key: "shop", value: "estate_agent" }] },
  { match: ["restaurante", "restaurantes"], filters: [{ key: "amenity", value: "restaurant" }, { key: "amenity", value: "food_court" }] },
  { match: ["oficina", "oficinas", "mecanica", "mecânica"], filters: [{ key: "shop", value: "car_repair" }, { key: "craft", value: "mechanic" }, { key: "shop", value: "tyres" }, { key: "shop", value: "motorcycle_repair" }] },
  { match: ["academia", "academias", "fitness"], filters: [{ key: "leisure", value: "fitness_centre" }, { key: "amenity", value: "gym" }] },
  { match: ["estetica", "estética", "beleza"], filters: [{ key: "shop", value: "beauty" }, { key: "beauty", regex: ".+" }] },
  { match: ["arquiteto", "arquitetos", "arquitetura"], filters: [{ key: "office", value: "architect" }, { key: "name", regex: "arquitet" }] },
  { match: ["psicologo", "psicólogo", "psicologos", "psicólogos", "psicologia"], filters: [{ key: "healthcare", value: "psychotherapist" }, { key: "office", value: "therapist" }, { key: "name", regex: "psicolog" }] },
  { match: ["veterinario", "veterinário", "veterinarios", "veterinários"], filters: [{ key: "amenity", value: "veterinary" }, { key: "healthcare", value: "veterinary" }] },
  { match: ["salao", "salão", "saloes", "salões", "cabeleireiro"], filters: [{ key: "shop", value: "hairdresser" }, { key: "shop", value: "beauty" }] },
  { match: ["escola", "escolas"], filters: [{ key: "amenity", value: "school" }] },
  { match: ["hotel", "hoteis", "hotéis"], filters: [{ key: "tourism", value: "hotel" }] },
  { match: ["cafeteria", "cafeterias", "cafe", "café"], filters: [{ key: "amenity", value: "cafe" }] },
  { match: ["loja de roupa", "lojas de roupas", "roupas", "vestuario", "vestuário"], filters: [{ key: "shop", value: "clothes" }, { key: "shop", value: "boutique" }] },

  // ---------- Segmentos Orvix ERP/PDV ----------
  { match: ["adega", "adegas", "loja de bebidas", "distribuidora de bebidas", "deposito de bebidas", "depósito de bebidas", "vinhos", "bebidas"], filters: [{ key: "shop", value: "alcohol" }, { key: "shop", value: "wine" }, { key: "shop", value: "beverages" }] },
  { match: ["mercado", "mercadinho", "mercearia", "minimercado", "empório", "emporio"], filters: [{ key: "shop", value: "convenience" }, { key: "shop", value: "supermarket" }, { key: "shop", value: "grocery" }, { key: "shop", value: "greengrocer" }, { key: "shop", value: "deli" }] },
  { match: ["supermercado", "hipermercado", "atacarejo", "atacadão"], filters: [{ key: "shop", value: "supermarket" }, { key: "shop", value: "wholesale" }] },
  { match: ["padaria", "panificadora", "confeitaria"], filters: [{ key: "shop", value: "bakery" }, { key: "shop", value: "pastry" }, { key: "craft", value: "bakery" }, { key: "craft", value: "confectionery" }] },
  { match: ["lanchonete", "lanches", "hamburgueria", "hamburguer", "burger", "hot dog", "sanduicheria"], filters: [{ key: "amenity", value: "fast_food" }] },
  { match: ["pizzaria", "pizza"], filters: [{ key: "amenity", value: "fast_food", regex: undefined }, { key: "cuisine", regex: "pizza" }] },
  { match: ["farmacia", "farmácia", "farmacias", "farmácias", "drogaria", "drogarias", "manipulacao", "manipulação"], filters: [{ key: "amenity", value: "pharmacy" }, { key: "shop", value: "chemist" }, { key: "healthcare", value: "pharmacy" }] },
  { match: ["pet shop", "pet shops", "petshop", "agropecuaria", "agropecuária"], filters: [{ key: "shop", value: "pet" }, { key: "shop", value: "agrarian" }, { key: "shop", value: "pet_grooming" }, { key: "shop", value: "pet_food" }, { key: "shop", value: "animal_feed" }, { key: "shop", value: "animal_boarding" }, { key: "amenity", value: "veterinary" }, { key: "healthcare", value: "veterinary" }] },
  { match: ["papelaria", "papelarias", "material escolar"], filters: [{ key: "shop", value: "stationery" }, { key: "shop", value: "books" }] },
  { match: ["loja de roupas", "boutique", "moda", "confeccao", "confecção"], filters: [{ key: "shop", value: "clothes" }, { key: "shop", value: "fashion" }, { key: "shop", value: "boutique" }] },
  { match: ["loja de calcados", "loja de calçados", "calcado", "calçado", "sapatos", "sapataria", "tenis", "tênis"], filters: [{ key: "shop", value: "shoes" }] },
  { match: ["loja de presentes", "presentes", "utilidades", "bazar", "variedades"], filters: [{ key: "shop", value: "gift" }, { key: "shop", value: "variety_store" }, { key: "shop", value: "houseware" }] },
  { match: ["autopeca", "autopeça", "autopecas", "autopeças", "peças automotivas", "acessorios automotivos", "acessórios automotivos", "auto center"], filters: [{ key: "shop", value: "car_parts" }, { key: "shop", value: "tyres" }, { key: "shop", value: "motorcycle_parts" }] },
  { match: ["material de construcao", "material de construção", "construção", "construcao", "ferragem", "ferragens", "hidraulica", "hidráulica"], filters: [{ key: "shop", value: "hardware" }, { key: "shop", value: "doityourself" }, { key: "shop", value: "trade" }, { key: "shop", value: "paint" }, { key: "shop", value: "electrical" }, { key: "shop", value: "plumbing" }, { key: "shop", value: "tiles" }, { key: "shop", value: "building_material" }] },
  { match: ["deposito", "depósito", "atacado", "atacadista"], filters: [{ key: "shop", value: "wholesale" }] },
  { match: ["assistencia tecnica", "assistência técnica", "conserto", "reparo", "manutencao de celular", "manutenção de celular"], filters: [{ key: "shop", value: "electronics" }, { key: "shop", value: "mobile_phone" }, { key: "craft", value: "electronics_repair" }] },
  { match: ["otica", "ótica", "opticas", "ópticas", "oculos", "óculos"], filters: [{ key: "shop", value: "optician" }] },
  { match: ["distribuidora", "distribuidor", "fornecedor"], filters: [{ key: "shop", value: "wholesale" }] },
  { match: ["conveniencia", "conveniência", "loja de conveniencia", "loja de conveniência"], filters: [{ key: "shop", value: "convenience" }] },
];

// Synonym expansion: maps a segment to multiple equivalent search terms.
// Boosts coverage by capturing businesses registered under different names on Google.
const SEGMENT_SYNONYMS: Array<{ match: string[]; synonyms: string[] }> = [
  { match: ["dentista", "odontologia", "odontológica", "odontologica"], synonyms: ["dentista", "odontologia", "clínica odontológica", "consultório odontológico"] },
  { match: ["medico", "médico", "clinica medica", "clínica médica"], synonyms: ["clínica médica", "consultório médico", "médico", "clínica geral"] },
  { match: ["advogado", "advocacia"], synonyms: ["advogado", "escritório de advocacia", "advocacia"] },
  { match: ["contador", "contabilidade"], synonyms: ["contador", "escritório de contabilidade", "contabilidade"] },
  { match: ["imobiliaria", "imobiliária"], synonyms: ["imobiliária", "corretor de imóveis", "imóveis"] },
  { match: ["mecanica", "mecânica", "oficina"], synonyms: ["mecânica", "oficina mecânica", "auto center", "auto elétrica"] },
  { match: ["academia", "fitness"], synonyms: ["academia", "academia de musculação", "studio fitness", "crossfit"] },
  { match: ["estetica", "estética", "beleza"], synonyms: ["clínica de estética", "estética", "centro de beleza", "spa"] },
  { match: ["construtora"], synonyms: ["construtora", "empresa de construção", "engenharia civil"] },
  { match: ["arquiteto", "arquitetura"], synonyms: ["arquiteto", "escritório de arquitetura", "arquitetura e interiores"] },
  { match: ["psicologo", "psicólogo", "psicologia"], synonyms: ["psicólogo", "clínica de psicologia", "consultório de psicologia"] },
  { match: ["veterinario", "veterinário"], synonyms: ["veterinário", "clínica veterinária", "hospital veterinário"] },
  { match: ["salao", "salão", "cabeleireiro"], synonyms: ["salão de beleza", "cabeleireiro", "barbearia"] },
  { match: ["hotel", "hoteis", "hotéis"], synonyms: ["hotel", "pousada", "hospedagem"] },
  { match: ["cafeteria", "cafe", "café"], synonyms: ["cafeteria", "café", "coffee shop"] },

  // ---------- Segmentos Orvix ERP/PDV ----------
  { match: ["adega"], synonyms: ["adega", "loja de bebidas", "distribuidora de bebidas", "depósito de bebidas", "empório de bebidas", "vinhos", "bebidas", "casa de bebidas"] },
  { match: ["supermercado", "hipermercado"], synonyms: ["supermercado", "hipermercado", "atacarejo", "mercado", "atacadão"] },
  { match: ["mercado", "mercadinho", "mercearia", "empório", "emporio"], synonyms: ["mercado", "minimercado", "mercearia", "empório", "loja de conveniência", "mercadinho", "hortifruti", "sacolão"] },
  { match: ["padaria", "confeitaria"], synonyms: ["padaria", "panificadora", "confeitaria", "pães e doces", "casa de pães", "doceria", "padaria e lanchonete"] },
  { match: ["restaurante"], synonyms: ["restaurante", "comida", "self service", "churrascaria"] },
  { match: ["lanchonete", "hamburgueria"], synonyms: ["lanchonete", "hamburgueria", "burger", "sanduicheria", "fast food", "hot dog", "cachorro quente", "lanches"] },
  { match: ["pizzaria"], synonyms: ["pizzaria", "pizza delivery", "rodízio de pizza"] },
  { match: ["farmacia", "farmácia", "drogaria"], synonyms: ["farmácia", "drogaria", "farmácia de manipulação", "farmácia popular", "drogaria popular", "farmácia 24h", "farmácia e perfumaria"] },
  { match: ["pet shop", "petshop"], synonyms: ["pet shop", "loja de animais", "banho e tosa", "agropecuária", "clínica veterinária pet", "ração e acessórios", "pet center", "petland"] },
  { match: ["papelaria"], synonyms: ["papelaria", "material escolar", "livraria papelaria", "papelaria e presentes", "papelaria e informática", "copiadora e papelaria", "papelaria escolar", "artigos de escritório"] },
  { match: ["loja de roupas", "roupas", "moda", "confecção", "confeccao", "boutique"], synonyms: ["loja de roupas", "boutique", "moda feminina", "moda masculina", "confecção"] },
  { match: ["loja de calcados", "loja de calçados", "calcado", "calçado", "sapatos", "tenis", "tênis"], synonyms: ["loja de calçados", "sapataria", "sapatos", "tênis"] },
  { match: ["loja de presentes", "presentes", "utilidades", "bazar"], synonyms: ["loja de presentes", "utilidades domésticas", "bazar", "loja de variedades"] },
  { match: ["autopeca", "autopeça", "autopeças", "auto peça"], synonyms: ["autopeças", "auto peças", "peças automotivas", "acessórios automotivos", "auto center", "loja de peças automotivas", "distribuidora de autopeças", "casa de peças"] },
  { match: ["material de construcao", "material de construção", "construção", "construcao", "ferragem"], synonyms: ["material de construção", "loja de materiais para construção", "ferragens", "loja de tintas", "depósito de material de construção", "casa de construção", "materiais hidráulicos e elétricos", "home center"] },
  { match: ["deposito", "depósito", "atacado", "atacadista"], synonyms: ["depósito", "atacado", "atacadista", "distribuidor"] },
  { match: ["assistencia tecnica", "assistência técnica", "conserto"], synonyms: ["assistência técnica", "conserto de celular", "assistência de eletrônicos", "reparo de eletrônicos"] },
  { match: ["otica", "ótica", "opticas", "ópticas"], synonyms: ["ótica", "óptica", "loja de óculos"] },
  { match: ["distribuidora", "distribuidor", "fornecedor"], synonyms: ["distribuidora", "atacado", "atacadista", "fornecedor", "revenda", "central de distribuição", "depósito", "importadora"] },
  { match: ["conveniencia", "conveniência"], synonyms: ["loja de conveniência", "conveniência 24h", "mercadinho", "conveniência de posto", "mini mercado 24h", "conveniência e tabacaria", "loja 24 horas", "conveniência express"] },
];

// Google Places API (New) `includedType` mapping. Sharpens semantic
// matching when the Orvix segment maps to a well-defined place type.
// See https://developers.google.com/maps/documentation/places/web-service/place-types
const GOOGLE_INCLUDED_TYPE: Array<{ match: string[]; types: string[] }> = [
  { match: ["adega", "bebidas", "vinhos"], types: ["liquor_store"] },
  { match: ["supermercado", "hipermercado"], types: ["supermarket", "grocery_store"] },
  { match: ["mercado", "mercearia", "mercadinho"], types: ["grocery_store", "convenience_store", "supermarket"] },
  { match: ["padaria", "panificadora"], types: ["bakery"] },
  { match: ["restaurante"], types: ["restaurant"] },
  { match: ["lanchonete", "hamburgueria", "burger"], types: ["hamburger_restaurant", "fast_food_restaurant", "sandwich_shop"] },
  { match: ["pizzaria"], types: ["pizza_restaurant"] },
  { match: ["farmacia", "farmácia", "drogaria"], types: ["pharmacy", "drugstore"] },
  { match: ["pet shop", "petshop"], types: ["pet_store"] },
  { match: ["papelaria"], types: ["book_store", "store"] },
  { match: ["loja de roupas", "boutique"], types: ["clothing_store"] },
  { match: ["loja de calcados", "loja de calçados", "sapataria"], types: ["shoe_store"] },
  { match: ["loja de presentes", "presentes", "bazar"], types: ["gift_shop"] },
  { match: ["autopeca", "autopeça", "autopeças"], types: ["auto_parts_store"] },
  { match: ["material de construcao", "material de construção", "ferragem"], types: ["hardware_store", "home_improvement_store"] },
  { match: ["conveniencia", "conveniência"], types: ["convenience_store"] },
  { match: ["distribuidora", "distribuidor", "fornecedor"], types: ["wholesaler", "store"] },
  { match: ["otica", "ótica"], types: ["optician"] },
  { match: ["cafeteria", "café", "cafe"], types: ["cafe"] },
  { match: ["hotel", "pousada"], types: ["lodging"] },
  { match: ["mecanica", "mecânica", "oficina"], types: ["car_repair"] },
  { match: ["dentista", "odontologia"], types: ["dental_clinic"] },
  { match: ["veterinario", "veterinário"], types: ["veterinary_care"] },
  { match: ["academia", "fitness"], types: ["gym"] },
];

function getGoogleIncludedTypes(segment: string): string[] {
  const normalized = normalizeText(segment);
  const match = GOOGLE_INCLUDED_TYPE.find((entry) =>
    entry.match.some((m) => normalized.includes(normalizeText(m)))
  );
  return match ? match.types : [];
}


function expandSegment(segment: string): string[] {
  const normalized = normalizeText(segment);
  const match = SEGMENT_SYNONYMS.find((entry) => entry.match.some((m) => normalized.includes(normalizeText(m))));
  if (match) {
    const set = new Set<string>([segment, ...match.synonyms]);
    return Array.from(set).slice(0, 8);
  }
  return [segment];
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function escapeOverpassString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function getOsmFilters(segment: string): OsmTagFilter[] {
  const normalized = normalizeText(segment);
  const direct = OSM_SEGMENT_FILTERS.find((entry) => entry.match.some((m) => normalized.includes(normalizeText(m))));
  if (direct) return direct.filters;

  const safeWords = normalized
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .slice(0, 3)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  if (safeWords.length === 0) return [];
  return [{ key: "name", regex: safeWords.join("|") }];
}

function getComponent(p: PlaceRaw, type: string): string | null {
  const c = p.addressComponents?.find((a) => a.types?.includes(type));
  return c?.longText ?? null;
}

function getLegacyComponent(p: LegacyDetailsResult, type: string): string | null {
  const c = p.address_components?.find((a) => a.types?.includes(type));
  return c?.long_name ?? null;
}

function normalizePhone(intl?: string, national?: string): string | null {
  const raw = (intl ?? national ?? "").trim();
  if (!raw) return null;
  return raw;
}

// WhatsApp link: somente números móveis brasileiros.
// Exige DDD + 9 dígitos (nono dígito obrigatório). Telefone fixo (8 dígitos)
// NÃO é convertido em WhatsApp sem evidência — permanece apenas como phone.
// Output é digits only, formatado como 55 + DDD(2) + 9 dígitos.
function inferWhatsapp(intl?: string, national?: string): string | null {
  const digits = (intl ?? national ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // Already includes country code 55
  let m = digits.match(/^55(\d{2})(9\d{8})$/);
  if (m) return `55${m[1]}${m[2]}`;
  // National format (no country code): DDD + 9 dígitos
  m = digits.match(/^(\d{2})(9\d{8})$/);
  if (m) return `55${m[1]}${m[2]}`;
  return null;
}

function scoreOpportunity(p: PlaceRaw, hasSite: boolean): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let s = 2;
  if (!hasSite) { s += 2; reasons.push("Sem site — alta oportunidade de landing page"); }
  const reviews = p.userRatingCount ?? 0;
  if (reviews >= 50) { s += 1; reasons.push(`${reviews} avaliações no Google (negócio ativo)`); }
  else if (reviews >= 10) { reasons.push(`${reviews} avaliações no Google`); }
  if ((p.rating ?? 0) >= 4.2) reasons.push(`Boa reputação (★ ${p.rating})`);
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") { s -= 2; reasons.push("Status não operacional"); }
  return { score: Math.max(1, Math.min(5, s)), reasons };
}

function confidence(p: PlaceRaw, hasPhone: boolean, hasSite: boolean, cityMatches: boolean): "high" | "medium" | "low" {
  const reviews = p.userRatingCount ?? 0;
  const signals = [hasPhone, hasSite, cityMatches, reviews >= 10, !!p.formattedAddress].filter(Boolean).length;
  if (signals >= 4) return "high";
  if (signals >= 2) return "medium";
  return "low";
}

function confidenceFromSignals(reviews: number, hasAddress: boolean, hasPhone: boolean, hasSite: boolean, cityMatches: boolean): "high" | "medium" | "low" {
  const signals = [hasPhone, hasSite, cityMatches, reviews >= 10, hasAddress].filter(Boolean).length;
  if (signals >= 4) return "high";
  if (signals >= 2) return "medium";
  return "low";
}

function safeJsonSnippet(value: unknown, max = 1800): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function logGoogleKeyStatus() {
  console.info("[search-places] Google Places key status", {
    loaded: GOOGLE_KEY_LOADED,
    empty: !GOOGLE_KEY_LOADED,
    formatLooksLikeApiKey: GOOGLE_KEY_LOADED ? GOOGLE_KEY!.startsWith("AIza") : false,
    length: GOOGLE_KEY_LOADED ? GOOGLE_KEY!.length : 0,
  });
}

function parseGooglePayload(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch (_) {
    return {};
  }
}

function getGoogleReason(parsed: Record<string, unknown>): string {
  const details = (parsed.error as Record<string, unknown> | undefined)?.details;
  if (!Array.isArray(details)) return "";
  const info = details.find((d) => d && typeof d === "object" && (d as Record<string, unknown>)["@type"] === "type.googleapis.com/google.rpc.ErrorInfo") as Record<string, unknown> | undefined;
  return typeof info?.reason === "string" ? info.reason : "";
}

function normalizeGoogleError(status: number, text: string, endpoint = "Google Places"): { message: string; code: GoogleErrorCode; action: string; retryLegacy: boolean } {
  let reason = "";
  let googleMessage = text;
  let legacyStatus = "";
  const parsed = parseGooglePayload(text);
  reason = getGoogleReason(parsed);
  legacyStatus = String(parsed.status ?? "");
  googleMessage = String((parsed.error as Record<string, unknown> | undefined)?.message ?? parsed.error_message ?? text);

  if (!GOOGLE_KEY_LOADED) {
    return {
      code: "GOOGLE_KEY_MISSING",
      message: "A chave do Google Places não está configurada no backend.",
      action: "Salve a chave correta em GOOGLE_PLACES_API_KEY para consultar o Google Places.",
      retryLegacy: false,
    };
  }

  if (!GOOGLE_KEY!.startsWith("AIza")) {
    return {
      code: "GOOGLE_API_KEY_INVALID",
      message: "A chave configurada não parece ser uma API key válida do Google Maps.",
      action: "Use uma chave de API do Google Maps que comece com AIza, não token OAuth.",
      retryLegacy: false,
    };
  }

  if (legacyStatus === "ZERO_RESULTS") {
    return {
      code: "GOOGLE_ZERO_RESULTS",
      message: "O Google Places não encontrou empresas para esses filtros.",
      action: "Tente outro segmento, cidade ou termo mais amplo.",
      retryLegacy: false,
    };
  }

  if (legacyStatus === "INVALID_REQUEST" || reason === "INVALID_ARGUMENT" || status === 400) {
    return {
      code: "GOOGLE_INVALID_REQUEST",
      message: "A requisição enviada ao Google Places está inválida.",
      action: "Revise estado, cidade e segmento. Evite campos vazios ou termos muito longos.",
      retryLegacy: endpoint.includes("New"),
    };
  }

  if (legacyStatus === "OVER_QUERY_LIMIT" || status === 429 || reason === "RATE_LIMIT_EXCEEDED" || reason === "RESOURCE_EXHAUSTED") {
    return {
      code: "GOOGLE_OVER_QUERY_LIMIT",
      message: "A cota ou limite de chamadas do Google Places foi atingido.",
      action: "Aguarde alguns minutos ou revise cotas e faturamento no Google Cloud.",
      retryLegacy: false,
    };
  }

  if (googleMessage === "GOOGLE_TIMEOUT") {
    return {
      code: "GOOGLE_TIMEOUT",
      message: "A consulta ao Google Places demorou demais e foi interrompida.",
      action: "Tente novamente em alguns instantes. Se continuar, reduza a busca ou verifique instabilidade no Google Places.",
      retryLegacy: endpoint.includes("New"),
    };
  }

  if (googleMessage === "GOOGLE_NETWORK_ERROR") {
    return {
      code: "GOOGLE_NETWORK_ERROR",
      message: "Não foi possível conectar ao Google Places no momento.",
      action: "Tente novamente. Se persistir, a integração continuará usando a fonte pública alternativa.",
      retryLegacy: endpoint.includes("New"),
    };
  }

  if (reason === "API_KEY_INVALID" || googleMessage.includes("API key not valid") || googleMessage.includes("invalid API key")) {
    return {
      code: "GOOGLE_API_KEY_INVALID",
      message: "A API key do Google é inválida ou foi revogada.",
      action: "Gere uma nova API key do Google Maps e salve em GOOGLE_PLACES_API_KEY.",
      retryLegacy: false,
    };
  }

  if (reason === "BILLING_DISABLED" || googleMessage.toLowerCase().includes("billing")) {
    return {
      code: "GOOGLE_BILLING_DISABLED",
      message: "O faturamento do projeto Google não está ativo para usar o Places.",
      action: "Ative o billing do projeto da chave no Google Cloud e tente novamente.",
      retryLegacy: false,
    };
  }

  if (reason === "SERVICE_DISABLED" || googleMessage.includes("has not been used") || googleMessage.includes("disabled")) {
    return {
      code: "GOOGLE_PLACES_NEW_DISABLED",
      message: "A chave está correta, mas a Places API (New) está desativada no projeto Google dessa chave.",
      action: "No Google Cloud, abra APIs e Serviços > Biblioteca, ative Places API (New) e aguarde alguns minutos. Confira também se o faturamento está ativo.",
      retryLegacy: true,
    };
  }

  if (googleMessage.includes("LegacyApiNotActivatedMapError") || googleMessage.includes("legacy API") || googleMessage.includes("not enabled for your project")) {
    return {
      code: "GOOGLE_LEGACY_DISABLED",
      message: "A Places API Legacy não está habilitada no projeto Google dessa chave.",
      action: "Se quiser usar fallback Legacy, habilite Places API. Se usar apenas a API nova, permita Places API (New) nas restrições da chave.",
      retryLegacy: false,
    };
  }

  if (reason === "API_KEY_SERVICE_BLOCKED" || legacyStatus === "REQUEST_DENIED" || googleMessage.includes("blocked") || googleMessage.includes("not authorized")) {
    return {
      code: "GOOGLE_API_KEY_RESTRICTED",
      message: "A chave foi aceita, mas suas restrições bloqueiam chamadas para o Google Places.",
      action: "Nas restrições da API key, permita Places API (New) e/ou Places API, ou deixe temporariamente sem restrição de API para testar.",
      retryLegacy: false,
    };
  }

  if (legacyStatus === "REQUEST_DENIED") {
    return {
      code: "GOOGLE_REQUEST_DENIED",
      message: "O Google recusou a consulta do Places.",
      action: "Verifique se a API correta está habilitada, se o billing está ativo e se a chave permite esse endpoint.",
      retryLegacy: endpoint.includes("New"),
    };
  }

  if (status === 403) {
    return {
      code: "GOOGLE_PERMISSION_DENIED",
      message: "O Google recusou a busca por permissão ou configuração da API key.",
      action: "Verifique billing, API ativada e restrições da chave no Google Cloud.",
      retryLegacy: endpoint.includes("New"),
    };
  }

  return {
    code: "GOOGLE_PLACES_ERROR",
    message: `Google Places retornou erro ${status}.`,
    action: "Revise a configuração da API key e tente novamente.",
    retryLegacy: endpoint.includes("New"),
  };
}

// ────────────────────────────────────────────────────────────────
// Resiliência: contexto por-request compartilhado entre fontes.
// Não persiste entre invocações. Serve para:
//   • Circuit breaker (Google/Nominatim) — evita tempestade de 429.
//   • Cache de boundary Nominatim por cidade+UF na mesma execução.
//   • Serialização (mutex) para Nominatim (política 1 req/s).
// ────────────────────────────────────────────────────────────────
type GeoBounds = { south: number; west: number; north: number; east: number };

type SearchCtx = {
  google429: number;
  googleCircuitOpen: boolean;
  nominatim429: number;
  nominatimCircuitOpen: boolean;
  boundaryCache: Map<string, { areaId: number | null; lat: number | null; lon: number | null; bounds?: GeoBounds | null; error?: string }>;
  nominatimGate: Promise<unknown>;
  sourcesFailed: string[];
};

function createSearchCtx(): SearchCtx {
  return {
    google429: 0,
    googleCircuitOpen: false,
    nominatim429: 0,
    nominatimCircuitOpen: false,
    boundaryCache: new Map(),
    nominatimGate: Promise.resolve(),
    sourcesFailed: [],
  };
}

// Consecutivos 429 antes de abrir circuito.
const GOOGLE_CIRCUIT_THRESHOLD = 3;
const NOMINATIM_CIRCUIT_THRESHOLD = 2;
const NOMINATIM_MIN_INTERVAL_MS = 1100;

// Executa a promise `task` respeitando um "gate" sequencial + delay mínimo
// entre chamadas. Usado para Nominatim (rate-limit público de 1 req/s).
async function runSerialized<T>(ctx: SearchCtx, minDelayMs: number, task: () => Promise<T>): Promise<T> {
  const prev = ctx.nominatimGate;
  let release: () => void = () => {};
  ctx.nominatimGate = new Promise<void>((r) => { release = r; });
  try {
    await prev.catch(() => {});
    const result = await task();
    await new Promise((r) => setTimeout(r, minDelayMs));
    return result;
  } finally {
    release();
  }
}

type FetchRetryOpts = {
  retries?: number;
  onRateLimit?: () => void;
  abortIfRateLimited?: () => boolean;
  respectRetryAfter?: boolean;
};

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  optsOrRetries: number | FetchRetryOpts = { retries: 2 },
): Promise<Response> {
  const opts: FetchRetryOpts = typeof optsOrRetries === "number"
    ? { retries: optsOrRetries }
    : optsOrRetries;
  const retries = Math.max(0, opts.retries ?? 2);
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    // Circuit breaker — se aberto antes da 1ª tentativa, aborta sem gastar quota.
    if (i === 0 && opts.abortIfRateLimited?.()) {
      throw new Error("CIRCUIT_OPEN");
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (res.status === 429) opts.onRateLimit?.();

        // Se ainda temos tentativa restante, esperar e continuar.
        if (i < retries) {
          // Respeita Retry-After quando disponível (segundos ou HTTP-date).
          let delayMs: number | null = null;
          if (opts.respectRetryAfter !== false) {
            const ra = res.headers.get("Retry-After");
            if (ra) {
              const asInt = Number(ra);
              if (Number.isFinite(asInt) && asInt >= 0) {
                delayMs = Math.min(asInt * 1000, 4000);
              } else {
                const asDate = Date.parse(ra);
                if (!Number.isNaN(asDate)) {
                  delayMs = Math.max(0, Math.min(asDate - Date.now(), 4000));
                }
              }
            }
          }
          if (delayMs == null) {
            // Backoff exponencial com jitter: 500 → 1000 → 2000 ms (cap 3000).
            const base = Math.min(500 * Math.pow(2, i), 3000);
            delayMs = base + Math.floor(Math.random() * 300);
          }
          console.warn("[search-places] fetch retry", {
            url: url.split("?")[0],
            httpStatus: res.status,
            attempt: i + 1,
            nextDelayMs: delayMs,
          });
          await new Promise((r) => setTimeout(r, delayMs));
          // Após esperar, se circuito abriu, aborta cedo.
          if (opts.abortIfRateLimited?.()) throw new Error("CIRCUIT_OPEN");
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error("GOOGLE_TIMEOUT");
      }
      if (e instanceof Error && e.message === "CIRCUIT_OPEN") throw e;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, Math.min(500 * Math.pow(2, i), 2000)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}



async function fetchLegacyPlaceDetails(p: LegacyTextSearchResult): Promise<LegacyDetailsResult | null> {
  if (!p.place_id) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", p.place_id);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  url.searchParams.set("fields", "place_id,name,formatted_address,address_components,geometry,types,formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,business_status,opening_hours");
  url.searchParams.set("key", GOOGLE_KEY ?? "");

  try {
    const startedAt = Date.now();
    const res = await fetchWithRetry(url.toString(), { method: "GET" }, 1);
    const data = await res.json().catch(() => ({}));
    console.info("[search-places] Google Legacy details response", {
      endpoint: "place/details/json",
      placeIdPresent: !!p.place_id,
      httpStatus: res.status,
      durationMs: Date.now() - startedAt,
      body: safeJsonSnippet(data, 900),
    });
    if (res.ok && data.status === "OK" && data.result) return data.result;
    return p;
  } catch (e) {
    console.warn("[search-places] Legacy details skipped", p.place_id, e instanceof Error ? e.message : e);
    return p;
  }
}

async function searchPlacesNew(
  textQuery: string,
  maxPages: number,
  options?: { locationBias?: { lat: number; lon: number; radius: number }; locationRestriction?: GeoBounds | null; includedType?: string | null; ctx?: SearchCtx },
): Promise<{ places: PlaceRaw[]; error?: SearchError }> {
  const ctx = options?.ctx;

  const allPlaces: PlaceRaw[] = [];
  let pageToken: string | undefined;
  const locationBias = options?.locationBias;
  const locationRestriction = options?.locationRestriction;
  const includedType = options?.includedType ?? null;

  for (let page = 0; page < maxPages; page++) {
    const endpoint = "https://places.googleapis.com/v1/places:searchText";
    const payload: Record<string, unknown> = {
      textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
    };
    if (pageToken) payload.pageToken = pageToken;
    if (includedType) payload.includedType = includedType;
    if (locationRestriction) {
      payload.locationRestriction = {
        rectangle: {
          low: { latitude: locationRestriction.south, longitude: locationRestriction.west },
          high: { latitude: locationRestriction.north, longitude: locationRestriction.east },
        },
      };
    } else if (locationBias) {
      payload.locationBias = {
        circle: {
          center: { latitude: locationBias.lat, longitude: locationBias.lon },
          radius: locationBias.radius,
        },
      };
    }


    console.info("[search-places] Google Places New request", {
      endpoint,
      params: { ...payload, apiKeyLoaded: GOOGLE_KEY_LOADED },
      page: page + 1,
    });

    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_KEY ?? "",
          "X-Goog-FieldMask": `${FIELD_MASK},nextPageToken`,
        },
        body: JSON.stringify(payload),
      }, {
        retries: 1,
        respectRetryAfter: true,
        onRateLimit: () => {
          if (!ctx) return;
          ctx.google429++;
          if (ctx.google429 >= GOOGLE_CIRCUIT_THRESHOLD && !ctx.googleCircuitOpen) {
            ctx.googleCircuitOpen = true;
            ctx.sourcesFailed.push("google_places_new_rate_limited");
            console.warn("[search-places] Google circuit breaker OPEN", { consecutive429: ctx.google429 });
          }
        },
        abortIfRateLimited: () => !!ctx?.googleCircuitOpen,
      });
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg === "GOOGLE_TIMEOUT" ? "GOOGLE_TIMEOUT" : msg === "CIRCUIT_OPEN" ? "GOOGLE_CIRCUIT_OPEN" : "GOOGLE_NETWORK_ERROR";
      console.error("[search-places] Google Places New network failure", { endpoint, durationMs, code, message: msg });
      return { places: allPlaces, error: { status: 0, text: JSON.stringify({ error: { message: code } }), endpoint, durationMs } };
    }


    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      const txt = await res.text();
      console.error("[search-places] Google Places New error", {
        endpoint,
        httpStatus: res.status,
        durationMs,
        body: safeJsonSnippet(txt),
      });
      return { places: allPlaces, error: { status: res.status, text: txt, endpoint, durationMs } };
    }

    // Sucesso — resetar contador de 429 (API respondeu bem).
    if (ctx) ctx.google429 = 0;

    const data = await res.json();

    console.info("[search-places] Google Places New response", {
      endpoint,
      httpStatus: res.status,
      durationMs,
      resultCount: Array.isArray(data.places) ? data.places.length : 0,
      hasNextPage: !!data.nextPageToken,
      body: safeJsonSnippet(data, 1200),
    });
    allPlaces.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  return { places: allPlaces };
}

async function searchPlacesLegacy(textQuery: string, maxPages: number): Promise<{ places: LegacyDetailsResult[]; error?: SearchError }> {
  const found: LegacyTextSearchResult[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", textQuery);
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("region", "br");
    url.searchParams.set("key", GOOGLE_KEY ?? "");
    if (pageToken) url.searchParams.set("pagetoken", pageToken);

    if (pageToken) await new Promise((r) => setTimeout(r, 2000));
    const endpoint = "https://maps.googleapis.com/maps/api/place/textsearch/json";
    console.info("[search-places] Google Places Legacy request", {
      endpoint,
      params: { query: textQuery, language: "pt-BR", region: "br", page: page + 1, apiKeyLoaded: GOOGLE_KEY_LOADED },
    });
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetchWithRetry(url.toString(), { method: "GET" });
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const code = e instanceof Error && e.message === "GOOGLE_TIMEOUT" ? "GOOGLE_TIMEOUT" : "GOOGLE_NETWORK_ERROR";
      console.error("[search-places] Google Places Legacy network failure", { endpoint, durationMs, code, message: e instanceof Error ? e.message : String(e) });
      return { places: [], error: { status: 0, text: JSON.stringify({ error_message: code, status: code }), endpoint, durationMs } };
    }
    const durationMs = Date.now() - startedAt;
    const data = await res.json().catch(() => ({}));
    console.info("[search-places] Google Places Legacy response", {
      endpoint,
      httpStatus: res.status,
      googleStatus: data.status,
      durationMs,
      resultCount: Array.isArray(data.results) ? data.results.length : 0,
      body: safeJsonSnippet(data, 1200),
    });

    if (!res.ok || (data.status && !["OK", "ZERO_RESULTS"].includes(data.status))) {
      const txt = JSON.stringify(data);
      console.error("[search-places] Google Places Legacy textsearch error", { endpoint, httpStatus: res.status, durationMs, body: safeJsonSnippet(txt) });
      return { places: [], error: { status: res.status || 502, text: txt, endpoint, durationMs } };
    }

    found.push(...(data.results ?? []));
    pageToken = data.next_page_token;
    if (!pageToken || data.status === "ZERO_RESULTS") break;
  }

  const details: LegacyDetailsResult[] = [];
  const batchSize = 5;
  for (let i = 0; i < found.length; i += batchSize) {
    const results = await Promise.allSettled(found.slice(i, i + batchSize).map(fetchLegacyPlaceDetails));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) details.push(result.value);
    }
  }

  return { places: details };
}

function mapPlacesNewToLeads(unique: PlaceRaw[], city: string, state: string): PublicLead[] {
  const cityNorm = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const stateNorm = state.trim().toUpperCase();
  return unique
    .filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL")
    .map((p): PublicLead | null => {
      const phone = normalizePhone(p.internationalPhoneNumber, p.nationalPhoneNumber);
      const whatsapp = inferWhatsapp(p.internationalPhoneNumber, p.nationalPhoneNumber);
      const site = p.websiteUri ?? null;
      const hasSite = !!site;
      const placeCity = getComponent(p, "administrative_area_level_2") ?? getComponent(p, "locality") ?? "";
      const placeState = getComponent(p, "administrative_area_level_1");
      const placeStateShort = p.addressComponents?.find((a) => a.types?.includes("administrative_area_level_1"))?.shortText ?? null;
      const placeCityNorm = placeCity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cityMatches = !placeCity || placeCityNorm.includes(cityNorm) || cityNorm.includes(placeCityNorm);
      // Filtro rígido de localização: descarta empresas comprovadamente de outra
      // cidade ou de outro estado. Só mantém quando a cidade não é determinável.
      const stateMatches = !placeStateShort || placeStateShort.toUpperCase() === stateNorm;
      if ((placeCity && !cityMatches) || !stateMatches) return null;
      const { score, reasons } = scoreOpportunity(p, hasSite);

      return {
        external_id: p.id,
        name: p.displayName?.text ?? "Não disponível",
        category: p.primaryTypeDisplayName?.text ?? (p.types?.[0] ?? null),
        address: p.formattedAddress ?? null,
        city: placeCity || city,
        state: placeStateShort ?? placeState ?? state,
        phone,
        whatsapp,
        website: site,
        google_url: p.googleMapsUri ?? null,
        instagram: null,
        facebook: null,
        rating: p.rating ?? null,
        reviews_count: p.userRatingCount ?? 0,
        has_website: hasSite,
        score,
        score_reasons: reasons,
        opening_hours: p.regularOpeningHours?.weekdayDescriptions ?? p.currentOpeningHours?.weekdayDescriptions ?? null,
        latitude: p.location?.latitude ?? null,
        longitude: p.location?.longitude ?? null,
        confidence: confidence(p, !!phone, hasSite, cityMatches),
        city_matches: cityMatches,
      };
    })
    .filter((l): l is PublicLead => l !== null)
    .sort((a, b) => Number(b.city_matches) - Number(a.city_matches));
}

function mapLegacyPlacesToLeads(unique: LegacyDetailsResult[], city: string, state: string): PublicLead[] {
  const cityNorm = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const stateNorm = state.trim().toUpperCase();
  return unique
    .filter((p) => !p.business_status || p.business_status === "OPERATIONAL")
    .map((p): PublicLead | null => {
      const phone = normalizePhone(p.international_phone_number, p.formatted_phone_number);
      const whatsapp = inferWhatsapp(p.international_phone_number, p.formatted_phone_number);
      const site = p.website ?? null;
      const placeCity = getLegacyComponent(p, "administrative_area_level_2") ?? getLegacyComponent(p, "locality") ?? "";
      const placeState = getLegacyComponent(p, "administrative_area_level_1");
      const placeStateShort = p.address_components?.find((a) => a.types?.includes("administrative_area_level_1"))?.short_name ?? null;
      const placeCityNorm = placeCity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cityMatches = !placeCity || placeCityNorm.includes(cityNorm) || cityNorm.includes(placeCityNorm);
      // Filtro rígido de localização (mesma regra do Places New).
      const stateMatches = !placeStateShort || placeStateShort.toUpperCase() === stateNorm;
      if ((placeCity && !cityMatches) || !stateMatches) return null;
      const proxyPlace: PlaceRaw = { id: p.place_id, userRatingCount: p.user_ratings_total, rating: p.rating };
      const { score, reasons } = scoreOpportunity(proxyPlace, !!site);

      return {
        external_id: p.place_id,
        name: p.name ?? "Não disponível",
        category: p.types?.[0] ?? null,
        address: p.formatted_address ?? null,
        city: placeCity || city,
        state: placeStateShort ?? placeState ?? state,
        phone,
        whatsapp,
        website: site,
        google_url: p.url ?? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
        instagram: null,
        facebook: null,
        rating: p.rating ?? null,
        reviews_count: p.user_ratings_total ?? 0,
        has_website: !!site,
        score,
        score_reasons: reasons,
        opening_hours: p.opening_hours?.weekday_text ?? null,
        latitude: p.geometry?.location?.lat ?? null,
        longitude: p.geometry?.location?.lng ?? null,
        confidence: confidenceFromSignals(p.user_ratings_total ?? 0, !!p.formatted_address, !!phone, !!site, cityMatches),
        city_matches: cityMatches,
      };
    })
    .filter((l): l is PublicLead => l !== null)
    .sort((a, b) => Number(b.city_matches) - Number(a.city_matches));
}

// ----------------- OpenStreetMap / Nominatim fallback -----------------
type NominatimItem = {
  place_id?: number;
  osm_id?: number;
  osm_type?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
  boundingbox?: string[];
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

// Opts compartilhadas para chamadas Nominatim — respeita circuit breaker
// e contabiliza HTTP 429 para permitir short-circuit e diagnóstico.
function nominatimFetchOpts(ctx?: SearchCtx): FetchRetryOpts {
  return {
    retries: 1,
    respectRetryAfter: true,
    onRateLimit: () => {
      if (!ctx) return;
      ctx.nominatim429++;
      if (ctx.nominatim429 >= NOMINATIM_CIRCUIT_THRESHOLD && !ctx.nominatimCircuitOpen) {
        ctx.nominatimCircuitOpen = true;
        ctx.sourcesFailed.push("openstreetmap_nominatim_rate_limited");
        console.warn("[search-places] Nominatim circuit breaker OPEN", { consecutive429: ctx.nominatim429 });
      }
    },
    abortIfRateLimited: () => !!ctx?.nominatimCircuitOpen,
  };
}

type NominatimSearchResult = {
  items: NominatimItem[];
  error?: string;
  queries: string[];
  perQueryCounts: Array<{ q: string; count: number; error?: string }>;
};

async function searchNominatim(segment: string, city: string, state: string, ctx?: SearchCtx): Promise<NominatimSearchResult> {
  if (ctx?.nominatimCircuitOpen) {
    return { items: [], error: "Nominatim circuit open (rate-limited nesta busca)", queries: [], perQueryCounts: [] };
  }

  // Expande sinônimos para cobrir variações comuns do segmento. Ex.: "Pet Shop"
  // vira ["Pet Shop", "pet shop", "loja de animais", "banho e tosa", "agropecuária"].
  // Nominatim é fraco para categorias — só encontra POIs cujo `name` contém o termo.
  // Por isso rodamos vários q= em série (~1 req/s, respeitando a política pública).
  const expanded = Array.from(new Set([segment, ...expandSegment(segment)]))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 4); // no máx. 4 queries — proteção contra rate-limit

  const perQueryCounts: Array<{ q: string; count: number; error?: string }> = [];
  const queries: string[] = [];
  const seen = new Set<string>();
  const merged: NominatimItem[] = [];
  let firstError: string | undefined;

  for (const term of expanded) {
    if (ctx?.nominatimCircuitOpen) {
      perQueryCounts.push({ q: term, count: 0, error: "circuit_open" });
      continue;
    }
    const q = `${term}, ${city}, ${state}, Brasil`;
    queries.push(q);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("extratags", "1");
      url.searchParams.set("namedetails", "1");
      url.searchParams.set("limit", "40");
      url.searchParams.set("countrycodes", "br");
      url.searchParams.set("accept-language", "pt-BR");

      const doFetch = () => fetchWithRetry(url.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "LeadHunterBrasil/1.0 (lovable.app)",
          "Accept": "application/json",
        },
      }, nominatimFetchOpts(ctx));

      const res = ctx ? await runSerialized(ctx, NOMINATIM_MIN_INTERVAL_MS, doFetch) : await doFetch();

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.warn("[search-places] Nominatim query error", { q, status: res.status, snippet: t.slice(0, 160) });
        perQueryCounts.push({ q: term, count: 0, error: `HTTP ${res.status}` });
        if (!firstError) firstError = `Nominatim HTTP ${res.status}`;
        continue;
      }
      if (ctx) ctx.nominatim429 = 0;
      const data = await res.json().catch(() => []);
      const items: NominatimItem[] = Array.isArray(data) ? data : [];
      let added = 0;
      for (const it of items) {
        const key = `${it.osm_type ?? "x"}:${it.osm_id ?? it.place_id ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(it);
        added++;
      }
      perQueryCounts.push({ q: term, count: added });
      console.info("[search-places] Nominatim query", { q, rawResults: items.length, added });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "nominatim_failed";
      console.error("[search-places] Nominatim query fatal", { q, error: msg });
      perQueryCounts.push({ q: term, count: 0, error: msg });
      if (!firstError) firstError = msg;
    }
  }

  console.info("[search-places] Nominatim summary", { queries: queries.length, totalUnique: merged.length, perQueryCounts });
  return { items: merged, error: merged.length === 0 ? firstError : undefined, queries, perQueryCounts };
}


async function getNominatimBoundary(city: string, state: string, ctx?: SearchCtx): Promise<{ areaId: number | null; lat: number | null; lon: number | null; bounds?: GeoBounds | null; error?: string }> {
  // Cache por-request — evita 2 lookups idênticos para a mesma cidade+UF.
  const cacheKey = `${city.toLowerCase()}|${state.toUpperCase()}`;
  if (ctx?.boundaryCache.has(cacheKey)) {
    return ctx.boundaryCache.get(cacheKey)!;
  }
  if (ctx?.nominatimCircuitOpen) {
    const val = { areaId: null, lat: null, lon: null, bounds: null as GeoBounds | null, error: "Nominatim circuit open" };
    ctx.boundaryCache.set(cacheKey, val);
    return val;
  }
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("city", city);
    url.searchParams.set("state", state);
    url.searchParams.set("country", "Brasil");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("accept-language", "pt-BR");
    url.searchParams.set("polygon_geojson", "0");

    const doFetch = () => fetchWithRetry(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "LeadHunterBrasil/1.0 (lovable.app)",
        "Accept": "application/json",
      },
    }, nominatimFetchOpts(ctx));
    const res = ctx ? await runSerialized(ctx, NOMINATIM_MIN_INTERVAL_MS, doFetch) : await doFetch();

    if (!res.ok) {
      const val = { areaId: null, lat: null, lon: null, bounds: null as GeoBounds | null, error: `Nominatim boundary HTTP ${res.status}` };
      if (ctx) ctx.boundaryCache.set(cacheKey, val);
      return val;
    }
    if (ctx) ctx.nominatim429 = 0;
    const data = await res.json().catch(() => []);
    const item = Array.isArray(data) ? data[0] as NominatimItem | undefined : undefined;
    const osmId = item?.osm_id;
    const osmType = item?.osm_type;
    const lat = item?.lat ? Number(item.lat) : null;
    const lon = item?.lon ? Number(item.lon) : null;

    // Nominatim boundingbox = [south, north, west, east] (strings).
    let bounds: GeoBounds | null = null;
    const bbox = item?.boundingbox;
    if (Array.isArray(bbox) && bbox.length >= 4) {
      const south = Number(bbox[0]);
      const north = Number(bbox[1]);
      const west = Number(bbox[2]);
      const east = Number(bbox[3]);
      if ([south, north, west, east].every((v) => Number.isFinite(v) && Math.abs(v) <= 180)) {
        bounds = { south, west, north, east };
      }
    }

    // Overpass area IDs: relation + 3600000000, way + 2400000000.
    const areaId = osmId && osmType === "relation" ? 3600000000 + osmId : osmId && osmType === "way" ? 2400000000 + osmId : null;
    const val = { areaId, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null, bounds };
    if (ctx) ctx.boundaryCache.set(cacheKey, val);
    return val;
  } catch (e) {
    console.error("[search-places] Nominatim boundary fatal", e);
    const val = { areaId: null, lat: null, lon: null, bounds: null as GeoBounds | null, error: e instanceof Error ? e.message : "boundary_failed" };
    if (ctx) ctx.boundaryCache.set(cacheKey, val);
    return val;
  }
}


type OverpassSearchResult = {
  elements: OverpassElement[];
  error?: string;
  query?: string;
  boundarySource?: string;
  endpointUsed?: string;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

async function searchOverpass(segment: string, city: string, state: string, ctx?: SearchCtx): Promise<OverpassSearchResult> {
  try {
    const filters = getOsmFilters(segment);
    if (filters.length === 0) return { elements: [], error: "Segmento sem mapeamento OpenStreetMap compatível" };

    // Boundary lookup é MELHOR-ESFORÇO. Se Nominatim estiver rate-limited,
    // seguimos com fallback: resolver a área direto dentro do Overpass via
    // `area[name="..."][boundary=administrative]`. Isso permite que Overpass
    // funcione mesmo quando Nominatim está 429.
    const boundary = ctx?.nominatimCircuitOpen
      ? { areaId: null, lat: null, lon: null, error: "Nominatim circuit open" }
      : await getNominatimBoundary(city, state, ctx);
    if (boundary.error) console.warn("[search-places] Boundary lookup warning", boundary.error);

    const hasBoundaryFromNominatim = !!(boundary.areaId || (boundary.lat && boundary.lon));
    const boundarySource = boundary.areaId ? "nominatim_area" : boundary.lat ? "nominatim_around" : "overpass_area_name";

    // Usa `nwr` (node+way+relation shorthand) — reduz drasticamente o custo
    // computacional em cidades grandes como São Paulo (evita 504 Gateway Timeout).
    const selectors = filters.map((filter) => {
      const tagSelector = filter.value
        ? `["${escapeOverpassString(filter.key)}"="${escapeOverpassString(filter.value)}"]`
        : `["${escapeOverpassString(filter.key)}"~"${escapeOverpassString(filter.regex ?? ".+")}",i]`;

      if (boundary.lat && boundary.lon && !boundary.areaId) {
        return `nwr${tagSelector}(around:25000,${boundary.lat},${boundary.lon});`;
      }
      return `nwr${tagSelector}(area.searchArea);`;
    });

    if (selectors.length === 0) return { elements: [], error: "Não foi possível montar a query Overpass" };

    // Cabeçalho: se temos areaId oficial do Nominatim, usa. Caso contrário,
    // resolve a área direto no Overpass consultando pelo nome da cidade
    // (admin_level=8 para municípios brasileiros).
    let areaHeader = "";
    if (boundary.areaId) {
      areaHeader = `area(${boundary.areaId})->.searchArea;`;
    } else if (!boundary.lat || !boundary.lon) {
      const cityEscaped = escapeOverpassString(city);
      areaHeader = `area["name"="${cityEscaped}"]["boundary"="administrative"]["admin_level"="8"]->.searchArea;`;
    }

    // Timeout de 90s: São Paulo/RJ têm grafos gigantes e travam com 25s.
    // `out center tags 1000` evita truncar cidades grandes (ex.: SP tem 800+
    // clínicas mapeadas; antes retornava no máximo 100).
    const query = `
      [out:json][timeout:90];
      ${areaHeader}
      (
        ${selectors.join("\n")}
      );
      out center tags 1000;
    `.trim();

    console.info("[search-places] Overpass request", {
      boundarySource,
      nominatimAvailable: hasBoundaryFromNominatim,
      selectorCount: selectors.length,
      timeoutSec: 60,
    });

    // Tenta múltiplos endpoints do Overpass. Se o primário retornar 504/5xx
    // (Gateway Timeout — comum em cidades grandes), migra para mirror.
    let lastStatus = 0;
    let lastText = "";
    let endpointUsed: string | undefined;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetchWithRetry(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": "TiagoProspector/1.0 (contato: tiagoprospector)",
          },
          body: new URLSearchParams({ data: query }).toString(),
        }, { retries: 1, respectRetryAfter: true });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          lastStatus = res.status;
          lastText = t;
          console.warn("[search-places] Overpass endpoint failed, trying next", { endpoint, status: res.status });
          continue;
        }
        endpointUsed = endpoint;
        const data = await res.json().catch(() => ({}));
        const elements = Array.isArray(data.elements) ? data.elements : [];
        console.info("[search-places] Overpass success", { endpoint, elements: elements.length });
        return { elements, query, boundarySource, endpointUsed };
      } catch (e) {
        console.warn("[search-places] Overpass endpoint threw", { endpoint, error: e instanceof Error ? e.message : String(e) });
      }
    }

    console.error("[search-places] Overpass all endpoints failed", lastStatus, lastText.slice(0, 200));
    return { elements: [], error: `Overpass indisponível (último status: ${lastStatus || "network"})`, query, boundarySource, endpointUsed };
  } catch (e) {
    console.error("[search-places] Overpass fatal", e);
    return { elements: [], error: e instanceof Error ? e.message : "overpass_failed" };
  }
}


// ─────────────────────────────────────────────────────────────
// RECUPERAÇÃO — Overpass por regex de `name`
// Usada quando a busca principal (Google + OSM tag-based) retorna 0.
// Muitos POIs em cidades pequenas não têm `shop=*` configurado, apenas o
// campo `name`. Buscamos por regex do nome do segmento + sinônimos, sem
// exigir tags de categoria — depois validamos no filtro Orvix do cliente.
// ─────────────────────────────────────────────────────────────
async function searchOverpassByName(
  segment: string,
  city: string,
  state: string,
  ctx?: SearchCtx,
): Promise<OverpassSearchResult> {
  try {
    // Termos de busca: segmento + sinônimos (limitado a 8) — sem stopwords
    // curtas para evitar falsos positivos ("a", "e", "de").
    const terms = Array.from(new Set([segment, ...expandSegment(segment)]))
      .map((t) => normalizeText(t))
      .flatMap((t) => t.split(/\s+/))
      .filter((w) => w.length >= 4)
      .slice(0, 12);
    if (terms.length === 0) return { elements: [], error: "recovery: sem termos de busca válidos" };

    const regex = Array.from(new Set(terms)).join("|");

    const boundary = ctx?.nominatimCircuitOpen
      ? { areaId: null, lat: null, lon: null, error: "Nominatim circuit open" }
      : await getNominatimBoundary(city, state, ctx);
    const boundarySource = boundary.areaId ? "nominatim_area" : boundary.lat ? "nominatim_around" : "overpass_area_name";

    const scope = (sel: string) => {
      if (boundary.lat && boundary.lon && !boundary.areaId) {
        return `${sel}(around:25000,${boundary.lat},${boundary.lon});`;
      }
      return `${sel}(area.searchArea);`;
    };

    // Aceita match em `name`, `brand` e `official_name`. Regex case-insensitive.
    const selectors = [
      scope(`nwr["name"~"${regex}",i]`),
      scope(`nwr["brand"~"${regex}",i]`),
      scope(`nwr["official_name"~"${regex}",i]`),
    ];

    let areaHeader = "";
    if (boundary.areaId) {
      areaHeader = `area(${boundary.areaId})->.searchArea;`;
    } else if (!boundary.lat || !boundary.lon) {
      const cityEscaped = escapeOverpassString(city);
      areaHeader = `area["name"="${cityEscaped}"]["boundary"="administrative"]["admin_level"="8"]->.searchArea;`;
    }

    const query = `
      [out:json][timeout:90];
      ${areaHeader}
      (
        ${selectors.join("\n")}
      );
      out center tags 500;
    `.trim();

    console.info("[search-places] Overpass RECOVERY request", {
      boundarySource,
      terms,
      selectorCount: selectors.length,
    });

    let lastStatus = 0;
    let endpointUsed: string | undefined;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetchWithRetry(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": "TiagoProspector/1.0 (contato: tiagoprospector)",
          },
          body: new URLSearchParams({ data: query }).toString(),
        }, { retries: 1, respectRetryAfter: true });

        if (!res.ok) { lastStatus = res.status; continue; }
        endpointUsed = endpoint;
        const data = await res.json().catch(() => ({}));
        const elements = Array.isArray(data.elements) ? data.elements : [];
        console.info("[search-places] Overpass RECOVERY success", { endpoint, elements: elements.length });
        return { elements, query, boundarySource, endpointUsed };
      } catch (e) {
        console.warn("[search-places] Overpass RECOVERY threw", { endpoint, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { elements: [], error: `Overpass recovery indisponível (último status: ${lastStatus || "network"})`, query, boundarySource, endpointUsed };
  } catch (e) {
    return { elements: [], error: e instanceof Error ? e.message : "overpass_recovery_failed" };
  }
}






const osmTagsById = new Map<string, Record<string, string>>();

function mapNominatimToLeads(items: NominatimItem[], city: string, state: string): PublicLead[] {
  const cityNorm = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const seen = new Set<string>();
  const leads: PublicLead[] = [];

  for (const it of items) {
    const extId = `osm:${it.osm_type ?? "x"}:${it.osm_id ?? it.place_id ?? ""}`;
    if (!it.osm_id && !it.place_id) continue;
    if (seen.has(extId)) continue;
    seen.add(extId);

    const name = it.namedetails?.name ?? it.display_name?.split(",")[0] ?? "";
    if (!name || name.trim().length < 2) continue;

    const addr = it.address ?? {};
    const placeCity = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "";
    const placeCityNorm = placeCity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cityMatches = !placeCity || placeCityNorm.includes(cityNorm) || cityNorm.includes(placeCityNorm);
    if (!cityMatches) continue;

    const phoneRaw = it.extratags?.["contact:phone"] ?? it.extratags?.phone ?? null;
    const site = it.extratags?.["contact:website"] ?? it.extratags?.website ?? null;
    const hasSite = !!site;
    const lat = it.lat ? Number(it.lat) : null;
    const lon = it.lon ? Number(it.lon) : null;

    const reviews = 0;
    const reasons: string[] = ["Fonte: OpenStreetMap"];
    let score = 2;
    if (!hasSite) { score += 2; reasons.push("Sem site identificado — oportunidade"); }

    const addressFull = it.display_name ?? null;
    const stateShort = addr["ISO3166-2-lvl4"]?.split("-")[1] ?? state;

    leads.push({
      external_id: extId,
      name,
      category: it.type ?? it.class ?? null,
      address: addressFull,
      city: placeCity || city,
      state: stateShort,
      phone: phoneRaw,
      whatsapp: inferWhatsapp(undefined, phoneRaw ?? undefined),
      website: site,
      google_url: lat && lon ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : null,
      instagram: null,
      facebook: null,
      rating: null,
      reviews_count: reviews,
      has_website: hasSite,
      score: Math.max(1, Math.min(5, score)),
      score_reasons: reasons,
      opening_hours: it.extratags?.opening_hours ? [it.extratags.opening_hours] : null,
      latitude: lat,
      longitude: lon,
      confidence: confidenceFromSignals(reviews, !!addressFull, !!phoneRaw, hasSite, cityMatches),
      city_matches: cityMatches,
    });
    osmTagsById.set(extId, {
      class: it.class ?? "",
      type: it.type ?? "",
      category: (it.category as string | undefined) ?? "",
      name: name,
    });
  }
  return leads;
}

function mapOverpassToLeads(elements: OverpassElement[], city: string, state: string): PublicLead[] {
  const seen = new Set<string>();
  const leads: PublicLead[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name ?? tags["brand"] ?? tags["operator"] ?? "";
    if (!name || name.trim().length < 2) continue;

    // Filtro geográfico rigoroso: se o elemento declara addr:city de outra
    // cidade (fallback "around" sem área administrativa), não pode entrar.
    const addrCity = tags["addr:city"];
    if (addrCity) {
      const normAddr = normalizeText(addrCity);
      const normTarget = normalizeText(city);
      const compatible = normAddr.includes(normTarget) || normTarget.includes(normAddr);
      if (!compatible) continue;
    }

    const extId = `osm:${el.type}:${el.id}`;
    if (seen.has(extId)) continue;
    seen.add(extId);

    const lat = el.lat ?? el.center?.lat ?? null;
    const lon = el.lon ?? el.center?.lon ?? null;
    const phone = tags["contact:phone"] ?? tags.phone ?? tags["contact:mobile"] ?? null;
    const site = tags["contact:website"] ?? tags.website ?? null;
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
    const district = tags["addr:suburb"] ?? tags["addr:neighbourhood"] ?? "";
    const address = [street, district, tags["addr:city"] ?? city, tags["addr:state"] ?? state].filter(Boolean).join(" - ") || null;
    const category = tags.healthcare ?? tags.amenity ?? tags.office ?? tags.shop ?? tags.leisure ?? tags.tourism ?? tags.craft ?? null;
    const reasons = ["Fonte: OpenStreetMap/Overpass"];
    let score = 2;
    if (!site) { score += 2; reasons.push("Sem site identificado — oportunidade"); }

    leads.push({
      external_id: extId,
      name,
      category,
      address,
      city: tags["addr:city"] ?? city,
      state: tags["addr:state"] ?? state,
      phone,
      whatsapp: inferWhatsapp(undefined, phone ?? undefined),
      website: site,
      google_url: lat && lon ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : null,
      instagram: tags["contact:instagram"] ?? null,
      facebook: tags["contact:facebook"] ?? null,
      rating: null,
      reviews_count: 0,
      has_website: !!site,
      score: Math.max(1, Math.min(5, score)),
      score_reasons: reasons,
      opening_hours: tags.opening_hours ? [tags.opening_hours] : null,
      latitude: lat,
      longitude: lon,
      confidence: confidenceFromSignals(0, !!address, !!phone, !!site, true),
      city_matches: true,
    });
    // Guarda todas as tags OSM cruas — usadas para auditoria de rejeição no cliente.
    osmTagsById.set(`osm:${el.type}:${el.id}`, { ...tags });
  }

  return leads;
}

// ----------------- Instagram enrichment -----------------
// Strategy: fetch the lead's own website HTML and extract instagram.com links.
// Validate the handle against the company name / domain before accepting.
// This avoids returning random "look-alike" profiles.

const IG_BLOCKED_HANDLES = new Set([
  "explore", "p", "reel", "reels", "stories", "tv", "share", "accounts", "about",
  "directory", "developer", "legal", "privacy", "terms", "help", "instagram",
  "web", "challenge", "blog", "press", "api", "oauth", "login", "signup", "sessions",
  "direct", "graphql", "static", "creator", "business", "ads",
]);

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

function extractInstagramCandidates(html: string): string[] {
  const found = new Set<string>();
  const re = /(?:https?:)?\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const handle = (m[1] ?? "").replace(/\/$/, "").toLowerCase();
    if (!handle || handle.length < 2 || handle.length > 30) continue;
    if (IG_BLOCKED_HANDLES.has(handle)) continue;
    if (handle.startsWith(".") || handle.endsWith(".")) continue;
    found.add(handle);
  }
  return [...found];
}

function siteDomainHost(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return ""; }
}

function pickBestInstagramHandle(candidates: string[], lead: PublicLead): string | null {
  if (candidates.length === 0) return null;
  const nameNorm = normalizeName(lead.name);
  const host = siteDomainHost(lead.website);
  const hostMain = host.split(".")[0] ?? "";

  let best: { handle: string; score: number } | null = null;
  for (const handle of candidates) {
    const hNorm = normalizeName(handle);
    let score = 0;
    if (hostMain && (hNorm === normalizeName(hostMain) || hNorm.includes(normalizeName(hostMain)) || normalizeName(hostMain).includes(hNorm))) score += 60;
    if (nameNorm && hNorm === nameNorm) score += 50;
    else if (nameNorm && hNorm.length >= 3 && (nameNorm.includes(hNorm) || hNorm.includes(nameNorm.slice(0, Math.max(4, Math.min(nameNorm.length, 10)))))) score += 30;
    // Penalty if handle is suspiciously generic and doesn't relate at all
    if (score === 0) score = 5; // weak — found on the company's own site, still some signal
    if (!best || score > best.score) best = { handle, score };
  }
  // Require a minimum match score to avoid noise. 25+ means name/domain alignment.
  return best && best.score >= 25 ? best.handle : null;
}

async function fetchInstagramFromWebsite(lead: PublicLead, timeoutMs = 3500): Promise<string | null> {
  if (!lead.website) return null;
  const url = /^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadHunterBrasil/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return null;
    const html = (await res.text()).slice(0, 400_000);
    const candidates = extractInstagramCandidates(html);
    const handle = pickBestInstagramHandle(candidates, lead);
    return handle ? `https://www.instagram.com/${handle}/` : null;
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichLeadsWithInstagram(leads: PublicLead[]): Promise<void> {
  // Preserve any instagram URL already present (e.g. OSM tags), enrich only missing ones.
  const targets = leads.filter((l) => !l.instagram && !!l.website);
  if (targets.length === 0) return;

  const concurrency = 6;
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (idx < targets.length) {
      const my = idx++;
      const lead = targets[my];
      try {
        const ig = await fetchInstagramFromWebsite(lead);
        if (ig) lead.instagram = ig;
      } catch { /* ignore */ }
    }
  });
  await Promise.all(workers);
  console.info("[search-places] instagram enrichment", {
    attempted: targets.length,
    found: targets.filter((l) => !!l.instagram).length,
  });
}

// ============================================================
// Website discovery + validation
// ============================================================
// Goal: when Google Places returns no websiteUri, run a second pass that:
//   1. Searches Google Places (New) again with name + city + state
//   2. Falls back to a DuckDuckGo HTML query "<name> <city> site oficial"
//   3. Validates candidate domains (blacklist directories/socials, fetch HTML,
//      verify name/city/phone presence) and only accepts when confidence is
//      high enough. Otherwise leaves website empty (never invents data).

const NON_OFFICIAL_HOSTS = [
  "facebook.com", "fb.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "tiktok.com", "youtube.com", "youtu.be", "wa.me", "api.whatsapp.com", "whatsapp.com",
  "goo.gl", "maps.google.com", "google.com", "google.com.br", "maps.app.goo.gl",
  "yelp.com", "tripadvisor.com", "tripadvisor.com.br", "ifood.com.br", "rappi.com.br",
  "olx.com.br", "mercadolivre.com.br", "vivareal.com.br", "zapimoveis.com.br",
  "doctoralia.com.br", "consultaremedios.com.br", "guiamais.com.br", "telelistas.net",
  "apontador.com.br", "econodata.com.br", "cnpj.biz", "econoinfo.com.br",
  "solucoesindustriais.com.br", "soluctionia.com.br", "linktr.ee", "lnk.bio",
  "beacons.ai", "bio.link", "campsite.bio", "carrd.co",
];

function hostOf(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return ""; }
}

function isOfficialCandidateHost(host: string): boolean {
  if (!host || host.length < 4) return false;
  return !NON_OFFICIAL_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

type WebsiteValidation = {
  url: string;
  host: string;
  confidence: number;
  signals: string[];
};

async function validateCandidateWebsite(
  candidate: string,
  lead: PublicLead,
  city: string,
  state: string,
  timeoutMs = 4000,
): Promise<WebsiteValidation | null> {
  const host = hostOf(candidate);
  if (!isOfficialCandidateHost(host)) return null;

  const nameNorm = normalizeName(lead.name);
  const hostMain = normalizeName(host.split(".")[0] ?? "");
  const signals: string[] = [];
  let score = 0;

  // Host vs name affinity
  if (hostMain && nameNorm) {
    if (hostMain === nameNorm) { score += 50; signals.push("host=name"); }
    else if (hostMain.length >= 4 && (nameNorm.includes(hostMain) || hostMain.includes(nameNorm.slice(0, Math.max(4, Math.min(nameNorm.length, 10)))))) {
      score += 30; signals.push("host~name");
    }
  }

  // Fetch HTML for content-level signals
  let html = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const url = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadHunterBrasil/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
      },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (/text\/html|application\/xhtml/i.test(ct)) {
        html = (await res.text()).slice(0, 400_000);
      }
    }
  } catch { /* ignore */ }

  if (html) {
    const htmlNorm = html.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nameTokens = nameNorm.match(/[a-z0-9]{4,}/g) ?? [];
    const nameHits = nameTokens.filter((t) => htmlNorm.includes(t)).length;
    if (nameHits >= 2) { score += 25; signals.push(`name-tokens:${nameHits}`); }
    else if (nameHits === 1) { score += 10; signals.push("name-token:1"); }

    const cityNorm = normalizeName(city);
    if (cityNorm && htmlNorm.includes(cityNorm)) { score += 20; signals.push("city-in-html"); }

    const stateNorm = state.toLowerCase();
    if (stateNorm && (htmlNorm.includes(` ${stateNorm} `) || htmlNorm.includes(`-${stateNorm}`) || htmlNorm.includes(`/${stateNorm}`))) {
      score += 5; signals.push("state-in-html");
    }

    const leadDigits = digits(lead.phone) || digits(lead.whatsapp);
    if (leadDigits.length >= 8) {
      const tail = leadDigits.slice(-8);
      const htmlDigits = htmlNorm.replace(/\D/g, "");
      if (htmlDigits.includes(tail)) { score += 30; signals.push("phone-match"); }
    }
  } else {
    signals.push("html-unreachable");
  }

  return { url: /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`, host, confidence: score, signals };
}

async function findWebsiteViaPlaces(lead: PublicLead, city: string, state: string): Promise<string[]> {
  if (!GOOGLE_KEY_LOADED) return [];
  const queries = [
    `${lead.name} ${city} ${state}`,
    `${lead.name} ${city}`,
    `${lead.name} site oficial`,
  ];
  const found = new Set<string>();
  for (const q of queries) {
    try {
      const res = await fetchWithRetry("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_KEY ?? "",
          "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.formattedAddress",
        },
        body: JSON.stringify({ textQuery: q, languageCode: "pt-BR", regionCode: "BR", pageSize: 5 }),
      }, 1);
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      for (const p of (data.places ?? []) as PlaceRaw[]) {
        if (p.websiteUri) found.add(p.websiteUri);
      }
      if (found.size >= 4) break;
    } catch { /* ignore */ }
  }
  return [...found];
}

async function findWebsiteViaDuckDuckGo(lead: PublicLead, city: string, state: string): Promise<string[]> {
  try {
    const q = encodeURIComponent(`${lead.name} ${city} ${state} site oficial`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadHunterBrasil/1.0)",
        "Accept": "text/html",
      },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 200_000);
    const out = new Set<string>();
    // DDG html result links use uddg= redirect param
    const re = /uddg=([^"&]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(m[1]);
        const host = hostOf(decoded);
        if (isOfficialCandidateHost(host)) out.add(decoded);
      } catch { /* ignore */ }
      if (out.size >= 6) break;
    }
    return [...out];
  } catch { return []; }
}

async function discoverWebsiteForLead(lead: PublicLead, city: string, state: string): Promise<void> {
  if (lead.website) return;
  const t0 = Date.now();

  const placeCandidates = await findWebsiteViaPlaces(lead, city, state);
  const ddgCandidates = placeCandidates.length === 0 ? await findWebsiteViaDuckDuckGo(lead, city, state) : [];
  const candidates = [...placeCandidates, ...ddgCandidates].filter((u) => isOfficialCandidateHost(hostOf(u)));

  if (candidates.length === 0) {
    console.info("[search-places][website-discovery] no candidate found", {
      lead: lead.name, city, state, reason: "no_candidates",
      placeCandidates: placeCandidates.length, ddgCandidates: ddgCandidates.length,
      durationMs: Date.now() - t0,
    });
    return;
  }

  const validations = await Promise.all(candidates.slice(0, 6).map((c) => validateCandidateWebsite(c, lead, city, state)));
  const valid = validations.filter((v): v is WebsiteValidation => !!v).sort((a, b) => b.confidence - a.confidence);

  const best = valid[0];
  // Accept only when single confident winner (>=40) OR clearly above runner-up
  const accept = !!best && best.confidence >= 40 && (!valid[1] || best.confidence - valid[1].confidence >= 15);

  console.info("[search-places][website-discovery] result", {
    lead: lead.name, city, state,
    candidates: candidates.length,
    validated: valid.length,
    best: best ? { host: best.host, confidence: best.confidence, signals: best.signals } : null,
    runnerUp: valid[1] ? { host: valid[1].host, confidence: valid[1].confidence } : null,
    accepted: accept,
    reason: accept ? "accepted" : (best ? "low_confidence_or_tie" : "no_valid_candidate"),
    durationMs: Date.now() - t0,
  });

  if (accept && best) {
    lead.website = best.url;
    lead.has_website = true;
    lead.score_reasons = [...(lead.score_reasons ?? []), `Site descoberto via validação multi-critério (${best.confidence}pts)`];
  }
}

async function runWebsiteDiscovery(leads: PublicLead[], city: string, state: string): Promise<void> {
  const targets = leads.filter((l) => !l.website);
  if (targets.length === 0) return;
  // Processa os leads sem site com mais sinais comerciais primeiro (reviews),
  // limitado para manter o runtime do enrich aceitável.
  const queue = [...targets]
    .sort((a, b) => (b.reviews_count ?? 0) - (a.reviews_count ?? 0))
    .slice(0, 60);
  const concurrency = 4;
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (idx < queue.length) {
      const my = idx++;
      try { await discoverWebsiteForLead(queue[my], city, state); } catch { /* ignore */ }
    }
  });
  await Promise.all(workers);
  console.info("[search-places][website-discovery] summary", {
    totalLeads: leads.length,
    withoutSiteBefore: targets.length,
    attempted: queue.length,
    recovered: queue.filter((l) => !!l.website).length,
    stillNoSite: queue.filter((l) => !l.website).length,
  });
}

// ============================================================
// Lead Score Inteligente (priorização interna)
// ============================================================
const PRIORITY_SEGMENTS: Array<{ match: string[]; weight: number }> = [
  { weight: 30, match: ["odontolog", "dentista", "clinica medica", "clínica médica", "estetica", "estética", "advog", "advocacia", "energia solar", "solar", "imobiliaria", "imobiliária", "academia", "esquadria", "marmoraria", "moveis planejados", "móveis planejados", "construtora", "arquiteto", "engenheiro", "engenharia", "seguradora", "seguro", "climatizacao", "climatização", "automacao residencial", "automação residencial", "escola particular", "curso profissionalizante", "curso tecnico", "curso técnico"] },
  { weight: 15, match: ["clinica", "clínica", "consultorio", "consultório", "medico", "médico", "psicolog", "veterinari", "fisioterap", "nutricionista", "fonoaudiolog"] },
  { weight: 10, match: ["pet shop", "petshop", "salao", "salão", "barbearia", "cabeleireiro", "spa", "tatuagem", "estudio", "estúdio"] },
];

function segmentPriorityWeight(segment: string): number {
  const n = normalizeText(segment);
  for (const tier of PRIORITY_SEGMENTS) {
    if (tier.match.some((m) => n.includes(normalizeText(m)))) return tier.weight;
  }
  return 0;
}

// Concurrency-limited parallel map. Prevents bursts of parallel HTTP requests
// against the same upstream project (Google Places quotas are per-project).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  opts?: { interItemDelayMs?: number },
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const delay = Math.max(0, opts?.interItemDelayMs ?? 0);
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      // Pequeno intervalo entre itens do MESMO worker — reduz pressão de burst
      // contra a mesma origem sem serializar totalmente a fila.
      if (delay > 0 && cursor < items.length) {
        await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 200)));
      }
    }
  });
  await Promise.all(workers);
  return results;
}


function computeLeadPriority(lead: PublicLead, segment: string, module: "orvix" | "landing_pages" = "landing_pages"): number {
  let p = 0;
  // Segment tier
  p += segmentPriorityWeight(segment);
  // Activity / reputation signals
  if (lead.reviews_count >= 100) p += 18;
  else if (lead.reviews_count >= 50) p += 12;
  else if (lead.reviews_count >= 20) p += 8;
  else if (lead.reviews_count >= 5) p += 3;
  if ((lead.rating ?? 0) >= 4.5) p += 10;
  else if ((lead.rating ?? 0) >= 4.0) p += 6;
  // Reachability
  if (lead.whatsapp) p += 12;
  if (lead.phone) p += 4;
  if (lead.instagram) p += 6;
  // Website state — só é sinal de oportunidade em Landing Pages.
  // No módulo Orvix (venda de ERP/PDV), presença/ausência de site NÃO deve
  // enviesar a priorização — o que importa é segmento, ERP fit, avaliações,
  // volume e presença comercial.
  if (module !== "orvix") {
    if (!lead.has_website) p += 25;
    else {
      const host = hostOf(lead.website ?? "");
      const weak = ["wixsite.com", "weebly.com", "webnode.com", "blogspot.com", "wordpress.com", "godaddysites.com", "site.google.com", "linktr.ee"];
      if (weak.some((w) => host.endsWith(w))) p += 15;
    }
  }
  // City match bonus
  if (lead.city_matches) p += 5;
  // Confidence
  if (lead.confidence === "high") p += 4;
  else if (lead.confidence === "medium") p += 2;
  return p;
}

function sortLeadsByPriority(leads: PublicLead[], segment: string, module: "orvix" | "landing_pages" = "landing_pages"): PublicLead[] {
  return leads
    .map((l) => ({ l, p: computeLeadPriority(l, segment, module) }))
    .sort((a, b) => b.p - a.p || Number(b.l.city_matches) - Number(a.l.city_matches))
    .map((x) => x.l);
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    logGoogleKeyStatus();
    const body = await req.json().catch(() => ({}));

    // ────────────────────────────────────────────────────────────
    // MODE: "enrich" — Website & Instagram Discovery em background.
    // Chamado pelo frontend após a busca inicial ter retornado. Aqui
    // apenas atualizamos os campos website/has_website/instagram das
    // linhas existentes na tabela `leads`. Nenhum novo lead é criado.
    // ────────────────────────────────────────────────────────────
    if (body?.mode === "enrich") {
      const searchId = String(body?.search_id ?? "").trim();
      if (!searchId) {
        return new Response(JSON.stringify({ error: "search_id obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supaUrl || !supaKey) {
        return new Response(JSON.stringify({ error: "Backend indisponível para enrichment" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(supaUrl, supaKey);
      const { data: rows, error: selErr } = await admin
        .from("leads")
        .select("id,name,city,state,website,has_website,instagram")
        .eq("search_id", searchId);
      if (selErr) {
        console.error("[search-places][enrich] select failed", selErr);
        return new Response(JSON.stringify({ error: selErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const dbRows = Array.isArray(rows) ? rows : [];
      // Adapta rows -> PublicLead shape (apenas campos usados pelo discovery).
      const pseudoLeads: PublicLead[] = dbRows.map((r: any) => ({
        external_id: r.id,
        name: r.name ?? "",
        category: null,
        address: null,
        city: r.city ?? "",
        state: r.state ?? "",
        phone: null,
        whatsapp: null,
        website: r.website ?? null,
        google_url: null,
        instagram: r.instagram ?? null,
        facebook: null,
        rating: null,
        reviews_count: 0,
        has_website: !!r.has_website,
        score: 1,
        score_reasons: [],
        opening_hours: null,
        latitude: null,
        longitude: null,
      } as unknown as PublicLead));

      // Descobre site por lead (usa a primeira cidade/estado encontrado).
      const firstCity = pseudoLeads.find((l) => l.city)?.city ?? "";
      const firstState = pseudoLeads.find((l) => l.state)?.state ?? "";
      await runWebsiteDiscovery(pseudoLeads, firstCity, firstState);
      await enrichLeadsWithInstagram(pseudoLeads);

      // Persiste apenas os que mudaram website/has_website/instagram.
      let updated = 0;
      const updates = pseudoLeads
        .map((l, i) => {
          const src = dbRows[i];
          const changed =
            (l.website ?? null) !== (src.website ?? null) ||
            (!!l.has_website) !== (!!src.has_website) ||
            (l.instagram ?? null) !== (src.instagram ?? null);
          if (!changed) return null;
          return {
            id: src.id,
            website: l.website ?? null,
            has_website: !!l.website,
            instagram: l.instagram ?? null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      for (const u of updates) {
        const { error: upErr } = await admin
          .from("leads")
          .update({ website: u.website, has_website: u.has_website, instagram: u.instagram })
          .eq("id", u.id);
        if (!upErr) updated++;
        else console.warn("[search-places][enrich] update failed", u.id, upErr.message);
      }

      console.info("[search-places][enrich] summary", {
        searchId, totalRows: dbRows.length, updated,
      });

      return new Response(JSON.stringify({
        mode: "enrich",
        search_id: searchId,
        total: dbRows.length,
        updated,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    const segment = String(body?.segment ?? "").trim();
    const city = String(body?.city ?? "").trim();
    const state = String(body?.state ?? "").trim().toUpperCase();
    const maxPages = Math.min(Math.max(Number(body?.maxPages ?? 2), 1), 3);
    const module: "orvix" | "landing_pages" = body?.module === "orvix" ? "orvix" : "landing_pages";

    console.info("[search-places] request params", {
      state,
      city,
      segment,
      maxPages,
      module,
      hasEmptyParams: !segment || !city || !state,
    });

    if (!segment || !city || !state) {
      return new Response(JSON.stringify({ error: "segment, city e state são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^[A-Z]{2}$/.test(state) || city.length < 2 || segment.length < 2 || city.length > 120 || segment.length > 120) {
      return new Response(JSON.stringify({
        error: "Parâmetros inválidos para a busca.",
        action: "Selecione um estado válido, uma cidade válida e um segmento com pelo menos 2 caracteres.",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const synonyms = expandSegment(segment);
    const textQueries = synonyms.map((s) => `${s} em ${city}, ${state}, Brasil`);
    const primaryQuery = textQueries[0];
    const includedTypes = getGoogleIncludedTypes(segment);
    const includedTypeForQuery: (string | null)[] = includedTypes.length > 0 ? includedTypes : [null];
    const sourcesTried: string[] = [];
    const warnings: Array<{ source: string; code?: string; message: string; action?: string }> = [];
    let leads: PublicLead[] = [];
    let source: "google_places_new" | "google_places_legacy" | "openstreetmap_nominatim" | "openstreetmap_overpass" | "openstreetmap_overpass_recovery" | "none" = "none";

    // Diagnostics: onde os leads são perdidos ao longo do funil.
    const diagnostics: Record<string, unknown> = {
      synonyms: synonyms.length,
      includedType: includedTypes.length > 0 ? includedTypes.join(",") : null,
      includedTypes,
      googlePlacesNew: 0,
      googlePlacesLegacy: 0,
      nominatim: 0,
      overpass: 0,
      afterDedupe: 0,
      final: 0,
      combined: null,
    };

    console.info("[search-places] expanded queries", { synonyms, includedTypes, queryCount: textQueries.length });

    // ────────────────────────────────────────────────────────────
    // Auditoria em memória — atribuição por lead (source, sinônimo,
    // includedType) e regras aplicadas. Sem persistência em banco.
    // ────────────────────────────────────────────────────────────
    type LeadAuditEntry = {
      source: "google_places_new" | "google_places_legacy" | "openstreetmap_nominatim" | "openstreetmap_overpass" | "openstreetmap_overpass_recovery";
      synonym?: string;
      includedType?: string | null;
      rule?: string;
      osmTags?: Record<string, string> | null;
      category?: string | null;
      googleTypes?: string[] | null;
    };
    const perLeadAudit = new Map<string, LeadAuditEntry>();
    const dedupeEvents: Array<{ id: string; source: string; keys: string[] }> = [];

    // Contexto de resiliência partilhado por-request (circuit breaker + cache).
    const ctx = createSearchCtx();

    // -------- 1) Google Places API (New) - multi-query + radius --------
    if (GOOGLE_KEY_LOADED && GOOGLE_KEY!.startsWith("AIza")) {
      sourcesTried.push(SOURCE_LABELS.googleNew);

      // Resolve city center/bounds for geo-restricted (locationRestriction) variants in parallel with first query
      const boundaryPromise = getNominatimBoundary(city, state, ctx)
        .catch(() => ({ areaId: null, lat: null, lon: null, bounds: null as GeoBounds | null, error: "boundary failed" }));

      // Concurrency-limited runner (max 2 in-flight) — prevents HTTP 429
      // bursts against the same Google project. Retry with backoff is still
      // handled inside fetchWithRetry per request.
      const GOOGLE_CONCURRENCY = 2;
      const GOOGLE_INTER_ITEM_DELAY_MS = 400;

      // Build query × includedType matrix so each relevant Google type gets its own pass.
      const textJobs: Array<{ query: string; includedType: string | null }> = [];
      for (const q of textQueries) {
        for (const t of includedTypeForQuery) textJobs.push({ query: q, includedType: t });
      }

      const textResults = await mapWithConcurrency(
        textJobs,
        GOOGLE_CONCURRENCY,
        (job) => {
          if (ctx.googleCircuitOpen) {
            return Promise.resolve({ places: [] as PlaceRaw[], error: { status: 429, text: JSON.stringify({ error: { message: "GOOGLE_CIRCUIT_OPEN" } }), endpoint: "searchText" } as SearchError });
          }
          return searchPlacesNew(job.query, maxPages, { includedType: job.includedType, ctx })
            .catch((e) => ({ places: [] as PlaceRaw[], error: { status: 0, text: String(e), endpoint: "searchText" } as SearchError }));
        },
        { interItemDelayMs: GOOGLE_INTER_ITEM_DELAY_MS },
      );

      // Then fire geo-restricted variants (top 2 synonyms only) using the resolved boundary
      const boundary = await boundaryPromise;
      const geoOptions = boundary.bounds
        ? { locationRestriction: boundary.bounds }
        : boundary.lat && boundary.lon
          ? { locationBias: { lat: boundary.lat, lon: boundary.lon, radius: 25000 } }
          : null;
      let radiusResults: Array<{ places: PlaceRaw[]; error?: SearchError }> = [];
      if (geoOptions && !ctx.googleCircuitOpen) {
        const radiusSynonyms = synonyms.slice(0, 2);
        const radiusJobs: Array<{ synonym: string; includedType: string | null }> = [];
        for (const s of radiusSynonyms) {
          for (const t of includedTypeForQuery) radiusJobs.push({ synonym: s, includedType: t });
        }
        radiusResults = await mapWithConcurrency(
          radiusJobs,
          GOOGLE_CONCURRENCY,
          (job) => {
            if (ctx.googleCircuitOpen) {
              return Promise.resolve({ places: [] as PlaceRaw[], error: { status: 429, text: JSON.stringify({ error: { message: "GOOGLE_CIRCUIT_OPEN" } }), endpoint: "searchText+geo" } as SearchError });
            }
            const base = (geoOptions ?? {}) as { locationBias?: { lat: number; lon: number; radius: number }; locationRestriction?: GeoBounds };
            return searchPlacesNew(job.synonym, 2, { ...base, includedType: job.includedType, ctx })
              .catch((e) => ({ places: [] as PlaceRaw[], error: { status: 0, text: String(e), endpoint: "searchText+geo" } as SearchError }));
          },
          { interItemDelayMs: GOOGLE_INTER_ITEM_DELAY_MS },
        );
        console.info("[search-places] geo variants fired", {
          count: radiusJobs.length,
          restriction: !!boundary.bounds,
          lat: boundary.lat,
          lon: boundary.lon,
          concurrency: GOOGLE_CONCURRENCY,
        });
      } else if (ctx.googleCircuitOpen) {
        console.warn("[search-places] geo variants skipped — Google circuit open");
      } else {
        console.info("[search-places] no boundary center available, skipping geo variants");
      }


      const all = [...textResults, ...radiusResults];
      const successful = all.filter((r) => !r.error);
      const failed = all.filter((r) => r.error);

      // Merge & dedupe by place id
      const seen = new Set<string>();
      const merged: PlaceRaw[] = [];
      let rawGoogleCount = 0;
      for (const r of successful) {
        for (const p of r.places) {
          rawGoogleCount++;
          if (!p.id || seen.has(p.id)) continue;
          seen.add(p.id);
          merged.push(p);
        }
      }
      // Registrar atribuição por Place ID (primeiro job vencedor).
      const placeAttribution = new Map<string, { synonym: string; includedType: string | null }>();
      const textJobResults = textResults.map((r, i) => ({ r, job: textJobs[i] }));
      const radiusJobResultsMeta = radiusResults.map((r, i) => ({
        r,
        job: { query: `radius:${synonyms.slice(0,2)[Math.floor(i/Math.max(includedTypeForQuery.length,1))] ?? synonyms[0]}`, includedType: includedTypeForQuery[i % Math.max(includedTypeForQuery.length,1)] },
      }));
      for (const { r, job } of [...textJobResults, ...radiusJobResultsMeta]) {
        if (r.error) continue;
        for (const p of r.places) {
          if (!p.id || placeAttribution.has(p.id)) continue;
          placeAttribution.set(p.id, { synonym: job.query, includedType: job.includedType });
        }
      }

      diagnostics.googlePlacesNew = rawGoogleCount;
      diagnostics.afterDedupe = merged.length;

      console.info("[search-places] merged Places New results", {
        totalQueries: all.length,
        successful: successful.length,
        failed: failed.length,
        rawGoogleCount,
        uniquePlaces: merged.length,
      });

      if (merged.length > 0) {
        leads = mapPlacesNewToLeads(merged, city, state);
        const placeById = new Map<string, PlaceRaw>(merged.map((p) => [p.id, p]));
        for (const l of leads) {
          const attr = placeAttribution.get(l.external_id);
          const raw = placeById.get(l.external_id);
          perLeadAudit.set(l.external_id, {
            source: "google_places_new",
            synonym: attr?.synonym,
            includedType: attr?.includedType ?? null,
            rule: "google_places_new_text_search",
            googleTypes: raw?.types ?? null,
            category: raw?.primaryTypeDisplayName?.text ?? l.category ?? null,
          });
        }
        source = "google_places_new";
      }



      // Surface a representative error if everything failed
      if (merged.length === 0 && failed.length > 0) {
        const firstErr = failed[0].error!;
        const ne = normalizeGoogleError(firstErr.status, firstErr.text, "Google Places New");
        warnings.push({ source: SOURCE_LABELS.googleNew, code: ne.code, message: ne.message, action: ne.action });

        // -------- 2) Google Places Legacy fallback --------
        if (ne.retryLegacy) {
          sourcesTried.push(SOURCE_LABELS.googleLegacy);
          const legacyResult = await searchPlacesLegacy(primaryQuery, maxPages);
          if (!legacyResult.error) {
            const lseen = new Set<string>();
            const unique = legacyResult.places.filter((p) => {
              if (!p.place_id || lseen.has(p.place_id)) return false;
              lseen.add(p.place_id);
              return true;
            });
            leads = mapLegacyPlacesToLeads(unique, city, state);
            for (const l of leads) {
              perLeadAudit.set(l.external_id, {
                source: "google_places_legacy",
                synonym: primaryQuery,
                includedType: null,
                rule: "google_places_legacy_fallback",
              });
            }
            diagnostics.googlePlacesLegacy = leads.length;
            if (leads.length > 0) source = SOURCE_LABELS.googleLegacy;
          } else {
            const le = normalizeGoogleError(legacyResult.error.status, legacyResult.error.text, "Google Places Legacy");
            warnings.push({ source: SOURCE_LABELS.googleLegacy, code: le.code, message: le.message, action: le.action });
          }
        }
      }
    } else {
      const missingOrInvalid = normalizeGoogleError(0, JSON.stringify({ error: { message: GOOGLE_KEY_LOADED ? "invalid API key" : "missing" } }), "Google Places New");
      warnings.push({
        source: SOURCE_LABELS.googleNew,
        code: missingOrInvalid.code,
        message: missingOrInvalid.message,
        action: missingOrInvalid.action,
      });
    }

    // -------- 3) OpenStreetMap: SEMPRE executa em paralelo ao Google --------
    // Google Places tem prioridade (processado primeiro no dedupe). OSM entra
    // apenas complementando estabelecimentos que o Google não retornou.
    {
      sourcesTried.push(SOURCE_LABELS.nominatim, SOURCE_LABELS.overpass);
      const [osm, overpass] = await Promise.all([
        searchNominatim(segment, city, state, ctx),
        searchOverpass(segment, city, state, ctx),
      ]);


      if (osm.error) warnings.push({ source: SOURCE_LABELS.nominatim, message: osm.error });
      if (overpass.error) warnings.push({ source: SOURCE_LABELS.overpass, message: overpass.error });

      const fromNominatim = mapNominatimToLeads(osm.items, city, state);
      const fromOverpass = mapOverpassToLeads(overpass.elements, city, state);

      // Diagnóstico OSM: quantos vieram brutos vs. aceitos, motivo de filtragem.
      const nominatimRaw = osm.items.length;
      const overpassRaw = overpass.elements.length;
      const nominatimFilteredOut = Math.max(0, nominatimRaw - fromNominatim.length);
      const overpassFilteredOut = Math.max(0, overpassRaw - fromOverpass.length);
      diagnostics.osm_nominatim_queries = osm.queries;
      diagnostics.osm_nominatim_per_query = osm.perQueryCounts;
      diagnostics.osm_nominatim_raw = nominatimRaw;
      diagnostics.osm_nominatim_accepted = fromNominatim.length;
      diagnostics.osm_nominatim_filtered_out = nominatimFilteredOut;
      diagnostics.osm_overpass_query = overpass.query ? overpass.query.replace(/\s+/g, " ").slice(0, 400) : null;
      diagnostics.osm_overpass_endpoint = overpass.endpointUsed ?? null;
      diagnostics.osm_overpass_boundary_source = overpass.boundarySource ?? null;
      diagnostics.osm_overpass_raw = overpassRaw;
      diagnostics.osm_overpass_accepted = fromOverpass.length;
      diagnostics.osm_overpass_filtered_out = overpassFilteredOut;
      diagnostics.osm_raw_count = nominatimRaw + overpassRaw;
      diagnostics.osm_filtered_out_count = nominatimFilteredOut + overpassFilteredOut;
      diagnostics.osm_accepted_count = fromNominatim.length + fromOverpass.length;

      console.info("[search-places] OSM audit", {
        nominatim: { queries: osm.queries, raw: nominatimRaw, accepted: fromNominatim.length, filteredOut: nominatimFilteredOut, perQuery: osm.perQueryCounts },
        overpass: { raw: overpassRaw, accepted: fromOverpass.length, filteredOut: overpassFilteredOut, boundarySource: overpass.boundarySource, endpoint: overpass.endpointUsed, error: overpass.error },
      });


      // Atribuição de fonte para leads OSM (antes do dedupe).
      for (const l of fromNominatim) {
        perLeadAudit.set(l.external_id, {
          source: "openstreetmap_nominatim",
          synonym: segment,
          includedType: null,
          rule: "osm_nominatim_search",
          osmTags: osmTagsById.get(l.external_id) ?? null,
          category: l.category ?? null,
        });
      }
      for (const l of fromOverpass) {
        perLeadAudit.set(l.external_id, {
          source: "openstreetmap_overpass",
          synonym: segment,
          includedType: null,
          rule: "osm_overpass_tag_filter",
          osmTags: osmTagsById.get(l.external_id) ?? null,
          category: l.category ?? null,
        });
      }
      diagnostics.nominatim = fromNominatim.length;
      diagnostics.overpass = fromOverpass.length;


      // Dedupe hierárquico — evita colapsar empresas diferentes no mesmo
      // shopping/galeria/prédio. Ordem de prioridade:
      //  1) Place ID (Google)   2) OSM ID   3) telefone normalizado
      //  4) nome + rua          5) nome + cidade
      //  6) coordenadas ~1m (5 casas decimais) — último recurso
      const normalizePhone = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const digits = raw.replace(/\D+/g, "");
        if (digits.length < 8) return null;
        return digits.slice(-11);
      };
      const extractStreet = (address: string | null): string => {
        if (!address) return "";
        const first = address.split(/[,\-|]/)[0] ?? "";
        return normalizeText(first).replace(/\s+/g, " ").trim();
      };
      const leadKeys = (l: PublicLead): string[] => {
        const keys: string[] = [];
        const ext = l.external_id ?? "";
        if (ext.startsWith("osm:")) keys.push(`osm:${ext}`);
        else if (ext) keys.push(`place:${ext}`);
        const phone = normalizePhone(l.phone) ?? normalizePhone(l.whatsapp);
        if (phone) keys.push(`phone:${phone}`);
        const name = normalizeText(l.name);
        const street = extractStreet(l.address);
        if (name && street) keys.push(`ns:${name}|${street}`);
        if (name) keys.push(`nc:${name}|${normalizeText(l.city ?? "")}`);
        if (keys.length === 0 && l.latitude != null && l.longitude != null) {
          keys.push(`geo:${l.latitude.toFixed(5)},${l.longitude.toFixed(5)}`);
        }
        return keys;
      };

      // Google entra PRIMEIRO no set → prioridade automática no dedupe.
      const seenKeys = new Set<string>();
      const merged: PublicLead[] = [];
      const googleCount = leads.length;
      let duplicatesRemoved = 0;

      for (const l of leads) {
        const keys = leadKeys(l);
        const hit = keys.find((k) => seenKeys.has(k));
        if (hit) {
          duplicatesRemoved++;
          dedupeEvents.push({ id: l.external_id, source: perLeadAudit.get(l.external_id)?.source ?? "unknown", keys });
          continue;
        }
        for (const k of keys) seenKeys.add(k);
        merged.push(l);
      }
      const osmCandidates = [...fromOverpass, ...fromNominatim];
      let osmAdded = 0;
      for (const l of osmCandidates) {
        const keys = leadKeys(l);
        const hit = keys.find((k) => seenKeys.has(k));
        if (hit) {
          duplicatesRemoved++;
          dedupeEvents.push({ id: l.external_id, source: perLeadAudit.get(l.external_id)?.source ?? "osm", keys });
          continue;
        }
        for (const k of keys) seenKeys.add(k);
        merged.push(l);
        osmAdded++;
      }


      leads = merged;
      if (leads.length > 0 && source === "none") {
        source = fromOverpass.length >= fromNominatim.length ? SOURCE_LABELS.overpass : SOURCE_LABELS.nominatim;
      }

      // Diagnóstico consolidado da coleta combinada.
      diagnostics.combined = {
        google: googleCount,
        osm_nominatim: fromNominatim.length,
        osm_overpass: fromOverpass.length,
        osm_total: osmCandidates.length,
        osm_added: osmAdded,
        duplicates_removed: duplicatesRemoved,
        final: merged.length,
      } as any;

      console.info("[search-places] combined Google+OSM", {
        google: googleCount,
        osm_nominatim: fromNominatim.length,
        osm_overpass: fromOverpass.length,
        osm_added: osmAdded,
        duplicates_removed: duplicatesRemoved,
        final: merged.length,
      });
    }

    // ─── RECUPERAÇÃO — 2ª tentativa mais ampla quando final = 0 ───────
    // Muitos POIs em cidades pequenas não têm `shop=*` configurado, apenas
    // nome. Buscamos por regex de `name`/`brand`/`official_name` no OSM,
    // sem exigir tags de categoria. A validação de segmento é feita no
    // cliente (filtro Orvix) — aqui só ampliamos a coleta.
    let recoveryRawCount = 0;
    let recoveryAcceptedCount = 0;
    let recoveryAttempted = false;
    if (leads.length === 0) {
      recoveryAttempted = true;
      sourcesTried.push(SOURCE_LABELS.overpassRecovery);
      const recovery = await searchOverpassByName(segment, city, state, ctx);
      recoveryRawCount = recovery.elements.length;
      diagnostics.recovery_attempted = true;
      diagnostics.recovery_raw = recoveryRawCount;
      diagnostics.recovery_query = recovery.query ? recovery.query.replace(/\s+/g, " ").slice(0, 400) : null;
      diagnostics.recovery_error = recovery.error ?? null;

      if (recovery.error) {
        warnings.push({ source: SOURCE_LABELS.overpassRecovery, message: `Recuperação: ${recovery.error}` });
      }
      const recoveryLeadsRaw = mapOverpassToLeads(recovery.elements, city, state);

      // Dedupe local (mesma lógica hierárquica: OSM ID > phone > nome+rua > nome+cidade > geo).
      // Como leads primários = 0 aqui, este dedupe atua apenas entre os próprios recovery leads,
      // mas mantém consistência estrutural com o pipeline principal.
      const normalizePhoneRec = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const digits = raw.replace(/\D+/g, "");
        if (digits.length < 8) return null;
        return digits.slice(-11);
      };
      const extractStreetRec = (address: string | null): string => {
        if (!address) return "";
        const first = address.split(/[,\-|]/)[0] ?? "";
        return normalizeText(first).replace(/\s+/g, " ").trim();
      };
      const leadKeysRec = (l: PublicLead): string[] => {
        const keys: string[] = [];
        const ext = l.external_id ?? "";
        if (ext.startsWith("osm:")) keys.push(`osm:${ext}`);
        else if (ext) keys.push(`place:${ext}`);
        const phone = normalizePhoneRec(l.phone) ?? normalizePhoneRec(l.whatsapp);
        if (phone) keys.push(`phone:${phone}`);
        const name = normalizeText(l.name);
        const street = extractStreetRec(l.address);
        if (name && street) keys.push(`ns:${name}|${street}`);
        if (name) keys.push(`nc:${name}|${normalizeText(l.city ?? "")}`);
        if (keys.length === 0 && l.latitude != null && l.longitude != null) {
          keys.push(`geo:${l.latitude.toFixed(5)},${l.longitude.toFixed(5)}`);
        }
        return keys;
      };
      const seenRec = new Set<string>();
      const recoveryLeads: PublicLead[] = [];
      for (const l of recoveryLeadsRaw) {
        const keys = leadKeysRec(l);
        const hit = keys.find((k) => seenRec.has(k));
        if (hit) {
          dedupeEvents.push({ id: l.external_id, source: SOURCE_LABELS.overpassRecovery, keys });
          continue;
        }
        for (const k of keys) seenRec.add(k);
        recoveryLeads.push(l);
      }

      // ─── Validação de precisão do Recovery ─────────────────────────
      // Recovery amplia recall (busca por nome/brand no OSM sem exigir tag
      // de categoria), mas historicamente trouxe shoppings, datacenters e
      // afins. Aplicamos um score mínimo antes de admitir no pipeline.
      // Filtros Orvix subsequentes continuam intactos — este score só
      // impede que "ruído textual" vaze pra fase seguinte.
      const segmentNorm = normalizeText(segment);
      const synonymsNorm = synonyms.map((s) => normalizeText(s)).filter(Boolean);

      // Termos fortes por segmento (Pet Shop explícito; demais herdam sinônimos).
      const SEGMENT_STRONG_TERMS: Record<string, string[]> = {
        "pet shop": ["pet", "animal", "animais", "racao", "ração", "banho", "tosa", "veterinaria", "veterinária", "veterinario", "veterinário", "agro", "agropecuaria", "agropecuária"],
      };
      const strongTerms = (SEGMENT_STRONG_TERMS[segmentNorm] ?? synonymsNorm).map(normalizeText).filter(Boolean);

      // Rejeição universal (não-comercial ou fora de qualquer varejo).
      const UNIVERSAL_NEGATIVES: Array<{ terms: string[]; penalty: number; reason: string }> = [
        { terms: ["shopping", "mall", "galeria comercial"], penalty: 50, reason: "shopping/mall" },
        { terms: ["datacenter", "data center"], penalty: 50, reason: "datacenter" },
        { terms: ["condominio", "condomínio", "edificio", "edifício", "predio", "prédio"], penalty: 40, reason: "condomínio/prédio" },
        { terms: ["tecnologia", "software", "sistemas", "solucoes em ti", "soluções em ti"], penalty: 40, reason: "empresa de tecnologia" },
        { terms: ["logistica", "logística", "transportadora", "industrial", "industria", "indústria"], penalty: 40, reason: "logística/industrial" },
      ];

      // Pet Shop: rejeições específicas do pedido do usuário.
      const SEGMENT_NEGATIVES: Record<string, Array<{ terms: string[]; penalty: number; reason: string }>> = {
        "pet shop": [
          { terms: ["shopping", "mall"], penalty: 50, reason: "shopping/mall" },
          { terms: ["datacenter", "data center"], penalty: 50, reason: "datacenter" },
          { terms: ["tecnologia"], penalty: 40, reason: "tecnologia" },
          { terms: ["logistica", "logística"], penalty: 40, reason: "logística" },
          { terms: ["industrial"], penalty: 40, reason: "industrial" },
          { terms: ["condominio", "condomínio"], penalty: 40, reason: "condomínio" },
        ],
      };

      const RETAIL_GENERIC = ["varejo", "loja", "lojas", "magazine", "departamento"];
      const isRetailGeneric = RETAIL_GENERIC.some((t) => segmentNorm.includes(t));

      const OSM_TAG_COMPATIBLE: Record<string, string[]> = {
        "pet shop": ["shop=pet", "shop=pet_grooming", "shop=pet_food", "shop=animal_feed", "shop=animal_boarding", "shop=agrarian", "amenity=veterinary", "healthcare=veterinary"],
      };
      const compatibleTagKeys = OSM_TAG_COMPATIBLE[segmentNorm] ?? [];

      const scoreRecoveryLead = (l: PublicLead): { score: number; positives: string[]; negatives: string[]; reason: string | null } => {
        const positives: string[] = [];
        const negatives: string[] = [];
        const nameNorm = normalizeText(l.name ?? "");
        const catNorm = normalizeText(l.category ?? "");
        const tags = osmTagsById.get(l.external_id) ?? {};
        const brandNorm = normalizeText((tags.brand ?? tags["brand:en"] ?? "") as string);
        const officialNorm = normalizeText((tags.official_name ?? "") as string);
        const haystackName = [nameNorm, brandNorm, officialNorm].filter(Boolean).join(" | ");
        const tagPairs = Object.entries(tags).map(([k, v]) => `${k}=${v}`.toLowerCase());
        const tagBlob = tagPairs.join(" ");

        let score = 0;

        // +30 nome/brand/official contém termo forte
        if (strongTerms.some((t) => t && haystackName.includes(t))) {
          score += 30;
          positives.push("strong-term-in-name");
        }
        // +25 tags OSM compatíveis
        if (compatibleTagKeys.length > 0 && compatibleTagKeys.some((tk) => tagPairs.includes(tk))) {
          score += 25;
          positives.push("osm-tag-compatible");
        }
        // +20 category compatível (mesmos termos fortes)
        if (catNorm && strongTerms.some((t) => t && catNorm.includes(t))) {
          score += 20;
          positives.push("category-compatible");
        }
        // +10 qualquer sinônimo do segmento
        if (synonymsNorm.some((s) => s && haystackName.includes(s))) {
          score += 10;
          positives.push("synonym-in-name");
        }
        // +10 google types compatíveis — recovery OSM não tem google types,
        // mas mantemos o gancho estruturado.
        const googleTypes: string[] = Array.isArray((l as any).google_types) ? (l as any).google_types : [];
        if (googleTypes.some((gt) => strongTerms.some((t) => t && gt.includes(t)))) {
          score += 10;
          positives.push("google-type-compatible");
        }

        // Sinais negativos — buscam em nome, brand, official, tags e category.
        const haystackAll = `${haystackName} ${catNorm} ${tagBlob}`;
        const segNegatives = SEGMENT_NEGATIVES[segmentNorm] ?? [];
        for (const rule of [...UNIVERSAL_NEGATIVES, ...segNegatives]) {
          if (rule.terms.some((t) => haystackAll.includes(t))) {
            score -= rule.penalty;
            negatives.push(rule.reason);
          }
        }

        // -30 department_store fora de varejo genérico
        if (!isRetailGeneric && (tagPairs.includes("shop=department_store") || catNorm.includes("department_store"))) {
          score -= 30;
          negatives.push("department_store fora de varejo");
        }

        const dedupNeg = Array.from(new Set(negatives));
        const primaryReason = dedupNeg[0] ?? (positives.length === 0 ? "sem sinais positivos" : null);
        return { score, positives, negatives: dedupNeg, reason: primaryReason };
      };

      const RECOVERY_MIN_SCORE = 30;
      const recoveryRejections: Array<{ id: string; name: string; score: number; reason: string; positives: string[]; negatives: string[] }> = [];
      const validatedRecoveryLeads: PublicLead[] = [];
      for (const l of recoveryLeads) {
        const { score, positives, negatives, reason } = scoreRecoveryLead(l);
        if (score >= RECOVERY_MIN_SCORE) {
          validatedRecoveryLeads.push(l);
        } else {
          recoveryRejections.push({
            id: l.external_id,
            name: l.name,
            score,
            reason: reason ?? "abaixo do score mínimo",
            positives,
            negatives,
          });
        }
      }

      recoveryAcceptedCount = validatedRecoveryLeads.length;
      diagnostics.recovery_accepted = recoveryAcceptedCount;
      diagnostics.recovery_rejected = recoveryRejections.length;
      diagnostics.recovery_rejection_reason = recoveryRejections.slice(0, 20).map((r) => ({
        name: r.name,
        score: r.score,
        reason: r.reason,
        negatives: r.negatives,
      }));
      // Objeto estruturado (fonte única de verdade para o frontend).
      diagnostics.recovery = {
        attempted: recoveryAttempted,
        raw_count: recoveryRawCount,
        accepted_count: recoveryAcceptedCount,
        rejected_count: recoveryRejections.length,
        min_score: RECOVERY_MIN_SCORE,
        rejection_reasons: (diagnostics.recovery_rejection_reason as unknown[]),
        source: SOURCE_LABELS.overpassRecovery,
      };

      console.info("[search-places] recovery Overpass by name", {
        raw: recoveryRawCount,
        after_dedupe: recoveryLeads.length,
        accepted: recoveryAcceptedCount,
        rejected: recoveryRejections.length,
        segment,
        source: SOURCE_LABELS.overpassRecovery,
      });
      if (recoveryRejections.length > 0) {
        console.info("[search-places] recovery rejections sample", recoveryRejections.slice(0, 10));
      }

      if (validatedRecoveryLeads.length > 0) {
        for (const l of validatedRecoveryLeads) {
          perLeadAudit.set(l.external_id, {
            source: SOURCE_LABELS.overpassRecovery,
            synonym: segment,
            includedType: null,
            rule: "osm_overpass_name_recovery",
            osmTags: osmTagsById.get(l.external_id) ?? null,
            category: l.category ?? null,
          });
        }
        leads = validatedRecoveryLeads;
        if (source === "none") source = SOURCE_LABELS.overpassRecovery;
      }
    } else {
      // Garante que o objeto exista mesmo quando não foi disparado.
      diagnostics.recovery = {
        attempted: false,
        raw_count: 0,
        accepted_count: 0,
        source: SOURCE_LABELS.overpassRecovery,
      };
    }

    // Website Discovery + Instagram Discovery are NO LONGER blocking.
    // They now run em background via a segunda chamada (mode: "enrich") disparada
    // pelo frontend após o retorno inicial. Isso permite que a busca retorne
    // imediatamente e os cards atualizem os campos website/instagram quando prontos.




    // ─── Fontes web complementares (Tavily + Firecrawl) ─────────────────────
    // Google continua opcional; a busca funciona por OSM/Overpass + enriquecimento
    // web. Este bloco nunca cria nem remove leads — apenas adiciona website e
    // contato reais quando há evidência (match por nome/domínio e scrape com
    // confirmação geográfica). Falha de qualquer fonte não derruba a busca.
    const webDiag: Record<string, unknown> = { enabled: true };
    if (leads.length > 0) {
      try {
        const webQuery = `${city} ${segment}`.trim();
        const web = await runWebSources({ query: webQuery, limit: 8, call: callWebFunction });
        webDiag.tavily_raw = web.tavily.length;
        webDiag.firecrawl_raw = web.firecrawl.length;
        if (web.tavily.length + web.firecrawl.length > 0) {
          const enriched = await enrichLeadsWithWeb({
            leads: leads as unknown as Parameters<typeof enrichLeadsWithWeb>[0]["leads"],
            web,
            city,
            state,
            maxScrape: 2,
            scrape: scrapePageContent,
          });
          leads = enriched.leads as unknown as PublicLead[];
          webDiag.websites_enriched = enriched.summary.websitesEnriched;
          webDiag.scrape_attempted = enriched.summary.scrapeAttempted;
          webDiag.contacts_applied = enriched.summary.contactsApplied;
          for (const l of enriched.leads) {
            const ext = l.external_id;
            if (typeof ext === "string") {
              const auditItem = perLeadAudit.get(ext);
              if (auditItem) perLeadAudit.set(ext, { ...auditItem, web_enriched: true });
            }
          }
        }
      } catch (e) {
        webDiag.error = e instanceof Error ? e.message : "web_error";
      }
    } else {
      webDiag.enabled = false;
    }
    diagnostics.web_sources = webDiag;

    // Intelligent priority sort — internal Lead Score, never excludes leads.
    if (leads.length > 0) {
      leads = sortLeadsByPriority(leads, segment, module);
    }

    diagnostics.final = leads.length;
    console.info("[search-places] diagnostics", { segment, city, state, source, ...diagnostics });

    // Zero-result: log estruturado para auditoria rápida.
    if (leads.length === 0) {
      console.warn("[search-places] ZERO_RESULT_DIAGNOSTIC", {
        segment, city, state,
        google_consultado: GOOGLE_KEY_LOADED && !ctx.googleCircuitOpen,
        google_retornou: (Number(diagnostics.googlePlacesNew) || 0) + (Number(diagnostics.googlePlacesLegacy) || 0),
        google_rate_limited: ctx.googleCircuitOpen,
        nominatim_consultas: Array.isArray(diagnostics.osm_nominatim_queries) ? (diagnostics.osm_nominatim_queries as unknown[]).length : 0,
        nominatim_retornou: Number(diagnostics.osm_nominatim_raw ?? diagnostics.nominatim) || 0,
        nominatim_rate_limited: ctx.nominatimCircuitOpen,
        overpass_executou: diagnostics.osm_overpass_query != null,
        overpass_retornou: Number(diagnostics.osm_overpass_raw ?? diagnostics.overpass) || 0,
        recovery_attempted: !!diagnostics.recovery_attempted,
        recovery_raw: Number(diagnostics.recovery_raw) || 0,
        recovery_accepted: Number(diagnostics.recovery_accepted) || 0,
        note: "Nenhum lead encontrado pelas fontes consultadas — não afirmar ausência de empresas.",
      });
    }

    // ────────────────────────────────────────────────────────────
    // Auditoria consolidada — apenas leitura, sem persistência.
    // ────────────────────────────────────────────────────────────
    const combined = (diagnostics.combined ?? {}) as {
      google?: number; osm_nominatim?: number; osm_overpass?: number;
      osm_added?: number; duplicates_removed?: number; final?: number;
    };
    const googleFound = (Number(diagnostics.googlePlacesNew) || 0) + (Number(diagnostics.googlePlacesLegacy) || 0);
    const osmFound = (Number(diagnostics.nominatim) || 0) + (Number(diagnostics.overpass) || 0);
    const duplicates = Number(combined.duplicates_removed) || 0;
    const accepted = leads.length;
    // Precisão estimada: leads aceitos / (aceitos + duplicados removidos).
    // Recall estimado: leads aceitos / total bruto coletado nas fontes.
    const rawTotal = googleFound + osmFound;
    const precisionEst = accepted + duplicates > 0 ? accepted / (accepted + duplicates) : 0;
    const recallEst = rawTotal > 0 ? accepted / rawTotal : 0;

    const audit = {
      segment_detected: segment,
      module,
      synonyms_used: synonyms,
      included_types_used: includedTypes,
      per_lead: Object.fromEntries(
        leads.map((l) => {
          const a = perLeadAudit.get(l.external_id);
          return [l.external_id, {
            source: a?.source ?? "unknown",
            synonym: a?.synonym ?? null,
            included_type: a?.includedType ?? null,
            rule: a?.rule ?? null,
            osm_tags: a?.osmTags ?? null,
            category: a?.category ?? l.category ?? null,
            google_types: a?.googleTypes ?? null,
            confidence: (l as any).confidence ?? null,
          }];
        }),
      ),
      dedupe_events: dedupeEvents.slice(0, 200),
      summary: {
        google_found: googleFound,
        google_places_new: Number(diagnostics.googlePlacesNew) || 0,
        google_places_legacy: Number(diagnostics.googlePlacesLegacy) || 0,
        osm_found: osmFound,
        osm_nominatim: Number(diagnostics.nominatim) || 0,
        osm_overpass: Number(diagnostics.overpass) || 0,
        duplicates_removed: duplicates,
        rejected: 0, // Preenchido no cliente (regras de segmento Orvix).
        accepted,
        recall_estimated: Number(recallEst.toFixed(3)),
        precision_estimated: Number(precisionEst.toFixed(3)),
        google_rate_limited: ctx.googleCircuitOpen,
        google_429_hits: ctx.google429,
        nominatim_rate_limited: ctx.nominatimCircuitOpen,
        nominatim_429_hits: ctx.nominatim429,
        sources_failed: ctx.sourcesFailed,
        // Contadores auditáveis do funil de descoberta (servidor).
        raw_google_count: (Number(diagnostics.googlePlacesNew) || 0) + (Number(diagnostics.googlePlacesLegacy) || 0),
        raw_nominatim_count: Number(diagnostics.osm_nominatim_raw ?? diagnostics.nominatim) || 0,
        raw_overpass_count: Number(diagnostics.osm_overpass_raw ?? diagnostics.overpass) || 0,
        recovery_raw_count: Number(diagnostics.recovery_raw) || 0,
        recovery_accepted_count: Number(diagnostics.recovery_accepted) || 0,
        recovery_attempted: !!diagnostics.recovery_attempted,
        after_dedupe_count: leads.length,
        after_segment_filter_count: null as number | null, // preenchido no cliente (filtro Orvix)
        rejected_count: 0, // preenchido no cliente
        final_count: leads.length,
      },

    };

    // ─── Status por fonte + status geral da busca ────────────────
    // Uma fonte só é "error" se foi tentada, não retornou nada e não é rate-limit.
    // rate_limited tem prioridade sobre error para deixar claro que é temporário.
    type SrcStatus = "success" | "rate_limited" | "error" | "skipped";
    const googleAttempted = GOOGLE_KEY_LOADED;
    const nominatimAttempted = true; // OSM sempre tentado
    const overpassAttempted = true;
    const googleReturned = (Number(diagnostics.googlePlacesNew) || 0) + (Number(diagnostics.googlePlacesLegacy) || 0) > 0;
    const nominatimReturned = (Number(diagnostics.nominatim) || 0) > 0;
    const overpassReturned = (Number(diagnostics.overpass) || 0) > 0;
    const warnsHave = (needle: string) => warnings.some((w) => (w.source ?? "").includes(needle));
    const google_status: SrcStatus = !googleAttempted
      ? "skipped"
      : ctx.googleCircuitOpen
        ? "rate_limited"
        : googleReturned
          ? "success"
          : warnsHave("google")
            ? "error"
            : "success"; // sem chave/sem query = tratado como skipped acima; se chegou aqui sem warns, considerar ok
    const nominatim_status: SrcStatus = !nominatimAttempted
      ? "skipped"
      : ctx.nominatimCircuitOpen
        ? "rate_limited"
        : nominatimReturned
          ? "success"
          : warnsHave("openstreetmap_nominatim") || warnsHave("nominatim")
            ? "error"
            : "success";
    const overpass_status: SrcStatus = !overpassAttempted
      ? "skipped"
      : overpassReturned
        ? "success"
        : warnsHave("openstreetmap_overpass") || warnsHave("overpass")
          ? "error"
          : "success";

    const sources_status = { google: google_status, nominatim: nominatim_status, overpass: overpass_status };
    const attemptedStatuses = [google_status, nominatim_status, overpass_status].filter((s) => s !== "skipped");
    const anyDegraded = attemptedStatuses.some((s) => s === "rate_limited" || s === "error");
    const allFailed = attemptedStatuses.length > 0 && attemptedStatuses.every((s) => s === "rate_limited" || s === "error");

    // Estados possíveis:
    //   SUCCESS               → há leads e nenhuma fonte falhou
    //   PARTIAL_RESULTS       → há leads e alguma fonte falhou/limitada
    //   EMPTY_REAL            → sem leads e todas as fontes tentadas responderam ok
    //   EMPTY_WITH_LIMITATIONS→ sem leads e uma+ fonte falhou (não podemos afirmar que "não existe")
    // Mantidos por retrocompatibilidade: SUCCESS_WITH_WARNINGS (alias PARTIAL_RESULTS), EMPTY (alias EMPTY_REAL), EXTERNAL_FAILURE (todas falharam).
    let search_status:
      | "SUCCESS"
      | "SUCCESS_WITH_WARNINGS"
      | "PARTIAL_RESULTS"
      | "EMPTY"
      | "EMPTY_REAL"
      | "EMPTY_WITH_LIMITATIONS"
      | "EXTERNAL_FAILURE";
    if (leads.length > 0) {
      search_status = anyDegraded ? "PARTIAL_RESULTS" : "SUCCESS";
    } else if (allFailed) {
      search_status = "EMPTY_WITH_LIMITATIONS";
    } else if (anyDegraded) {
      search_status = "EMPTY_WITH_LIMITATIONS";
    } else {
      search_status = "EMPTY_REAL";
    }

    console.info("[search-places] search_status", { search_status, sources_status, leads: leads.length });

    return new Response(JSON.stringify({
      leads,
      count: leads.length,
      source,
      sources_tried: sourcesTried,
      warnings,
      diagnostics,
      audit,
      search_status,
      sources_status,
      google_enabled: GOOGLE_KEY_LOADED,
      google_key_loaded: GOOGLE_KEY_LOADED,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });


  } catch (e) {
    console.error("[search-places] fatal", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
