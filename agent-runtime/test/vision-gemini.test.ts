import { describe, it, expect } from "vitest";
import { formatVisualReview, type VisualReviewResult } from "../src/vision-gemini";

describe("vision-gemini formatação (5.23)", () => {
  it("formata diagnóstico com issues para o Agent Loop", () => {
    const r: VisualReviewResult = {
      ok: true, usedVision: true, summary: "CTA invisível",
      issues: [{ severity: "alta", area: "cta", description: "botão sem contraste", fix: "escureça o botão" }],
    };
    const out = formatVisualReview(r);
    expect(out).toContain("VISUAL REVIEW (Gemini Vision)");
    expect(out).toContain("[alta]");
    expect(out).toContain("escureça o botão");
  });

  it("sem problemas retorna 'nenhum claro'", () => {
    const r: VisualReviewResult = { ok: true, usedVision: true, summary: "ok", issues: [] };
    expect(formatVisualReview(r)).toContain("nenhum claro");
  });

  it("quando visão NÃO executou, avisa honestamente", () => {
    const r: VisualReviewResult = { ok: false, usedVision: false, error: "503" };
    expect(formatVisualReview(r)).toContain("NÃO EXECUTADO");
    expect(formatVisualReview(r)).toContain("sem suporte");
  });
});
