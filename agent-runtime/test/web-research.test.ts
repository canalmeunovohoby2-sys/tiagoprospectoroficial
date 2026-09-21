import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { researchEnabled, firecrawlEnabled, webResearchEnabled, runSearchQuery, runFirecrawlSearch, runPageFetch } from "../src/research";
import { activityForTool, resultForTool } from "../src/studio/live-events";

// As chaves vivem no .env.local do runtime (TAVILY_API_KEY_01.. e
// FIRECRAWL_API_KEY_01..). Quando uma chave falha (saldo/quota), a PRÓXIMA é usada.
const T = "TAVILY_API_KEY_01";
const T2 = "TAVILY_API_KEY_02";
const F = "FIRECRAWL_API_KEY_01";
const F2 = "FIRECRAWL_API_KEY_02";

function clearKeys() {
  for (const k of [T, T2, F, F2, "TAVILY_API_KEY", "FIRECRAWL_API_KEY"]) delete process.env[k];
}

afterEach(() => { clearKeys(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("pesquisa web · credenciais e failover por saldo", () => {
  it("researchEnabled/firecrawlEnabled/webResearchEnabled refletem as chaves do runtime", () => {
    clearKeys();
    expect(researchEnabled()).toBe(false);
    expect(firecrawlEnabled()).toBe(false);
    expect(webResearchEnabled()).toBe(false);
    process.env[T] = "k1";
    expect(researchEnabled()).toBe(true);
    expect(webResearchEnabled()).toBe(true);
    delete process.env[T];
    process.env[F] = "f1";
    expect(firecrawlEnabled()).toBe(true);
    expect(webResearchEnabled()).toBe(true);
  });

  it("Tavily: chave 1 sem saldo → usa a chave 2 automaticamente", async () => {
    process.env[T] = "k1";
    process.env[T2] = "k2";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { headers?: Record<string, string> }) => {
      const auth = String(init?.headers?.Authorization ?? "");
      calls.push(auth);
      if (auth.includes("k1")) return { status: 402, json: async () => ({}) } as unknown as Response;
      return { status: 200, json: async () => ({ results: [{ title: "A", url: "https://a.com", content: "x" }] }) } as unknown as Response;
    }));
    const r = await runSearchQuery("teste");
    expect(r.ok).toBe(true);
    expect(r.results[0].url).toBe("https://a.com");
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("k1");
    expect(calls[1]).toContain("k2");
  });

  it("Firecrawl: busca e abertura de página com failover de chave", async () => {
    process.env[F] = "f1";
    process.env[F2] = "f2";
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n += 1;
      if (n === 1) return { status: 429, json: async () => ({}) } as unknown as Response;
      return { status: 200, json: async () => ({ data: [{ title: "T", url: "https://x.com", description: "d" }] }) } as unknown as Response;
    }));
    const s = await runFirecrawlSearch("qualquer");
    expect(s.ok).toBe(true);
    expect(n).toBe(2);

    n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n += 1;
      if (n === 1) return { status: 402, json: async () => ({}) } as unknown as Response;
      return { status: 200, json: async () => ({ data: { markdown: "conteudo da pagina com mais de quarenta caracteres para validar" } }) } as unknown as Response;
    }));
    const p = await runPageFetch("https://exemplo.com/noticia");
    expect(p.ok).toBe(true);
    expect(p.content).toContain("conteudo da pagina");
  });

  it("sem chave: a tool NÃO existe e a mensagem é honesta", async () => {
    clearKeys();
    const r = await runSearchQuery("x");
    expect(r.ok).toBe(false);
    expect(String(r.error)).toContain("indisponível");
    const agent = readFileSync(join(process.cwd(), "src/prospector-site-agent.ts"), "utf8");
    expect(agent).toContain("researchEnabled() || firecrawlEnabled()");
    expect(agent).toContain('name: "web_fetch"');
    expect(agent).toContain("Nunca diga que não tem acesso à web sem chamar esta ferramenta");
  });

  it("chat: atividade e resultado REAIS para pesquisa e abertura de fonte", () => {
    expect(activityForTool("web_search", "")?.detail).toContain("Pesquisando na web");
    expect(activityForTool("web_fetch", "")?.detail).toContain("Abrindo a fonte");
    expect(resultForTool("web_search", "", true)?.detail).toBe("Pesquisa concluída.");
    expect(resultForTool("web_fetch", "", true)?.detail).toBe("Fonte lida.");
    expect(resultForTool("web_search", "", false)?.detail).toContain("Não consegui consultar");
    expect(resultForTool("web_fetch", "", false)?.detail).toContain("não respondeu");
  });
});
