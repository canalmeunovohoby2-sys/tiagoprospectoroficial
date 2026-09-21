import { supabase } from "@/integrations/supabase/client";
import { LOCAL_AGENT_RUNTIME_URL, getAgentRuntimeMode } from "@/lib/siteProjectsApi";

/**
 * SCRAPERS LOCAIS (Maps 8788 / Photos 8789) via Agent Runtime.
 *
 * O navegador fala SOMENTE com 127.0.0.1:8787 — as rotas /maps e /photos do runtime
 * encaminham para os motores locais. A Edge Function do Supabase roda na nuvem e não
 * alcança o localhost do usuário, por isso a ponte é o runtime.
 *
 * Regras:
 * - Só quando o runtime NÃO está em modo "Nuvem" (modo "Este computador"/automático).
 * - Nunca é obrigatório: qualquer falha é silenciosa e os providers atuais
 *   (Google Places/Geoapify/Nominatim/Overpass) seguem valendo.
 * - Nunca cria fallback para Railway.
 */

export type LocalScraperKind = "maps" | "photos";

export interface LocalPlace {
  id?: string | null;
  title?: string | null;
  category?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  completePhoneNumber?: string | null;
  domain?: string | null;
  url?: string | null;
  url_place?: string | null;
  link?: string | null;
  coor?: string | null;
  stars?: string | number | null;
  reviews?: string | number | null;
  thumbnail?: string | null;
  images?: string[] | null;
  site_email?: string | null;
  site_instagram?: string | null;
  site_facebook?: string | null;
}

/** O runtime remoto está selecionado? Então nada de scraper local. */
export function localScrapersEnabled(): boolean {
  return getAgentRuntimeMode() !== "remote";
}

function digits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function coordinates(value: string | null | undefined): { latitude: number | null; longitude: number | null } {
  const parts = String(value ?? "").split(",");
  if (parts.length !== 2) return { latitude: null, longitude: null };
  return { latitude: toNumber(parts[0]), longitude: toNumber(parts[1]) };
}

/**
 * Sinal de timeout quando o navegador suportar (`AbortSignal.timeout` não existe em
 * Safari antigo nem em alguns ambientes de teste) — sem ele o fetch segue sem prazo.
 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Consulta um motor local pelo runtime. Devolve [] em qualquer problema
 * (runtime fora do ar, motor desligado, sem sessão) — a busca nunca quebra por isso.
 */
export async function searchLocalPlaces(
  kind: LocalScraperKind,
  query: string,
  maxPlaces = 30,
): Promise<LocalPlace[]> {
  const q = query.trim();
  if (!q || !localScrapersEnabled()) return [];
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return [];
    const res = await fetch(`${LOCAL_AGENT_RUNTIME_URL}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: q, maxPlaces }),
      signal: timeoutSignal(280_000),
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { places?: unknown };
    return Array.isArray(payload.places) ? (payload.places as LocalPlace[]) : [];
  } catch {
    return [];
  }
}

/** Converte um registro do scraper local para o mesmo shape usado pela busca. */
function placeToLead<T>(place: LocalPlace, ctx: { city: string; state: string }): T {
  const website = place.url || (place.domain ? `https://${place.domain}` : "") || "";
  const phone = place.completePhoneNumber || place.phoneNumber || "";
  const mobile = digits(phone);
  const { latitude, longitude } = coordinates(place.coor);
  const images = Array.isArray(place.images) ? place.images.filter(Boolean) : [];
  const photo = place.thumbnail || images[0] || null;
  const social = (place.site_instagram && "instagram") || (place.site_facebook && "facebook") || "";
  return {
    external_id: place.id || `${place.title ?? ""}|${place.address ?? ""}`,
    name: place.title ?? null,
    category: place.category ?? null,
    address: place.address ?? null,
    city: ctx.city,
    state: ctx.state,
    phone: phone || null,
    whatsapp: mobile.length >= 12 ? mobile : null,
    website: website || null,
    google_url: place.url_place || place.link || null,
    instagram: place.site_instagram ?? (social === "instagram" ? place.url ?? null : null),
    facebook: place.site_facebook ?? (social === "facebook" ? place.url ?? null : null),
    rating: toNumber(place.stars),
    reviews_count: toNumber(place.reviews) ?? 0,
    has_website: !!website,
    latitude,
    longitude,
    photos: images,
    photoUrl: photo,
    photo_name: null,
    source: "local_scraper",
  } as unknown as T;
}

function keyOf(value: unknown): string {
  const v = value as { external_id?: unknown; name?: unknown; address?: unknown } | null;
  const id = String(v?.external_id ?? "").trim();
  if (id) return id.toLowerCase();
  return `${String(v?.name ?? "").trim().toLowerCase()}|${String(v?.address ?? "").trim().toLowerCase()}`;
}

/**
 * Mescla os resultados locais nos leads já obtidos, sem descartar nada:
 * - lead novo → entra;
 * - lead que já veio de outra fonte → só completa campos vazios (telefone, site,
 *   coordenadas, nota, foto), nunca sobrescreve dado existente.
 */
export function mergeLocalPlaces<T>(leads: T[], places: LocalPlace[], ctx: { city: string; state: string }): T[] {
  if (places.length === 0) return leads;
  const out: T[] = [...leads];
  const index = new Map<string, number>();
  out.forEach((lead, i) => index.set(keyOf(lead), i));
  const FILLABLE = ["phone", "whatsapp", "website", "google_url", "instagram", "facebook", "latitude", "longitude", "rating", "photoUrl", "address"] as const;
  for (const place of places) {
    const mapped = placeToLead<T>(place, ctx);
    const key = keyOf(mapped);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push(mapped);
      continue;
    }
    const target = out[at] as Record<string, unknown>;
    const source = mapped as Record<string, unknown>;
    for (const field of FILLABLE) {
      const atual = target[field];
      if (atual === null || atual === undefined || atual === "") {
        if (source[field] !== null && source[field] !== undefined && source[field] !== "") target[field] = source[field];
      }
    }
    if (!target.has_website && source.website) target.has_website = true;
  }
  return out;
}

/** Termo das consultas locais no mesmo padrão dos providers ("segmento em cidade, UF"). */
export function localQuery(segment: string, city: string, state: string): string {
  return `${segment} em ${city}, ${state}`;
}
