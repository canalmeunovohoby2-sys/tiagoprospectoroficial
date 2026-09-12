import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeWorkspace, readWorkspace, resolveWorkspaceRoot, cleanupWorkspace, ensureWorkspaceDir } from "../src/workspace";
import { loadSiteBase, prepareBaseWorkspace, resolveBasesDir, buildGenerationSeed } from "../src/site-bases";
import { buildCreativeBrief } from "../src/creative-direction";

// Prova de isolamento REAL em disco: dois projetos criados a partir da MESMA
// base têm workspaces independentes, e a base original permanece intacta.
describe("Site Bases — cópia independente em disco", () => {
  let tmpRoot: string;
  const prev = process.env.PROSPECTOR_WORKSPACES;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "prospector-bases-test-"));
    process.env.PROSPECTOR_WORKSPACES = tmpRoot;
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.PROSPECTOR_WORKSPACES;
    else process.env.PROSPECTOR_WORKSPACES = prev;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("dois projetos a partir da mesma base não compartilham arquivos", () => {
    const baseBefore = loadSiteBase("premium")["index.html"];

    const filesA = prepareBaseWorkspace("premium", { name: "Projeto A", segment: "Estética", city: "Barueri" }, buildCreativeBrief("Projeto A", "Estética"));
    const filesB = prepareBaseWorkspace("premium", { name: "Projeto B", segment: "Estética", city: "Suzano" }, buildCreativeBrief("Projeto B", "Estética"));

    const rootA = resolveWorkspaceRoot("proj-A");
    const rootB = resolveWorkspaceRoot("proj-B");
    expect(rootA).not.toBe(rootB);

    materializeWorkspace(rootA, filesA);
    materializeWorkspace(rootB, filesB);

    // Cada workspace tem o SEU conteúdo.
    const readA0 = readWorkspace(rootA);
    const readB0 = readWorkspace(rootB);
    expect(readA0["index.html"]).toContain("Projeto A");
    expect(readA0["index.html"]).not.toContain("Projeto B");
    expect(readB0["index.html"]).toContain("Projeto B");
    expect(readB0["index.html"]).not.toContain("Projeto A");

    // O agente edita APENAS o projeto A.
    const edited = readA0["index.html"] + "\n<!-- edição do projeto A -->";
    materializeWorkspace(rootA, { ...readA0, "index.html": edited });

    const readA1 = readWorkspace(rootA);
    const readB1 = readWorkspace(rootB);
    expect(readA1["index.html"]).toContain("edição do projeto A");
    expect(readB1["index.html"]).not.toContain("edição do projeto A");
    expect(readB1["index.html"]).toBe(readB0["index.html"]);

    // A BASE ORIGINAL permanece intacta.
    expect(loadSiteBase("premium")["index.html"]).toBe(baseBefore);

    cleanupWorkspace("proj-A");
    cleanupWorkspace("proj-B");
    expect(existsSync(rootA)).toBe(false);
    expect(existsSync(rootB)).toBe(false);
    // A base no repositório continua existindo.
    expect(existsSync(resolveBasesDir())).toBe(true);
  });

  it("as bases não carregam imagens externas e o scaffold preparado não deixa marcadores", () => {
    for (const id of ["editorial", "conversion", "premium"] as const) {
      const raw = loadSiteBase(id);
      const joined = Object.values(raw).join("\n");
      expect(joined).not.toMatch(/<img[^>]+src=["'](https?:)?\/\//i);

      const prepared = prepareBaseWorkspace(id, { name: "Cliente", segment: "Serviços", city: "Cidade", state: "UF" }, buildCreativeBrief("Cliente", "Serviços"));
      for (const content of Object.values(prepared)) {
        expect(content).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
      }
    }
  });

  it("ensureWorkspaceDir materializa a base no disco (workspace inicial do agente)", () => {
    const business = { name: "Clínica Alfa", segment: "Clínica", city: "Bauru", state: "SP" };
    const { seed, baseUsed } = buildGenerationSeed({
      files: {},
      business,
      brief: buildCreativeBrief("Clínica Alfa", "Clínica"),
      briefing: { user_prompt: "site institucional, sóbrio e tradicional" },
    });
    expect(baseUsed).toBe("editorial");
    const root = ensureWorkspaceDir("base-disk-test", seed);
    const files = readWorkspace(root);
    expect(Object.keys(files)).toContain("index.html");
    expect(Object.keys(files)).toContain("src/site.css");
    expect(Object.keys(files)).toContain("src/main.js");
    expect(files["index.html"]).toContain("Clínica Alfa");
    expect(files["index.html"]).not.toContain("{{");
    cleanupWorkspace("base-disk-test");
  });
});
