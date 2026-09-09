import { describe, it, expect } from "vitest";
import { analyzeVisualEvidence } from "../src/visual-analysis";
import { buildVisualEvidence, type VisualEvidence } from "../src/visual-evidence";

function ev(multimodalShot: boolean): VisualEvidence {
  return buildVisualEvidence({
    ...(multimodalShot ? { screenshot: { data: "aW1n", mimeType: "image/png" as const } } : {}),
    viewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
    geometry: { elements: [], viewport: { width: 1366, height: 768 } },
    consoleErrors: ["x"],
  });
}

describe("visual-analysis — provider-agnostic (6.0)", () => {
  it("provider sem suporte multimodal → modo structured, performed=false (sem análise por imagem)", async () => {
    const r = await analyzeVisualEvidence({
      prompt: "avalie", evidence: ev(true), provider: "ollama", model: "qwen2.5-coder:3b-instruct", apiKey: "", baseUrl: "http://localhost:11434",
    });
    expect(r.mode).toBe("structured");
    expect(r.performed).toBe(false);
    expect(r.analysis).toContain("modo: structured");
  });

  it("provider multimodal + screenshot + chave → tenta multimodal; provider usado é o CONFIGURADO (não Gemini)", async () => {
    // stub global fetch para devolver uma resposta de chat completions (finge OpenAI).
    const captured: { url: string; auth?: string }[] = [];
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(typeof input === "string" ? input : input?.url ?? "");
      captured.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Composição ok, CTA em destaque." } }] }),
      } as Response;
    }) as typeof fetch;

    const r = await analyzeVisualEvidence({
      prompt: "avalie", evidence: ev(true), provider: "openai", model: "gpt-4o", apiKey: "sk-x", baseUrl: "https://api.openai.com/v1",
    });
    expect(r.mode).toBe("multimodal");
    expect(r.performed).toBe(true);
    expect(r.providerUsed).toBe("openai");
    expect(captured.some((c) => c.url.includes("/chat/completions"))).toBe(true);
    expect(captured.some((c) => c.auth === "Bearer sk-x")).toBe(true);
    // NÃO caiu para Gemini.
    expect(captured.some((c) => c.url.includes("generativelanguage"))).toBe(false);
  });

  it("provider multimodal FALHANDO → NÃO cai para Gemini; usa structured honesta (performed=false)", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch;
    const r = await analyzeVisualEvidence({
      prompt: "avalie", evidence: ev(true), provider: "openai", model: "gpt-4o", apiKey: "sk-bad", baseUrl: "https://api.openai.com/v1",
    });
    expect(r.mode).toBe("structured");
    expect(r.performed).toBe(false);
    expect(r.error).toMatch(/falhou/i);
    expect(r.analysis).toContain("modo: structured");
  });

  it("multimodal sem screenshot → structured honesta (não inventa imagem)", async () => {
    const r = await analyzeVisualEvidence({
      prompt: "avalie", evidence: ev(false), provider: "openai", model: "gpt-4o", apiKey: "sk-x", baseUrl: "https://api.openai.com/v1",
    });
    expect(r.mode).toBe("structured");
    expect(r.performed).toBe(false);
  });
});
