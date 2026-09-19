import { describe, it, expect } from "vitest";
import { reactRunKind, buildConversationSystemPrompt } from "../src/server";
import { instructionRequestsChange } from "../src/completion-guard";

// FASE 7.3 — PEDIDO IMPLÍCITO DE ALTERAÇÃO deve EXECUTAR (e não virar conversa
// que só promete). Caso real: "tem uma logomarca diferente aí do jeito que você
// achar melhor pode seguir o mesmo padrão de cores tá".

const PEDIDO_LOGO =
  "tem uma logomarca diferente aí do jeito que você achar melhor pode seguir o mesmo padrão de cores tá";

describe("FASE 7.3 · pedido implícito vira TRABALHO", () => {
  it("o caso real da logomarca é edição (antes era conversa e nada acontecia)", () => {
    expect(instructionRequestsChange(PEDIDO_LOGO)).toBe(true);
    expect(reactRunKind({ firstGen: false, instruction: PEDIDO_LOGO })).toBe("edit");
  });

  it("variações reais de pedido implícito também executam", () => {
    for (const msg of [
      "coloca uma logomarca diferente, pode seguir o mesmo padrão de cores",
      "faz um logo novo no lugar da atual",
      "quero outro logotipo, do jeito que você achar melhor",
      "substitui a logo por uma mais moderna",
      "deixa o header diferente, pode seguir a identidade",
    ]) {
      expect(instructionRequestsChange(msg), msg).toBe(true);
      expect(reactRunKind({ firstGen: false, instruction: msg }), msg).toBe("edit");
    }
  });

  it("conversa continua conversa (nada de executar por perguntar)", () => {
    for (const msg of [
      "Oi tudo bem?",
      "Quem descobriu o Brasil?",
      "O que é SEO?",
      "Me explica o que você está fazendo.",
      "Por que você escolheu essa cor?",
      "O que você consegue fazer neste projeto?",
    ]) {
      expect(reactRunKind({ firstGen: false, instruction: msg }), msg).toBe("conversation");
      expect(instructionRequestsChange(msg), msg).toBe(false);
    }
  });

  it("o prompt da conversa PROÍBE prometer execução sem executar", () => {
    const system = buildConversationSystemPrompt({ name: "Empresa X" });
    expect(system).toMatch(/NUNCA diga que vai criar\/aplicar\/alterar/i);
    expect(system).toMatch(/pe[çc]a para ele confirmar o pedido/i);
  });
});
