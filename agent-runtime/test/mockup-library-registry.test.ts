import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveLibraryState, eligibleForOrchestrator } from "../src/mockup-library-registry";
import { runApplicationPipeline, buildApplicationPlan } from "../src/mockup-orchestrator";
import type { MockupTemplate } from "../src/mockup-library";

const PNG1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const tmp = join(process.cwd(), ".tmp-reg");
const assets = join(tmp, "assets");
const manifestPath = join(tmp, "manifest.json");

function tmpl(id: string, over: Partial<MockupTemplate>): MockupTemplate {
  return {
    id, name: id, category: "other",
    source: { provider: "Mockup World", url: "https://mockupworld.co", licenseStatus: "unknown", checkedAt: "2026-09-08", commercialAllowed: false },
    asset: { path: `mocks/${id}.png`, format: "png" },
    application: { target: "other", placement: "flat" },
    capabilities: { acceptsSvg: true, requiresPsd: false, supportsSmartObject: false, supportsWebApplication: true, smartObjectStatus: "unknown" },
    quality: { score: 70, tags: ["flat"] },
    ...over,
  } as MockupTemplate;
}

beforeEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(assets, "mocks"), { recursive: true });
  mkdirSync(join(assets, "previews"), { recursive: true });
});

function writeManifest(ts: MockupTemplate[]) {
  writeFileSync(manifestPath, JSON.stringify({ templates: ts }, null, 2));
}

describe("mockup-library-registry — estado operacional real (6.10)", () => {
  it("web/image + commercial + asset + preview + área → production_ready (elegível p/ orquestrador)", () => {
    writeFileSync(join(assets, "mocks", "ok.png"), PNG1x1);
    writeFileSync(join(assets, "previews", "ok.jpg"), "preview");
    const t = tmpl("ok", { source: { provider: "X", url: "https://x", licenseStatus: "commercial", commercialAllowed: true, checkedAt: "2026-09-08" }, asset: { path: "mocks/ok.png", format: "png", previewPath: "previews/ok.jpg" }, application: { target: "business_card", placement: "flat" }, applicationArea: { x: 10, y: 10, width: 80, height: 80 }, category: "stationery" });
    writeManifest([t]);
    const state = resolveLibraryState(assets, manifestPath);
    expect(state.productionReady.length).toBe(1);
    expect(state.pending.length).toBe(0);
    expect(eligibleForOrchestrator(state).length).toBe(1);
  });

  it("licença unknown → pending (não production-ready), mesmo com asset presente", () => {
    writeFileSync(join(assets, "mocks", "u.png"), PNG1x1);
    const t = tmpl("u", { source: { provider: "X", url: "https://x", licenseStatus: "unknown", commercialAllowed: false, checkedAt: "2026-09-08" }, applicationArea: { x: 0, y: 0, width: 10, height: 10 } });
    writeManifest([t]);
    const state = resolveLibraryState(assets, manifestPath);
    expect(state.productionReady.length).toBe(0);
    expect(state.pending.find((p) => p.id === "u")?.status).toBe("pending");
    expect(state.pending.find((p) => p.id === "u")?.reason).toMatch(/licença/i);
  });

  it("PSD com Smart Object não comprovado → unsupported (não inventa)", () => {
    const t = tmpl("psd", { asset: { path: "mocks/psd.psd", format: "psd" }, capabilities: { acceptsSvg: true, requiresPsd: true, supportsSmartObject: true, supportsWebApplication: false, smartObjectStatus: "unknown" } });
    writeManifest([t]);
    const state = resolveLibraryState(assets, manifestPath);
    expect(state.unsupported.find((u) => u.id === "psd")?.reason).toMatch(/psd_smart_object_unknown|psb_unsupported/i);
  });

  it("formato não suportado → unsupported_format; asset ausente → pending", () => {
    writeManifest([
      tmpl("other", { asset: { path: "mocks/other.tiff", format: "other", previewPath: undefined } }),
      tmpl("miss", { source: { provider: "X", url: "https://x", licenseStatus: "commercial", commercialAllowed: true, checkedAt: "2026-09-08" }, applicationArea: { x: 0, y: 0, width: 10, height: 10 } }),
    ]);
    const state = resolveLibraryState(assets, manifestPath);
    expect(state.unsupported.find((u) => u.id === "other")?.reason).toBe("unsupported_format");
    expect(state.pending.find((p) => p.id === "miss")?.reason).toMatch(/asset ausente/i);
  });
});

describe("mockup-library-registry — E2E real: orquestrador consome somente elegíveis (6.10)", () => {
  it("asset real na biblioteca → production_ready → orquestrador renderiza", async () => {
    writeFileSync(join(assets, "mocks", "card.png"), PNG1x1);
    writeFileSync(join(assets, "previews", "card.jpg"), "preview");
    const t = tmpl("card", { source: { provider: "X", url: "https://x", licenseStatus: "commercial", commercialAllowed: true, checkedAt: "2026-09-08" }, asset: { path: "mocks/card.png", format: "png", previewPath: "previews/card.jpg" }, application: { target: "business_card", placement: "flat" }, applicationArea: { x: 10, y: 10, width: 80, height: 80 }, category: "stationery" });
    writeManifest([t]);
    const state = resolveLibraryState(assets, manifestPath);
    const eligible = eligibleForOrchestrator(state);
    expect(eligible.length).toBe(1);
    const plan = buildApplicationPlan({ brandName: "Marca", segment: "generico" });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180"><rect x="40" y="40" width="80" height="80" fill="#4F46E5"/></svg>`;
    const results = await runApplicationPipeline(plan, eligible, { brandSvg: svg, assetsRoot: assets, workspaceDir: join(tmp, "ws"), isReady: () => true });
    const applied = results.find((r) => r.application.target === "business_card");
    expect(applied?.status).toBe("validated");
    expect(applied?.outputPath).toBeTruthy();
  });
});
