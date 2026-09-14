// Contexto de MÍDIA e LOCALIZAÇÃO do site (React Studio).
//
// Ponto ÚNICO que transforma os dados reais do cliente (fotos, endereço,
// geo/place) em:
//   - URLs prontas de Google Maps (embed/rota) — SEM API key;
//   - um bloco textual para o Coder.
// Reutiliza o MESMO padrão do gerador legado (`maps.google.com/maps?q=...&
// output=embed`, exigido por `generation-gate.ts`), que funciona no publicado.
//
// Regra de ouro: NUNCA inventar endereço nem URL de imagem. Sem dado → omite.

import type { BusinessContext } from "../../tools.js";
import { readWorkspace, safeWorkspaceJoin } from "../../workspace.js";
import { writeFileSync } from "node:fs";

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^https?:\/\//i.test(v);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Fotos REAIS válidas (dedup, só http/https), na ordem recebida. */
export function realPhotos(business: BusinessContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of business.photos ?? []) {
    if (!isHttpUrl(raw)) continue;
    const url = raw.trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Imagens ilustrativas/stock válidas (dedup), nunca confundidas com fotos reais. */
export function stockImages(business: BusinessContext): string[] {
  const real = new Set(realPhotos(business));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of business.stockImages ?? []) {
    if (!isHttpUrl(raw)) continue;
    const url = raw.trim();
    if (real.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function coord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Consulta textual para o mapa, em ordem de precisão:
 *   lat,lng → endereço(+cidade/UF) → nome+cidade/UF → cidade/UF.
 * Sem nenhum dado confiável → null (o mapa NÃO é inventado).
 */
export function pickMapQuery(business: BusinessContext): { query: string; zoom: number } | null {
  const lat = coord(business.latitude);
  const lng = coord(business.longitude);
  if (lat !== null && lng !== null) return { query: `${lat},${lng}`, zoom: 16 };

  const address = cleanText(business.address);
  const city = cleanText(business.city);
  const state = cleanText(business.state);
  const place = [city, state].filter(Boolean).join("/");
  if (address) return { query: [address, place].filter(Boolean).join(", "), zoom: 16 };

  const name = cleanText(business.name);
  if (name && place) return { query: `${name}, ${place}`, zoom: 15 };
  if (place) return { query: place, zoom: 13 };
  return null;
}

/** URL de embed responsável pelo Google Maps (padrão legado, sem api key). */
export function buildMapEmbedUrl(business: BusinessContext): string | null {
  const picked = pickMapQuery(business);
  if (!picked) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(picked.query)}&z=${picked.zoom}&output=embed`;
}

/** URL oficial de ROTA (Maps URLs API; usa place_id quando disponível). */
export function buildMapDirectionsUrl(business: BusinessContext): string | null {
  const picked = pickMapQuery(business);
  if (!picked) return null;
  const params = new URLSearchParams({ api: "1", destination: picked.query });
  const placeId = cleanText(business.placeId);
  if (placeId && /^[A-Za-z0-9_-]{10,}$/.test(placeId)) params.set("destination_place_id", placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// `src` de <iframe> apontando para o Google Maps (somente iframes — links de
// rota/WhatsApp em <a href> NÃO são tocados).
const IFRAME_GOOGLE_MAPS_SRC = /(<iframe\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*google\.[^"']*\/maps[^"']*)\2/gi;

/**
 * Garante que o <iframe> do Google Maps use a URL EMBUTÍVEL canônica
 * (`output=embed`). O modelo às vezes escreve a URL "normal" do Maps (ex.: sem
 * `output=embed`), que o Google BLOQUEIA em iframe: "recusou a conexão".
 * Não altera embeds já válidos (`/maps/embed` ou `output=embed`) nem links
 * comuns (<a href>), apenas o `src` de iframes do Maps.
 */
export function normalizeMapEmbedUrls(text: string, canonicalEmbedUrl: string): string {
  if (!text || !canonicalEmbedUrl) return text;
  return text.replace(IFRAME_GOOGLE_MAPS_SRC, (full, pre: string, quote: string, url: string) => {
    if (/\/maps\/embed/i.test(url) || /[?&]output=embed/i.test(url)) return full;
    return `${pre}${quote}${canonicalEmbedUrl}${quote}`;
  });
}

/**
 * Normaliza os embeds de mapa nos arquivos REAIS do projeto (determinístico).
 * Devolve os caminhos alterados (para o front reaplicar os arquivos).
 */
export function normalizeWorkspaceMapEmbeds(root: string, business: BusinessContext): string[] {
  const canonical = buildMapEmbedUrl(business);
  if (!canonical) return [];
  const changed: string[] = [];
  for (const [rel, content] of Object.entries(readWorkspace(root))) {
    if (!/\.(tsx|jsx|ts|js|html?|css)$/i.test(rel)) continue;
    if (!/google\./i.test(content) || !/maps/i.test(content)) continue;
    const next = normalizeMapEmbedUrls(content, canonical);
    if (next === content) continue;
    const abs = safeWorkspaceJoin(root, rel);
    if (!abs) continue;
    try { writeFileSync(abs, next, "utf8"); changed.push(rel); } catch { /* noop */ }
  }
  return changed;
}

export interface SiteMediaContext {
  photos: string[];
  stock: string[];
  mapEmbedUrl: string | null;
  mapDirectionsUrl: string | null;
  hasLocation: boolean;
}

export function buildSiteMediaContext(business: BusinessContext): SiteMediaContext {
  const photos = realPhotos(business);
  const stock = stockImages(business);
  const mapEmbedUrl = buildMapEmbedUrl(business);
  const mapDirectionsUrl = buildMapDirectionsUrl(business);
  return { photos, stock, mapEmbedUrl, mapDirectionsUrl, hasLocation: !!mapEmbedUrl };
}

/**
 * Bloco textual com os DADOS REAIS de mídia/localização + as regras de uso.
 * Injetado a cada turno do Coder (fatos sempre presentes).
 */
export function mediaContextBlock(business: BusinessContext): string {
  const { photos, stock, mapEmbedUrl, mapDirectionsUrl } = buildSiteMediaContext(business);
  const lines: string[] = [];

  if (photos.length > 0) {
    lines.push(
      "IMAGENS REAIS DO CLIENTE (use EXATAMENTE estas URLs em <img src>; NUNCA invente/adivinhe URL de imagem):",
      ...photos.slice(0, 12).map((u, i) => `  ${i + 1}. ${u}`),
    );
  } else {
    lines.push("IMAGENS REAIS DO CLIENTE: nenhuma disponível. NÃO invente fotos do estabelecimento nem use <img> quebrada.");
  }

  if (stock.length > 0) {
    lines.push(
      "IMAGENS ILUSTRATIVAS DISPONÍVEIS (stock do sistema — use como apoio visual; NÃO são do cliente, NÃO afirme que são):",
      ...stock.slice(0, 12).map((u, i) => `  ${i + 1}. ${u}`),
    );
  }

  lines.push(
    "LOCALIZAÇÃO + GOOGLE MAPS (OBRIGATÓRIO nesta entrega):",
    mapEmbedUrl
      ? `  - <iframe> de mapa (responsivo, sem api key): ${mapEmbedUrl}`
      : "  - SEM dados de endereço/cidade confiáveis: NÃO invente endereço nem mapa; omita a seção de mapa.",
    mapDirectionsUrl ? `  - Botão \"Abrir rota\": ${mapDirectionsUrl}` : "",
    cleanText(business.address) ? `  - Endereço real: ${cleanText(business.address)}` : "",
    mapEmbedUrl
      ? `  - COPIE ESTE SNIPPET (não invente outra URL de mapa; só ajuste classes/estilo se quiser): <iframe title="Localização" src="${mapEmbedUrl}" className="w-full h-[320px] rounded-xl border-0" loading="lazy" referrerPolicy="no-referrer" />`
      : "",
    "  - O <iframe> do mapa DEVE ter altura definida (ex.: h-[320px]) para não colapsar. SEMPRE inclua também um link/botão \"Abrir no Google Maps\" (rota) ao lado — a localização funciona mesmo se o iframe for bloqueado.",
    "REGRAS DE IMAGEM (evitam foto quebrada):",
    "  - Todo <img> DEVE ter referrerPolicy=\"no-referrer\" (evita bloqueio de hotlink), alt descritivo e loading=\"lazy\" abaixo da primeira dobra.",
    "  - Todo <img> DEVE ter onError que esconde a imagem (ex.: e.currentTarget.style.display=\"none\") ou troca por um bloco de cor — NUNCA deixe aparecer o ícone de imagem quebrada nem caixa vazia.",
  );

  return `\n\n${lines.filter(Boolean).join("\n")}`;
}
