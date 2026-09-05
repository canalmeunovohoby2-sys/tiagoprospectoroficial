import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runTavilySearch } from "../../supabase/functions/search-tavily/handler";
import { runFirecrawlSearch } from "../../supabase/functions/search-firecrawl/handler";
import { runWithKeyPool, clearKeyCooldowns, isKeyCooling } from "../../supabase/functions/_shared/provider-pool";

type EnvMap = Record<string, string | undefined>;

function installDenoEnv(env: EnvMap) {
  (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno = {
    env: { get: (k: string) => env[k] },
  };
}

const TAVILY_KEYS = { TAVILY_API_KEY_01: "tvly-01", TAVILY_API_KEY_02: "tvly-02", TAVILY_API_KEY_03: "tvly-03" };
const FIRECRAWL_KEYS = { FIRECRAWL_API_KEY_01: "fc-01", FIRECRAWL_API_KEY_02: "fc-02", FIRECRAWL_API_KEY_03: "fc-03" };

function tavilyOkResponse() {
  return new Response(JSON.stringify({ results: [{ title: "A", url: "https://a.com", content: "desc" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function firecrawlOkResponse() {
  return new Response(JSON.stringify({ success: true, data: [{ title: "B", url: "https://b.com", description: "descB" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function statusResponse(status: number) {
  return new Response(JSON.stringify({ error: "x" }), { status, headers: { "Content-Type": "application/json" } });
}

// Retorna a chave usada (valor após "Bearer ") de uma chamada.
function usedKeyOf(init?: RequestInit): string {
  const auth = String(init?.headers ? (init.headers as Record<string, string>)["Authorization"] ?? (init.headers as Headers).get?.("Authorization") ?? "" : "");
  return auth.replace("Bearer ", "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Provider Key Pool — Tavily + Firecrawl (fetch mockado)", () => {
  let calls: Array<{ key: string; url: string; init?: RequestInit }> = [];

  function mockFetch(handler: (key: string, url: string, init: RequestInit | undefined) => Promise<Response> | Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const key = usedKeyOf(init);
        calls.push({ key, url: String(url), init });
        return handler(key, String(url), init);
      }),
    );
  }

  beforeEach(() => {
    installDenoEnv({ ...TAVILY_KEYS, ...FIRECRAWL_KEYS });
    clearKeyCooldowns();
    calls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1) primeira chave funciona", async () => {
    mockFetch(() => tavilyOkResponse());
    const res = await runTavilySearch("teste", 10);
    expect(res.provider).toBe("tavily");
    expect(res.keyIndex).toBe("01");
    expect(res.results.length).toBe(1);
    expect(calls.length).toBe(1);
  });

  it("2) primeira falha → segunda funciona", async () => {
    mockFetch((key) => (key === "tvly-01" ? statusResponse(401) : tavilyOkResponse()));
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
    expect(calls.length).toBe(2);
  });

  it("3) primeira e segunda falham → terceira funciona", async () => {
    mockFetch((key) => (key === "tvly-03" ? tavilyOkResponse() : statusResponse(403)));
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("03");
    expect(calls.length).toBe(3);
  });

  it("4) todas falham", async () => {
    mockFetch(() => statusResponse(500));
    const res = await runTavilySearch("teste", 10);
    expect(res.error?.code).toBe("ALL_KEYS_FAILED");
    expect(res.error?.attemptedKeys).toEqual(["01", "02", "03"]);
    expect(calls.length).toBe(3);
  });

  it("5) 429 aciona failover", async () => {
    mockFetch((key) => (key === "tvly-01" ? statusResponse(429) : tavilyOkResponse()));
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
  });

  it("6) 401 aciona failover", async () => {
    mockFetch((key) => (key === "tvly-01" ? statusResponse(401) : tavilyOkResponse()));
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
  });

  it("7) 500 aciona failover", async () => {
    mockFetch((key) => (key === "tvly-01" ? statusResponse(500) : tavilyOkResponse()));
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
  });

  it("8) 529 aciona failover", async () => {
    mockFetch((key) => (key === "tvly-01" ? statusResponse(529) : tavilyOkResponse()));
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
  });

  it("9) timeout/erro de rede aciona failover", async () => {
    mockFetch((key) => (key === "tvly-01" ? Promise.reject(new Error("network down")) : tavilyOkResponse()));
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
  });

  it("10) sucesso interrompe a sequência", async () => {
    mockFetch(() => tavilyOkResponse());
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("01");
    expect(calls.length).toBe(1);
  });

  it("11) nenhuma chamada paralela", async () => {
    const timeline: Array<[number, number]> = [];
    mockFetch(async (key) => {
      if (key !== "tvly-03") {
        timeline.push([Date.now(), 0]);
        await sleep(15);
        timeline[timeline.length - 1][1] = Date.now();
        return statusResponse(429);
      }
      return tavilyOkResponse();
    });
    await runTavilySearch("teste", 10);
    expect(calls.length).toBe(3);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i][0]).toBeGreaterThanOrEqual(timeline[i - 1][1]);
    }
  });

  it("12) chaves ausentes são ignoradas", async () => {
    installDenoEnv({ TAVILY_API_KEY_02: "tvly-02", TAVILY_API_KEY_05: "tvly-05", ...FIRECRAWL_KEYS });
    mockFetch(() => tavilyOkResponse());
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
    expect(calls.length).toBe(1);
  });

  it("13) logs não expõem segredo", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    mockFetch((key) => (key === "tvly-01" ? statusResponse(429) : tavilyOkResponse()));
    await runTavilySearch("teste", 10);
    const logged = spy.mock.calls.map((c) => JSON.stringify(c)).join(" ");
    expect(logged).not.toContain("tvly-");
    expect(logged).not.toContain("Bearer");
    spy.mockRestore();
  });

  it("14) resposta inválida aciona failover", async () => {
    mockFetch((key) => {
      if (key === "tvly-01") return new Response(JSON.stringify({ nope: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      return tavilyOkResponse();
    });
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
    expect(calls.length).toBe(2);
  });

  it("15) cooldown funciona", async () => {
    // Primeira execução: 01 falha (429) → sucesso em 02 (01 entra em cooldown).
    mockFetch((key) => (key === "tvly-01" ? statusResponse(429) : tavilyOkResponse()));
    await runTavilySearch("teste", 10);
    expect(calls.length).toBe(2);

    // Segunda execução: todas responderiam 200; 01 está em cooldown → deve tentar 02.
    calls = [];
    mockFetch(() => tavilyOkResponse());
    const res = await runTavilySearch("teste", 10);
    expect(res.keyIndex).toBe("02");
    expect(calls[0].key).toBe("tvly-02");
  });

  it("16) provider Tavily isolado (endpoint/body corretos)", async () => {
    mockFetch((key, url, init) => {
      expect(url).toContain("api.tavily.com/search");
      const body = JSON.parse(String(init?.body));
      expect(body.query).toBe("pet shop Guarulhos");
      expect(body.max_results).toBe(5);
      return tavilyOkResponse();
    });
    const res = await runTavilySearch("pet shop Guarulhos", 5);
    expect(res.provider).toBe("tavily");
    expect(res.results[0].url).toBe("https://a.com");
    expect(res.results[0].content).toBeNull();
  });

  it("17) provider Firecrawl isolado (endpoint/body/forma corretos)", async () => {
    mockFetch((key, url, init) => {
      expect(url).toContain("api.firecrawl.dev/v1/search");
      const body = JSON.parse(String(init?.body));
      expect(body.query).toBe("clínica Suzano");
      expect(body.limit).toBe(4);
      return firecrawlOkResponse();
    });
    const res = await runFirecrawlSearch("clínica Suzano", 4);
    expect(res.provider).toBe("firecrawl");
    expect(res.keyIndex).toBe("01");
    expect(res.results[0].title).toBe("B");
    expect(res.results[0].content).toBeNull();
  });
});
