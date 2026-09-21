import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// O Google Maps embed é bloqueado pelo COEP dentro do preview do editor
// (ERR_BLOCKED_BY_RESPONSE). A rota /preview serve o site buildado SEM COEP —
// é lá (e no site publicado) que o Google Maps real carrega.
describe("Maps · preview completo em aba (sem COEP)", () => {
  const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");

  it("existe a rota GET /preview/:projectId com auth por token na query", () => {
    expect(server).toContain('url.pathname.startsWith("/preview/")');
    expect(server).toContain('url.searchParams.get("t")');
    expect(server).toContain("Autenticação necessária para abrir o preview.");
  });

  it("a resposta do preview NÃO envia COEP (é o que permite o Google Maps)", () => {
    const block = server.slice(server.indexOf('url.pathname.startsWith("/preview/")'));
    const upTo = block.slice(0, block.indexOf("/capture") === -1 ? 2500 : block.indexOf("/capture"));
    expect(upTo).not.toMatch(/Cross-Origin-Embedder-Policy/i);
    expect(upTo).toContain("text/html");
  });

  it("o iframe do Google é criado com a URL oficial do embed", () => {
    const map = readFileSync(join(process.cwd(), "src/studio/agent-core/static-map.ts"), "utf8");
    expect(map).toContain("maps.google.com/maps?q=");
    expect(map).toContain("output=embed");
  });
});
