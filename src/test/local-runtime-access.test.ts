import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// REGRESSÃO (Chrome 153, reproduzido): com a permissão de rede local JÁ concedida,
// o fetch simples do site publicado (Vercel/HTTPS) para http://127.0.0.1:8787/health
// responde 200, mas o MESMO fetch com `targetAddressSpace` falha com
// "TypeError: Failed to fetch". Como o health check usava essa opção, o app publicado
// mostrava "Agente local não encontrado" com o runtime no ar.
describe("acesso do site publicado ao Agent Runtime local", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/siteProjectsApi.ts"), "utf8");

  it("não usa targetAddressSpace no fetch (quebra o acesso no Chrome)", () => {
    expect(src).not.toMatch(/targetAddressSpace\s*:/);
  });

  it("consulta /health no runtime local (127.0.0.1:8787)", () => {
    expect(src).toContain('LOCAL_AGENT_RUNTIME_URL = "http://127.0.0.1:8787"');
    expect(src).toContain("LOCAL_RUNTIME_HEALTH");
  });

  it("o health check da UI é paciente e tenta de novo (prompt de permissão do Chrome)", () => {
    const idx = src.indexOf("export async function localRuntimeHealth");
    const bloco = src.slice(idx, idx + 400);
    expect(bloco).toContain("localRuntimeAvailable(20_000)");
    expect(bloco).toContain("localRuntimeAvailable(8_000)");
  });
});
