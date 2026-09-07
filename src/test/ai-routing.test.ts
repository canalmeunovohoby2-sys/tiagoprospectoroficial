import { describe, it, expect } from "vitest";
import { resolveExecutionConfig, AI_PROVIDERS, providerLabel } from "../../supabase/functions/_shared/ai-routing";

describe("AI Routing (5.37) — seleção central provedor/modelo/fallback", () => {
  it("sem configuração → usa padrão global (deepseek)", () => {
    const r = resolveExecutionConfig({});
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("deepseek");
    expect(r.model).toBe("deepseek-chat");
    expect(r.source).toBe("global");
  });

  it("configuração GLOBAL é respeitada (ex.: gemini)", () => {
    const r = resolveExecutionConfig({ global: { provider: "gemini", model: "gemini-2.5-flash" } });
    expect(r.provider).toBe("gemini");
    expect(r.model).toBe("gemini-2.5-flash");
  });

  it("PROJETO sobrescreve o global", () => {
    const r = resolveExecutionConfig({ global: { provider: "deepseek", model: "deepseek-chat" }, project: { provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash-0731", fallback: "openai" } });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("project");
    expect(r.provider).toBe("nvidia");
    expect(r.fallbackProvider).toBe("openai");
  });

  it("modelo ausente → usa modelo padrão do provedor selecionado", () => {
    const r = resolveExecutionConfig({ project: { provider: "gemini" } });
    expect(r.model).toBe("gemini-2.5-flash");
  });

  it("provedor inexistente → erro de configuração (sem fallback silencioso)", () => {
    const r = resolveExecutionConfig({ project: { provider: "groq" } });
    expect(r.ok).toBe(false);
    expect(r.error ?? "").toContain("desconhecido");
  });

  it("modelo inexistente (allowlist) → erro de configuração", () => {
    const r = resolveExecutionConfig({ project: { provider: "openai", model: "modelo-que-nao-existe" }, knownModels: ["gpt-4o-mini"] });
    expect(r.ok).toBe(false);
    expect(r.error ?? "").toContain("não está disponível");
  });

  it("fallback igual ao principal → erro de configuração", () => {
    const r = resolveExecutionConfig({ project: { provider: "deepseek", model: "deepseek-chat", fallback: "deepseek" } });
    expect(r.ok).toBe(false);
  });

  it("fallback de provider válido é aceito; inválido vira erro", () => {
    expect(resolveExecutionConfig({ project: { provider: "deepseek", fallback: "openai" } }).fallbackProvider).toBe("openai");
    const bad = resolveExecutionConfig({ project: { provider: "deepseek", fallback: "groq" } });
    expect(bad.ok).toBe(false);
  });

  it("catálogo de providers inclui NVIDIA, DeepSeek, OpenAI, Gemini e OpenRouter", () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["nvidia", "deepseek", "openai", "gemini", "openrouter"]));
    expect(providerLabel("nvidia")).toContain("NVIDIA");
  });

  it("OpenRouter é aceito como provedor de execução", () => {
    const r = resolveExecutionConfig({ project: { provider: "openrouter", model: "openrouter/auto" } });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("openrouter");
    expect(r.model).toBe("openrouter/auto");
  });

  it("OpenRouter como fallback válido", () => {
    const r = resolveExecutionConfig({ project: { provider: "deepseek", fallback: "openrouter" } });
    expect(r.ok).toBe(true);
    expect(r.fallbackProvider).toBe("openrouter");
  });

  it("OpenRouter inválido como fallback retorna erro", () => {
    const r = resolveExecutionConfig({ project: { provider: "deepseek", fallback: "openrouterx" } });
    expect(r.ok).toBe(false);
  });
});
