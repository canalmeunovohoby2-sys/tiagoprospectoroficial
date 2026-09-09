// Mockup library registry (6.10) — reconcilia os arquivos REAIS em
// assets/mockups/ com o manifesto e classifica o estado OPERACIONAL de cada
// template. NÃO infere licença/capacidade/coords. Diferencia: web/image suportado,
// PSD/PSB, Smart Object, formato ainda não suportado. O orquestrador consome
// SOMENTE o subset realmente elegível (production_ready).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateMockupTemplate, isProductionReady, type MockupTemplate, type MockupFormat } from "./mockup-library.js";
import { validateAssetFile, sniffImageKind } from "./mockup-acquire.js";

export interface LibraryItemState {
  id: string;
  template: MockupTemplate;
  status: "production_ready" | "pending" | "unsupported";
  reason: string;
  format: MockupFormat | null;
  kind: "web_image" | "psd" | "psb" | "unsupported_format";
  supportsWeb: boolean;
  smartObject: boolean;
}

export interface LibraryState {
  productionReady: MockupTemplate[];
  pending: LibraryItemState[];
  unsupported: LibraryItemState[];
  invalid: Array<{ id: string; errors: string[] }>;
}

function classifyKind(t: MockupTemplate): "psd" | "psb" | "web_image" | "unsupported_format" {
  const f = String(t.asset?.format ?? "").toLowerCase();
  const p = String(t.asset?.path ?? "").toLowerCase();
  if (f === "psd" || p.endsWith(".psd")) return "psd";
  if (f === "psb" || p.endsWith(".psb")) return "psb";
  if (["png", "jpg", "jpeg", "webp"].includes(f) || /\.(png|jpe?g|webp)$/.test(p)) return "web_image";
  return "unsupported_format";
}

function normalizeFormat(f: string | undefined): string {
  return f === "jpeg" ? "jpg" : f ?? "";
}

/** Resolve o estado operacional da biblioteca a partir dos ARQUIVOS reais + manifesto. */
export function resolveLibraryState(assetsRoot: string, manifestPath: string): LibraryState {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { templates?: MockupTemplate[] };
  const templates = manifest.templates ?? [];
  const productionReady: MockupTemplate[] = [];
  const pending: LibraryItemState[] = [];
  const unsupported: LibraryItemState[] = [];
  const invalid: Array<{ id: string; errors: string[] }> = [];
  const ids = new Set<string>();

  for (const t of templates) {
    if (ids.has(t.id)) { invalid.push({ id: t.id, errors: ["id duplicado"] }); continue; }
    const v = validateMockupTemplate(t); // estrutura (sem exigir asset)
    ids.add(t.id);
    if (!v.ok) { invalid.push({ id: t.id, errors: v.errors }); continue; }

    const kind = classifyKind(t);
    const supportsWeb = !!t.capabilities?.supportsWebApplication && !!t.capabilities?.acceptsSvg;
    const smartObj = !!t.capabilities?.supportsSmartObject && t.capabilities.smartObjectStatus === "confirmed";

    // PSD / PSB / Smart Object não suportado pelo motor atual (sem comprovação).
    if (kind === "psd" || kind === "psb") {
      unsupported.push({ id: t.id, template: t, status: "unsupported", reason: kind === "psd" ? "psd_smart_object_unknown" : "psb_unsupported", format: t.asset.format, kind, supportsWeb, smartObject: smartObj });
      continue;
    }
    if (kind === "unsupported_format") {
      unsupported.push({ id: t.id, template: t, status: "unsupported", reason: "unsupported_format", format: t.asset.format, kind, supportsWeb, smartObject: smartObj });
      continue;
    }
    if (!supportsWeb) {
      unsupported.push({ id: t.id, template: t, status: "unsupported", reason: "not_web_svg", format: t.asset.format, kind, supportsWeb, smartObject: smartObj });
      continue;
    }

    // Web/image: só production_ready com asset + preview + commercial + área conhecida.
    const assetPath = join(assetsRoot, t.asset.path);
    const assetPresent = existsSync(assetPath);
    const actualFormat = assetPresent ? sniffImageKind(readFileSync(assetPath)) : null;
    const actualDeclared = actualFormat === "jpeg" ? "jpg" : actualFormat;
    const declared = normalizeFormat(t.asset.format);
    const previewPresent = !t.asset.previewPath || existsSync(join(assetsRoot, t.asset.previewPath));
    const hasArea = !!(t as MockupTemplate & { applicationArea?: unknown }).applicationArea;
    const issues: string[] = [];
    if (!assetPresent) issues.push("asset ausente");
    if (actualFormat === null) issues.push("asset não é imagem reconhecida");
    if (assetPresent && actualDeclared && actualDeclared !== declared) issues.push(`formato real (${actualDeclared}) difere do declarado (${declared})`);
    if (!previewPresent) issues.push("preview ausente");
    if (t.source.licenseStatus !== "commercial" || t.source.commercialAllowed !== true) issues.push("licença comercial não comprovada");
    if (!hasArea) issues.push("applicationArea desconhecida");

    if (issues.length === 0 && isProductionReady(t, true)) {
      productionReady.push(t);
    } else {
      pending.push({ id: t.id, template: t, status: "pending", reason: issues.join("; ") || "pendente", format: t.asset.format, kind: "web_image", supportsWeb, smartObject: false });
    }
  }
  return { productionReady, pending, unsupported, invalid };
}

/** Subset que o orquestrador pode consumir (somente realmente elegível). */
export function eligibleForOrchestrator(state: LibraryState): MockupTemplate[] {
  return state.productionReady;
}

export function eligibleTemplateById(state: LibraryState, id: string): MockupTemplate | null {
  return state.productionReady.find((t) => t.id === id) ?? null;
}
