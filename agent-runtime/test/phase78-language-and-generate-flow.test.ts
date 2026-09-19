import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReactMission, reactRunKind } from "../src/server";

// FASE 7.8 — idioma: a missão do React obriga pensar/planejar/narrar em pt-BR
// (o usuário acompanha o texto no chat) e o pedido do botão é GERAÇÃO.

const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
const identity = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8");

describe("FASE 7.8 · idioma do raciocínio e da resposta", () => {
  it("a missão do React exige pt-BR em tudo que o usuário lê", () => {
    const mission = buildReactMission({ instruction: "troque as cores" });
    expect(mission).toMatch(/IDIOMA \(obrigatório\)/);
    expect(mission).toMatch(/pense, planeje, narre e responda SEMPRE em português do Brasil/i);
    // e o pedido do usuário continua presente
    expect(mission).toContain("troque as cores");
  });

  it("os prompts do agente (generate/edit) exigem raciocínio em pt-BR", () => {
    expect(identity).toMatch(/RACIOCÍNIO\/PLANEJAMENTO TAMBÉM EM pt-BR/);
    expect(identity).toMatch(/Nunca escreva o raciocínio em inglês/);
  });

  it("o botão 'Gerar site' (topo e preview) dispara geração pelo agente", () => {
    const pedido = "Crie o site real de Usinagem Precisão Ferro (Usinagem CNC) agora, substituindo o rascunho inicial pelos arquivos reais do site — use os dados, as fotos e a direção criativa deste cliente.";
    expect(reactRunKind({ firstGen: true, instruction: pedido })).toBe("generate");
    // o caminho rápido de conversa não intercepta este pedido
    const reactBranch = server.slice(server.indexOf('String(body.projectKind ?? "") === "react"'));
    const fast = reactBranch.slice(reactBranch.indexOf("CAMINHO RÁPIDO DE CONVERSA"), reactBranch.indexOf("await withWorkspaceLock("));
    expect(fast).not.toContain("Crie o site real");
  });
});
