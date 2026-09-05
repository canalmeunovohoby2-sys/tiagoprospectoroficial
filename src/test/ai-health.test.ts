import { describe, it, expect } from "vitest";
import { runHealthCheck, PROVIDER_DEFS } from "../../supabase/functions/ai-health/handler";
import { AIProviderRateLimitError, AIProviderUnavailableError, AIProviderTimeoutError, AIProviderConfigurationError, AIProviderError } from "../../supabase/functions/_shared/ai";

type Env = Record<string, string | undefined>;
const makeEnv = (env: Env): ((k: string) => string | undefined) => (k: string) => env[k];

describe("AI Health Check", () => {
  const KEYS = { NVIDIA_API_KEY: "nvk-secret", DEEPSEEK_API_KEY: "dsk-secret", OPENAI_API_KEY: "oak-secret", GEMINI_API_KEY: "gmk-secret" };

  it("identifica configurados e não configurados sem expor secrets", async () => {
    const env = makeEnv({ ...KEYS, AI_PROVIDER: "nvidia" });
    const payload = await runHealthCheck({ getEnv: env, runProvider: async () => ({ model: "deepseek-ai/deepseek-v4-flash-0731" }) });
    expect(payload.providers.find((p) => p.name === "nvidia")?.configured).toBe(true);
    expect(payload.providers.find((p) => p.name === "openai")?.configured).toBe(true);
    const ser = JSON.stringify(payload);
    expect(ser).not.toContain("nvk-secret");
    expect(ser).not.toContain("dsk-secret");
  });

  it("provider ativo online com modelo resolvido", async () => {
    const env = makeEnv({ ...KEYS, AI_PROVIDER: "nvidia", NVIDIA_MODEL: "deepseek-ai/deepseek-v4-flash-0731" });
    const payload = await runHealthCheck({ getEnv: env, runProvider: async () => ({ model: "deepseek-ai/deepseek-v4-flash-0731" }) });
    expect(payload.activeProvider).toBe("nvidia");
    expect(payload.testedProvider).toBe("nvidia");
    expect(payload.providers.find((p) => p.name === "nvidia")?.status).toBe("online");
    expect(payload.activeModel).toBe("deepseek-ai/deepseek-v4-flash-0731");
    expect(payload.providers.find((p) => p.name === "nvidia")?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("AI_MODEL sobrescreve modelo default", async () => {
    const env = makeEnv({ ...KEYS, AI_PROVIDER: "gemini", AI_MODEL: "gemini-2.5-pro" });
    const payload = await runHealthCheck({ getEnv: env, runProvider: async () => ({ model: "gemini-2.5-pro" }) });
    expect(payload.activeModel).toBe("gemini-2.5-pro");
    expect(payload.providers.find((p) => p.name === "gemini")?.model).toBe("gemini-2.5-pro");
  });

  it("classifica erros (429/503/529/timeout/config/bad)", async () => {
    const cases: Array<{ e: Error; want: string }> = [
      { e: new AIProviderRateLimitError(undefined, "nvidia"), want: "rate_limited" },
      { e: new AIProviderUnavailableError(500, undefined, "nvidia"), want: "unavailable" },
      { e: new AIProviderUnavailableError(503, undefined, "nvidia"), want: "unavailable" },
      { e: new AIProviderUnavailableError(529, undefined, "nvidia"), want: "unavailable" },
      { e: new AIProviderTimeoutError(undefined, "nvidia"), want: "timeout" },
      { e: new AIProviderConfigurationError("x", "nvidia"), want: "configuration_error" },
      { e: new AIProviderError("bad", 400, "bad_request", undefined, "nvidia"), want: "error" },
    ];
    for (const c of cases) {
      const env = makeEnv({ NVIDIA_API_KEY: "nvk", AI_PROVIDER: "nvidia" });
      const payload = await runHealthCheck({ getEnv: env, runProvider: async () => { throw c.e; } });
      expect(payload.providers.find((p) => p.name === "nvidia")?.status).toBe(c.want);
    }
  });

  it("fallback é identificado", async () => {
    const env = makeEnv({ ...KEYS, AI_PROVIDER: "nvidia", AI_FALLBACK_PROVIDER: "deepseek" });
    const payload = await runHealthCheck({ getEnv: env, runProvider: async () => ({ model: "m" }) });
    expect(payload.fallbackProvider).toBe("deepseek");
  });

  it("provider ativo sem chave → not_configured", async () => {
    const env = makeEnv({ AI_PROVIDER: "deepseek" });
    const payload = await runHealthCheck({ getEnv: env, runProvider: async () => ({ model: "m" }) });
    expect(payload.providers.find((p) => p.name === "deepseek")?.status).toBe("not_configured");
    expect(payload.testedProvider).toBeNull();
  });

  it("AI_PROVIDER inválido → ativo null (sem crash)", async () => {
    const env = makeEnv({ ...KEYS, AI_PROVIDER: "desconhecido" });
    const payload = await runHealthCheck({ getEnv: env, runProvider: async () => ({ model: "m" }) });
    expect(payload.activeProvider).toBeNull();
    expect(payload.testedProvider).toBeNull();
  });
});
