import { describe, it, expect } from "vitest";
import { reactRunKind, reactSessionKey, shouldReuseSession, buildContinuityBlock } from "../src/server";

// FASE 1 — requisitos A (conversa em bootstrap), B (histórico no prompt),
// D (isolamento de projeto) e troca de IA recriando sessão. Tudo decidido por
// funções puras usadas pelo caminho React do `/run` (nada de heurística nova:
// `reactRunKind` reutiliza `instructionRequestsChange`).

describe("FASE 1 · decisão de execução do React (reactRunKind)", () => {
  it("A) bootstrap + saudação NUNCA vira geração — é conversa pura", () => {
    for (const msg of ["Oi, boa tarde. Tudo bem?", "oi", "Boa noite", "Tudo bem?", "obrigado", "valeu!"]) {
      expect(reactRunKind({ firstGen: true, instruction: msg }), msg).toBe("conversation");
      expect(reactRunKind({ firstGen: false, instruction: msg }), msg).toBe("conversation");
    }
  });

  it("bootstrap + pedido real → geração (a primeira geração é do usuário, não automática)", () => {
    for (const msg of ["Gere o site da minha empresa", "Crie um site para o meu pet shop", "quero um site elegante"]) {
      expect(reactRunKind({ firstGen: true, instruction: msg }), msg).toBe("generate");
    }
  });

  it("projeto já gerado + pedido de alteração → edição", () => {
    expect(reactRunKind({ firstGen: false, instruction: "troque a cor do botão do WhatsApp" })).toBe("edit");
    expect(reactRunKind({ firstGen: false, instruction: "deixe o hero mais sofisticado" })).toBe("edit");
    // saudação JUNTO com pedido continua sendo pedido
    expect(reactRunKind({ firstGen: false, instruction: "oi, troque a cor do header" })).toBe("edit");
  });

  it("pergunta/explicação sem pedido de alteração → conversa", () => {
    expect(reactRunKind({ firstGen: true, instruction: "qual classe controla o título?" })).toBe("conversation");
    expect(reactRunKind({ firstGen: false, instruction: "me explique a estrutura do projeto" })).toBe("conversation");
  });
});

describe("FASE 1 · sessão por projeto (isolamento real)", () => {
  it("D) projeto A e projeto B têm chaves de sessão diferentes (nunca compartilham)", () => {
    const a = reactSessionKey("user-1", "proj-A", "conv-1");
    const b = reactSessionKey("user-1", "proj-B", "conv-1");
    const outroUsuario = reactSessionKey("user-2", "proj-A", "conv-1");
    const outraConversa = reactSessionKey("user-1", "proj-A", "conv-2");
    expect(a).not.toBe(b);
    expect(a).not.toBe(outroUsuario);
    expect(a).not.toBe(outraConversa);
    expect(a.startsWith("react:")).toBe(true);
    expect(a).toBe(reactSessionKey("user-1", "proj-A", "conv-1"));
  });

  it("sessão é reaproveitada só com a MESMA IA (trocar provider recria)", () => {
    expect(shouldReuseSession({ execKey: "deepseek:chat" }, "deepseek:chat")).toBe(true);
    expect(shouldReuseSession({ execKey: "deepseek:chat" }, "openai:gpt")).toBe(false);
    expect(shouldReuseSession(undefined, "deepseek:chat")).toBe(false);
    expect(shouldReuseSession(null, "deepseek:chat")).toBe(false);
  });
});

describe("FASE 1 · histórico/memória chegam à missão (buildContinuityBlock)", () => {
  it("B) o segundo turno recebe a conversa do primeiro", () => {
    const block = buildContinuityBlock({
      memory: ["Paleta azul definida pelo cliente"],
      conversation: ["Usuário: Quero um site elegante para minha empresa.", "Assistente: Vou criar uma direção elegante."],
    });
    expect(block).toContain("Quero um site elegante para minha empresa");
    expect(block).toContain("Paleta azul definida pelo cliente");
    expect(block).toContain("CONVERSA RECENTE");
    expect(block).toContain("MEMÓRIA DE DECISÕES");
  });

  it("sem memória/conversa não inventa bloco (missão limpa)", () => {
    expect(buildContinuityBlock({})).toBe("");
    expect(buildContinuityBlock({ memory: [], conversation: [] })).toBe("");
  });
});
