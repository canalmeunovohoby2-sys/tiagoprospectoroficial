import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Proposta PDF · fluxo restaurado para projetos React (sem spec)", () => {
  it("não bloqueia mais o PDF por falta de spec — usa os dados reais do projeto/lead", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    // O antigo early-return por falta de spec NÃO existe mais.
    expect(page).not.toContain('Gere o site antes de exportar a proposta');
    // Monta os dados da proposta a partir do negócio real.
    expect(page).toContain("pdfSpec");
    expect(page).toMatch(/const specData = currentSpec\(\)/);
    expect(page).toMatch(/business:\s*\{/);
  });

  it("preserva a captura REAL (desktop/mobile) e a apresentação profissional existente", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("captureWorkspaceScreenshots(codeFiles)");
    expect(page).toMatch(/shots\.desktop && .*shots\.mobile|!shots\.desktop \|\| !shots\.mobile/);
    expect(page).toMatch(/buildCommercialPdf\(pdfSpec/);
    expect(page).toMatch(/\[shots\.desktop, shots\.mobile\]/); // PDF só com capturas reais
  });

  it("o gerador do PDF mantém os mockups (laptop/iPhone) e as 4 páginas", () => {
    const pdf = read("src/lib/sitePdf.ts");
    expect(pdf).toContain("renderProposalMockups");
    expect(pdf).toMatch(/IPHONE/);
    // capa + laptop + iphone + fechamento (múltiplas páginas)
    const pages = (pdf.match(/doc\.addPage\(\)/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(3);
  });

  it("a captura dá tempo do runtime COMPILAR o projeto React", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    expect(api).toMatch(/\/capture/);
    expect(api).toContain("180_000"); // build (npm run build) + screenshots
  });
});

describe("Vídeo · fluxo preservado (runtime compila e grava o site real)", () => {
  it("o front chama /video com os arquivos reais e baixa o artefato autenticado", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    expect(api).toMatch(/\/video/);
    expect(api).toContain("fetchRuntimeArtifact");
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("generateSiteVideo({ files: realFiles, projectId: project.id");
  });

  it("o runtime prepara o diretório compilado antes de capturar/gravar", () => {
    const server = read("agent-runtime/src/server.ts");
    expect(server).toContain("prepareSiteServeDir");
    // usado nas duas rotas
    const uses = (server.match(/prepareSiteServeDir\(/g) ?? []).length;
    expect(uses).toBeGreaterThanOrEqual(3); // definição + /capture + /video
    // compila o React (nunca serve o código-fonte)
    expect(server).toContain("buildReactProject(root)");
  });
});
