import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStudioTeam } from "../src/studio/team";
import { readWorkspace, materializeWorkspace } from "../src/workspace";
import { loadProjectState, stateFilePath } from "../src/studio/agent-core/project-state";
import type { ModelCaller, ModelTurn } from "../src/studio/agent-core/model";
import type { RunPlannerInput, RunPlannerResult } from "../src/studio/agent-core/planner";

const TEMPLATE = {
  "package.json": JSON.stringify({ name: "t", private: true, scripts: { dev: "vite", build: "vite build" } }),
  "index.html": '<div id="root"></div>',
  "src/main.tsx": "import React from 'react';",
  "src/App.tsx": "export default function App(){return null}",
};

function scriptedModel(turns: ModelTurn[]): ModelCaller {
  let i = 0;
  return async () => {
    const turn = turns[Math.min(i, turns.length - 1)];
    i += 1;
    return { ok: true, turn };
  };
}

function writeCall(path: string, content: string) {
  return { id: `c${Math.random().toString(36).slice(2, 6)}`, name: "write_file", arguments: { path, content }, rawArguments: "" };
}

describe("C1 · StudioTeam (vertical slice)", () => {
  let root = "";
  let rootA = "";
  let rootB = "";
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "prospector-team-"));
    rootA = mkdtempSync(join(tmpdir(), "prospector-team-a-"));
    rootB = mkdtempSync(join(tmpdir(), "prospector-team-b-"));
    materializeWorkspace(root, TEMPLATE);
    materializeWorkspace(rootA, TEMPLATE);
    materializeWorkspace(rootB, TEMPLATE);
  });
  afterAll(() => {
    for (const r of [root, rootA, rootB]) {
      rmSync(r, { recursive: true, force: true });
      try { rmSync(stateFilePath(r), { force: true }); } catch { /* noop */ }
    }
  });

  it("Coder executa ferramenta real, altera App.tsx e termina (sem Planner)", async () => {
    const emit = vi.fn();
    const onFilesChanged = vi.fn();
    const model = scriptedModel([
      { text: "Vou trocar o título no App.tsx.", toolCalls: [writeCall("src/App.tsx", "export default function App(){return <h1>Sua beleza começa aqui</h1>}")] },
      { text: 'Pronto.\n{"signal":"TERMINATE"}', toolCalls: [] },
    ]);

    const result = await runStudioTeam({
      instruction: "Troque o título principal",
      projectId: "proj-1",
      workspaceRoot: root,
      business: { name: "Estética X" },
      ai: {},
      emit,
      readWorkspace: () => readWorkspace(root),
      onFilesChanged,
      model,
    });

    expect(result.ok).toBe(true);
    expect(result.signal?.type).toBe("TERMINATE");
    expect(result.touched).toContain("src/App.tsx");
    expect(onFilesChanged).toHaveBeenCalled();
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("Sua beleza começa aqui");
    // eventos emitidos (thought + tool_call + tool_response + complete não aqui)
    const types = emit.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("agent_interaction");
    // estado persistido por projeto
    expect(loadProjectState(root, "proj-1").history.length).toBeGreaterThan(0);
  });

  it("Coder delega ao Planner (DELEGATE_TO_PLANNER) e depois executa", async () => {
    const emit = vi.fn();
    const planner = vi.fn(async (planInput: RunPlannerInput): Promise<RunPlannerResult> => {
      const plan = "PLAN: criar App\n1. [ ] App.tsx\nNext task: criar App.tsx";
      planInput.emit({ type: "plan", agent_name: "Planner", plan, timestamp: Date.now() });
      return { ok: true, plan };
    });
    const model = scriptedModel([
      { text: '{"signal":"DELEGATE_TO_PLANNER","reason":"vários arquivos"}', toolCalls: [] },
      { text: "Executando o passo do plano.", toolCalls: [writeCall("src/App.tsx", "export default function App(){return <main>ok</main>}")] },
      { text: '{"signal":"SUBTASK_DONE","summary":"App criado"}', toolCalls: [] },
      { text: 'Tudo pronto.\n{"signal":"TERMINATE"}', toolCalls: [] },
    ]);

    const result = await runStudioTeam({
      instruction: "Construa a landing completa",
      projectId: "proj-2",
      workspaceRoot: root,
      business: {},
      ai: {},
      emit,
      readWorkspace: () => readWorkspace(root),
      model,
      planner,
    });

    expect(planner).toHaveBeenCalled();
    // Planner NÃO recebe ferramentas
    expect(Object.prototype.hasOwnProperty.call(planner.mock.calls[0][0], "tools")).toBe(false);
    expect(result.signal?.type).toBe("TERMINATE");
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("<main>ok</main>");
    const planEvents = emit.mock.calls.filter((c) => (c[0] as { type: string }).type === "plan");
    expect(planEvents.length).toBeGreaterThan(0);
  });

  it("estado é isolado por projeto e não mistura", async () => {
    const model = scriptedModel([{ text: 'ok\n{"signal":"TERMINATE"}', toolCalls: [] }]);
    await runStudioTeam({ instruction: "a", projectId: "pa", workspaceRoot: rootA, business: {}, ai: {}, emit: vi.fn(), readWorkspace: () => readWorkspace(rootA), model });
    await runStudioTeam({ instruction: "b", projectId: "pb", workspaceRoot: rootB, business: {}, ai: {}, emit: vi.fn(), readWorkspace: () => readWorkspace(rootB), model });
    expect(loadProjectState(rootA, "pa").history.some((m) => m.content.includes("a"))).toBe(true);
    expect(loadProjectState(rootA, "pa").history.some((m) => m.content.includes("b"))).toBe(false);
    expect(loadProjectState(rootB, "pb").history.some((m) => m.content.includes("b"))).toBe(true);
    expect(existsSync(stateFilePath(rootA))).toBe(true);
  });

  it("respeita cancelamento (AbortSignal)", async () => {
    const controller = new AbortController();
    controller.abort();
    const model = scriptedModel([{ text: "x", toolCalls: [] }]);
    const result = await runStudioTeam({ instruction: "x", projectId: "pc", workspaceRoot: rootB, business: {}, ai: {}, emit: vi.fn(), readWorkspace: () => readWorkspace(rootB), model, signal: controller.signal });
    expect(result.iterations).toBe(0);
  });
});
