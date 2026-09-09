// Mockup Library (6.10) — infraestrutura da BIBLIOTECA DE MOCKUPS REAIS.
// NÃO gera mockups artificialmente (sem div/CSS/SVG fake). Define o tipo
// MockupTemplate, manifest, categorias/targets/tags, licença, validação,
// indexação/busca, score determinístico, production-ready e diversidade.
// O agente (FASE 10.2) consultará listMockupCandidates/getMockupTemplate/validate.
// Puro e testável. ASSERTS REAIS: esta fase só marca production-ready com
// licenseStatus === "commercial" e asset presente/verificado.

export type MockupCategory =
  | "stationery" | "notebook" | "uniforms" | "signage" | "packaging"
  | "printed" | "social" | "digital" | "other";

export type MockupTarget =
  | "business_card" | "stationery" | "notebook" | "smartphone" | "shirt"
  | "uniform" | "signage" | "facade" | "packaging" | "bag" | "social"
  | "digital" | "other";

export type MockupPlacement =
  | "flat" | "perspective" | "curved" | "screen" | "wall" | "fabric" | "other";

export type LicenseStatus = "commercial" | "personal_only" | "unknown" | "restricted";

export type MockupFormat = "psd" | "png" | "jpg" | "webp" | "other";

export interface MockupSource {
  provider: string;
  url: string;
  author?: string;
  licenseStatus: LicenseStatus;
  /** ISO data (yyyy-mm-dd) de verificação da origem/licença. */
  checkedAt: string;
  /** Permite uso comercial? (não inventar — só se confirmado.) */
  commercialAllowed: boolean;
  notes?: string;
}

export interface MockupAsset {
  path: string;
  format: MockupFormat;
  width?: number;
  height?: number;
  /** PDF de preview para visualização (se o original for PSD). */
  previewPath?: string;
}

export interface MockupApplication {
  target: MockupTarget;
  placement: MockupPlacement;
}

export interface MockupCapabilities {
  acceptsSvg: boolean;
  requiresPsd: boolean;
  supportsSmartObject: boolean;
  supportsWebApplication: boolean;
  /** Só "true" se a informação puder ser comprovada; senão "unknown". */
  smartObjectStatus: "confirmed" | "unknown";
  smartObjectName?: string;
}

export interface MockupApplicationArea {
  /** Configuração da área de aplicação (coords/dimensões/perspectiva/máscara).
   *  NÃO são inventados visualmente; documentados a partir do template real. */
  x?: number; y?: number; width?: number; height?: number;
  rotation?: number; scale?: number; mask?: string; blend?: string;
  /** Referência ao elemento substituível (ex.: nome do smart object). */
  replaceableRef?: string;
}

export interface MockupQuality {
  score: number;       // 0..100
  tags: string[];      // descrevem o asset real (perspective, corporate, minim, front…)
}

export interface MockupTemplate {
  id: string;
  name: string;
  category: MockupCategory;
  source: MockupSource;
  asset: MockupAsset;
  application: MockupApplication;
  capabilities: MockupCapabilities;
  applicationArea?: MockupApplicationArea;
  quality: MockupQuality;
}

export interface MockupValidation { ok: boolean; errors: string[]; warnings: string[]; }

const KNOWN_CATEGORIES: MockupCategory[] = ["stationery", "notebook", "uniforms", "signage", "packaging", "printed", "social", "digital", "other"];
const KNOWN_TARGETS: MockupTarget[] = ["business_card", "stationery", "notebook", "smartphone", "shirt", "uniform", "signage", "facade", "packaging", "bag", "social", "digital", "other"];
const KNOWN_PLACEMENTS: MockupPlacement[] = ["flat", "perspective", "curved", "screen", "wall", "fabric", "other"];
const KNOWN_FORMATS: MockupFormat[] = ["psd", "png", "jpg", "webp", "other"];

/** Production-ready apenas se licença verificada como commercial E asset presente/verificado. */
export function isProductionReady(t: MockupTemplate, assetPresent = true): boolean {
  return t.source.licenseStatus === "commercial" && t.source.commercialAllowed === true && assetPresent;
}

export function validateMockupTemplate(t: MockupTemplate, opts: { ids?: Set<string>; assetsPresent?: (path: string) => boolean } = {}): MockupValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!t?.id || typeof t.id !== "string" || !t.id.trim()) errors.push("id obrigatório/único");
  if (opts.ids?.has(t?.id)) errors.push(`id duplicado: ${t.id}`);
  if (!t?.name || !t.name.trim()) errors.push("nome obrigatório");
  if (!KNOWN_CATEGORIES.includes(t?.category)) errors.push(`categoria inválida: ${t.category}`);
  if (!KNOWN_TARGETS.includes(t?.application?.target)) errors.push(`target inválido: ${t.application?.target}`);
  if (!KNOWN_PLACEMENTS.includes(t?.application?.placement)) errors.push(`placement inválido: ${t.application?.placement}`);
  if (!KNOWN_FORMATS.includes(t?.asset?.format)) errors.push(`formato inválido: ${t.asset?.format}`);
  if (!t?.asset?.path) errors.push("asset.path obrigatório");
  if (!t?.source?.url) errors.push("source.url obrigatório");
  if (!["commercial", "personal_only", "unknown", "restricted"].includes(t?.source?.licenseStatus)) errors.push("licenseStatus inválido");
  if (t?.source?.licenseStatus === "commercial" && t.source.commercialAllowed !== true) errors.push("commercial sem commercialAllowed=true (não inventar licença)");
  if (t?.source?.licenseStatus === "unknown") warnings.push("licença não verificada — não é production-ready");
  if (opts?.assetsPresent && !opts.assetsPresent(t?.asset?.path)) errors.push(`asset ausente: ${t.asset?.path}`);
  if (t?.quality?.tags?.length && t.quality.tags.some((tag) => /(genérico|generic|good|nice|bonito)/i.test(tag))) warnings.push("tag genérica detectada — descreva o asset real");
  return { ok: errors.length === 0, errors, warnings };
}

export function validateManifest(templates: MockupTemplate[], opts: { assetsPresent?: (path: string) => boolean } = {}): { ok: boolean; errors: string[]; warnings: string[] } {
  const ids = new Set<string>();
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const t of templates) {
    const v = validateMockupTemplate(t, { ids, assetsPresent: opts.assetsPresent });
    ids.add(t.id);
    errors.push(...v.errors.map((e) => `[${t.id}] ${e}`));
    warnings.push(...v.warnings.map((w) => `[${t.id}] ${w}`));
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ---- Score determinístico (sem IA) ----
export interface MockupCriteria {
  category?: MockupCategory;
  target?: MockupTarget;
  tags?: string[];
  requiresSmartObject?: boolean;
  maxScoreQuality?: boolean;
}

export function scoreMockup(t: MockupTemplate, criteria: MockupCriteria): number {
  let score = 0;
  if (criteria.category && t.category === criteria.category) score += 30;
  if (criteria.target && t.application.target === criteria.target) score += 30;
  if (criteria.tags?.length) {
    const matched = criteria.tags.filter((tag) => t.quality.tags.includes(tag)).length;
    score += (matched / criteria.tags.length) * 20;
  }
  if (criteria.requiresSmartObject && t.capabilities.supportsSmartObject && t.capabilities.smartObjectStatus === "confirmed") score += 15;
  score += (t.quality.score ?? 0) / 10; // 0..10
  if (criteria.maxScoreQuality) score += t.quality.score * 0.5;
  return Math.round(score);
}

export function findMockupCandidates(templates: MockupTemplate[], criteria: MockupCriteria): MockupTemplate[] {
  return templates
    .filter((t) => {
      if (criteria.category && t.category !== criteria.category) return false;
      if (criteria.target && t.application.target !== criteria.target) return false;
      if (criteria.tags?.length && !criteria.tags.some((tag) => t.quality.tags.includes(tag))) return false;
      return true;
    })
    .sort((a, b) => scoreMockup(b, criteria) - scoreMockup(a, criteria));
}

export function getMockupTemplate(templates: MockupTemplate[], id: string): MockupTemplate | null {
  return templates.find((t) => t.id === id) ?? null;
}

/** Diversidade básica: evita retornar sempre o mesmo mockup (histórico de usados). */
export function diverseCandidates(templates: MockupTemplate[], criteria: MockupCriteria, usedIds?: Set<string>): MockupTemplate[] {
  const cands = findMockupCandidates(templates, criteria);
  const fresh = cands.filter((t) => !usedIds?.has(t.id));
  return fresh.length ? fresh : cands;
}
