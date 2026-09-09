import { describe, it, expect } from "vitest";
import { extractBrandPdf, toBrandPdfView, hasBrandPdf, brandPdfUrl, PDF_RESULT_PATH } from "../lib/brandPdfView";

const result = {
  status: "ready", versionId: "v3", identityName: "Bella", pageCount: 10,
  createdAt: "2026-09-09T00:00:00Z", primary: "#4F46E5", validationOk: true, persisted: true, pdfRelPath: "pdf/current.pdf",
};

function files() { return { [PDF_RESULT_PATH]: JSON.stringify(result) }; }

describe("brandPdfView — Manual da Identidade (11)", () => {
  it("só marca ready quando persistido + validado", () => {
    const v = toBrandPdfView(files());
    expect(v.state).toBe("ready");
    expect(v.versionId).toBe("v3");
    expect(v.pageCount).toBe(10);
    expect(v.primary).toBe("#4F46E5");
  });

  it("persisted/validation falho → error (não mostra falso pronto)", () => {
    const v = toBrandPdfView({ [PDF_RESULT_PATH]: JSON.stringify({ ...result, persisted: false, validationOk: false, status: "error" }) });
    expect(v.state).toBe("error");
    expect(v.pdfUrl).toBeNull();
  });

  it("sem manifesto → none", () => {
    expect(toBrandPdfView(null).state).toBe("none");
    expect(hasBrandPdf({ "brand-state.json": "{}" })).toBe(false);
    expect(hasBrandPdf({ [PDF_RESULT_PATH]: JSON.stringify(result) })).toBe(true);
    expect(extractBrandPdf({ "x": "y" })).toBeNull();
  });

  it("gera URL do PDF persistido (binário sob demanda)", () => {
    const u = brandPdfUrl("http://localhost:8787/", "projA");
    expect(u).toBe("http://localhost:8787/artifacts/branding/projA/pdf/current.pdf");
  });
});
