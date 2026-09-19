import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReactTemplateFiles, REACT_TEMPLATE_PATHS, REACT_BOOTSTRAP_MARKER, isBootstrapFiles } from "@/lib/studio/reactTemplate";
import { PHASE_LABEL } from "@/lib/studio/chatModel";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// FASE 7.1 — Preview rápido (lockfile), rascunho honesto e rótulos operacionais.

describe("FASE 7.1 · package-lock.json do template (boot rápido no WebContainer)", () => {
  it("existe no template, é JSON válido e bate com o package.json", () => {
    const files = buildReactTemplateFiles();
    expect(REACT_TEMPLATE_PATHS).toContain("package-lock.json");
    expect(files["package-lock.json"]).toBeTruthy();

    const lock = JSON.parse(files["package-lock.json"]);
    const pkg = JSON.parse(files["package.json"]);
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
    expect(lock.name).toBe(pkg.name);

    // Compatibilidade real: TODAS as deps do template estão travadas no lock com a
    // MESMA faixa declarada (sem alterar dependências).
    const lockedRoot = lock.packages?.[""] ?? {};
    for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(lockedRoot.dependencies?.[dep], `dependência ${dep} ausente no lock`).toBe(range);
      expect(lock.packages?.[`node_modules/${dep}`]?.version, `${dep} sem versão travada`).toBeTruthy();
    }
    for (const [dep, range] of Object.entries(pkg.devDependencies ?? {})) {
      expect(lockedRoot.devDependencies?.[dep], `devDependency ${dep} ausente no lock`).toBe(range);
    }
  });

  it("é montado no WebContainer junto com os demais arquivos do projeto", () => {
    const wc = read("src/components/sites/studio/WebContainerPreview.tsx");
    const hook = read("src/hooks/studio/useWebContainerPreview.ts");
    // o preview recebe os arquivos do projeto (inclui o lock) e faz mount/sync
    expect(hook).toContain("files");
    expect(wc).toContain("useWebContainerPreview");
    expect(REACT_TEMPLATE_PATHS).toContain("package-lock.json");
  });
});

describe("FASE 7.1 · estado de RASCUNHO no Preview (honesto, sem geração automática)", () => {
  it("o Preview mostra 'Rascunho — peça no chat para gerar o site.' quando é bootstrap", () => {
    const preview = read("src/components/sites/studio/WebContainerPreview.tsx");
    expect(preview).toContain("Rascunho — peça no chat para gerar o site.");
    expect(preview).toContain("isBootstrapFiles");
    expect(preview).toMatch(/isDraft/);
  });

  it("detecção de bootstrap é a mesma marca do template (sem heurística nova)", () => {
    const draft = { "src/App.tsx": `// ${REACT_BOOTSTRAP_MARKER}\nexport default () => null;` };
    const real = { "src/App.tsx": "export default function App(){ return <h1>Site real</h1>; }" };
    expect(isBootstrapFiles(draft)).toBe(true);
    expect(isBootstrapFiles(real)).toBe(false);
  });
});

describe("FASE 7.1 · rótulos operacionais em PT-BR e sem estado falso", () => {
  it("não existe mais 'Preparando…'/'Executando ferramenta…'/'Codificando…'", () => {
    const labels = Object.values(PHASE_LABEL).join(" | ");
    expect(labels).not.toMatch(/Preparando/);
    expect(labels).not.toMatch(/Executando ferramenta/);
    expect(labels).not.toMatch(/Codificando/);
    expect(labels).not.toMatch(/checkpoint/);
  });

  it("cada fase tem um rótulo PT-BR verdadeiro", () => {
    expect(PHASE_LABEL.preparing).toBe("Entendendo o pedido…");
    expect(PHASE_LABEL.tool_running).toBe("Executando a ação…");
    expect(PHASE_LABEL.validating).toBe("Validando a alteração…");
    expect(PHASE_LABEL.files_ready).toBe("Atualizando o Preview…");
    expect(PHASE_LABEL.committing).toBe("Salvando versão…");
  });
});
