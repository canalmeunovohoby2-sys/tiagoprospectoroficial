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

  it("a rota de preview (iframe same-origin) também é isolada", () => {
    const idx = src.indexOf('url.pathname.startsWith("/preview/")');
    const bloco = src.slice(idx, idx + 2500);
    expect(bloco).toContain('"Cross-Origin-Embedder-Policy": "credentialless"');
    expect(bloco).toContain('"Cross-Origin-Resource-Policy": "cross-origin"');
  });
});
