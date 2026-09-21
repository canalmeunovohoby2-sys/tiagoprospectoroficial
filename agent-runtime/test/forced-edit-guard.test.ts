import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { needsForcedEdit, FORCED_EDIT_INSTRUCTION } from "../src/run-guards";

// O agente finalizava pedidos de ALTERAÇÃO sem tocar em arquivo (só list_files) e
// ainda respondia em inglês. Estes guardas garantem AÇÃO OBRIGATÓRIA + pt-BR.
describe("ação obrigatória · pedido de alteração não pode terminar sem editar", () => {
  it("exige rodada forçada quando é edição/geração e nada foi alterado", () => {
    expect(needsForcedEdit("edit", 0)).toBe(true);
    expect(needsForcedEdit("generate", 0)).toBe(true);
  });

  it("não interfere quando já houve alteração ou quando é conversa", () => {
    expect(needsForcedEdit("edit", 2)).toBe(false);
    expect(needsForcedEdit("conversation", 0)).toBe(false);
  });

  it("a instrução forçada manda editar de fato, em pt-BR e com escopo mínimo", () => {
    expect(FORCED_EDIT_INSTRUCTION).toContain("NÃO ALTEROU NENHUM ARQUIVO");
    expect(FORCED_EDIT_INSTRUCTION).toContain("português do Brasil");
    expect(FORCED_EDIT_INSTRUCTION).toContain("edit_file");
    expect(FORCED_EDIT_INSTRUCTION).toContain("só no necessário");
  });

  it("o system prompt tem as regras duras de AÇÃO e IDIOMA (origem)", () => {
    const identity = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8");
    expect(identity).toContain("AÇÃO OBRIGATÓRIA (pedido de alteração)");
    expect(identity).toContain("NUNCA responda em inglês");
    expect(identity).toContain("Analisar, listar arquivos e responder sem editar é FALHA");
  });

  it("o servidor usa o guard forçado (1 rodada) e a ressalva honesta", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain("needsForcedEdit(runKind, touchedAll.length)");
    expect(server).toContain("FORCED_EDIT_INSTRUCTION");
    expect(server).toContain("não consegui aplicar nenhuma alteração neste pedido");
  });
});
