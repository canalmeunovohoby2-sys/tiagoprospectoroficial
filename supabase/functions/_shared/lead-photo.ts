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

/** Rejeita candidatos que claramente NÃO são a foto do negócio (ícones/placeholders). */
const BAD_IMAGE = /(sprite|favicon|placeholder|spacer|pixel|1x1|blank|loading|preloader|gravatar|\.svg(?:\?|$)|logo[-_.]?(?:pequen|small)?\.(?:png|jpe?g|webp))/i;
/** Pistas de que a URL provavelmente é um LOGO (evita como foto principal). */
const LOGO_HINT = /(logo|brand|marca)[-_.\/]?/i;
/** Pistas de que a URL parece uma FOTO real (hero/ambiente/produto). */
const PHOTO_HINT = /(hero|banner|capa|cover|foto|photo|ambiente|equipe|team|about|sobre|produto|product|galeria|gallery|slider|destaque|servico|service)/i;

function looksLikeImageUrl(raw: string): boolean {
  if (!raw || raw.startsWith("data:")) return false;
  if (BAD_IMAGE.test(raw)) return false;
  return /\.(jpe?g|png|webp|avif)(?:\?|#|$)/i.test(raw) || /(image|photo|img|media|cdn|cloudinary|imgix|wixstatic)/i.test(raw);
}

function isBetterThan(current: string | null, candidate: string): boolean {
  if (!current) return true;
  const candLogo = LOGO_HINT.test(candidate) && !PHOTO_HINT.test(candidate);
  const currLogo = LOGO_HINT.test(current) && !PHOTO_HINT.test(current);
  if (candLogo && !currLogo) return false;
  if (!candLogo && currLogo) return true;
  return false;
}

/**
 * Extrai a melhor imagem do HTML. Prefere (nesta ordem): og:image/twitter:image
 * (com todas as variações), <link image_src>, JSON-LD "image", e por fim imagens
 * do HTML em src/srcset/data-src/lazy/picture, evitando logos/ícones/placeholders.
 */
export function extractWebsiteImage(html: string, baseUrl: string): string | null {
  if (!html) return null;
  const explicit: string[] = []; // declarações explícitas (meta/link/JSON-LD)
  const inline: string[] = [];   // imagens soltas do HTML (exigem heurística)

  // 1) Metas sociais (og:image, og:image:url, og:image:secure_url, twitter:image, twitter:image:src).
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (tag.match(/(?:property|name|itemprop)=["']([^"']+)["']/i) ?? [])[1] ?? "";
    if (!/^(?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?|image)$/i.test(key)) continue;
    const content = (tag.match(/content=["']([^"']+)["']/i) ?? [])[1];
    if (content) explicit.push(content);
  }
  // 2) <link rel="image_src" href="...">
  const linkSrc = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i);
  if (linkSrc?.[1]) explicit.push(linkSrc[1]);
  // 3) JSON-LD "image": "..." | ["..."]
  for (const m of html.matchAll(/"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi)) {
    const v = m[1] ?? m[2];
    if (v) explicit.push(v);
  }
  // 4) <picture><source srcset> e <img> (src/srcset/data-src/data-lazy-src/data-original).
  for (const tag of html.match(/<source\b[^>]*>/gi) ?? []) {
    const srcset = (tag.match(/srcset=["']([^"']+)["']/i) ?? [])[1];
    if (srcset) inline.push(srcset.split(",")[0].trim().split(/\s+/)[0]);
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = (tag.match(/(?:data-lazy-src|data-src|data-original|data-flickity-lazyload|src)=["']([^"']+)["']/i) ?? [])[1];
    const srcset = (tag.match(/srcset=["']([^"']+)["']/i) ?? [])[1];
    const fromSrcset = srcset ? srcset.split(",")[0].trim().split(/\s+/)[0] : null;
    const candidate = src || fromSrcset;
    if (candidate) inline.push(candidate);
  }

  const pick = (list: string[], strict: boolean): string | null => {
    let best: string | null = null;
    for (const raw of list) {
      if (!raw || raw.startsWith("data:")) continue;
      const abs = toAbsolute(raw, baseUrl);
      if (!abs) continue;
      if (BAD_IMAGE.test(abs)) continue;
      if (strict && !looksLikeImageUrl(abs)) continue;
      if (isBetterThan(best, abs)) best = abs;
      // Já achou uma foto não-logo: é a melhor escolha possível nesta lista.
      if (best && !LOGO_HINT.test(best)) break;
    }
    return best;
  };

  const ex = pick(explicit, false);
  const inl = pick(inline, true);
  // Prefere a explícita (og:image), a menos que ela seja só um logo e exista foto no HTML.
  if (ex && inl) {
    const exLogo = LOGO_HINT.test(ex) && !PHOTO_HINT.test(ex);
    const inlLogo = LOGO_HINT.test(inl) && !PHOTO_HINT.test(inl);
    if (exLogo && !inlLogo) return inl;
  }
  return ex ?? inl;
}

async function fetchImageOnce(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<string | null> {
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
    const text = (await res.text()).slice(0, 400_000);
    return extractWebsiteImage(text, res.url || url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveWebsiteImage(
  website: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const { timeoutMs = 6000, fetchImpl = fetch } = opts;
  const base = String(website ?? "").trim();
  if (!base) return null;
  const primary = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  // Tenta a URL dada e, se falhar, www (ou sem www) — muitos sites só respondem
  // em um dos hosts. Mantém no máximo 2 tentativas para não atrasar a busca.
  const tries: string[] = [primary];
  try {
    const u = new URL(primary);
    const alt = new URL(u);
    alt.hostname = /^www\./i.test(u.hostname) ? u.hostname.replace(/^www\./i, "") : `www.${u.hostname}`;
    tries.push(alt.toString());
  } catch { /* URL inválida */ }
  for (const url of tries) {
    const img = await fetchImageOnce(url, timeoutMs, fetchImpl);
    if (img) return img;
  }
  return null;
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
