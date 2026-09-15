// MAPA estático (tiles OSM) — sem iframe e sem chave de API.
//
// POR QUÊ: o app é cross-origin isolated (COEP) para o WebContainer, e sob COEP
// QUALQUER iframe cross-origin sem CORP é bloqueado pelo Chromium
// (net::ERR_BLOCKED_BY_RESPONSE → "A conexão com maps.google.com foi recusada").
// Imagens, porém, carregam normalmente. Então o mapa do site é montado com tiles
// (imagens) + marcador + botão "Abrir no Google Maps" (link real do Google).
// Comprovado em Chromium: iframes bloqueados, tiles carregando sob credentialless.

import type { BusinessContext } from "../../tools.js";

interface Point { lat: number; lng: number }

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Coordenadas do negócio (só lat/lng; sem geocodificação não há marcador). */
export function businessPoint(business: BusinessContext): Point | null {
  const lat = num(business.latitude);
  const lng = num(business.longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Converte lat/lng em coordenada de tile (fracionária) no zoom Z. */
export function tileCoords(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export interface StaticMap {
  /** URLs dos 4 tiles (2x2) em ordem [topo-esq, topo-dir, baixo-esq, baixo-dir]. */
  tiles: string[];
  /** Posição do marcador em px dentro do bloco 512x512. */
  marker: { x: number; y: number };
}

const TILE = 256;

/** Monta o mapa 2x2 (512px) centrado no ponto, com o marcador na posição exata. */
export function buildStaticMap(point: Point, zoom = 15): StaticMap {
  const { x, y } = tileCoords(point.lat, point.lng, zoom);
  const startX = Math.floor(x - 0.5);
  const startY = Math.floor(y - 0.5);
  const max = 2 ** zoom - 1;
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const tiles: string[] = [];
  for (const dy of [0, 1]) {
    for (const dx of [0, 1]) {
      tiles.push(`https://tile.openstreetmap.org/${zoom}/${clamp(startX + dx)}/${clamp(startY + dy)}.png`);
    }
  }
  return { tiles, marker: { x: Math.round((x - startX) * TILE), y: Math.round((y - startY) * TILE) } };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** URL de rota (Google Maps) — o link REAL do Google para o cliente. */
export function mapsDirectionsUrl(business: BusinessContext): string | null {
  const p = businessPoint(business);
  if (p) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const addr = typeof business.address === "string" ? business.address.trim() : "";
  const place = [business.city, business.state].filter((v) => typeof v === "string" && v.trim()).join("/");
  const q = [addr, place].filter(Boolean).join(", ");
  if (!q) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export interface StaticMapBlockOptions {
  /** Classe Tailwind do container (altura). Default h-[320px]. */
  heightClass?: string;
  /** Rota textual exibida acima/abaixo (ex.: endereço). */
  address?: string | null;
}

/**
 * Bloco JSX pronto do mapa (sem iframe): responde em qualquer contexto COEP,
 * no preview e no publicado. Inclui marcador, atribuição e botão do Google Maps.
 */
export function buildStaticMapBlock(business: BusinessContext, opts: StaticMapBlockOptions = {}): string | null {
  const directions = mapsDirectionsUrl(business);
  const point = businessPoint(business);
  const heightClass = opts.heightClass ?? "h-[320px]";
  const address = (opts.address ?? (typeof business.address === "string" ? business.address : "")) || "";

  // Sem coordenadas: não inventa mapa — devolve bloco de endereço + rota.
  if (!point) {
    if (!directions) return null;
    return [
      `<div className="relative w-full ${heightClass} overflow-hidden rounded-xl border border-black/10 bg-neutral-100">`,
      `  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">`,
      address ? `    <p className="text-sm font-medium text-neutral-800">${esc(address)}</p>` : "",
      `    <a href="${esc(directions)}" target="_blank" rel="noreferrer" className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white">Abrir no Google Maps</a>`,
      `  </div>`,
      `</div>`,
    ].filter(Boolean).join("\n");
  }

  const { tiles, marker } = buildStaticMap(point);
  return [
    `<div className="relative w-full ${heightClass} overflow-hidden rounded-xl border border-black/10 bg-neutral-200">`,
    `  <div className="absolute left-1/2 top-1/2 h-[512px] w-[512px] -translate-x-1/2 -translate-y-1/2">`,
    ...tiles.map((t, i) => {
      const left = (i % 2) * TILE;
      const top = Math.floor(i / 2) * TILE;
      return `    <img src="${t}" alt="" loading="lazy" className="absolute h-[256px] w-[256px]" style={{ left: "${left}px", top: "${top}px" }} />`;
    }),
    `    <span className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-full rounded-full bg-red-600 ring-2 ring-white" style={{ left: "${marker.x}px", top: "${marker.y}px" }} />`,
    `  </div>`,
    directions ? `  <a href="${esc(directions)}" target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 rounded-lg bg-black/75 px-2.5 py-1.5 text-[11px] font-semibold text-white">Abrir no Google Maps</a>` : "",
    `  <span className="absolute bottom-1 left-2 text-[9px] text-black/50">© OpenStreetMap</span>`,
    `</div>`,
  ].filter(Boolean).join("\n");
}
