import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectKickoffPending } from "@/data/siteProjects";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Kickoff — primeira geração de novo projeto React", () => {
  it("projectKickoffPending: só projetos React em bootstrap", () => {
    expect(projectKickoffPending({ settings: { kind: "react", kickoff: "pending" } })).toBe(true);
    expect(projectKickoffPending({ settings: { kind: "react", kickoff: "done" } })).toBe(false);
    expect(projectKickoffPending({ settings: { kind: "react" } })).toBe(false);
    expect(projectKickoffPending({ settings: { kind: "static" } })).toBe(false);
    expect(projectKickoffPending({ settings: {} })).toBe(false);
    expect(projectKickoffPending(null)).toBe(false);
  });

  it("novos projetos React nascem com kickoff pendente (Sites e Lead)", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    expect(api).toMatch(/settings:\s*\{\s*kind:\s*"react",\s*kickoff:\s*"pending"\s*\}/);
    expect(api).toContain("export async function markReactKickoffDone");
  });

  it("o SiteProjectPage dispara a primeira geração pelo /run (Studio) e marca done", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("projectKickoffPending");
    expect(page).toContain("buildReactKickoffInstruction");
    expect(page).toContain("markReactKickoffDone");
    // A primeira geração é uma run do Studio (nunca o editor legado).
    expect(page).toMatch(/kickoffStartedRef\.current === project\.id/);
    expect(page).toMatch(/buildReactKickoffInstruction\(project/);
  });

  it("a instrução de kickoff usa dados reais e proíbe inventar fatos", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toMatch(/NÃO invente telefone, endereço, serviços/i);
    expect(page).toContain("write_file/edit_file");
  });

  it("a 1ª geração exige fotos reais + estrutura premium + Google Maps obrigatório", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toMatch(/site comercial premium/i);
    expect(page).toMatch(/Google Maps/i);
    expect(page).toMatch(/Abrir rota/);
    expect(page).toMatch(/Fotos reais/);
  });

  it("o gerador recebe fotos e localização REAIS do lead (foto/place/geo)", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    // Consulta do lead traz os campos de mídia/geo usados pelo site.
    expect(page).toMatch(/photo_name,\s*google_url,\s*latitude,\s*longitude/);
    // Contexto enviado ao /run inclui fotos/stock/place/geo.
    expect(page).toMatch(/photos:\s*media\?\.photos/);
    expect(page).toMatch(/stockImages:\s*stock/);
    expect(page).toMatch(/placeId:\s*media\?\.placeId/);
    // Fallback ilustrativo reutiliza o sistema existente (get-images).
    expect(page).toContain("fetchIllustrativeImages");
  });

  it("a 1ª geração só dispara depois de carregar os dados reais do lead", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("leadLoaded");
    expect(page).toMatch(/if \(!leadLoaded\) return;/);
    expect(page).toMatch(/buildReactKickoffInstruction\(project,\s*projectLeadRef\.current\)/);
  });

  it("WebContainer isola por projectId (não reusa a instância anterior)", () => {
    const wc = read("src/lib/studio/webcontainer.ts");
    expect(wc).toContain("mountedProjectId");
    expect(wc).toMatch(/mountedProjectId !== pid/);
    expect(wc).toContain("getProjectId");
    const hook = read("src/hooks/studio/useWebContainerPreview.ts");
    expect(hook).toMatch(/service\.load\(mounted,\s*pushLog,\s*projectId\)/);
  });
});
