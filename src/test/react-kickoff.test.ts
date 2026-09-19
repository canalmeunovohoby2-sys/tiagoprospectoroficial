import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectKickoffPending, projectKickoffState } from "@/data/siteProjects";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// FASE 1 — a primeira geração deixou de ser automática. Abrir um projeto NÃO
// inicia mais nada: o site nasce quando o usuário PEDE no chat (e "oi" conversa).

describe("Kickoff automático REMOVIDO (Fase 1)", () => {
  it("G) abrir um projeto React NÃO dispara geração sozinho", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    // Nenhum resquício do gatilho automático:
    expect(page).not.toContain("needsKickoff");
    expect(page).not.toContain("kickoffStartedRef");
    expect(page).not.toContain("buildReactKickoffInstruction");
    expect(page).not.toContain("markReactKickoff(");
    expect(page).not.toContain("kickoffDisplay");
    expect(page).not.toMatch(/runAiInstruction\([^)]*\)\.then\(async/); // sem run automática encadeada
    // Continua existindo o MESMO caminho de execução, só que acionado pelo chat:
    expect(page).toContain("runAiInstruction");
    expect(page).toContain("useStudioChat");
  });

  it("F) o progresso não é mais simulado por timer no caminho de chat (EDIT_STEPS)", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).not.toMatch(/runAgentProgress\(EDIT_STEPS/);
    expect(page).toContain("progresso real");
  });

  it("FASE 7.2: a flag de kickoff NÃO é mais gravada (geração é ação explícita)", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    expect(api).not.toContain('kickoff: "pending"');
    expect(api).toMatch(/settings:\s*\{\s*kind:\s*"react"\s*\}/);
    // Os helpers continuam existindo (leitura de projetos antigos), sem gatilho.
    expect(projectKickoffPending({ settings: { kind: "react", kickoff: "pending" } })).toBe(true);
    expect(projectKickoffState({ settings: { kind: "react", kickoff: "done" } })).toBe("done");
    expect(projectKickoffState({ settings: {} })).toBe("none");
  });

  it("o contexto real do cliente continua sendo enviado ao /run (fotos/geo/stock)", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toMatch(/photo_name,\s*google_url,\s*latitude,\s*longitude/);
    expect(page).toMatch(/photos:\s*media\?\.photos/);
    expect(page).toMatch(/stockImages:\s*stock/);
    expect(page).toMatch(/placeId:\s*media\?\.placeId/);
    expect(page).toContain("fetchIllustrativeImages");
    expect(page).toMatch(/media && opts\?\.media/);
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
