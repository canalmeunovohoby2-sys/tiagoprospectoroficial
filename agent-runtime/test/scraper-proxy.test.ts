import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// O runtime local é a ÚNICA ponte para os scrapers: a Edge Function do Supabase roda
// na nuvem e não alcança 127.0.0.1. O navegador fala só com 127.0.0.1:8787.
const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");

describe("runtime · ponte para os scrapers locais (/maps e /photos)", () => {
  it("expoe as duas rotas POST (e apenas no runtime local)", () => {
    expect(src).toContain('url.pathname === "/maps" || url.pathname === "/photos"');
    expect(src).toContain('req.method === "POST"');
  });

  it("encaminha para 8788 (maps) e 8789 (photos), sem reimplementar scraping", () => {
    expect(src).toContain('"http://127.0.0.1:8788"');
    expect(src).toContain('"http://127.0.0.1:8789"');
    expect(src).toContain('new URL("/scrape-get", baseUrl)');
    // Não duplica a implementação: nenhuma regex de parsing de HTML/JSON do Google aqui.
    expect(src).not.toContain("google_maps_data.json");
    expect(src).not.toContain("undetected_chromedriver");
  });

  it("exige autenticacao (mesmo resolveIdentity) — nunca anonima", () => {
    const idx = src.indexOf('url.pathname === "/maps" || url.pathname === "/photos"');
    const bloco = src.slice(idx, idx + 900);
    expect(bloco).toContain("resolveIdentity(req.headers.authorization)");
    expect(bloco).toContain("401");
    expect(bloco).not.toContain("skipAuth");
  });

  it("valida a query (400) e trata scraper fora do ar (502 com orientacao)", () => {
    const idx = src.indexOf('url.pathname === "/maps" || url.pathname === "/photos"');
    const bloco = src.slice(idx, idx + 2600);
    expect(bloco).toContain("query é obrigatória");
    expect(bloco).toContain("400");
    expect(bloco).toContain("502");
    expect(bloco).toContain("INICIAR-TIAGOPROSPECTOR.bat");
  });

  it("tem timeout proprio no encaminhamento", () => {
    expect(src).toContain("SCRAPER_PROXY_TIMEOUT_MS");
    expect(src).toContain("AbortSignal.timeout(timeoutMs)");
  });
});
