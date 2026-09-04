import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateText } from "../../supabase/functions/_shared/ai";

type EnvMap = Record<string, string | undefined>;

function installDenoEnv(env: EnvMap) {
  (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno = {
    env: { get: (k: string) => env[k] },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const NVIDIA_MODEL = "deepseek-ai/deepseek-v4-flash-0731";
const opts = { provider: "nvidia" as const, user: "Diga olá" };

describe("AI Adapter — NVIDIA NIM (fetch mockado)", () => {
  let calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  // mockFetch(handler) controla a resposta por teste.
  function mockFetch(handler: (url: string, body: Record<string, unknown>, n: number) => Response | Promise<Response>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return handler(String(url), JSON.parse(String(init?.body ?? "{}")), calls.length);
      }),
    );
  }

  beforeEach(() => {
    installDenoEnv({ NVIDIA_API_KEY: "nv-mock-secret", AI_PROVIDER: "nvidia" });
    calls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1) resposta 200 válida com content", async () => {
    mockFetch(() => jsonResponse({ choices: [{ message: { content: "Olá!" } }] }));
    const res = await generateText(opts);
    expect(res.text).toBe("Olá!");
    expect(res.provider).toBe("nvidia");
    expect(res.model).toBe(NVIDIA_MODEL);
    expect(calls[0].url).toContain("/chat/completions");
    expect(calls[0].url).toContain("integrate.api.nvidia.com");
    expect(calls[0].body.model).toBe(NVIDIA_MODEL);
    expect(calls[0].body.stream).toBe(false);
  });

  it("2) content multilinha", async () => {
    mockFetch(() => jsonResponse({ choices: [{ message: { content: "Linha 1\nLinha 2" } }] }));
    const res = await generateText(opts);
    expect(res.text).toContain("Linha 2");
  });

  it("3) reasoning presente é descartado", async () => {
    mockFetch(() => jsonResponse({ choices: [{ message: { content: "Conteúdo final", reasoning: "oculto" } }] }));
    const res = await generateText(opts);
    expect(res.text).toBe("Conteúdo final");
    expect(res.text).not.toContain("oculto");
  });

  it("4) reasoning_content presente é descartado", async () => {
    mockFetch(() => jsonResponse({ choices: [{ message: { content: "Texto útil", reasoning_content: "pensando..." } }] }));
    const res = await generateText(opts);
    expect(res.text).toBe("Texto útil");
    expect(res.text).not.toContain("pensando");
  });

  it("5) resposta sem reasoning funciona", async () => {
    mockFetch(() => jsonResponse({ choices: [{ message: { content: "Simples" } }] }));
    const res = await generateText(opts);
    expect(res.text).toBe("Simples");
  });

  it("6) sem content → erro empty", async () => {
    mockFetch(() => jsonResponse({ choices: [{ message: {} }] }));
    await expect(generateText(opts)).rejects.toMatchObject({ kind: "empty", status: 502 });
  });

  it("7) 401 → auth", async () => {
    mockFetch(() => jsonResponse({ error: { message: "invalid api key" } }, 401));
    await expect(generateText(opts)).rejects.toMatchObject({ kind: "auth", status: 401 });
  });

  it("8) 403 → auth", async () => {
    mockFetch(() => jsonResponse({ error: { message: "forbidden" } }, 403));
    await expect(generateText(opts)).rejects.toMatchObject({ kind: "auth", status: 403 });
  });

  it("9) 429 → rate_limit", async () => {
    mockFetch(() => jsonResponse({ error: { message: "rate limited" } }, 429));
    await expect(generateText(opts)).rejects.toMatchObject({ kind: "rate_limit", status: 429 });
  });

  it("10) 500 → upstream", async () => {
    mockFetch(() => jsonResponse({ error: { message: "boom" } }, 500));
    await expect(generateText(opts)).rejects.toMatchObject({ kind: "upstream", status: 500 });
  });

  it("11) timeout (abort)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      ),
    );
    await expect(generateText({ ...opts, timeoutMs: 40 })).rejects.toMatchObject({ kind: "timeout", status: 504 });
  });

  it("12) corpo não-JSON → erro controlado (AiError)", async () => {
    mockFetch(() => new Response("não é json", { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(generateText(opts)).rejects.toBeInstanceOf(Error);
  });

  it("400 por chat_template_kwargs → reenvia sem reasoning (1x)", async () => {
    mockFetch((_url, _body, n) =>
      n === 1
        ? jsonResponse({ error: { message: "Unknown argument: 'chat_template_kwargs'" } }, 400)
        : jsonResponse({ choices: [{ message: { content: "ok sem reasoning" } }] }),
    );
    const res = await generateText(opts);
    expect(res.text).toBe("ok sem reasoning");
    expect(calls.length).toBe(2);
    expect(calls[1].body.chat_template_kwargs).toBeUndefined();
  });
});
