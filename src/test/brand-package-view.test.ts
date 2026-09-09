import { describe, it, expect } from "vitest";
import { extractBrandPackage, toBrandPackageView, hasBrandPackage, brandPackageUrl, PACKAGE_RESULT_PATH } from "../lib/brandPackageView";

const result = { status: "ready", packageId: "pkg-v1", versionId: "v1", identityName: "Bella", fileCount: 12, totalBytes: 200000, zipSizeBytes: 50000, createdAt: "2026-09-09T00:00:00Z", validationOk: true, persisted: true, packageRelPath: "package/current.zip" };

function files() { return { [PACKAGE_RESULT_PATH]: JSON.stringify(result) }; }

describe("brandPackageView — Identidade completa (12)", () => {
  it("só marca ready quando persistido + validado", () => {
    const v = toBrandPackageView(files());
    expect(v.state).toBe("ready");
    expect(v.versionId).toBe("v1");
    expect(v.fileCount).toBe(12);
    expect(v.zipSizeBytes).toBe(50000);
  });

  it("persisted/validation falho → error (não mostra falso pronto)", () => {
    const v = toBrandPackageView({ [PACKAGE_RESULT_PATH]: JSON.stringify({ ...result, persisted: false, validationOk: false, status: "error" }) });
    expect(v.state).toBe("error");
    expect(v.zipUrl).toBeNull();
  });

  it("sem manifesto → none", () => {
    expect(toBrandPackageView(null).state).toBe("none");
    expect(hasBrandPackage({ "x": "y" })).toBe(false);
    expect(hasBrandPackage(files())).toBe(true);
    expect(extractBrandPackage({ "x": "y" })).toBeNull();
  });

  it("gera URL do ZIP persistido (arquivo sob demanda)", () => {
    const u = brandPackageUrl("http://localhost:8787/", "projA");
    expect(u).toBe("http://localhost:8787/artifacts/branding/projA/package/current.zip");
  });
});
