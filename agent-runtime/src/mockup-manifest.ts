// Mockup manifest loader (6.10) — liga o manifesto à realidade FÍSICA dos assets.
// Só marca um template como PRODUCTION-READY quando o arquivo REAL existe no disco
// (fs.existsSync) + licença comercial comprovada + preview presente. Nunca inventa
// licença nem aceita caminho fictício. Puro/existencial; testável com arquivos reais.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validateMockupTemplate, isProductionReady, type MockupTemplate } from "./mockup-library.js";

export interface MockupLibrarySnapshot {
  templates: MockupTemplate[];
  productionReady: MockupTemplate[];
  pending: MockupTemplate[];
  invalid: Array<{ id: string; errors: string[] }>;
}

/**
 * Avalia a biblioteca contra os arquivos REAIS em `assetsRoot` (mockups/assets).
 * productionReady === asset presente + preview presente (se declarado) +
 * licença "commercial" comprovada. Everything else = pending.
 */
export function resolveMockupLibrary(templates: MockupTemplate[], assetsRoot: string): MockupLibrarySnapshot {
  const productionReady: MockupTemplate[] = [];
  const pending: MockupTemplate[] = [];
  const invalid: Array<{ id: string; errors: string[] }> = [];

  for (const t of templates) {
    const v = validateMockupTemplate(t);
    if (!v.ok) { invalid.push({ id: t.id, errors: v.errors }); continue; }
    const assetPresent = existsSync(join(assetsRoot, t.asset.path));
    const previewPresent = !t.asset.previewPath || existsSync(join(assetsRoot, t.asset.previewPath));
    const ready = isProductionReady(t, assetPresent) && previewPresent;
    (ready ? productionReady : pending).push(t);
  }
  return { templates, productionReady, pending, invalid };
}

/** Registro de verificação de um asset (o que foi realmente checado / não foi). */
export interface AssetVerificationRecord {
  id: string;
  url: string;
  licenseVerified: boolean;
  filePresent: boolean;
  previewPresent: boolean;
  dimensionsVerified: boolean;
  watermarkChecked: boolean;
  note?: string;
}

export function verifyAssetRecord(t: MockupTemplate, assetsRoot: string, opts: { checkLicense?: boolean } = {}): AssetVerificationRecord {
  const filePresent = existsSync(join(assetsRoot, t.asset.path));
  const previewPresent = !t.asset.previewPath || existsSync(join(assetsRoot, t.asset.previewPath));
  return {
    id: t.id,
    url: t.source.url,
    licenseVerified: opts.checkLicense === true && t.source.licenseStatus === "commercial" && t.source.commercialAllowed,
    filePresent,
    previewPresent,
    dimensionsVerified: Boolean(t.asset.width && t.asset.height),
    watermarkChecked: false, // não verificado neste ambiente
    note: t.source.licenseStatus,
  };
}
