// FOTO oficial do estabelecimento via Google Places (New) + proxy `place-photo`.
//
// MOTIVO: o mapScraper devolve o `place_id` (ChIJ) mas NÃO devolve imagem. Para
// leads sem site (ou cujo site não rende og:image), a foto real vem da própria
// ficha do Google Maps — servida pelo proxy `place-photo`, que mantém a API key
// APENAS no servidor (nunca no HTML). Enriquecimento best-effort: qualquer falha
// apenas deixa o lead sem foto, sem quebrar a busca.
export type GooglePhotoLead = { photoUrl: string | null; placeId?: string | null };

/** Monta a URL pública (sem key) que o <img> do front carrega. */
export function buildPlacePhotoProxyUrl(proxyBase: string, photoName: string, width = 800): string {
  const base = proxyBase.replace(/\/+$/, "");
  return `${base}/functions/v1/place-photo?name=${encodeURIComponent(photoName)}&w=${width}`;
}

async function fetchPlacePhotoName(
  placeId: string,
  opts: { apiKey: string; timeoutMs: number; fetchImpl: typeof fetch },
): Promise<{ name: string | null; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR`;
    const res = await opts.fetchImpl(url, {
      headers: { "X-Goog-Api-Key": opts.apiKey, "X-Goog-FieldMask": "photos" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { name: null, error: `HTTP ${res.status}: ${text.slice(0, 160)}` };
    }
    const data = (await res.json().catch(() => null)) as { photos?: Array<{ name?: unknown }> } | null;
    const name = Array.isArray(data?.photos) ? data!.photos![0]?.name : null;
    return { name: typeof name === "string" && name ? name : null };
  } catch (e) {
    return { name: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Um `place_id` utilizável no Places API (New): ChIJ/etc., nunca o fallback nome|endereço. */
export function isGooglePlaceId(value: string | null | undefined): value is string {
  return typeof value === "string" && !value.includes("|") && /^[A-Za-z0-9_-]{15,}$/.test(value);
}

/**
 * Preenche a foto dos leads SEM imagem e COM `placeId` do Google, usando a foto
 * oficial da ficha. Muta `photoUrl` e devolve quantos foram enriquecidos.
 */
export async function enrichLeadsWithGooglePhotos<T extends GooglePhotoLead>(
  leads: T[],
  opts: {
    budget?: number;
    concurrency?: number;
    timeoutMs?: number;
    apiKey?: string;
    proxyBase?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{ enriched: number; attempted: number; sample?: string }> {
  const { budget = 40, concurrency = 6, timeoutMs = 3000, apiKey, proxyBase, fetchImpl = fetch } = opts;
  if (!apiKey || !proxyBase) return { enriched: 0, attempted: 0, sample: "sem apiKey/proxyBase" };
  const targets = leads
    .filter((l) => !l.photoUrl && isGooglePlaceId(l.placeId))
    .slice(0, Math.max(0, budget));
  if (targets.length === 0) return { enriched: 0, attempted: 0 };
  let cursor = 0;
  let enriched = 0;
  let sample: string | undefined;
  const worker = async () => {
    while (cursor < targets.length) {
      const lead = targets[cursor++];
      const r = await fetchPlacePhotoName(lead.placeId as string, { apiKey, timeoutMs, fetchImpl });
      if (r.name) {
        lead.photoUrl = buildPlacePhotoProxyUrl(proxyBase, r.name, 800);
        enriched++;
      } else if (r.error && !sample) {
        sample = r.error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  return { enriched, attempted: targets.length, sample };
}
