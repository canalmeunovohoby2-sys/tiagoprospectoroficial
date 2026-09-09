import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { applyBrandToMockupCore, buildComposeHtml, applyBrandToMockup, renderMockup } from "../src/mockup-apply";
import { MOCKUP_SEED } from "../src/mockup-seed";
import { validateAssetFile } from "../src/mockup-acquire";
import type { MockupTemplate } from "../src/mockup-library";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180"><g fill="#4F46E5"><rect x="60" y="40" width="40" height="100" rx="8"/><circle cx="140" cy="90" r="40"/></g></svg>`;
const PNG1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const tmp = join(process.cwd(), ".tmp-apply");
const asset = join(tmp, "mockup.png");

// Template web-compatible real (do seed, mas marcado como web+svg).
const web: MockupTemplate = {
  ...MOCKUP_SEED[0],
  id: "social-01", application: { target: "social", placement: "flat" },
  capabilities: { acceptsSvg: true, requiresPsd: false, supportsSmartObject: false, supportsWebApplication: true, smartObjectStatus: "unknown" },
  asset: { ...MOCKUP_SEED[0].asset, path: "mock.png", format: "png" },
};
const area = { x: 60, y: 60, width: 240, height: 240, rotation: 0 };

beforeEach(() => { rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true }); writeFileSync(asset, PNG1x1); });

describe("mockup-apply — núcleo (6.10)", () => {
  it("aplica SVG em template web+svg com área conhecida → applied", () => {
    const plan = applyBrandToMockupCore({ brandSvg: SVG, template: web, assetPath: asset, applicationArea: area, assetWidth: 600, assetHeight: 400 });
    expect(plan.status).toBe("applied");
    expect(plan.method).toBe("web-compose");
    expect(plan.validations.some((v) => /svg embutido/i.test(v))).toBe(true);
  });

  it("applicationArea desconhecida → unsupported (não inventa coords)", () => {
    const plan = applyBrandToMockupCore({ brandSvg: SVG, template: web, assetPath: asset });
    expect(plan.status).toBe("unsupported");
    expect(plan.reason).toBe("application_area_unknown");
  });

  it("asset inexistente → failed", () => {
    const plan = applyBrandToMockupCore({ brandSvg: SVG, template: web, assetPath: join(tmp, "nope.png"), applicationArea: area });
    expect(plan.status).toBe("failed");
    expect(plan.reason).toBe("asset_missing");
  });

  it("PSD/Smart Object não comprovado → unsupported", () => {
    const psd = { ...web, capabilities: { ...web.capabilities, requiresPsd: true, smartObjectStatus: "unknown" as const } };
    const plan = applyBrandToMockupCore({ brandSvg: SVG, template: psd, assetPath: asset, applicationArea: area });
    expect(plan.status).toBe("unsupported");
    expect(plan.reason).toBe("psd_smart_object_unknown");
  });

  it("template não compatível (não web/svg) → unsupported", () => {
    const noSvg = { ...web, capabilities: { ...web.capabilities, acceptsSvg: false } };
    expect(applyBrandToMockupCore({ brandSvg: SVG, template: noSvg, assetPath: asset, applicationArea: area }).status).toBe("unsupported");
  });

  it("buildComposeHtml embute o SVG na área e preserva style", () => {
    const plan = applyBrandToMockupCore({ brandSvg: SVG, template: web, assetPath: asset, applicationArea: area, assetWidth: 600, assetHeight: 400 });
    const html = buildComposeHtml(plan, "mock.png");
    expect(html).toContain("<svg");
    expect(html).toContain('left:60px');
    expect(html).toContain('width:240px');
    expect(html).toContain('src="mock.png"');
  });
});

describe("mockup-apply — preservação do original (6.10)", () => {
  it("não modifica o asset original (só lê)", () => {
    const before = readFileSync(asset).toString("base64");
    applyBrandToMockupCore({ brandSvg: SVG, template: web, assetPath: asset, applicationArea: area });
    expect(readFileSync(asset).toString("base64")).toBe(before);
  });
});

describe("mockup-apply — E2E real via Chromium/Playwright (6.10)", () => {
  it("aplica e gera um NOVO render real (asset real + SVG), validando saída", async () => {
    // O asset do mockup é uma imagem PNG REAL (fixture). O motor compõe o SVG e
    // renderiza no Chromium/Playwright — não é mockup em CSS.
    const out = await applyBrandToMockup({ brandSvg: SVG, template: web, assetPath: asset, applicationArea: area, assetWidth: 600, assetHeight: 400 }, { render: true, workspaceDir: join(tmp, "ws") });
    expect(out.status).toBe("validated");
    expect(out.outputPath).toBeTruthy();
    expect(out.method).toBe("web-compose+render");
    const vo = validateAssetFile(out.outputPath!);
    expect(vo.ok).toBe(true);
    expect(vo.type).toBe("png");
  });

  it("renderMockup mantém o asset intacto (não o sobrescreve)", async () => {
    const plan = applyBrandToMockupCore({ brandSvg: SVG, template: web, assetPath: asset, applicationArea: area, assetWidth: 600, assetHeight: 400 });
    const before = readFileSync(asset).toString("base64");
    const out = await renderMockup(plan, join(tmp, "ws2"), asset);
    expect(out.status).toBe("validated");
    expect(readFileSync(asset).toString("base64")).toBe(before);
    // render real usa BrowserSession → mantém sessão aberta no browser
  });
});
