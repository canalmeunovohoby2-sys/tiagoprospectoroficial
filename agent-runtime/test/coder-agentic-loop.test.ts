import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCoderTurn } from "../src/studio/agent-core/coder";
import { buildCoderTools } from "../src/studio/agent-core/agent-tools";
import type { ModelCaller, ModelMessage, ModelTurn } from "../src/studio/agent-core/model";

// PROVA CONTROLADA: o DeepSeek dirige o ciclo (investiga → observa → decide →
// edita → valida → conclui) e VÊ os resultados das próprias ferramentas.
const APP = [
  "export default function App(){",
  "  return <main className=\"bg-yellow-500 text-black\">Site</main>;",
  "}",
].join("\n");

let root = "";
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "agentic-loop-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), "{}", "utf8");
  writeFileSync(join(root, "index.html"), "<div id='root'></div>", "utf8");
  writeFileSync(join(root, "src/App.tsx"), APP, "utf8");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const toolCall = (id: string, name: string, args: Record<string, unknown>) => ({ id, name, arguments: args, rawArguments: JSON.stringify(args) });
const toolMsgs = (msgs: ModelMessage[]) => msgs.filter((m) => m.role === "tool");

describe("Auditoria · o MODELO dirige o ciclo (não o runtime)", () => {
  it("grep → lê o resultado → read_file → VÊ o conteúdo → edita → valida → conclui", async () => {
    const { list } = buildCoderTools({ workspaceRoot: root, business: {} } as never);
    const seen: Array<{ call: number; system: string; messages: ModelMessage[]; tools: string[] }> = [];

    // Roteiro do "modelo": cada decisão USA o resultado da rodada anterior.
    const script: ModelTurn[] = [
      { text: "Vou localizar onde está a cor atual.", toolCalls: [toolCall("t1", "grep_search", { pattern: "yellow" })] },
      { text: "Vi as ocorrências; vou ler o arquivo real.", toolCalls: [toolCall("t2", "read_file", { path: "src/App.tsx" })] },
      { text: "Li o App.tsx; vou trocar a cor.", toolCalls: [toolCall("t3", "edit_file", { path: "src/App.tsx", find: "bg-yellow-500", replace: "bg-green-600" })] },
      { text: "Apliquei; agora valido que não sobrou amarelo.", toolCalls: [toolCall("t4", "grep_search", { pattern: "yellow" })] },
      { text: 'Validado: nenhuma sobra. {"signal":"TERMINATE"}', toolCalls: [] },
    ];

    let i = 0;
    const model: ModelCaller = async (input) => {
      seen.push({ call: i, system: input.system, messages: input.messages.map((m) => ({ ...m })), tools: input.tools.map((t) => t.name) });
      const turn = script[Math.min(i, script.length - 1)];
      i += 1;
      return { ok: true, turn };
    };

    const res = await runCoderTurn({
      model, system: "SYS", messages: [{ role: "user", content: "troque o amarelo por verde" }],
      tools: list, ai: {}, emit: vi.fn(), instruction: "troque o amarelo por verde",
    });

    // 1) Múltiplas rodadas reais modelo→ferramenta→modelo (não uma única).
    expect(seen.length).toBeGreaterThanOrEqual(5);

    // 2) As ferramentas disponibilizadas ao modelo incluem investigar/editar/validar.
    for (const t of ["grep_search", "read_file", "edit_file", "run_command", "list_files", "write_file"]) {
      expect(seen[0].tools).toContain(t);
    }

    // 3) RESULTADOS DAS FERRAMENTAS voltam ao modelo (id + conteúdo real).
    const grepResult = toolMsgs(seen[1].messages).find((m) => m.toolCallId === "t1");
    expect(grepResult, "resultado do grep não voltou ao modelo").toBeTruthy();
    expect(String(grepResult?.content)).toContain("bg-yellow-500");

    const readResult = toolMsgs(seen[2].messages).find((m) => m.toolCallId === "t2");
    expect(readResult, "conteúdo do read_file não voltou ao modelo").toBeTruthy();
    expect(String(readResult?.content)).toContain("export default function App()");

    const editResult = toolMsgs(seen[3].messages).find((m) => m.toolCallId === "t3");
    expect(editResult, "resultado da edição não voltou ao modelo").toBeTruthy();

    // 4) O modelo VIU o resultado da própria validação (grep após editar).
    const validateResult = toolMsgs(seen[4].messages).find((m) => m.toolCallId === "t4");
    expect(validateResult).toBeTruthy();
    expect(String(validateResult?.content)).not.toContain("bg-yellow-500"); // sobra zero

    // 5) A SEQUÊNCIA foi escolhida pelo modelo (cada rodada muda de estratégia).
    expect(res.toolUses.map((u) => u.name)).toEqual(["grep_search", "read_file", "edit_file", "grep_search"]);
    const idsRequested = new Set(script.flatMap((t) => t.toolCalls.map((c) => c.id)));
    for (const m of toolMsgs(seen[seen.length - 1].messages)) expect(idsRequested.has(String(m.toolCallId))).toBe(true);

    // 6) EVIDÊNCIA REAL: o arquivo mudou de verdade (não é "achismo" da resposta).
    const final = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(final).toContain("bg-green-600");
    expect(final).not.toContain("bg-yellow-500");
    expect(res.touched).toContain("src/App.tsx");
    expect(res.signal?.type).toBe("TERMINATE");
  });

  it("o runtime NÃO injeta ferramentas: quem decide a sequência é o modelo", async () => {
    const { list } = buildCoderTools({ workspaceRoot: root, business: {} } as never);
    const seen: ModelMessage[][] = [];
    // Modelo escolhe um caminho DIFERENTE (sem grep, indo direto ao arquivo).
    const script: ModelTurn[] = [
      { text: "Vou ler direto.", toolCalls: [toolCall("x1", "read_file", { path: "src/App.tsx" })] },
      { text: 'Nada a mudar. {"signal":"TERMINATE"}', toolCalls: [] },
    ];
    let i = 0;
    const model: ModelCaller = async (input) => {
      seen.push(input.messages.map((m) => ({ ...m })));
      const turn = script[Math.min(i, script.length - 1)];
      i += 1;
      return { ok: true, turn };
    };
    const res = await runCoderTurn({
      model, system: "SYS", messages: [{ role: "user", content: "confira o App" }],
      tools: list, ai: {}, emit: vi.fn(), instruction: "confira o App",
    });
    // O runtime não acrescentou nenhuma chamada de ferramenta além das do modelo.
    expect(res.toolUses.map((u) => u.name)).toEqual(["read_file"]);
    // E o resultado voltou ao modelo na rodada seguinte.
    expect(toolMsgs(seen[1]).some((m) => m.toolCallId === "x1")).toBe(true);
  });
});
