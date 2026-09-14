import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("C8 · React nunca usa o fluxo legado (spec/HTML)", () => {
  it("o guard de React vem ANTES de editSiteWithAI e é honesto", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    const guard = page.indexOf("REACT NUNCA usa o editor de spec");
    const legacy = page.indexOf("await editSiteWithAI(");
    expect(guard).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(-1);
    // o guard de React precisa estar no código antes da chamada legada
    expect(guard).toBeLessThan(legacy);
    expect(page).toContain("nenhuma alteração de arquivo foi aplicada");
  });

  it("App.tsx remonta a página por projectId (isolamento entre projetos)", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("SiteProjectPageRoute");
    expect(app).toMatch(/<SiteProjectPage key=\{id\}/);
    expect(app).toMatch(/element=\{<SiteProjectPageRoute \/>\}/);
  });

  it("o /run React expõe mudança real (changed) e a ausência explícita (no_file_changes)", () => {
    const server = read("agent-runtime/src/server.ts");
    // `touched` = arquivos do agente + normalizações determinísticas (ex.: mapa).
    expect(server).toContain("changed: touched.length > 0");
    expect(server).toContain("no_file_changes: touched.length === 0");
    expect(server).toContain("withWorkspaceLock");
  });
});
