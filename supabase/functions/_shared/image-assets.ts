// Infraestrutura de assets/imagens por nicho.
// Define o que cada cluster precisa visualmente, monta queries de busca e
// normaliza assets retornados por provedores (Pexels por padrão).
// Puro (sem Deno) para testes e edge.

import { getNicheDesign } from "./niche-design.ts";

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
  pet_care: {
    imageDriven: true,
    heroQuery: "dog grooming pet care bath",
    secondaryQuery: "dog happy pet veterinary",
    galleryCount: 5,
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

// Queries específicas por seção (hero, gallery, trust/features, about) e cluster.
// Permite buscar imagens com art direction mais precisa por bloco da página.
const SECTION_IMAGE_QUERIES: Record<string, Partial<Record<string, string>>> = {
  saude_bem_estar: {
    hero: "modern clinic reception welcoming clean",
    gallery: "healthcare professional caring patient environment",
    trust: "medical team trust certification clean",
    about: "clinic interior warm lighting waiting room",
  },
  profissional_consultivo: {
    hero: "law office library wood paneling serious",
    gallery: "business meeting conference table professional",
    trust: "lawyer badge courtroom architectural detail",
    about: "corporate office architecture glass building",
  },
  alimentacao: {
    hero: "restaurant dish gourmet plating delicious",
    gallery: "restaurant interior table wine glasses ambiance",
    trust: "chef kitchen professional cooking fresh",
    about: "dining room warm lighting terrace seating",
  },
  arquitetura_design: {
    hero: "modern architecture concrete glass facade minimal",
    gallery: "interior design living room contemporary minimal",
    trust: "architectural detail staircase material texture",
    about: "design studio workspace creative minimal",
  },
  automotivo: {
    hero: "auto repair shop mechanic garage professional",
    gallery: "car service workshop tools diagnostic",
    trust: "mechanic working quality certification garage",
    about: "automotive workshop entrance storefront",
  },
  pet_care: {
    hero: "pet grooming salon dog bath clean",
    gallery: "dog cat pet store happy animals care",
    trust: "veterinary professional pet care certified",
    about: "pet shop interior friendly welcoming",
  },
  beleza: {
    hero: "beauty salon elegant interior luxury",
    gallery: "hair styling treatment close up beauty",
    trust: "cosmetologist professional beauty wellness",
    about: "spa interior calm atmosphere wellness",
  },
  geral: {
    hero: "small business storefront modern",
    gallery: "business environment professional team",
    trust: "customer service quality business",
    about: "business interior welcoming",
  },
};

export function getImageNeeds(segment: string): ImageNeeds {
  const cluster = getNicheDesign(segment).cluster;
  const plan = IMAGE_PLAN[cluster] ?? IMAGE_PLAN.geral;
  return { cluster, ...plan };
}

// Query de imagem para uma seção específica do site.
export function sectionImageQuery(segment: string, section: string): string | null {
  const cluster = getNicheDesign(segment).cluster;
  const map = SECTION_IMAGE_QUERIES[cluster] ?? SECTION_IMAGE_QUERIES.geral;
  return map[section] ?? null;
}

// =========================================================
// FASE 7.1 — IMAGE ART DIRECTION
// Plano de arte por seção: cada bloco da página sabe QUE imagem pedir.
// As queries cobrem as categorias: hero, service, environment, professional,
// process, product, lifestyle, detail, trust, gallery.
// =========================================================

export interface SectionImageArt {
  section: string;
  query: string;
  orientation: "landscape" | "portrait";
  intent: string; // descrição curta do que a imagem deve comunicar
}

// Foco do cluster por papel — usado para diversificar as buscas e rejeitar
// imagens genéricas/fora de contexto quando o alt não casa com o cluster.
const CLUSTER_IMAGE_FOCUS: Record<string, string[]> = {
  pet_care: ["dog", "cat", "puppy", "groom", "pet", "vet", "animal", "bath"],
  saude_bem_estar: ["clinic", "medical", "doctor", "health", "patient", "care", "hospital", "dentist"],
  profissional_consultivo: ["office", "law", "court", "meeting", "legal", "corporate", "business", "building"],
  alimentacao: ["food", "restaurant", "dish", "chef", "kitchen", "table", "meal", "bar"],
  arquitetura_design: ["architecture", "interior", "design", "building", "space", "facade", "furniture"],
  automotivo: ["car", "mechanic", "garage", "workshop", "engine", "auto", "repair", "tire"],
  beleza: ["salon", "beauty", "hair", "skin", "spa", "makeup", "cosmetic", "nails"],
  geral: ["business", "store", "shop", "service", "customer", "office", "shopfront", "people"],
};

const IMAGE_ART_BY_SECTION: Record<string, Record<string, SectionImageArt>> = {
  saude_bem_estar: {
    hero: { section: "hero", query: "modern clinic reception welcoming", orientation: "landscape", intent: "ambiente clínico acolhedor e profissional" },
    environment: { section: "environment", query: "clinic interior clean bright waiting area", orientation: "landscape", intent: "estrutura e conforto do espaço" },
    professional: { section: "professional", query: "doctor consulting patient warm", orientation: "landscape", intent: "atendimento humano e competência" },
    trust: { section: "trust", query: "medical team smiling hospital", orientation: "landscape", intent: "confiança da equipe" },
    detail: { section: "detail", query: "medical equipment modern close up", orientation: "portrait", intent: "tecnologia e cuidado no detalhe" },
    gallery: { section: "gallery", query: "clinic environment healthcare professionals", orientation: "landscape", intent: "conjunto do ambiente e atendimento" },
  },
  profissional_consultivo: {
    hero: { section: "hero", query: "elegant law office library serious", orientation: "landscape", intent: "autoridade e sobriedade" },
    environment: { section: "environment", query: "modern corporate office architecture", orientation: "landscape", intent: "escritório institucional" },
    professional: { section: "professional", query: "lawyer meeting handshake professional", orientation: "landscape", intent: "consultoria e relação de confiança" },
    trust: { section: "trust", query: "legal books gavel scale", orientation: "landscape", intent: "solidez jurídica" },
    detail: { section: "detail", query: "office detail pen contract desk", orientation: "portrait", intent: "cuidado e formalidade" },
    gallery: { section: "gallery", query: "corporate building meeting room", orientation: "landscape", intent: "ambiente corporativo" },
  },
  alimentacao: {
    hero: { section: "hero", query: "gourmet dish restaurant plating", orientation: "landscape", intent: "desejo e apresentação do prato" },
    product: { section: "product", query: "restaurant signature dish close up", orientation: "landscape", intent: "produto apetitoso" },
    environment: { section: "environment", query: "restaurant interior ambiance table", orientation: "landscape", intent: "experiência do ambiente" },
    professional: { section: "professional", query: "chef cooking kitchen flames", orientation: "landscape", intent: "técnica e paixão na cozinha" },
    trust: { section: "trust", query: "fresh ingredients market quality", orientation: "landscape", intent: "qualidade dos insumos" },
    detail: { section: "detail", query: "wine glasses toast table setting", orientation: "portrait", intent: "detalhe da experiência" },
    gallery: { section: "gallery", query: "restaurant food ambiance drinks", orientation: "landscape", intent: "variedade gastronômica" },
  },
  arquitetura_design: {
    hero: { section: "hero", query: "modern architecture minimal facade", orientation: "landscape", intent: "linguagem arquitetônica" },
    environment: { section: "environment", query: "contemporary interior living space", orientation: "landscape", intent: "ambientes internos" },
    product: { section: "product", query: "design furniture object minimal", orientation: "portrait", intent: "objeto/design autoral" },
    professional: { section: "professional", query: "architect studio working blueprint", orientation: "landscape", intent: "processo de projeto" },
    trust: { section: "trust", query: "architectural detail material texture", orientation: "landscape", intent: "materialidade e acabamento" },
    detail: { section: "detail", query: "staircase concrete minimal detail", orientation: "portrait", intent: "detalhe construtivo" },
    gallery: { section: "gallery", query: "interior exterior architecture portfolio", orientation: "landscape", intent: "portfólio de espaços" },
  },
  automotivo: {
    hero: { section: "hero", query: "auto repair mechanic garage professional", orientation: "landscape", intent: "oficina técnica e confiável" },
    product: { section: "product", query: "car detailing polish shine", orientation: "landscape", intent: "resultado do serviço" },
    environment: { section: "environment", query: "modern workshop car lift equipment", orientation: "landscape", intent: "estrutura da oficina" },
    professional: { section: "professional", query: "mechanic working engine diagnostic", orientation: "landscape", intent: "trabalho técnico especializado" },
    trust: { section: "trust", query: "auto parts quality tools organized", orientation: "landscape", intent: "organização e qualidade" },
    detail: { section: "detail", query: "mechanic hands tools tire", orientation: "portrait", intent: "detalhe do ofício" },
    gallery: { section: "gallery", query: "car service workshop garage", orientation: "landscape", intent: "rotina da oficina" },
  },
  pet_care: {
    hero: { section: "hero", query: "dog grooming bath pet care", orientation: "landscape", intent: "cuidado profissional com o pet" },
    product: { section: "product", query: "pet products store grooming tools", orientation: "landscape", intent: "produtos para pets" },
    environment: { section: "environment", query: "pet shop interior welcoming", orientation: "landscape", intent: "ambiente do estabelecimento" },
    professional: { section: "professional", query: "veterinarian or groomer caring animal", orientation: "landscape", intent: "profissional cuidando do animal" },
    trust: { section: "trust", query: "happy healthy pet owner dog", orientation: "landscape", intent: "relação de afeto e confiança" },
    detail: { section: "detail", query: "dog paws towel bath detail", orientation: "portrait", intent: "detalhe do banho/tosa" },
    gallery: { section: "gallery", query: "dogs cats grooming pet shop", orientation: "landscape", intent: "variedade de atendimentos" },
  },
  beleza: {
    hero: { section: "hero", query: "beauty salon elegant interior", orientation: "landscape", intent: "ambiente sofisticado" },
    environment: { section: "environment", query: "salon chairs mirrors elegant", orientation: "landscape", intent: "estrutura do salão" },
    professional: { section: "professional", query: "hairstylist styling client salon", orientation: "landscape", intent: "atendimento profissional" },
    product: { section: "product", query: "hair treatment products close up", orientation: "portrait", intent: "produtos e tratamentos" },
    trust: { section: "trust", query: "beautiful healthy hair result", orientation: "landscape", intent: "resultado do cuidado" },
    detail: { section: "detail", query: "makeup brush or manicure detail", orientation: "portrait", intent: "detalhe estético" },
    gallery: { section: "gallery", query: "salon beauty wellness treatments", orientation: "landscape", intent: "conjunto de serviços" },
  },
};

// Foco default para clusters sem plano detalhado.
const FALLBACK_IMAGE_ART: Record<string, SectionImageArt> = {
  hero: { section: "hero", query: "modern business storefront small business", orientation: "landscape", intent: "fachada/ambiente do negócio" },
  environment: { section: "environment", query: "small business interior welcoming", orientation: "landscape", intent: "espaço de atendimento" },
  professional: { section: "professional", query: "customer service professional friendly", orientation: "landscape", intent: "atendimento ao cliente" },
  about: { section: "about", query: "business team environment welcoming", orientation: "landscape", intent: "identidade do negócio" },
  trust: { section: "trust", query: "quality service detail business", orientation: "landscape", intent: "confiança e qualidade" },
  product: { section: "product", query: "product close up detail", orientation: "portrait", intent: "produto/serviço em destaque" },
  detail: { section: "detail", query: "business product detail close up", orientation: "portrait", intent: "detalhe de produto/serviço" },
  gallery: { section: "gallery", query: "business environment team customer", orientation: "landscape", intent: "ambiente e equipe" },
};

export function sectionImageArt(segment: string, section: string): SectionImageArt | null {
  const cluster = getNicheDesign(segment).cluster;
  const map = IMAGE_ART_BY_SECTION[cluster] ?? {};
  const own = map[section];
  if (own) return own;
  return FALLBACK_IMAGE_ART[section] ?? null;
}

export function clusterImageFocus(cluster: string): string[] {
  return CLUSTER_IMAGE_FOCUS[cluster] ?? CLUSTER_IMAGE_FOCUS.geral;
}

// Lista de papéis de imagem disponíveis por cluster (para planejar o site).
export function imageRolesForSegment(segment: string): string[] {
  const cluster = getNicheDesign(segment).cluster;
  const map = IMAGE_ART_BY_SECTION[cluster] ?? FALLBACK_IMAGE_ART;
  return Object.keys(map).filter((k) => map[k]);
}

// Relevância de um alt de imagem versus o foco do cluster (0-100).
export function imageRelevance(cluster: string, alt: string): number {
  const haystack = alt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!haystack.trim()) return 40; // alt vazio = neutro, não reprova mas não soma
  const focus = clusterImageFocus(cluster);
  const strong = focus.filter((k) => haystack.includes(k)).length;
  if (strong >= 2) return 100;
  if (strong === 1) return 80;
  // Alt com termos genéricos demais (business/stock) reduz a relevância.
  if (/stock|generic|businessman/i.test(haystack)) return 30;
  return 50;
}

// Diversidade entre imagens do projeto: evita repetição de URLs e alt semelhantes.
export function imageDiversity(assets: Array<{ url: string; alt?: string }>): number {
  if (assets.length === 0) return 0;
  const urls = new Set(assets.map((a) => a.url));
  if (urls.size < assets.length) return 45; // URLs repetidas
  const alts = assets.map((a) => (a.alt || "").toLowerCase().trim()).filter(Boolean);
  if (alts.length === 0) return 70; // sem alt não é possível avaliar — neutro positivo
  const first = alts[0];
  const similar = alts.filter((a) => a !== first && (a.includes(first) || first.includes(a))).length;
  const uniqueRatio = new Set(alts).size / alts.length;
  if (similar > 0) return 55;
  if (uniqueRatio >= 0.9) return 100;
  return 80;
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
