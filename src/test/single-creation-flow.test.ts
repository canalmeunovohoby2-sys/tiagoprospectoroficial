import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Fluxo único de criação — React Studio", () => {
  it("Sites.tsx não oferece mais escolha de tipo (Site HTML / App React)", () => {
    const sites = read("src/pages/Sites.tsx");
    expect(sites).not.toContain("Site HTML");
    expect(sites).not.toContain("App React");
    expect(sites).not.toMatch(/createKind/);
  });

  it("Sites.tsx cria sempre React", () => {
    const sites = read("src/pages/Sites.tsx");
    expect(sites).toMatch(/createSiteProjectFromPrompt\(user\.id,\s*p,\s*"react"\)/);
  });

  it("createSiteProjectFromPrompt tem default react e seeda o template", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    expect(api).toMatch(/createSiteProjectFromPrompt\([^)]*kind:\s*SiteProjectKind\s*=\s*"react"\)/);
    expect(api).toContain("buildReactTemplateFiles");
  });

  it("Lead (openOrCreateSiteProject) nasce React com template — sem passar por /generate", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    const start = api.indexOf("export async function openOrCreateSiteProject");
    const end = api.indexOf("export async function createSiteProjectFromPrompt");
    const fn = api.slice(start, end);
    expect(fn).toContain('settings: { kind: "react" }');
    expect(fn).toContain("buildReactTemplateFiles");
    expect(fn).toContain('status: "generated"');
    // Não aciona o gerador legado (Cline/ProspectorSiteAgent).
    expect(fn).not.toContain("invokeProspectorGenerate");
    expect(fn).not.toContain("ProspectorSiteAgent");
  });

  it("projectKindOf mantém default 'static' para projetos legacy (compatibilidade)", () => {
    const data = read("src/data/siteProjects.ts");
    expect(data).toMatch(/raw === "react" \? "react" : "static"/);
  });
});
