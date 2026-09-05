// Infraestrutura de assets/imagens por nicho.
// Define o que cada cluster precisa visualmente, monta queries de busca e
// normaliza assets retornados por provedores (Unsplash por padrão).
// Puro (sem Deno) para testes e edge.

export interface SiteAsset {
  id: string;
  url: string;
  source: "pexels" | "unknown";
  sourceUrl?: string;
  alt: string;
  description?: string;
  isIllustrative: boolean;
  width?: number;
  height?: number;
  aspectRatio?: string;
  license?: string;
}

export interface ImageNeeds {
  cluster: string;
  imageDriven: boolean;
  heroQuery: string;
  secondaryQuery: string;
  galleryCount: number;
  orientation: "landscape" | "portrait";
}

const IMAGE_PLAN: Record<string, Omit<ImageNeeds, "cluster">> = {
  saude_bem_estar: {
    imageDriven: true,
    heroQuery: "modern medical clinic interior clean",
    secondaryQuery: "doctor patient consultation friendly",
    galleryCount: 4,
    orientation: "landscape",
  },
  profissional_consultivo: {
    imageDriven: false,
    heroQuery: "elegant law office meeting room",
    secondaryQuery: "professional handshake business",
    galleryCount: 3,
    orientation: "landscape",
  },
  alimentacao: {
    imageDriven: true,
    heroQuery: "gourmet dish restaurant food",
    secondaryQuery: "restaurant ambiance table setting",
    galleryCount: 5,
    orientation: "landscape",
  },
  arquitetura_design: {
    imageDriven: true,
    heroQuery: "modern architecture facade minimal",
    secondaryQuery: "interior design living room contemporary",
    galleryCount: 6,
    orientation: "landscape",
  },
  automotivo: {
    imageDriven: true,
    heroQuery: "car mechanic workshop professional",
    secondaryQuery: "auto repair garage service",
    galleryCount: 4,
    orientation: "landscape",
  },
  beleza: {
    imageDriven: true,
    heroQuery: "hair salon elegant interior",
    secondaryQuery: "beauty treatment close up",
    galleryCount: 4,
    orientation: "landscape",
  },
  geral: {
    imageDriven: true,
    heroQuery: "modern business storefront small business",
    secondaryQuery: "customer service friendly",
    galleryCount: 4,
    orientation: "landscape",
  },
};

import { getNicheDesign } from "./niche-design.ts";

export function getImageNeeds(segment: string): ImageNeeds {
  const cluster = getNicheDesign(segment).cluster;
  const plan = IMAGE_PLAN[cluster] ?? IMAGE_PLAN.geral;
  return { cluster, ...plan };
}

// Normaliza um resultado bruto de uma API de imagens para SiteAsset.
// Suporta o formato Pexels (photo.src.*, photographer) e o formato antigo
// Unsplash (urls.regular) para compatibilidade.
export function normalizeImageItem(item: unknown, source: "pexels" | "unknown" = "pexels"): SiteAsset | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;

  // Pexels
  const src = r.src && typeof r.src === "object" ? (r.src as Record<string, unknown>) : undefined;
  const url = src ? (typeof src.large2x === "string" ? src.large2x : typeof src.large === "string" ? src.large : typeof src.original === "string" ? src.original : "") : "";
  const id = typeof r.id === "number" || typeof r.id === "string" ? String(r.id) : "";
  const alt = typeof r.alt === "string" && r.alt.trim() ? r.alt.trim() : "";
  if (src && url) {
    const w = typeof r.width === "number" ? r.width : undefined;
    const h = typeof r.height === "number" ? r.height : undefined;
    return {
      id: `pexels-${id}`,
      url,
      source: "pexels",
      sourceUrl: typeof r.url === "string" ? r.url : undefined,
      alt,
      description: typeof r.photographer === "string" ? `Foto por ${r.photographer}` : undefined,
      isIllustrative: true,
      width: w,
      height: h,
      aspectRatio: w && h ? `${w}:${h}` : undefined,
      license: "Pexels License",
    };
  }

  // Unsplash (legado)
  const urls = r.urls && typeof r.urls === "object" ? (r.urls as Record<string, unknown>) : {};
  const legacyUrl = typeof urls.regular === "string" ? urls.regular : typeof r.url === "string" ? r.url : "";
  if (!legacyUrl || !/^https:\/\//i.test(legacyUrl)) return null;
  const lw = typeof r.width === "number" ? r.width : undefined;
  const lh = typeof r.height === "number" ? r.height : undefined;
  const links = r.links && typeof r.links === "object" ? (r.links as Record<string, unknown>) : {};
  return {
    id: String(r.id ?? legacyUrl),
    url: legacyUrl,
    source: "unknown",
    sourceUrl: typeof links.html === "string" ? links.html : undefined,
    alt: typeof r.alt_description === "string" ? r.alt_description : "",
    description: typeof r.description === "string" ? r.description : undefined,
    isIllustrative: true,
    width: lw,
    height: lh,
    aspectRatio: lw && lh ? `${lw}:${lh}` : undefined,
    license: "Unsplash License",
  };
}

export function normalizeImageList(raw: unknown, source: "pexels" | "unknown" = "pexels"): SiteAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteAsset[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const asset = normalizeImageItem(item, source);
    if (!asset) continue;
    if (seen.has(asset.url)) continue;
    seen.add(asset.url);
    out.push(asset);
  }
  return out;
}

// Seleciona sem repetição a partir de um pool (evita duplicadas entre planos).
export function selectAssets(pool: SiteAsset[], count: number, skip: Set<string> = new Set()): SiteAsset[] {
  const chosen: SiteAsset[] = [];
  for (const asset of pool) {
    if (skip.has(asset.id) || skip.has(asset.url)) continue;
    chosen.push(asset);
    skip.add(asset.id);
    skip.add(asset.url);
    if (chosen.length >= count) break;
  }
  return chosen;
}

// Compatibilidade: aceita URL string antiga ou asset estruturado.
export function resolveImageUrl(value: unknown): { url: string; alt: string; source?: string } | null {
  if (typeof value === "string" && value.trim() && /^https?:\/\//i.test(value.trim())) {
    return { url: value.trim(), alt: "" };
  }
  if (value && typeof value === "object") {
    const r = value as Record<string, unknown>;
    if (typeof r.url === "string" && /^https?:\/\//i.test(r.url)) {
      return { url: r.url, alt: typeof r.alt === "string" ? r.alt : "", source: typeof r.source === "string" ? r.source : undefined };
    }
  }
  return null;
}
