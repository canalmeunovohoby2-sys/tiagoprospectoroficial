import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectKickoffPending, projectKickoffState } from "@/data/siteProjects";

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

  it("projectKickoffState distingue pending/done/failed/none (idempotência)", () => {
    expect(projectKickoffState({ settings: { kind: "react", kickoff: "pending" } })).toBe("pending");
    expect(projectKickoffState({ settings: { kind: "react", kickoff: "done" } })).toBe("done");
    expect(projectKickoffState({ settings: { kind: "react", kickoff: "failed" } })).toBe("failed");
    expect(projectKickoffState({ settings: { kind: "react" } })).toBe("none");
    expect(projectKickoffState({ settings: { kind: "static", kickoff: "pending" } })).toBe("none");
    expect(projectKickoffState(null)).toBe("none");
  });

  it("novos projetos React nascem com kickoff pendente (Sites e Lead)", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    expect(api).toMatch(/settings:\s*\{\s*kind:\s*"react",\s*kickoff:\s*"pending"\s*\}/);
    expect(api).toContain("export async function markReactKickoffDone");
  });

  it("o SiteProjectPage dispara a primeira geração pelo /run (Studio) e marca done", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("projectKickoffState");
    expect(page).toContain("buildReactKickoffInstruction");
    expect(page).toContain("markReactKickoff");
    // A primeira geração é uma run do Studio (nunca o editor legado).
    expect(page).toMatch(/kickoffStartedRef\.current === project\.id/);
    expect(page).toMatch(/buildReactKickoffInstruction\(project/);
  });

  it("IDEMPOTÊNCIA: refresh NÃO retrabalha o site (estado persistido + guarda local)", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    // Guarda local sobrevive ao F5 e a tentativa é marcada ANTES de rodar.
    expect(page).toContain("safeLocalStorage");
    expect(page).toContain("kickoffAttemptedLocally");
    expect(page).toMatch(/kickoffState === "pending"/);
    // Só o legado sem estado (ainda no rascunho) tenta uma vez.
    expect(page).toMatch(/legacyStuck/);
    expect(page).toMatch(/kickoffState === "none" && bootstrapPending/);
    // SEMPRE persiste um estado terminal após a tentativa (done/failed).
    expect(page).toMatch(/markReactKickoff\(project\.id, state\)/);
    expect(page).toMatch(/"done" \| "failed"/);
    // Site já gerado → corrige a flag sem retrabalhar (nunca reescreve o site).
    expect(page).toMatch(/if \(!isBootstrapFiles\(draftFiles\)\)/);
    expect(page).toMatch(/markReactKickoff\(project\.id, "done"\)/);
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

  it("recupera projeto preso no rascunho (só o legado, uma vez) e nunca marca done sem aplicar", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("isBootstrapFiles");
    expect(page).toMatch(/needsKickoff/);
    // Self-heal só para o legado sem estado — não é gatilho permanente.
    expect(page).toMatch(/legacyStuck = kickoffState === "none" && bootstrapPending/);
    // Nunca marca "done" se o rascunho permaneceu.
    expect(page).toMatch(/applied = .*!isBootstrapFiles\(produced\)/);
    expect(page).toMatch(/applied \? "done" : "failed"/);
  });

  it("imagens ilustrativas do sistema são oferecidas na 1ª geração (mesmo com foto real)", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    // Stock deixa de ser condicionado a "sem foto real": o site nunca fica sem imagem.
    expect(page).toMatch(/media && opts\?\.media/);
    expect(page).not.toMatch(/media\.photos\.length === 0 && opts\?\.media/);
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
