// Enriquecimento de FOTO do lead a partir do PRÓPRIO site do estabelecimento.
// O gmaps-scraper já traz `thumbnail`; o mapScraper (aiohttp) NÃO traz imagem —
// então, para leads sem foto e COM site, buscamos a imagem real do negócio
// (og:image/twitter:image ou 1ª imagem do HTML). Nunca inventa/usa imagem de
// terceiros: a imagem é do domínio do próprio estabelecimento.

function toAbsolute(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.protocol === "http:") u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

/** Extrai a melhor imagem do HTML (og:image → twitter:image → 1ª <img> raster). */
export function extractWebsiteImage(html: string, baseUrl: string): string | null {
  if (!html) return null;
  const meta1 = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image:secure_url|og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i);
  const meta2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image:secure_url|og:image|twitter:image)["']/i);
  const fromMeta = meta1?.[1] ?? meta2?.[1] ?? null;
  const firstImg = (html.match(/<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp|avif)(?:\?[^"']*)?)["']/i) ?? [])[1] ?? null;
  for (const raw of [fromMeta, firstImg]) {
    const abs = toAbsolute(raw, baseUrl);
    if (abs) return abs;
  }
  return null;
}

export async function resolveWebsiteImage(
  website: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const { timeoutMs = 4500, fetchImpl = fetch } = opts;
  const base = String(website ?? "").trim();
  if (!base) return null;
  const url = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 300_000);
    return extractWebsiteImage(text, res.url || url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type PhotoLead = { photoUrl: string | null; website: string | null };

/**
 * Busca foto para leads SEM foto e COM site (limitado por orçamento). Muta
 * `photoUrl` no local e devolve quantos foram enriquecidos.
 */
export async function enrichLeadsWithWebsiteImages<T extends PhotoLead>(
  leads: T[],
  opts: { budget?: number; concurrency?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ enriched: number; attempted: number }> {
  const { budget = 40, concurrency = 8, timeoutMs = 4500, fetchImpl = fetch } = opts;
  const targets = leads.filter((l) => !l.photoUrl && l.website).slice(0, Math.max(0, budget));
  if (targets.length === 0) return { enriched: 0, attempted: 0 };
  let cursor = 0;
  let enriched = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const lead = targets[cursor++];
      const img = await resolveWebsiteImage(lead.website ?? "", { timeoutMs, fetchImpl });
      if (img) {
        lead.photoUrl = img;
        enriched++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  return { enriched, attempted: targets.length };
}
