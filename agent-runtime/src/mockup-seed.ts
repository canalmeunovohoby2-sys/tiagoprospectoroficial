// Mockup Seed (6.10) — AMOSTRA da biblioteca de mockups reais (Mockup World).
// IMPORTANTE: nesta fase NENHUM asset foi baixado/verificado neste ambiente, então
// TODOS têm licenseStatus "unknown" e productionReady=FALSE. Nenhuma licença é
// inventada. A FASE 10.2 só poderá usar assets com licença commercial verificada.
import type { MockupTemplate } from "./mockup-library.js";

const TODAY = new Date().toISOString().slice(0, 10);

function seed(over: Partial<MockupTemplate> & { id: string; name: string; asset: { path: string; format: MockupTemplate["asset"]["format"] } }): MockupTemplate {
  return {
    category: "other",
    source: { provider: "Mockup World", url: `https://mockupworld.co/${over.id}/`, licenseStatus: "unknown", checkedAt: TODAY, commercialAllowed: false, notes: "licença não verificada neste ambiente" },
    application: { target: "other", placement: "flat" },
    capabilities: { acceptsSvg: true, requiresPsd: false, supportsSmartObject: false, supportsWebApplication: true, smartObjectStatus: "unknown" },
    quality: { score: 60, tags: [] },
    ...over,
  } as MockupTemplate;
}

export const MOCKUP_SEED: MockupTemplate[] = [
  seed({ id: "business-card-01", name: "Cartão de visita (perspectiva, corporativo)", category: "stationery", application: { target: "business_card", placement: "perspective" }, asset: { path: "mockups/assets/business-card-01/business-card-01.pxd", format: "psd", width: 3000, height: 2000, previewPath: "mockups/previews/business-card-01.jpg" }, capabilities: { acceptsSvg: true, requiresPsd: true, supportsSmartObject: true, supportsWebApplication: false, smartObjectStatus: "unknown", smartObjectName: "LOGO" }, quality: { score: 80, tags: ["perspective", "corporate", "front"] } }),
  seed({ id: "business-card-02", name: "Cartão de visita (flat, minimal)", category: "stationery", application: { target: "business_card", placement: "flat" }, asset: { path: "mockups/assets/business-card-02/business-card-02.pxd", format: "psd", width: 2400, height: 1600, previewPath: "mockups/previews/business-card-02.jpg" }, capabilities: { acceptsSvg: true, requiresPsd: true, supportsSmartObject: true, supportsWebApplication: false, smartObjectStatus: "unknown" }, quality: { score: 70, tags: ["flat", "minimal", "corporate"] } }),
  seed({ id: "facade-01", name: "Fachada de loja (perspectiva)", category: "signage", application: { target: "facade", placement: "perspective" }, asset: { path: "mockups/assets/facade-01/facade-01.pxd", format: "psd", width: 4000, height: 2600 }, capabilities: { acceptsSvg: true, requiresPsd: true, supportsSmartObject: false, supportsWebApplication: false, smartObjectStatus: "unknown" }, quality: { score: 75, tags: ["perspective", "storefront", "angled"] } }),
  seed({ id: "shirt-01", name: "Camiseta (uniforme, vista frontal)", category: "uniforms", application: { target: "shirt", placement: "flat" }, asset: { path: "mockups/assets/shirt-01/shirt-01.jpg", format: "jpg", width: 2000, height: 2000 }, applicationArea: { x: 0.35, y: 0.25, width: 0.3, height: 0.18, replaceableRef: "logo" }, capabilities: { acceptsSvg: true, requiresPsd: false, supportsSmartObject: false, supportsWebApplication: true, smartObjectStatus: "unknown" }, quality: { score: 66, tags: ["flat", "front", "uniform"] } }),
  seed({ id: "notebook-01", name: "Notebook (tela, mockup digital)", category: "notebook", application: { target: "notebook", placement: "screen" }, asset: { path: "mockups/assets/notebook-01/notebook-01.pxd", format: "psd" }, capabilities: { acceptsSvg: true, requiresPsd: true, supportsSmartObject: true, supportsWebApplication: false, smartObjectStatus: "unknown" }, quality: { score: 78, tags: ["screen", "digital", "perspective"] } }),
  seed({ id: "bag-01", name: "Sacola (packaging, perspectiva)", category: "packaging", application: { target: "bag", placement: "perspective" }, asset: { path: "mockups/assets/bag-01/bag-01.webp", format: "webp" }, capabilities: { acceptsSvg: true, requiresPsd: false, supportsSmartObject: false, supportsWebApplication: true, smartObjectStatus: "unknown" }, quality: { score: 72, tags: ["perspective", "packaging", "front"] } }),
  seed({ id: "social-01", name: "Post social (redes)", category: "social", application: { target: "social", placement: "flat" }, asset: { path: "mockups/assets/social-01/social-01.png", format: "png", width: 1080, height: 1080 }, capabilities: { acceptsSvg: true, requiresPsd: false, supportsSmartObject: false, supportsWebApplication: true, smartObjectStatus: "unknown" }, quality: { score: 85, tags: ["flat", "social", "square"] } }),
];
