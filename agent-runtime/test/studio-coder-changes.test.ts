import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCoderTurn } from "../src/studio/agent-core/coder";
import { buildCoderTools } from "../src/studio/agent-core/agent-tools";
import { materializeWorkspace } from "../src/workspace";
import type { ModelCaller, ModelTurn } from "../src/studio/agent-core/model";

const TEMPLATE = { "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x", "src/App.tsx": "y" };

function scriptedModel(turns: ModelTurn[]): ModelCaller {
  let i = 0;
  return async () => ({ ok: true, turn: turns[Math.min(i++, turns.length - 1)] });
}
function call(id: string, name: string, args: Record<string, unknown>): ModelTurn {
  return { text: `usando ${name}`, toolCalls: [{ id, name, arguments: args, rawArguments: JSON.stringify(args) }] };
}

let root = "";
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "c8-coder-")); materializeWorkspace(root, TEMPLATE); });
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

function run(model: ModelCaller) {
  const { list } = buildCoderTools({ workspaceRoot: root, business: {} });
  return runCoderTurn({
    model,
    system: "sys",
    messages: [{ role: "user", content: "troque o título" }],
    tools: list,
    ai: {},
    emit: vi.fn(),
    instruction: "Crie o site completo do cliente e troque o título",
  });
}

describe("C8 · mudança real exige tool de edição bem-sucedida", () => {
  it("Teste 2 — write_file success ⇒ touched>0 e arquivo realmente escrito", async () => {
    const res = await run(scriptedModel([
      call("1", "write_file", { path: "src/App.tsx", content: "export default function App(){return <h1>TaskFlow</h1>}" }),
      { text: 'Feito. {"signal":"TERMINATE"}', toolCalls: [] },
    ]));
    expect(res.touched).toContain("src/App.tsx");
    expect(res.toolUses.some((t) => t.ok)).toBe(true);
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("TaskFlow");
  });

  it("Teste 1 — só texto + TERMINATE ⇒ touched vazio (changed=false)", async () => {
    const res = await run(scriptedModel([{ text: 'Criei o app inteiro. {"signal":"TERMINATE"}', toolCalls: [] }]));
    expect(res.touched).toEqual([]);
    expect(res.toolUses).toEqual([]);
  });

  it("Teste 3 — write_file com erro (path inválido) ⇒ touched vazio, sem falsa conclusão", async () => {
    const res = await run(scriptedModel([
      call("1", "write_file", { path: "../escape.tsx", content: "x" }),
      { text: '{"signal":"TERMINATE"}', toolCalls: [] },
    ]));
    expect(res.touched).toEqual([]);
    expect(res.toolUses[0]?.ok).toBe(false);
    expect(existsSync(join(root, "..", "escape.tsx"))).toBe(false);
  });

  it("tool-call malformada (args truncados → {}) ⇒ falha real, nada escrito", async () => {
    const res = await run(scriptedModel([
      { text: "usando write_file", toolCalls: [{ id: "1", name: "write_file", arguments: {}, rawArguments: '{"path":"src/App.tsx","content":"x' }] },
      { text: '{"signal":"TERMINATE"}', toolCalls: [] },
    ]));
    expect(res.touched).toEqual([]);
    expect(res.toolUses[0]?.ok).toBe(false);
  });

  it("NUDGE — modelo responde texto+TERMINATE sem tools ⇒ força tool de edição e grava", async () => {
    const res = await run(scriptedModel([
      { text: 'Pronto, criei o site completo. {"signal":"TERMINATE"}', toolCalls: [] },
      call("1", "write_file", { path: "src/App.tsx", content: "export default function App(){return <h1>Real</h1>}" }),
      { text: '{"signal":"TERMINATE"}', toolCalls: [] },
    ]));
    expect(res.touched).toContain("src/App.tsx");
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("Real");
  });

  it("pergunta/análise (não exige alteração) NÃO força nudge", async () => {
    const { list } = buildCoderTools({ workspaceRoot: root, business: {} });
    const model = scriptedModel([{ text: "O site tem 3 seções. TERMINATE", toolCalls: [] }]);
    const res = await runCoderTurn({
      model, system: "sys", messages: [{ role: "user", content: "o que tem no site?" }],
      tools: list, ai: {}, emit: vi.fn(), instruction: "O que tem no site?",
    });
    expect(res.touched).toEqual([]);
    expect(res.toolUses).toEqual([]);
  });

  it("NUNCA vaza o objeto de controle no chat (nem no emit, nem no texto final)", async () => {
    const emits: Array<Record<string, unknown>> = [];
    const { list } = buildCoderTools({ workspaceRoot: root, business: {} });
    const model = scriptedModel([
      call("1", "write_file", { path: "src/App.tsx", content: "export default function App(){return <h1>Ok</h1>}" }),
      { text: 'Página pronta. {"signal":"TERMINATE"}', toolCalls: [] },
    ]);
    const res = await runCoderTurn({
      model, system: "sys", messages: [{ role: "user", content: "crie o site" }],
      tools: list, ai: {}, emit: (e) => emits.push(e), instruction: "Crie o site do cliente",
    });
    const shown = emits
      .filter((e) => e.type === "agent_interaction")
      .map((e) => String(e.content ?? ""))
      .join("\n");
    expect(shown).not.toContain("TERMINATE");
    expect(res.text).not.toContain("TERMINATE");
  });
});
