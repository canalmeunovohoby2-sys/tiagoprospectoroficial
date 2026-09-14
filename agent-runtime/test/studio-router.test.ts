import { describe, it, expect } from "vitest";
import { routeStudioTask, assessStudioComplexity } from "../src/studio/router";
import { buildStudioCoderPrompt } from "../src/studio/coder";

describe("Studio Router (Fase 2)", () => {
  it("edição simples/cirúrgica → Coder direto", () => {
    const d = routeStudioTask({ instruction: "Troque a cor do botão para vermelho", mode: "edit" });
    expect(d.route).toBe("coder");
  });

  it("defeito/bug → Coder direto", () => {
    const d = routeStudioTask({ instruction: "O menu não fecha e a tela fica preta ao clicar", mode: "edit" });
    expect(d.route).toBe("coder");
    expect(d.signals.some((s) => s.kind === "bug")).toBe(true);
  });

  it("tarefa complexa/multietapa → Planner", () => {
    const d = routeStudioTask({
      instruction: "Redesenhe o site inteiro, adicione uma seção de depoimentos, reorganize os serviços e melhore o SEO.",
      mode: "edit",
    });
    expect(d.route).toBe("planner");
    expect(d.signals.length).toBeGreaterThan(0);
  });

  it("sinal explícito de edição visual → Coder direto", () => {
    const d = routeStudioTask({ instruction: "[VISUAL EDIT] deixe o hero mais escuro", mode: "edit" });
    expect(d.route).toBe("coder");
  });

  it("assessStudioComplexity não marca pedido curto como complexo", () => {
    expect(assessStudioComplexity("Ajuste o telefone no rodapé").complex).toBe(false);
  });
});

describe("Studio Coder prompt", () => {
  it("inclui o plano do Planner e os sinais de controle", () => {
    const prompt = buildStudioCoderPrompt({
      instruction: "Adicione uma seção de FAQ",
      contextPrefix: "CTX:",
      plan: "PLAN:\n1. [ ] editar index.html\nNext task: editar index.html",
      projectFiles: ["cliente/index.html", "cliente/src/site.css"],
    });
    expect(prompt).toContain("CTX:");
    expect(prompt).toContain("PLANO DO PLANNER");
    expect(prompt).toContain("editar index.html");
    expect(prompt).toContain("ESTRUTURA DO PROJETO");
    expect(prompt).toContain("cliente/src/site.css");
    expect(prompt).toContain("DELEGATE_TO_PLANNER");
  });

  it("sem plano, ainda inclui a instrução e os sinais", () => {
    const prompt = buildStudioCoderPrompt({ instruction: "Troque o título" });
    expect(prompt).toContain("Troque o título");
    expect(prompt).toContain("finish_task");
  });
});
