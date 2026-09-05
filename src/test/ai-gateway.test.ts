import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateText, AIProviderConfigurationError } from "../../supabase/functions/_shared/ai";

type Env = Record<string, string | undefined>;
function installEnv(env: Env) {
  (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno = { env: { get: (k: string) => env[k] } };
}
function okContent(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function okGemini(content: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function err(status: number) {
  return new Response(JSON.stringify({ error: "x" }), { status, headers: { "Content-Type": "application/json" } });
}

const KEYS = {
  NVIDIA_API_KEY: "nvk", DEEPSEEK_API_KEY: "dsk", OPENAI_API_KEY: "oak", GEMINI_API_KEY: "gmk",
};

describe("AI Gateway — multi-provider", () => {
  let calls: Array<{ url: string; body: unknown }> = [];
  function mockFetch(handler: (url: string, n: number) => Response | Promise<Response>) {
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return handler(String(url), calls.length);
    }));
  }

  beforeEach(() => { installEnv({ ...KEYS }); calls = []; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("selection via AI_PROVIDER=deepseek usa api.deepseek.com", async () => {
    installEnv({ ...KEYS, AI_PROVIDER: "deepseek", DEEPSEEK_MODEL: "deepseek-chat" });
    mockFetch((url) => okContent("ok-deep"));
    const res = await generateText({ user: "oi" });
    expect(res.provider).toBe("deepseek");
    expect(res.model).toBe("deepseek-chat");
    expect(calls[0].url).toContain("api.deepseek.com/chat/completions");
  });

  it("selection via AI_PROVIDER=openai usa api.openai.com e envia temperature", async () => {
    installEnv({ ...KEYS, AI_PROVIDER: "openai", AI_MODEL: "gpt-4o", AI_TEMPERATURE: "0.5" });
    mockFetch((url) => okContent("ok-oai"));
    const res = await generateText({ user: "oi" });
    expect(res.provider).toBe("openai");
    expect(calls[0].url).toContain("api.openai.com/v1/chat/completions");
    expect((calls[0].body as { temperature: number }).temperature).toBe(0.5);
  });

  it("gemini preservado (AI_PROVIDER=gemini)", async () => {
    installEnv({ ...KEYS, AI_PROVIDER: "gemini", GEMINI_MODEL: "gemini-2.5-flash" });
    mockFetch((url) => okGemini("ok-gemini"));
    const res = await generateText({ user: "oi" });
    expect(res.provider).toBe("gemini");
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
  });

  it("provider inválido lança erro de configuração", async () => {
    installEnv({ ...KEYS, AI_PROVIDER: "nonsense" });
    await expect(generateText({ user: "oi" })).rejects.toBeInstanceOf(AIProviderConfigurationError);
  });

  it("API key ausente lança erro de configuração", async () => {
    installEnv({ AI_PROVIDER: "openai" });
    await expect(generateText({ user: "oi" })).rejects.toBeInstanceOf(AIProviderConfigurationError);
  });

  it("retry transitório (429 depois 200)", async () => {
    installEnv({ ...KEYS, AI_PROVIDER: "openai", AI_MAX_RETRIES: "1" });
    mockFetch((_u, n) => (n === 1 ? err(429) : okContent("recuperou")));
    const res = await generateText({ user: "oi" });
    expect(res.text).toBe("recuperou");
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("fallback: nvidia 500 → deepseek responde", async () => {
    installEnv({ ...KEYS, AI_PROVIDER: "nvidia", AI_FALLBACK_PROVIDER: "deepseek", DEEPSEEK_MODEL: "deepseek-chat", AI_MAX_RETRIES: "0" });
    mockFetch((url) => (url.includes("nvidia.com") ? err(500) : okContent("via-fallback")));
    const res = await generateText({ user: "oi" });
    expect(res.provider).toBe("deepseek");
    expect(res.fallbackUsed).toBe(true);
    expect(res.text).toBe("via-fallback");
  });

  it("erro não transitório não dispara fallback", async () => {
    installEnv({ ...KEYS, AI_PROVIDER: "nvidia", AI_FALLBACK_PROVIDER: "deepseek", AI_MAX_RETRIES: "0" });
    mockFetch((url) => (url.includes("nvidia.com") ? err(400) : okContent("não deveria")));
    await expect(generateText({ user: "oi" })).rejects.toMatchObject({ kind: "bad_request" });
    expect(calls.every((c) => c.url.includes("nvidia.com"))).toBe(true);
  });
});
