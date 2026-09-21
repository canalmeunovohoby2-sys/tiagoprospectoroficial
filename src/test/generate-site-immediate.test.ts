import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// BUG: clicar em "Gerar site" (Lead ou criação com prompt) só NAVEGAVA para o preview;
// a geração exigia um SEGUNDO clique dentro da página. Agora a navegação leva a intenção
// explícita e a página dispara a MESMA ação do botão — uma única vez.
describe("Gerar site · inicia a geração imediatamente", () => {
  it("Lead e criação com prompt levam a intenção explícita", () => {
    expect(read("src/pages/Leads.tsx")).toContain("state: { startGeneration: true }");
    expect(read("src/pages/Sites.tsx")).toContain("state: { startGeneration: true }");
  });

  it("o projeto consome a intenção UMA vez (1 clique = 1 execução)", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("startIntentRef");
    expect(page).toContain("startGeneration");
    expect(page).toContain("handleGenerateSite()");
    // limpa a intenção para reload/voltar não re-disparar
    expect(page).toContain("window.history.replaceState");
  });

  it("abrir o projeto normalmente NÃO gera (FASE 7.2 preservada)", () => {
    expect(read("src/pages/Sites.tsx")).toContain("onOpen={() => navigate(`/sites/${p.id}`)}");
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).not.toContain("markReactKickoff(");
  });
});
