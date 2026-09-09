import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveMockupLibrary, verifyAssetRecord } from "../src/mockup-manifest";
import { MOCKUP_SEED } from "../src/mockup-seed";
import type { MockupTemplate } from "../src/mockup-library";

const tmpRoot = join(process.cwd(), ".tmp-mockups");

function fixture(commercial: boolean, license: "commercial" | "unknown", filePresent: boolean): MockupTemplate {
  const base = MOCKUP_SEED[0];
  return {
    ...base,
    source: { ...base.source, licenseStatus: license, commercialAllowed: commercial },
    asset: { ...base.asset, path: "stationery/fixture/mock.png", previewPath: "previews/fixture.jpg" },
  };
}

describe("mockup-manifest — production-ready só com arquivo REAL + licença comprovada (6.10.1)", () => {
  beforeEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); mkdirSync(join(tmpRoot, "stationery/fixture"), { recursive: true }); mkdirSync(join(tmpRoot, "previews"), { recursive: true }); });

  it("commercial + arquivo presente + preview presente → production-ready", () => {
    writeFileSync(join(tmpRoot, "stationery/fixture/mock.png"), "PNG");
    writeFileSync(join(tmpRoot, "previews/fixture.jpg"), "JPG");
    const lib = resolveMockupLibrary([fixture(true, "commercial", true)], tmpRoot);
    expect(lib.productionReady.length).toBe(1);
    expect(lib.pending.length).toBe(0);
  });

  it("commercial mas arquivo AUSENTE → não é production-ready (pending)", () => {
    const lib = resolveMockupLibrary([fixture(true, "commercial", false)], tmpRoot);
    expect(lib.productionReady.length).toBe(0);
    expect(lib.pending.length).toBe(1);
  });

  it("arquivo presente mas licença unknown → NÃO é production-ready", () => {
    writeFileSync(join(tmpRoot, "stationery/fixture/mock.png"), "PNG");
    const lib = resolveMockupLibrary([fixture(false, "unknown", true)], tmpRoot);
    expect(lib.productionReady.length).toBe(0);
    expect(lib.pending.length).toBe(1);
  });

  it("caminho fictício NUNCA vira production-ready (existe check de arquivo real)", () => {
    const lib = resolveMockupLibrary([fixture(true, "commercial", false)], tmpRoot);
    expect(lib.productionReady.every((t) => !t.asset.path.includes("ficticio"))).toBe(true);
  });

  it("verifyAssetRecord registra honestamente o que foi/não foi verificado", () => {
    const rec = verifyAssetRecord(fixture(true, "commercial", true), tmpRoot, { checkLicense: true });
    expect(rec.licenseVerified).toBe(true);
    expect(rec.filePresent).toBe(false);
    expect(rec.watermarkChecked).toBe(false);
  });

  it("manifesto (seed) não possui production-ready sem arquivos reais", () => {
    const lib = resolveMockupLibrary(MOCKUP_SEED, tmpRoot);
    expect(lib.productionReady.length).toBe(0);
    expect(lib.pending.length).toBe(MOCKUP_SEED.length);
  });
});
