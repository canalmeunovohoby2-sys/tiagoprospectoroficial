// Pipeline de imagem 100% gratuito — funções PURAS (sem Deno/fetch), para
// serem testáveis e reutilizadas pela Edge Function.
//
// Prioridade: Wikimedia Commons (associado via OSM) > og:image do site oficial
// > imagem principal do HTML > logo/favicon. NUNCA imagem genérica/stock e
// NUNCA imagem de domínio externo ao site do lead.
export type LeadImageSource = "wikimedia" | "website-og" | "website-html" | "website-logo";

export interface LeadImage {
  url: string;
  source: LeadImageSource;
}

const MAX_HTML_CHARS = 400_000;

/** Resolve uma URL possivelmente relativa e valida o protocolo. */
export function resolveAbsoluteUrl(candidate: string | null | undefined, base: string): string | null {
  const raw = (candidate ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

/**
 * A imagem deve pertencer ao próprio domínio do site (ou um subdomínio dele).
 * Bloqueia domínios externos (ads, stock, outro estabelecimento).
 */
export function isAllowedImageHost(imageUrl: string, siteUrl: string): boolean {
  const ih = hostOf(imageUrl);
  const sh = hostOf(siteUrl);
  if (!ih || !sh) return false;
  if (ih === sh) return true;
  if (ih.endsWith("." + sh) || sh.endsWith("." + ih)) return true;
  return registrableDomain(ih) === registrableDomain(sh);
}

function extractMetaContent(html: string, names: string[]): string[] {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const out: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!key || content == null) continue;
    if (wanted.has(key.trim().toLowerCase())) out.push(content);
  }
  return out;
}

/** og:image / twitter:image / link[rel=image_src] do site oficial. */
export function extractOgImage(html: string, pageUrl: string): string | null {
  const metas = extractMetaContent(html.slice(0, MAX_HTML_CHARS), [
    "og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src",
  ]);
  for (const m of metas) {
    const abs = resolveAbsoluteUrl(m, pageUrl);
    if (abs) return abs;
  }
  const link = html.match(/<link\b[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)
    ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']image_src["']/i);
  if (link) {
    const abs = resolveAbsoluteUrl(link[1], pageUrl);
    if (abs) return abs;
  }
  return null;
}

const IMG_NOISE = /logo|icon|sprite|pixel|avatar|placeholder|blank|spacer|badge|flag|loading|spinner/i;

/** Primeira imagem "de conteúdo" do HTML (pula ícones/logos/placeholders). */
export function extractMainImage(html: string, pageUrl: string): string | null {
  for (const tag of html.slice(0, MAX_HTML_CHARS).match(/<img\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || /^data:/i.test(src)) continue;
    if (IMG_NOISE.test(src)) continue;
    const abs = resolveAbsoluteUrl(src, pageUrl);
    if (abs) return abs;
  }
  return null;
}

/** favicon/apple-touch-icon ou <img> com "logo" como último recurso. */
export function extractLogoUrl(html: string, pageUrl: string): string | null {
  const icons = html.match(/<link\b[^>]*>/gi) ?? [];
  const ordered = icons
    .filter((t) => /rel\s*=\s*["'][^"']*(?:apple-touch-icon|icon)[^"']*["']/i.test(t))
    .sort((a, b) => (/(apple-touch-icon)/i.test(a) ? -1 : 0) - (/(apple-touch-icon)/i.test(b) ? -1 : 0));
  for (const tag of ordered) {
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const abs = resolveAbsoluteUrl(href, pageUrl);
    if (abs) return abs;
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    if (/logo|brand/i.test(tag) || /logo|brand/i.test(src)) {
      const abs = resolveAbsoluteUrl(src, pageUrl);
      if (abs) return abs;
    }
  }
  return null;
}

/** Nome de arquivo do Wikimedia Commons referenciado pelo OSM (`File:...`). */
export function extractWikimediaFileName(tags: Record<string, string | undefined> | null | undefined): string | null {
  const raw = String(tags?.["wikimedia_commons"] ?? "").trim();
  if (!raw) return null;
  const fileMatch = raw.match(/^(?:File:)?\s*(.+\.(?:jpe?g|png|webp|gif|tiff?))$/i);
  return fileMatch ? fileMatch[1].trim() : null;
}

/** URL pública e estável para um arquivo do Commons. */
export function wikimediaFilePath(fileName: string, width = 800): string | null {
  const clean = (fileName ?? "").replace(/^File:/i, "").trim().replace(/\s+/g, "_");
  if (!clean || clean.length > 240) return null;
  if (/[<>\u0000-\u001f]/.test(clean)) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=${width}`;
}

export interface PickImageInput {
  siteUrl?: string | null;
  wikimediaFileName?: string | null;
  og?: string | null;
  main?: string | null;
  logo?: string | null;
}

/**
 * Escolhe a melhor imagem pela prioridade definida. Wikimedia é aceita por
 * associação explícita (OSM). Demais candidatos só valem se forem do próprio
 * domínio do site. Sem candidato seguro → null ("Sem imagem").
 */
export function pickLeadImage(input: PickImageInput): LeadImage | null {
  const fileName = (input.wikimediaFileName ?? "").trim();
  if (fileName) {
    const url = wikimediaFilePath(fileName);
    if (url) return { url, source: "wikimedia" };
  }
  const site = (input.siteUrl ?? "").trim();
  if (!site) return null;
  const candidates: Array<{ url: string | null | undefined; source: LeadImageSource }> = [
    { url: input.og, source: "website-og" },
    { url: input.main, source: "website-html" },
    { url: input.logo, source: "website-logo" },
  ];
  for (const c of candidates) {
    const url = (c.url ?? "").trim();
    if (!url) continue;
    if (!isAllowedImageHost(url, site)) continue;
    return { url, source: c.source };
  }
  return null;
}
