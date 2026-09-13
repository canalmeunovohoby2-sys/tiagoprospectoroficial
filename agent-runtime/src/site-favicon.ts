// ============================================================================
// FAVICON DO CLIENTE (identidade do site) — determinístico, sem IA/API.
//
// PROBLEMA: as bases não traziam <link rel="icon">; sem favicon no HTML, o
// navegador caía no /favicon.ico da ORIGEM (o do Prospector) na aba do cliente.
//
// SOLUÇÃO (na origem do fluxo): o site do cliente SEMPRE recebe um favicon
// PRÓPRIO e relativo ao projeto:
//   1) se existir a logo do cliente no workspace (assets/brand/*.svg), usa o
//      SÍMBOLO/ícone dela — reutiliza o asset existente, não gera outra imagem;
//   2) senão, um monograma SVG do próprio cliente (iniciais + cor do briefing),
//      criado localmente e isolado por projeto.
// Nunca usa asset/caminho do Prospector, nunca usa caminho absoluto/localhost.
// ============================================================================

export interface FaviconBusiness {
  name?: string | null;
  segment?: string | null;
}

/** Paleta (só o que o favicon usa) — estrutural para aceitar os Design Tokens. */
export interface FaviconPalette {
  primary?: string | null;
  cta?: string | null;
}

type FileMap = Record<string, string>;

const FAVICON_ASSET = "assets/favicon.svg";

/** Iniciais do negócio (1–2 letras) para o monograma. Sem IA. */
export function clientInitials(name: string | null | undefined): string {
  const words = String(name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(de|da|do|das|dos|e|y|and|and|the|o|a|os|as|la|el)$/i.test(w));
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function toHex(color: string | null | undefined): string | null {
  const c = String(color ?? "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const full = /^#([0-9a-f]{6})$/i.exec(c);
  return full ? `#${full[1]}` : null;
}

function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Cor de contraste legível sobre um fundo. */
function contrastOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 150 ? "#0b1220" : "#ffffff";
}

function escapeXml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Monograma SVG do cliente (fundo na cor da marca, iniciais em contraste).
 * Determinístico e específico do negócio — nunca a marca do Prospector.
 */
export function buildClientMonogramFavicon(
  business: FaviconBusiness,
  palette?: FaviconPalette | null,
): string {
  const name = String(business.name ?? "").trim() || "Cliente";
  const seg = String(business.segment ?? "").trim();
  const primary = toHex(palette?.primary ?? palette?.cta) ?? `hsl(${hueFor(name + seg)} 52% 34%)`;
  const onPrimary = toHex(primary) ? contrastOn(primary) : "#ffffff";
  const initials = escapeXml(clientInitials(name));
  const label = escapeXml(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${label}">
  <rect width="64" height="64" rx="14" fill="${primary}"/>
  <text x="32" y="42.5" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="30" font-weight="700" fill="${onPrimary}" letter-spacing="0.5">${initials}</text>
</svg>
`;
}

/** Escolhe o MELHOR asset de logo existente para favicon (símbolo > ícone > principal). */
export function pickClientBrandAsset(files: FileMap): string | null {
  const brand = Object.keys(files).filter((p) => /(^|\/)assets\/brand\/[^/]+\.svg$/i.test(p) || /^assets\/brand\/.+\.svg$/i.test(p));
  if (brand.length === 0) return null;
  const score = (p: string): number => {
    const n = p.toLowerCase();
    if (/(symbol|simbolo|monogram|mark|icone|icon)\b/.test(n) || /(symbol|simbolo|monogram|mark|icone|icon)\./.test(n)) return 0;
    if (/favicon/.test(n)) return 1;
    if (/(primary|principal)/.test(n)) return 2;
    return 3; // horizontal/vertical/mono/negative/etc.
  };
  return [...brand].sort((a, b) => score(a) - score(b) || a.localeCompare(b))[0];
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Garante o link do favicon do cliente no <head> (removendo resquícios herdados). */
export function ensureFaviconLink(html: string, href: string): string {
  // Remove QUALQUER link de ícone herdado (Prospector/absoluto/externo/ico antigo).
  let out = html.replace(
    /<link\b[^>]*\brel\s*=\s*["'](?:shortcut\s+icon|icon|apple-touch-icon(?:-precomposed)?|mask-icon)["'][^>]*>\s*/gi,
    "",
  );
  const tags =
    `  <link rel="icon" type="image/svg+xml" href="${href}" />\n` +
    `  <link rel="apple-touch-icon" href="${href}" />\n`;
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${tags}</head>`);
  return `${out}\n${tags}`;
}

/** Corrige vazamento do nome do Prospector no <title> (se existir). */
export function ensureClientTitle(html: string, business: FaviconBusiness): string {
  const name = String(business.name ?? "").trim();
  if (!name) return html;
  return html.replace(/<title>([\s\S]*?)<\/title>/i, (full, inner: string) => {
    if (!/prospector|leadhunter/i.test(inner)) return full;
    const seg = String(business.segment ?? "").trim();
    return `<title>${escapeHtml(name)}${seg ? ` — ${escapeHtml(seg)}` : ""}</title>`;
  });
}

export interface FaviconResult {
  files: FileMap;
  changed: boolean;
  href: string;
  source: "logo" | "existing" | "monogram";
}

/**
 * Aplica o favicon do cliente no mapa de arquivos do projeto (index.html + asset).
 * Reutiliza a logo do cliente quando existe; senão cria o monograma local.
 */
export function ensureClientFavicon(
  files: FileMap,
  business: FaviconBusiness,
  palette?: FaviconPalette | null,
): FaviconResult {
  const out: FileMap = { ...files };
  let href: string;
  let source: FaviconResult["source"];
  let changed = false;

  const brandAsset = pickClientBrandAsset(out);
  if (brandAsset) {
    href = `./${brandAsset.replace(/^\.\//, "")}`;
    source = "logo";
  } else if (out[FAVICON_ASSET] && out[FAVICON_ASSET].trim()) {
    href = `./${FAVICON_ASSET}`;
    source = "existing";
  } else {
    out[FAVICON_ASSET] = buildClientMonogramFavicon(business, palette);
    href = `./${FAVICON_ASSET}`;
    source = "monogram";
    changed = true;
  }

  for (const [path, content] of Object.entries(out)) {
    if (!/\.html?$/i.test(path)) continue;
    if (!/<head[\s>]/i.test(content)) continue;
    const next = ensureClientTitle(ensureFaviconLink(content, href), business);
    if (next !== content) {
      out[path] = next;
      changed = true;
    }
  }

  return { files: out, changed, href, source };
}

/** Sanidade: nenhum sinal do Prospector/absoluto/localhost em qualquer arquivo. */
export function hasProspectorFaviconLeak(files: FileMap): boolean {
  for (const [path, content] of Object.entries(files)) {
    if (!/\.html?$/i.test(path)) continue;
    if (/prospector|leadhunter/i.test(content)) return true;
    for (const tag of content.match(/<link\b[^>]*\brel\s*=\s*["'](?:shortcut\s+icon|icon|apple-touch-icon(?:-precomposed)?)["'][^>]*>/gi) ?? []) {
      const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) ?? [])[1] ?? "";
      if (!href) continue;
      if (/^(?:https?:)?\/\//i.test(href)) return true; // externo/absoluto
      if (/^\/favicon/i.test(href)) return true; // raiz da origem → Prospector
      if (/localhost|127\.0\.0\.1/i.test(href)) return true;
      if (/prospector/i.test(href)) return true;
    }
  }
  return false;
}
