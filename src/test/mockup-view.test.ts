import { describe, it, expect } from "vitest";
import { extractMockupResult, toMockupView, hasMockupState, mockupPreviewUrl, mockupPsdUrl } from "../lib/mockupView";

const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function filesWith(result: Record<string, unknown>): Record<string, string> {
  return { "assets/mockups/mockup-result.json": JSON.stringify(result) };
}

describe("mockupView — projeção do resultado real (10.10)", () => {
  it("só marca isReady quando o backend comprovou persisted e status applied", () => {
    const files = filesWith({
      status: "applied",
      versionId: "2026-09-09T00-00-00",
      persisted: true,
      applicationsApplied: ["BC", "A4"],
      applicationsUnsupported: [],
      modifiedColors: ["Color/Color 1", "Color/Color 2"],
      identityUsed: { name: "Bella", primary: "#111111", secondary: "#F97316", accent: "#4F46E5" },
      previews: [{ applicationId: "BC", dataUrl: PNG_1X1, bytes: 68, width: 311, height: 204 }],
      outputPsdBytes: 100,
    });
    const v = toMockupView(files);
    expect(v.hasMockup).toBe(true);
    expect(v.status).toBe("applied");
    expect(v.isReady).toBe(true);
    expect(v.applicationsApplied).toEqual(["BC", "A4"]);
    expect(v.previews[0].width).toBe(311);
    expect(v.previews[0].dataUrl).toBe(PNG_1X1);
  });

  it("status failed/persisted false → não marca pronto (sem falso sucesso)", () => {
    const files = filesWith({ status: "failed", persisted: false, applicationsApplied: [], applicationsUnsupported: [{ applicationId: "Unknown", reason: "application_not_mapped" }] });
    const v = toMockupView(files);
    expect(v.isReady).toBe(false);
    expect(v.applicationsUnsupported[0].reason).toBe("application_not_mapped");
  });

  it("sem mockup-result.json → hasMockup false (mantém honesto)", () => {
    const v = toMockupView({ "brand-state.json": "{}" });
    expect(v.hasMockup).toBe(false);
    expect(v.isReady).toBe(false);
    expect(hasMockupState({ "brand-state.json": "{}" })).toBe(false);
    expect(hasMockupState(null)).toBe(false);
  });

  it("extrai o resultado quando presente", () => {
    const r = extractMockupResult(filesWith({ status: "partial", applicationsApplied: ["BC"], previews: [] }));
    expect(r?.status).toBe("partial");
    expect(r?.applicationsApplied).toEqual(["BC"]);
    expect(extractMockupResult(null)).toBeNull();
    expect(extractMockupResult({ "x": "y" })).toBeNull();
  });

  it("monta URLs do armazenamento persistente (sem base64 gigante em generated_code)", () => {
    const u = mockupPreviewUrl("http://localhost:8787", "projA", "BC");
    expect(u).toBe("http://localhost:8787/artifacts/branding/projA/mockups/current/BC.png");
    const psd = mockupPsdUrl("http://localhost:8787/", "projA");
    expect(psd).toBe("http://localhost:8787/artifacts/branding/projA/mockups/current/master-output.psd");
  });
});
