import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentRunOutcome } from "../src/prospector-site-agent";

vi.mock("../src/studio/planner", () => ({
  runStudioPlanner: vi.fn(async () => ({
    ok: true,
    plan: "PLAN:\n1. [ ] editar index.html\nNext task: editar index.html",
    modelUsed: "mock",
  })),
}));

import { runStudioPlanner } from "../src/studio/planner";
import { runStudioOrchestration } from "../src/studio/orchestrator";

const plannerMock = vi.mocked(runStudioPlanner);

function outcome(reply: string): AgentRunOutcome {
  return { ok: true, reply, files: {}, touched: [], iterations: 0, events: [] };
}

const COMPLEX = "Redesenhe o site inteiro, adicione uma seção de depoimentos, reorganize os serviços e melhore o SEO.";
const SIMPLE = "Troque a cor do botão para vermelho";

function baseInput(overrides: Partial<Parameters<typeof runStudioOrchestration>[0]> = {}) {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    input: {
      instruction: SIMPLE,
      mode: "edit" as const,
      contextPrefix: "CTX:",
      filePaths: ["cliente/index.html", "cliente/src/site.css"],
      business: { name: "Loja X" },
      memory: [],
      recentChanges: [],
      ai: { providerId: "deepseek", modelId: "deepseek-chat", apiKey: "k", baseUrl: "https://api.deepseek.com" },
      continueSession: false,
      runCoder: vi.fn(async () => outcome("Feito.")),
      emit: (e: Record<string, unknown>) => events.push(e),
      ...overrides,
    },
  };
}

describe("Studio Orchestrator (Fase 2)", () => {
  beforeEach(() => plannerMock.mockClear());

  it("edição simples → Coder direto, sem Planner", async () => {
    const { input } = baseInput();
    const result = await runStudioOrchestration(input);
    expect(result.route).toBe("coder");
    expect(plannerMock).not.toHaveBeenCalled();
    expect(input.runCoder).toHaveBeenCalledTimes(1);
    const prompt = (input.runCoder as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(prompt).not.toContain("PLANO DO PLANNER");
    expect(result.outcome?.reply).toBe("Feito.");
  });

  it("tarefa complexa → Planner produz plano visível e o Coder o consome", async () => {
    const { input, events } = baseInput({ instruction: COMPLEX });
    const result = await runStudioOrchestration(input);
    expect(result.route).toBe("planner");
    expect(plannerMock).toHaveBeenCalledTimes(1);
    expect(result.plan).toContain("PLAN:");
    expect(events.some((e) => e.type === "plan")).toBe(true);
    const prompt = (input.runCoder as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(prompt).toContain("PLANO DO PLANNER");
    expect(prompt).toContain("editar index.html");
  });

  it("Coder pedindo DELEGATE_TO_PLANNER → Planner revisa e Coder reexecuta", async () => {
    let call = 0;
    const runCoder = vi.fn(async () => {
      call += 1;
      return call === 1 ? outcome("Preciso de nova estratégia. DELEGATE_TO_PLANNER") : outcome("Concluído.");
    });
    const { input } = baseInput({ instruction: COMPLEX, runCoder });
    const result = await runStudioOrchestration(input);
    expect(plannerMock).toHaveBeenCalledTimes(2);
    expect(runCoder).toHaveBeenCalledTimes(2);
    expect(result.outcome?.reply).toBe("Concluído.");
  });

  it("cancelamento antes de começar não executa o Coder", async () => {
    const { input } = baseInput({ isCancelled: () => true });
    const result = await runStudioOrchestration(input);
    expect(result.cancelled).toBe(true);
    expect(result.outcome).toBeNull();
    expect(input.runCoder).not.toHaveBeenCalled();
  });

  it("Planner indisponível → segue direto para o Coder sem plano", async () => {
    plannerMock.mockResolvedValueOnce({ ok: false, plan: "", error: "sem key" });
    const { input } = baseInput({ instruction: COMPLEX });
    const result = await runStudioOrchestration(input);
    expect(result.route).toBe("planner");
    expect(result.plan).toBeNull();
    expect(result.planError).toBe("sem key");
    expect(input.runCoder).toHaveBeenCalledTimes(1);
  });
});
