import { describe, it, expect } from "vitest";
import { buildConversationContext, buildDesignMemory, isDecisionTurn } from "../../src/lib/aiEditContext";

describe("Conversational Design Intelligence (memória de contexto)", () => {
  const turns = [
    { role: "user" as const, text: "Deixa o site mais sofisticado." },
    { role: "assistant" as const, text: "Feito: elevei a tipografia e refinei as cores." },
    { role: "user" as const, text: "Agora muda a hero." },
    { role: "assistant" as const, text: "Hero nova aplicada." },
    { role: "user" as const, text: "Gostei mais da versão anterior." },
    { role: "assistant" as const, text: "Revertida para a anterior." },
    { role: "user" as const, text: "Mantém aquela tipografia e deixa os cards mais elegantes." },
  ];

  it("intercala usuário e assistente preservando o contexto", () => {
    const ctx = buildConversationContext(turns);
    expect(ctx[0]).toMatch(/^Usuário: Deixa o site mais sofisticado/);
    expect(ctx.some((l) => l.startsWith("Assistente:"))).toBe(true);
    expect(ctx[ctx.length - 1]).toContain("deixa os cards mais elegantes");
  });

  it("janela respeita o limite de turnos mas sempre inclui o último usuário", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      role: ("user" as const),
      text: `mensagem ${i}`,
    }));
    const ctx = buildConversationContext(many, { maxTurns: 12 });
    expect(ctx.length).toBeLessThanOrEqual(12);
    expect(ctx[ctx.length - 1]).toContain("mensagem 29");
  });

  it("detecta decisões e monta memória curta", () => {
    expect(isDecisionTurn("Gostei da hero anterior, mantém.")).toBe(true);
    expect(isDecisionTurn("bom dia!")).toBe(false);
    const memory = buildDesignMemory(turns);
    expect(memory.length).toBeGreaterThan(0);
    expect(memory.some((m) => m.includes("Gostei mais da versão anterior"))).toBe(true);
    expect(memory.some((m) => m.includes("Mantém aquela tipografia"))).toBe(true);
  });

  it("memória ignora assistente e respeita max", () => {
    const mem = buildDesignMemory([...turns, { role: "user" as const, text: "quero X" }, { role: "user" as const, text: "prefiro Y" }, { role: "user" as const, text: "coloca Z" }], { max: 2 });
    expect(mem.length).toBe(2);
    expect(mem.every((m) => !m.startsWith("Assistente"))).toBe(true);
  });
});
