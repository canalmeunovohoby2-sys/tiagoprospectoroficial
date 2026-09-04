import type { Lead } from "@/data/types";

/**
 * Resolve a Google Maps URL para um lead com validação de confiança.
 *
 * Ordem de prioridade (só frontend, não altera banco/busca):
 * 1. URL oficial retornada pelo Google Places (googleMapsUri / p.url).
 *    Detectada por padrões estáveis: `place_id:`, `/maps/place/`,
 *    `goo.gl/maps`, `maps.app.goo.gl`, ou `cid=` em maps.google.com.
 * 2. URL construída via `place_id` (também tratada como oficial).
 * 3. Coordenadas reais (lat/lon) — quando o `google_url` já é
 *    `google.com/maps/search/?api=1&query=<lat>,<lon>` vindo do
 *    OSM/Overpass, marcamos como "aproximada" (não validada pelo Google).
 * 4. Fallback textual: busca por nome + endereço no Google Maps.
 *    Marcado como "não validada".
 *
 * Quando não há nada confiável, retorna `url: null` para a UI mostrar
 * "Localização não validada" em vez de abrir um mapa incorreto.
 */

export type MapConfidence = "validated" | "coords" | "search" | "none";

export interface MapResolution {
  url: string | null;
  confidence: MapConfidence;
  label: string;
  tooltip: string;
}

const OFFICIAL_PATTERNS: RegExp[] = [
  /place_id[:=]/i,
  /google\.com\/maps\/place\//i,
  /maps\.app\.goo\.gl/i,
  /goo\.gl\/maps/i,
  /maps\.google\.[^/]+\/\?[^ ]*cid=/i,
];

const COORD_SEARCH = /google\.com\/maps\/search\/\?api=1&query=-?\d+(\.\d+)?,-?\d+(\.\d+)?/i;

function isFiniteCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n !== 0;
}

export function resolveLeadMap(lead: Pick<Lead, "google_url" | "latitude" | "longitude" | "name" | "address" | "city" | "state">): MapResolution {
  const raw = (lead.google_url ?? "").trim();

  // 1º — URL oficial do Google Places
  if (raw && OFFICIAL_PATTERNS.some((rx) => rx.test(raw))) {
    return {
      url: raw,
      confidence: "validated",
      label: "Google Maps",
      tooltip: "Localização validada pelo Google Places.",
    };
  }

  // 3º — coordenadas reais (quando o google_url é um search por lat/lon)
  if (raw && COORD_SEARCH.test(raw) && isFiniteCoord(lead.latitude) && isFiniteCoord(lead.longitude)) {
    // Reconstrói a URL com as coordenadas do próprio lead para evitar
    // string manipulada; mesmo assim marcamos como aproximada.
    const url = `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`;
    return {
      url,
      confidence: "coords",
      label: "Localização aproximada",
      tooltip: "Coordenadas vindas de fonte alternativa (OpenStreetMap). Pode não corresponder ao endereço exato.",
    };
  }

  // 3º (bis) — sem google_url, mas com lat/lon válidas
  if (!raw && isFiniteCoord(lead.latitude) && isFiniteCoord(lead.longitude)) {
    return {
      url: `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`,
      confidence: "coords",
      label: "Localização aproximada",
      tooltip: "Coordenadas de fonte alternativa — sem confirmação do Google Places.",
    };
  }

  // 4º — fallback textual (nome + endereço)
  const parts = [lead.name, lead.address, lead.city, lead.state].filter(Boolean).join(", ").trim();
  if (parts) {
    return {
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`,
      confidence: "search",
      label: "Buscar no Google Maps",
      tooltip: "Sem localização confirmada — abre uma busca por nome e endereço no Google Maps.",
    };
  }

  return {
    url: null,
    confidence: "none",
    label: "Localização não validada",
    tooltip: "Este lead não possui place_id, coordenadas confiáveis nem endereço suficiente.",
  };
}

export function mapConfidenceBadgeClass(c: MapConfidence): string {
  switch (c) {
    case "validated": return "border-emerald-500/40 text-emerald-500 bg-emerald-500/5";
    case "coords":    return "border-amber-500/40 text-amber-500 bg-amber-500/5";
    case "search":    return "border-sky-500/40 text-sky-500 bg-sky-500/5";
    case "none":      return "border-muted-foreground/30 text-muted-foreground bg-muted/20";
  }
}

export function mapConfidenceShort(c: MapConfidence): string {
  switch (c) {
    case "validated": return "Validada";
    case "coords":    return "Aproximada";
    case "search":    return "Busca";
    case "none":      return "Sem localização";
  }
}
