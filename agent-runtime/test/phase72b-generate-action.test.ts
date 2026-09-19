import { describe, it, expect } from "vitest";
import { reactRunKind } from "../src/server";
import { instructionRequestsChange } from "../src/completion-guard";

// FASE 7.2 — ação explícita "Gerar site": o clique envia uma instrução que cai no
// modo `generate` pelo fluxo existente. E o verbo "gerar/gere" passou a ser ação.

const PROMPT_DO_BOTAO =
  "Crie o site real de Usinagem Precisão Ferro (Usinagem CNC) agora, substituindo o rascunho inicial pelos arquivos reais do site — use os dados, as fotos e a direção criativa deste cliente.";

describe("FASE 7.2 · 'Gerar site' dispara geração pelo fluxo existente", () => {
  it("a instrução do botão é GERAÇÃO em projeto bootstrap (modo generate)", () => {
    expect(reactRunKind({ firstGen: true, instruction: PROMPT_DO_BOTAO })).toBe("generate");
    expect(instructionRequestsChange(PROMPT_DO_BOTAO)).toBe(true);
  });

  it("o mesmo pedido em projeto já gerado é EDIÇÃO (não regera do zero)", () => {
    expect(reactRunKind({ firstGen: false, instruction: PROMPT_DO_BOTAO })).toBe("edit");
  });

  it("'Gere o site' / 'gere o site da empresa' agora são ação (verbo reconhecido)", () => {
    for (const msg of ["Gere o site", "gere o site da empresa", "Gere o site real do cliente"]) {
      expect(instructionRequestsChange(msg), msg).toBe(true);
      expect(reactRunKind({ firstGen: true, instruction: msg }), msg).toBe("generate");
    }
  });

  it("perguntas sobre geração continuam conversa (não disparam trabalho)", () => {
    for (const msg of ["O que você consegue gerar neste projeto?", "Como você gera o site?", "Quem descobriu o Brasil?"]) {
      expect(reactRunKind({ firstGen: true, instruction: msg }), msg).toBe("conversation");
      expect(instructionRequestsChange(msg), msg).toBe(false);
    }
  });
});
