import { describe, it, expect } from "vitest";
import { supportsMultimodal } from "../src/visual-modality";
import { buildVisualEvidence, hasScreenshot, summarizeStructuredEvidence, type VisualEvidence } from "../src/visual-evidence";

describe("visual-modality — detecção de suporte multimodal (6.0)", () => {
  it("Gemini 2.5/2.0/1.5-flash suporta", () => {
    expect(supportsMultimodal("gemini", "gemini-2.5-flash")).toBe(true);
    expect(supportsMultimodal("gemini", "gemini-2.0-flash")).toBe(true);
  });
  it("OpenAI gpt-4o suporta; gpt-3.5 NÃO", () => {
    expect(supportsMultimodal("openai", "gpt-4o")).toBe(true);
    expect(supportsMultimodal("openai", "gpt-3.5-turbo")).toBe(false);
  });
  it("DeepSeek NÃO suporta", () => {
    expect(supportsMultimodal("deepseek", "deepseek-chat")).toBe(false);
  });
  it("Ollama: qwen2.5-vl/llava suporta; qwen2.5-coder/llama3.2 NÃO", () => {
    expect(supportsMultimodal("ollama", "qwen2.5-vl:7b")).toBe(true);
    expect(supportsMultimodal("ollama", "qwen2.5-coder:3b-instruct")).toBe(false);
    expect(supportsMultimodal("ollama", "llama3.2:3b")).toBe(false);
  });
  it("capacidade desconhecida (openrouter/modelo genérico) → structured", () => {
    expect(supportsMultimodal("openrouter", "some/model")).toBe(false);
    expect(supportsMultimodal(undefined, undefined)).toBe(false);
  });
});

describe("visual-evidence — estrutura + honestidade (6.0)", () => {
  it("buildVisualEvidence monta evidência com viewport/geometria/console", () => {
    const ev = buildVisualEvidence({
      screenshot: { data: "abcd", mimeType: "image/png" },
      viewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
      geometry: { elements: [], viewport: { width: 1366, height: 768 } },
      consoleErrors: ["boom"],
    });
    expect(ev.viewport.width).toBe(1366);
    expect(ev.screenshot?.mimeType).toBe("image/png");
    expect(ev.consoleErrors).toEqual(["boom"]);
    expect(ev.capturedAt).toBeTruthy();
  });
  it("hasScreenshot distingue screenshot real de ausência", () => {
    const withShot = buildVisualEvidence({ viewport: { width: 1, height: 1 }, screenshot: { data: "x", mimeType: "image/png" } });
    const noShot = buildVisualEvidence({ viewport: { width: 1, height: 1 } });
    expect(hasScreenshot(withShot)).toBe(true);
    expect(hasScreenshot(noShot)).toBe(false);
  });
  it("summarizeStructuredEvidence não afirma análise visual por imagem", () => {
    const ev = buildVisualEvidence({ viewport: { width: 1366, height: 768, deviceScaleFactor: 1 } });
    const out = summarizeStructuredEvidence(ev);
    expect(out).toContain("modo: structured");
    expect(out).toContain("sem análise visual por imagem");
  });
  it("summarizeStructuredEvidence reflete geometria real", () => {
    const ev: VisualEvidence = buildVisualEvidence({
      viewport: { width: 1000, height: 800, deviceScaleFactor: 1 },
      geometry: {
        viewport: { width: 1000, height: 800 },
        elements: [
          { selector: ".hero h1", tag: "h1", id: "", classes: "", text: "Titulo", box: { x: 40, y: 64, width: 500, height: 60, right: 540, bottom: 124 }, style: { fontSize: "56px", fontWeight: "700" }, notFound: false },
          { selector: ".hero .cta", tag: "a", id: "", classes: "cta", text: "CTA", box: { x: 40, y: 130, width: 120, height: 40, right: 160, bottom: 170 }, style: {}, notFound: false },
        ],
      },
    });
    const out = summarizeStructuredEvidence(ev);
    expect(out).toContain(".hero h1");
    expect(out).toContain("abaixo de");
    expect(out).toContain("50.0% da largura do viewport");
  });
});
