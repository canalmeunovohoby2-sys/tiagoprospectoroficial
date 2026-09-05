import { describe, it, expect } from "vitest";
import {
  QUICK_STRATEGIES,
  buildStrategyInstruction,
  strategyById,
  type StrategyId,
} from "@/lib/siteStrategies";
import { instructionRequestsChange } from "../../agent-runtime/src/completion-guard";

const CHANGE_IDS: StrategyId[] = ["premium_design", "improve_design", "optimize_mobile", "improve_images", "improve_copy", "improve_conversion", "full_audit"];

describe("Quick Strategies (5.27) — camada reutilizável", () => {
  it("todas as 8 estratégias existem com id, rótulo e sinalização de análise", () => {
    expect(QUICK_STRATEGIES).toHaveLength(8);
    const ids = QUICK_STRATEGIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of QUICK_STRATEGIES) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.emoji.trim().length).toBeGreaterThan(0);
      expect(strategyById(s.id)).toEqual(s);
    }
  });

  it("somente 'analyze_site' é somente-análise; o resto altera código real", () => {
    const analyzeOnly = QUICK_STRATEGIES.filter((s) => s.analyzeOnly).map((s) => s.id);
    expect(analyzeOnly).toEqual(["analyze_site"]);
    for (const id of CHANGE_IDS) expect(strategyById(id)?.analyzeOnly).toBe(false);
  });

  it("toda estratégia gera uma missão completa (analisar→decidir→executar→testar→criticar→corrigir→verificar)", () => {
    const ctx = { name: "Clínica Vida", segment: "Clínica veterinária" };
    for (const s of QUICK_STRATEGIES) {
      const instruction = buildStrategyInstruction(s.id, ctx);
      expect(instruction, s.id).toContain("Clínica Vida");
      expect(instruction, s.id).toContain("Clínica veterinária");
      expect(instruction.length, s.id).toBeGreaterThan(400);
    }
  });

  it("comandos de ALTERAÇÃO exigem evidência: o Completion Guard trata a missão como pedido de mudança", () => {
    for (const id of CHANGE_IDS) {
      const instruction = buildStrategyInstruction(id, { name: "Padaria Sol", segment: "Padaria" });
      expect(instructionRequestsChange(instruction), id).toBe(true);
    }
  });

  it("comando de ANÁLISE nunca é tratado como pedido de mudança (não altera nada e não mente)", () => {
    const instruction = buildStrategyInstruction("analyze_site", { name: "Padaria Sol", segment: "Padaria" });
    expect(instructionRequestsChange(instruction)).toBe(false);
    expect(instruction.toLowerCase()).toContain("relatório");
    expect(instruction.toLowerCase()).toMatch(/n[aã]o altere|n[aã]o use write/);
  });

  it("missões de alteração usam o navegador e exigem EVIDÊNCIA (ciclo real, nada fictício)", () => {
    for (const id of CHANGE_IDS) {
      const instruction = buildStrategyInstruction(id, { name: "X", segment: "Y" });
      expect(instruction, id).toMatch(/browser|navegador/);
      expect(instruction, id).toContain("Evidência é obrigatória");
      expect(instruction, id).toMatch(/analisar|analise/);
      expect(instruction, id).toMatch(/criticar|corrigir|verificar/);
    }
  });

  it("missões proíbem inventar dados e imagens repetidas quando o assunto é imagem/conteúdo/conversão", () => {
    const img = buildStrategyInstruction("improve_images", {});
    expect(img).toMatch(/mesma imagem|repetida/i);
    const copy = buildStrategyInstruction("improve_copy", {});
    expect(copy).toMatch(/nunca invente|n[aã]o invente/i);
    const conv = buildStrategyInstruction("improve_conversion", {});
    expect(conv).toMatch(/n[aã]o invente/i);
    const premium = buildStrategyInstruction("premium_design", {});
    expect(premium).toMatch(/n[aã]o invente dados/i);
  });

  it("auditoria cobre código+UX/UI+conteúdo+imagens+links+responsividade+console+conversão", () => {
    const audit = buildStrategyInstruction("full_audit", {});
    expect(audit.toLowerCase()).toContain("ux/ui");
    expect(audit.toLowerCase()).toContain("links");
    expect(audit.toLowerCase()).toContain("responsividade");
    expect(audit.toLowerCase()).toContain("console");
    expect(audit.toLowerCase()).toContain("conversão");
  });
});
