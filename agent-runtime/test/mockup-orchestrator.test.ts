import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildApplicationPlan, planMockupApplications, runApplicationPipeline } from "../src/mockup-orchestrator";
import { MOCKUP_SEED } from "../src/mockup-seed";
import type { MockupTemplate } from "../src/mockup-library";

const PNG1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const tmp = join(process.cwd(), ".tmp-orch");
const assets = join(tmp, "assets");
const ws = join(tmp, "ws");

/** Template production-ready (licença comercial + asset presente). */
function ready(id: string, target: "business_card" | "social" | "facade" | "shirt", category: any, area = { x: 20, y: 20, width: 100, height: 100 }): MockupTemplate {
  return {
    ...MOCKUP_SEED[0], id, name: id, category, application: { target, placement: "flat" }, applicationArea: area,
    source: { ...MOCKUP_SEED[0].source, licenseStatus: "commercial", commercialAllowed: true, checkedAt: "2026-09-08" },
    capabilities: { acceptsSvg: true, requiresPsd: false, supportsSmartObject: false, supportsWebApplication: true, smartObjectStatus: "unknown" },
    asset: { ...MOCKUP_SEED[0].asset, path: `mocks/${id}.png` },
  } as MockupTemplate;
}
const lib: MockupTemplate[] = [
  ready("card-01", "business_card", "stationery"),
  ready("card-02", "business_card", "stationery", { x: 10, y: 10, width: 80, height: 50 }),
  ready("social-01", "social", "social"),
  ready("facade-01", "facade", "signage"),
  ready("shirt-01", "shirt", "uniforms"),
];

describe("mockup-orchestrator — plano contextual (6.10)", () => {
  it("restaurante → fachada/packaging/uniforme/cartão/social (não lista fixa por nicho igual)", () => {
    const p = buildApplicationPlan({ brandName: "Bella", segment: "restaurante" });
    expect(p.intents.some((i) => i.target === "facade")).toBe(true);
    expect(p.intents.some((i) => i.target === "packaging")).toBe(true);
    expect(p.intents.some((i) => i.target === "social")).toBe(true);
  });
  it("academia → uniforme/sacola/social/digital (contexto diferente)", () => {
    const p = buildApplicationPlan({ brandName: "Iron", segment: "academia" });
    expect(p.intents.some((i) => i.target === "shirt")).toBe(true);
    expect(p.intents.some((i) => i.target === "bag")).toBe(true);
  });
});

describe("mockup-orchestrator — seleção/diversidade/indisponibilidade (6.10)", () => {
  it("seleciona apenas production-ready e compatíveis; unavailable quando falta", () => {
    const plan = buildApplicationPlan({ brandName: "Bella", segment: "restaurante" });
    const planned = planMockupApplications(plan, lib, { isReady: (t) => t.source.licenseStatus === "commercial" && t.source.commercialAllowed, requireArea: true });
    const ready = planned.filter((p) => p.status === "ready");
    const unavailable = planned.filter((p) => p.status === "unavailable");
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.every((p) => p.template!.source.licenseStatus === "commercial")).toBe(true);
    // packaging não tem template na lib → unavailable (não fabrica alternativa)
    expect(unavailable.some((p) => p.intent.target === "packaging")).toBe(true);
  });

  it("diversidade evita repetir o mesmo template entre aplicações", () => {
    const plan = buildApplicationPlan({ brandName: "X", segment: "restaurante" });
    const planned = planMockupApplications(plan, lib, { isReady: () => true, requireArea: true });
    const ids = planned.filter((p) => p.template).map((p) => p.template!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("mockup-orchestrator — execução com E2E real (6.10)", () => {
  beforeEach(() => { rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(assets, "mocks"), { recursive: true }); mkdirSync(ws, { recursive: true }); });

  it("executa aplicações, isola falha e preserva o original", async () => {
    // fixture real: assets mock PNG presentes para os templates marcados como prontos
    writeFileSync(join(assets, "mocks", "card-01.png"), PNG1x1);
    writeFileSync(join(assets, "mocks", "social-01.png"), PNG1x1);
    const plan = buildApplicationPlan({ brandName: "Bella", segment: "restaurante" });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180"><rect x="40" y="40" width="80" height="80" fill="#4F46E5"/></svg>`;
    const results = await runApplicationPipeline(plan, [lib[0], lib[2]], {
      brandSvg: svg, assetsRoot: assets, workspaceDir: ws,
      isReady: (t) => exists(t, assets),
    });
    // fachada/uniforme/cartão não têm template na lista reduzida → unavailable (mas não quebra)
    expect(results.length).toBe(plan.intents.length);
    const applied = results.find((r) => r.application.target === "business_card");
    expect(applied?.status).toBe("validated");
    // asset original intacto
    expect((await import("node:fs")).readFileSync(join(assets, "mocks", "card-01.png")).length).toBe(PNG1x1.length);
  });
});

function exists(t: MockupTemplate, assetsRoot: string): boolean {
  return existsSync(join(assetsRoot, t.asset.path));
}
