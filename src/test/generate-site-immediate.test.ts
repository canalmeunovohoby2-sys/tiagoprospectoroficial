import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// BUG: clicar em "Gerar site" (Lead ou criação com prompt) abria o Studio no RASCUNHO e
// exigia um SEGUNDO clique. Agora o projeto React em rascunho inicia a geração sozinho ao
// entrar, e o card "✨ Gerar site" foi removido do preview.
describe("Gerar site · inicia a geração sozinho (sem segundo clique)", () => {
  it("a página inicia a geração quando o projeto React está em rascunho", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("autoStartRef");
    expect(page).toContain("isBootstrapFiles(draftFiles)");
    expect(page).toContain("void handleGenerateSite()");
    expect(page).toContain("aiRunning || generating");
  });

  it("o card 'Gerar site' saiu do preview", () => {
    const preview = read("src/components/sites/studio/WebContainerPreview.tsx");
    expect(preview).not.toContain("Rascunho — peça no chat para gerar o site");
    expect(preview).not.toContain("✨ Gerar site");
  });

  it("Lead e criação com prompt seguem levando a intenção (sem duplicar execução)", () => {
    expect(read("src/pages/Leads.tsx")).toContain("state: { startGeneration: true }");
    expect(read("src/pages/Sites.tsx")).toContain("state: { startGeneration: true }");
    // uma única via de disparo automático (ref) — nunca duas gerações em paralelo
    const page = read("src/pages/SiteProjectPage.tsx");
    expect((page.match(/autoStartRef\.current = true/g) ?? []).length).toBe(1);
  });
});
