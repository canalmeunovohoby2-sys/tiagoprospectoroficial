import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Teste de invariantes do pipeline 100% gratuito (leitura estática do Edge Function).
// Garante que dependências pagas/scraping não voltem ao fluxo de prospecção.
const FILE = resolve(process.cwd(), "supabase/functions/search-places/index.ts");
const code = readFileSync(FILE, "utf8");

describe("Pipeline de prospecção 100% gratuito", () => {
  it("Google Places está desacoplado (funciona com ou sem GOOGLE_API_KEY)", () => {
    expect(code).toContain("const USE_GOOGLE_PLACES = false;");
    // A descoberta Google só roda se a flag estiver ligada — hoje é false.
    expect(code).toContain("if (USE_GOOGLE_PLACES && GOOGLE_KEY_LOADED");
    // Não existe descoberta Google disparada apenas pela presença da key.
    expect(code).not.toMatch(/if \(\s*GOOGLE_KEY_LOADED\s*&&/);
  });

  it("não usa Tavily/Firecrawl (nem as edge functions correspondentes)", () => {
    expect(code).not.toMatch(/runWebSources|callWebFunction/);
    expect(code).not.toMatch(/search-tavily|search-firecrawl/);
    expect(code).not.toMatch(/\btavily\b\s*:/i);
  });

  it("não faz scraping de buscador (DuckDuckGo/Brave/Serper)", () => {
    expect(code).not.toMatch(/duckduckgo\.com/i);
    expect(code).not.toMatch(/api\.search\.brave\.com/i);
    expect(code).not.toMatch(/google\.serper\.dev/i);
    expect(code).not.toMatch(/findWebsiteViaPlaces|findCandidatesViaTavily|findWebsiteViaDuckDuckGo/);
  });

  it("não executa o regex caro de advogados (mantém filtros estruturados)", () => {
    expect(code).not.toMatch(/regex:\s*["']advogad\|advocaci\|lawyer\|oab/);
    // office/amenity=lawyer continuam (cobertura estruturada).
    expect(code).toMatch(/"office",\s*value:\s*"lawyer"/);
    expect(code).toMatch(/"amenity",\s*value:\s*"lawyer"/);
  });

  it("website vem apenas do OSM (sem adivinhação de domínio)", () => {
    // A descoberta de website por terceiros foi removida.
    expect(code).not.toMatch(/discoverWebsiteForLead|runWebsiteDiscovery|validateCandidateWebsite/);
    // Mapeamentos OSM ainda capturam website/contact:website.
    expect(code).toMatch(/contact:website/);
  });

  it("enriquecimento usa somente o próprio domínio (fetchSiteHtml)", () => {
    expect(code).toContain("fetchSiteHtml");
    // O enriquecimento gratuito é o único caminho de contato web.
    expect(code).toMatch(/mode:\s*"own_site"/);
  });
});
