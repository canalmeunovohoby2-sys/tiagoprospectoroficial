import { describe, it, expect, afterEach, vi } from "vitest";
import { buildResearchQueries, researchEnabled, researchBusiness, runSearchQuery, formatResearch } from "../src/research";

const REAL_KEYS = process.env.TAVILY_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TAVILY_API_KEY_01;
  delete process.env.TAVILY_API_KEY;
  if (REAL_KEYS) process.env.TAVILY_API_KEY = REAL_KEYS;
});

function mockTavily() {
  const fn = vi.fn(async () => new Response(JSON.stringify({
    results: [
      { title: "Barbearia premium - referência", url: "https://exemplo.com/barbearia", content: "site moderno com identidade forte e experiências imersivas." },
      { title: "Tendências 2026", url: "https://exemplo.com/tendencias", content: "paletas ousadas e tipografia display." },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("Research (5.26) — pesquisa web de referência", () => {
  it("buildResearchQueries monta consultas contextuais do segmento", () => {
    const qs = buildResearchQueries("Barbearia Navalha", "Barbearia", "São Paulo");
    expect(qs.length).toBeGreaterThanOrEqual(1);
    expect(qs[0].toLowerCase()).toContain("barbearia");
    expect(qs.join(" ").toLowerCase()).toContain("são paulo");
  });

  it("researchEnabled reflete a presença de chave", () => {
    expect(researchEnabled()).toBe(false);
    process.env.TAVILY_API_KEY = "tk-fake";
    expect(researchEnabled()).toBe(true);
  });

  it("sem chave → falha honesta (nunca lança)", async () => {
    delete process.env.TAVILY_API_KEY;
    const r = await researchBusiness({ businessName: "X", segment: "Pet" });
    expect(r.ok).toBe(false);
    expect(r.error ?? "").toMatch(/indispon[ií]vel/i);
    expect(r.snippets).toEqual([]);
  });

  it("com chave e Tavily ok → retorna snippets reais", async () => {
    process.env.TAVILY_API_KEY = "tk-fake";
    const fetchMock = mockTavily();
    const r = await researchBusiness({ businessName: "Barbearia Navalha", segment: "Barbearia", city: "SP" });
    expect(r.ok).toBe(true);
    expect(r.snippets.length).toBeGreaterThan(0);
    const urls = r.snippets.flatMap((s) => s.results.map((x) => x.url));
    expect(urls).toContain("https://exemplo.com/barbearia");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("runSearchQuery devolve erro honesto quando o provedor falha", async () => {
    process.env.TAVILY_API_KEY = "tk-fake";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    const r = await runSearchQuery("qualquer coisa");
    expect(r.ok).toBe(false);
    expect(r.results).toEqual([]);
  });

  it("formatResearch gera texto curto e vazio quando sem pesquisa", () => {
    expect(formatResearch({ ok: false, snippets: [], error: "x" })).toBe("");
    process.env.TAVILY_API_KEY = "tk-fake";
    mockTavily();
    return researchBusiness({ businessName: "Pet", segment: "Pet Shop" }).then((r) => {
      expect(formatResearch(r).length).toBeGreaterThan(10);
      expect(formatResearch(r).length).toBeLessThanOrEqual(2700);
    });
  });
});
