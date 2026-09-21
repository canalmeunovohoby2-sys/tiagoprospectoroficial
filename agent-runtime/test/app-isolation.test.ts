import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// O app servido pelo agente local precisa ser "cross-origin isolated" para o
// WebContainer (SharedArrayBuffer). Sem COOP/COEP o Studio mostra
// "WebContainer indisponível — SharedArrayBuffer indisponível" e o preview fica branco.
describe("app servido pelo agente: isolamento (WebContainer/SharedArrayBuffer)", () => {
  const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");

  it("o handler estático do app envia COOP/COEP (credentialless)", () => {
    const idx = src.indexOf("APP SERVIDO PELO PRÓPRIO AGENTE");
    expect(idx).toBeGreaterThan(0);
    const bloco = src.slice(idx, idx + 2200);
    expect(bloco).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(bloco).toContain('"Cross-Origin-Embedder-Policy": "credentialless"');
  });

  it("a rota de preview (site do cliente) NÃO leva COEP e serve os assets do projeto", () => {
    const idx = src.indexOf('url.pathname.startsWith("/preview/")');
    expect(idx).toBeGreaterThan(0);
    // COEP bloqueava recursos externos (Google Maps, imagens) dentro do site do cliente.
    const rota = src.slice(idx, idx + 3200);
    expect(rota).not.toContain('"Cross-Origin-Embedder-Policy"');
    expect(src).toContain('"Cross-Origin-Resource-Policy": "cross-origin"');
    // Assets do projeto (/assets/*) servidos do WORKSPACE, com o token do preview.
    expect(src).toContain('url.pathname.includes("/assets/")');
    expect(src).toContain("public\", \"assets\"");
  });
});
