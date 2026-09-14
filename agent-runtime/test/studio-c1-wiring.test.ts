import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("C1 · fiação (react usa o novo núcleo; static continua legado)", () => {
  it("o núcleo C1 não importa ProspectorSiteAgent nem o Router heurístico", () => {
    for (const file of [
      "src/studio/team.ts",
      "src/studio/agent-core/coder.ts",
      "src/studio/agent-core/planner.ts",
      "src/studio/agent-core/selector.ts",
      "src/studio/agent-core/agent-tools.ts",
      "src/studio/agent-core/model.ts",
      "src/studio/agent-core/first-message.ts",
      "src/studio/agent-core/project-state.ts",
    ]) {
      const src = read(file);
      expect(src, `${file} não deve importar prospector-site-agent`).not.toMatch(/prospector-site-agent/);
      expect(src, `${file} não deve importar o router heurístico`).not.toMatch(/studio\/router|\.\/router\.js/);
    }
  });

  it("o /run roteia react → StudioTeam antes do fluxo legado", () => {
    const server = read("src/server.ts");
    expect(server).toContain("runStudioTeam");
    expect(server).toMatch(/body\.projectKind\s*\?\?\s*""\)\s*===\s*"react"|body\.projectKind === "react"/);
    // fluxo legado (static) preservado
    expect(server).toContain("ProspectorSiteAgent");
    expect(server).toContain("makeAgent");
  });

  it("o time expõe Coder (com tools) e Planner (sem tools) separados", () => {
    const team = read("src/studio/team.ts");
    expect(team).toContain("runCoderTurn");
    expect(team).toContain("planner");
    const planner = read("src/studio/agent-core/planner.ts");
    expect(planner).not.toMatch(/buildCoderTools|buildSiteTools|runCoderTurn/);
  });
});
