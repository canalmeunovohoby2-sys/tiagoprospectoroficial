import { describe, it, expect } from "vitest";
import { runCoderTurn } from "../src/studio/agent-core/coder";
import type { ModelCaller, ModelTurn } from "../src/studio/agent-core/model";

const toolCall = (id: string, name: string, args: Record<string, unknown>) => ({ id, name, arguments: args, rawArguments: JSON.stringify(args) });

interface Emitted { type: string; message_type?: string; content?: string; tool_name?: string }

async function run(script: ModelTurn[], instruction = "oi, boa noite") {
  const events: Emitted[] = [];
  let i = 0;
  const model: ModelCaller = async () => ({ ok: true, turn: script[Math.min(i++, script.length - 1)] });
  const res = await runCoderTurn({
    model,
    system: "SYS",
    messages: [{ role: "user", content: instruction }],
    tools: [],
    ai: {},
    emit: (e) => events.push(e as unknown as Emitted),
    instruction,
  });
  const thoughts = events.filter((e) => e.type === "agent_interaction" && e.message_type === "thought").map((e) => String(e.content ?? ""));
  return { res, thoughts };
}

describe("Coder · pensamento visível vs resposta final", () => {
  it("raciocínio do provider vira PENSAMENTO no chat", async () => {
    const { thoughts } = await run([
      { text: "", toolCalls: [toolCall("t1", "read_file", { path: "src/App.tsx" })], reasoning: "Preciso ver o arquivo antes de mexer." },
      { text: "Tudo certo por aqui.", toolCalls: [] },
    ]);
    expect(thoughts).toContain("Preciso ver o arquivo antes de mexer.");
  });

  it("a RESPOSTA final NÃO entra no bloco de pensamento", async () => {
    const { res, thoughts } = await run([{ text: "Boa noite! Como posso ajudar?", toolCalls: [] }]);
    expect(res.text).toBe("Boa noite! Como posso ajudar?");
    expect(thoughts).toEqual([]);
  });

  it("rodada sem narração gera pensamento com o trabalho REAL (sem nomes de ferramentas)", async () => {
    const { thoughts } = await run([
      { text: "", toolCalls: [toolCall("t1", "read_file", { path: "src/App.tsx" })] },
      { text: "Concluído.", toolCalls: [] },
    ]);
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0]).toContain("src/App.tsx");
    for (const name of ["read_file", "write_file", "grep_search", "list_files"]) {
      expect(thoughts[0]).not.toContain(name);
    }
  });

  it("texto que acompanha ferramentas é pensamento (a resposta continua sendo o texto final)", async () => {
    const { res, thoughts } = await run([
      { text: "Vou ajustar o cabeçalho agora.", toolCalls: [toolCall("t1", "edit_file", { path: "src/App.tsx" })] },
      { text: "Cabeçalho ajustado.", toolCalls: [] },
    ]);
    expect(thoughts).toContain("Vou ajustar o cabeçalho agora.");
    expect(thoughts).not.toContain("Cabeçalho ajustado.");
    expect(res.text).toBe("Cabeçalho ajustado.");
  });
});
