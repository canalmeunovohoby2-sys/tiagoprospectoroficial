import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 1) Vídeo fora das ferramentas.
// 2) Ao abrir o EDITOR DE SITES (/sites/:id) o menu lateral recolhe sozinho,
//    deixando só o chat e o preview. Fora do editor, o menu volta aberto.
describe("Editor de sites · menu recolhido e vídeo fora das ferramentas", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/app/AppShell.tsx"), "utf8");

  it("o menu lateral recolhe ao entrar no editor de sites", () => {
    expect(shell).toContain("const isSiteEditor = /^\\/sites\\/[^/]+\\/?$/.test(location.pathname);");
    expect(shell).toContain("useState(!isSiteEditor)");
    expect(shell).toContain("setSidebarOpen(!isSiteEditor)");
    expect(shell).toContain("<SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>");
  });

  it("o vídeo saiu da barra de ferramentas e o card de geração saiu da página", () => {
    const bar = readFileSync(join(process.cwd(), "src/components/sites/studio/StudioCommercialBar.tsx"), "utf8");
    expect(bar).not.toContain('id: "video"');
    const page = readFileSync(join(process.cwd(), "src/pages/SiteProjectPage.tsx"), "utf8");
    // A UI de vídeo saiu (o código de geração permanece, sem renderização).
    expect(page).not.toContain("<video src={videoBlobUrl}");
    expect(page).not.toContain("Gerar vídeo");
    expect(page).not.toContain("Baixar MP4");
  });
});
