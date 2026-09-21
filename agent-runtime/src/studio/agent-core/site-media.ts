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
import { buildStaticMapBlock, injectMapRuntimeIntoHtml, mapsDirectionsUrl as staticMapDirectionsUrl, businessPoint } from "./static-map.js";

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

/** Imagens ilustrativas/stock válidas (dedup), nunca confundidas com fotos reais. */export function stockImages(business: BusinessContext): string[] {
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

// `src` de <iframe> apontando para o Google Maps — cobre as formas:
//   src="https://..."   src='https://...'   src={"https://..."}   src={'https://...'}
// Somente iframes (links de rota/WhatsApp em <a href> NÃO são tocados).
const IFRAME_GOOGLE_MAPS_SRC = /(<iframe\b[^>]*?\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)')\s*\})/gi;

/**
 * Garante que o <iframe> do Google Maps use a URL EMBUTÍVEL canônica
 * (`output=embed`). O modelo às vezes escreve a URL "normal" do Maps (ex.:
 * `/maps/place/...`, sem `output=embed`), que o Google BLOQUEIA em iframe
 * ("recusou a conexão"). Não altera embeds já válidos (`/maps/embed` ou
 * `output=embed`) nem links comuns (<a href>), apenas o `src` de iframes do Maps.
 */
export function normalizeMapEmbedUrls(text: string, canonicalEmbedUrl: string): string {
  if (!text || !canonicalEmbedUrl) return text;
  return text.replace(IFRAME_GOOGLE_MAPS_SRC, (full, pre: string, dq?: string, sq?: string, jdq?: string, jsq?: string) => {
    const isExpr = jdq !== undefined || jsq !== undefined;
    const url = dq ?? sq ?? jdq ?? jsq ?? "";
    if (!/google\./i.test(url) || !/\/maps/i.test(url)) return full;
    if (/\/maps\/embed/i.test(url) || /[?&]output=embed/i.test(url)) return full;
    const q = isExpr ? '"' : (dq !== undefined ? '"' : "'");
    const value = isExpr ? `{${q}${canonicalEmbedUrl}${q}}` : `${q}${canonicalEmbedUrl}${q}`;
    return `${pre}${value}`;
  });
}

/**
 * FASE 7.7 — Sem coordenadas/endereço, o iframe de mapa do modelo é bloqueado
 * (COEP) e vira ÁREA BRANCA. Aqui ele é trocado por um card honesto (endereço
 * quando houver + link real do Google Maps) ou simplesmente removido.
 */
function replaceBrokenMapEmbeds(root: string, business: BusinessContext): string[] {
  const IFRAME = /<iframe\b(?=[^>]*(?:google|maps|data-pf-gmap|\bsrc\s*=\s*\{))[^>]*(?:\/>|>[\s\S]*?<\/iframe>)/gi;
  const address = cleanText(business.address);
  const name = cleanText(business.name);
  const city = cleanText(business.city);
  const link = staticMapDirectionsUrl(business)
    ?? (name || city ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, city, business.state].filter(Boolean).join(" "))}` : "");
  const label = address || [name, city].filter(Boolean).join(" — ") || "";
  const cardJsx = label
    ? `<div className="rounded-xl border border-black/10 bg-neutral-100 p-4 text-center" style={{ padding: "16px", textAlign: "center", border: "1px solid rgba(0,0,0,.1)", borderRadius: "12px" }}><p style={{ margin: "0 0 8px", fontSize: "14px" }}>📍 ${label}</p>${link ? `<a href="${link}" target="_blank" rel="noreferrer" style={{ display: "inline-block", fontWeight: 600 }}>Abrir no Google Maps</a>` : ""}</div>`
    : "";
  const changed: string[] = [];
  for (const [rel, content] of Object.entries(readWorkspace(root))) {
    if (!/\.(tsx|jsx|html?)$/i.test(rel)) continue;
    if (!IFRAME.test(content)) { IFRAME.lastIndex = 0; continue; }
    IFRAME.lastIndex = 0;
    const next = content.replace(IFRAME, cardJsx);
    if (next !== content) {
      const full = safeWorkspaceJoin(root, rel);
      if (!full) continue;
      try { writeFileSync(full, next, "utf8"); changed.push(rel); } catch { /* ignora */ }
    }
  }
  return changed;
}

/**
 * Substitui qualquer <iframe> de Google Maps pelo MAPA ESTÁTICO (tiles + marcador).
 * MOTIVO (comprovado em Chromium): o site roda em contexto COEP (necessário ao
 * WebContainer) e QUALQUER iframe cross-origin sem CORP é bloqueado ali
 * ("A conexão com maps.google.com foi recusada"). Imagens carregam normalmente.
 */
export function normalizeWorkspaceMapEmbeds(root: string, business: BusinessContext): string[] {
  const block = buildStaticMapBlock(business);
  // FASE 7.10 — HTML recebe o bloco em sintaxe HTML (iframe fechado, style string);
  // JSX/TSX recebe JSX. Sem isso, em .html o iframe auto-fechado engolia o resto.
  const blockHtml = buildStaticMapBlock(business, { syntax: "html" });
  // FASE 7.7 — SEM bloco (sem coordenadas/endereço) o iframe do modelo ficava no
  // site e era BLOQUEADO pelo COEP → área branca no lugar do mapa. Agora trocamos
  // por um card honesto (endereço quando existir + link do Google Maps) ou
  // removemos o iframe quebrado — NUNCA deixamos a área branca.
  if (!block) return replaceBrokenMapEmbeds(root, business);
  const changed: string[] = [];
  const IFRAME = /<iframe\b(?=[^>]*(?:google|maps|data-pf-gmap|\bsrc\s*=\s*\{))[^>]*(?:\/>|>[\s\S]*?<\/iframe>)/gi;
  const files = readWorkspace(root);
  let needsRuntime = false;
  // O runtime do mapa é necessário SEMPRE que houver um bloco de mapa (escrito pelo
  // modelo OU trocado por nós) — antes ele só era injetado quando NÓS trocávamos um
  // iframe, então um mapa escrito pelo modelo ficava sem interatividade.
  for (const [rel, content] of Object.entries(files)) {
    if (!/\.(tsx|jsx|ts|js|html?)$/i.test(rel)) continue;
    let next = content;
    // Troca QUALQUER iframe de mapa — inclusive src={variavel} (ex.: const mapSrc
    // = "...google.com/maps...") e o bloco ANTIGO marcado data-pf-gmap, que trazia
    // iframe e escondia o mosaico. Antes a proteção do data-pf-gmap preservava o
    // bloco velho e o mapa nunca era atualizado.
    const repl = /\.html?$/i.test(rel) ? (blockHtml ?? block) : block;
    const looksGoogle = /data-pf-gmap/i.test(content) || /google\.com\/maps|maps\.google\./i.test(content);
    if (looksGoogle) {
      IFRAME.lastIndex = 0;
      // O NOSSO iframe (data-pf-gmap, dentro do bloco com data-pf-map) NÃO é
      // trocado — idempotência: senão a normalização duplicaria o bloco.
      next = content.replace(IFRAME, (m) => (/data-pf-gmap/i.test(m) ? m : repl));
    }
    if (next.includes("data-pf-map") || next.includes("data-pf-map-ready")) needsRuntime = true;
    if (next === content) continue;
    const abs = safeWorkspaceJoin(root, rel);
    if (!abs) continue;
    try { writeFileSync(abs, next, "utf8"); changed.push(rel); } catch { /* noop */ }
  }
  // Se o projeto TEM coordenadas, garante o runtime no index.html (idempotente e
  // inócuo quando não há mapa na página) — assim o mapa funciona no preview e no publicado.
  if (!needsRuntime && businessPoint(business)) needsRuntime = true;
  // O mapa INTERATIVO precisa do runtime (vanilla, sem dependências) no index.html
  // — funciona no preview E no publicado (tiles são imagens; iframe é bloqueado).
  const html = readWorkspace(root)["index.html"];
  if (needsRuntime && typeof html === "string") {
    const abs = safeWorkspaceJoin(root, "index.html");
    if (abs) {
      try {
        const out = injectMapRuntimeIntoHtml(html);
        if (out !== html) { writeFileSync(abs, out, "utf8"); changed.push("index.html"); }
      } catch { /* noop */ }
    }
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

  const staticBlock = buildStaticMapBlock(business);
  const directions = staticMapDirectionsUrl(business);
  const address = cleanText(business.address);

  lines.push(
    "LOCALIZAÇÃO + MAPA (OBRIGATÓRIO nesta entrega):",
    "  - NUNCA use <iframe> do Google Maps: neste site ele é BLOQUEADO (o site roda isolado por COEP e o Google recusa a conexão).",
    staticBlock
      ? `  - COPIE ESTE BLOCO de mapa (mosaico de imagens + marcador + botão \"Abrir no Google Maps\"); não invente outra URL de mapa e não troque as imagens:\n${staticBlock}`
      : "  - SEM coordenadas/endereço confiáveis: NÃO invente localização; omita a seção de mapa.",
    directions ? `  - Link REAL do Google Maps (rota) para o botão: ${directions}` : "",
    address ? `  - Endereço real: ${address}` : "",
    "  - Mantenha o mapa responsivo (o bloco já tem altura definida) e o botão \"Abrir no Google Maps\" sempre visível.",
    "REGRAS DE IMAGEM (evitam foto quebrada):",
    "  - Todo <img> DEVE ter referrerPolicy=\"no-referrer\" (evita bloqueio de hotlink), alt descritivo e loading=\"lazy\" abaixo da primeira dobra.",
    "  - Todo <img> DEVE ter onError que esconde a imagem (ex.: e.currentTarget.style.display=\"none\") ou troca por um bloco de cor — NUNCA deixe aparecer o ícone de imagem quebrada nem caixa vazia.",
  );

  return `\n\n${lines.filter(Boolean).join("\n")}`;
}

/**
 * VALIDA as imagens de verdade (HTTP) ANTES de entrarem no site.
 *
 * Motivo (regressão de imagens): fotos de lead podem ser URLs mortas (proxy do
 * Google Places sem resposta, og:image com hotlink bloqueado, thumbnail expirada).
 * O Coder recebia a URL e, com o onError que esconde imagem quebrada, o site ficava
 * SEM imagem nenhuma. Aqui o runtime testa cada URL (HEAD → GET com Range) e só
 * entrega ao Coder as que REALMENTE respondem imagem. URL morta nunca entra.
 */
export async function filterWorkingImages(urls: string[], opts?: { timeoutMs?: number }): Promise<string[]> {
  const timeoutMs = opts?.timeoutMs ?? 4500;
  const signal = (): AbortSignal | undefined => {
    try { return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined; }
    catch { return undefined; }
  };
  const usable = new Set<string>();
  await Promise.all((urls ?? []).map(async (raw) => {
    const url = String(raw ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return;
    const attempt = async (init: RequestInit): Promise<boolean> => {
      try {
        const res = await fetch(url, { ...init, redirect: "follow", ...(signal() ? { signal: signal() } : {}) });
        if (!res.ok) return false;
        const type = (res.headers.get("content-type") ?? "").toLowerCase();
        // Sem content-type confiável não dá para garantir imagem → exige image/*
        return type.startsWith("image/");
      } catch { return false; }
    };
    if (await attempt({ method: "HEAD" })) { usable.add(url); return; }
    if (await attempt({ method: "GET", headers: { Range: "bytes=0-0" } })) { usable.add(url); return; }
  }));
  // Preserva a ordem original, sem duplicatas.
  return urls.filter((u, i) => usable.has(u) && urls.indexOf(u) === i);
}

/**
 * Junta imagens VALIDADAS (primeiro) com as originais que não validaram.
 * Garante que a validação HTTP NUNCA reduza a lista — antes, uma falha de rede do
 * runtime deixava o site SEM FOTO NENHUMA.
 */
export function mergeValidatedImages(original: string[], validated: string[]): string[] {
  const ok = new Set(validated);
  const rest = (original ?? []).filter((u) => typeof u === "string" && u && !ok.has(u));
  return [...(validated ?? []), ...rest];
}
