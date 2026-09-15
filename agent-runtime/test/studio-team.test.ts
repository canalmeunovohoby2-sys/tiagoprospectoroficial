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

// Bootstrap REAL (com a marca) — usado para provar o anti-template.
const BOOTSTRAP = {
  "package.json": JSON.stringify({ name: "t", private: true, scripts: { dev: "vite", build: "vite build" } }),
  "index.html": '<div id="root"></div>',
  "src/main.tsx": "import React from 'react';",
  "src/App.tsx": "// prospector-bootstrap: rascunho neutro descartável\nexport default function App(){return <main>Rascunho</main>}",
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
  let bootRoot = "";
  let bootRoot2 = "";
  let dirRoot = "";
  let dirRoot2 = "";
  let skillsRoot = "";
  let editRoot = "";
  let colorRoot = "";
  let inspectRoot = "";
  let verifyRoot = "";
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "prospector-team-"));
    rootA = mkdtempSync(join(tmpdir(), "prospector-team-a-"));
    rootB = mkdtempSync(join(tmpdir(), "prospector-team-b-"));
    bootRoot = mkdtempSync(join(tmpdir(), "prospector-bootstrap-"));
    bootRoot2 = mkdtempSync(join(tmpdir(), "prospector-bootstrap2-"));
    dirRoot = mkdtempSync(join(tmpdir(), "prospector-dir-"));
    dirRoot2 = mkdtempSync(join(tmpdir(), "prospector-dir2-"));
    skillsRoot = mkdtempSync(join(tmpdir(), "prospector-skills-"));
    editRoot = mkdtempSync(join(tmpdir(), "prospector-edit-"));
    colorRoot = mkdtempSync(join(tmpdir(), "prospector-color-"));
    inspectRoot = mkdtempSync(join(tmpdir(), "prospector-inspect-"));
    verifyRoot = mkdtempSync(join(tmpdir(), "prospector-verify-"));
    materializeWorkspace(root, TEMPLATE);
    materializeWorkspace(rootA, TEMPLATE);
    materializeWorkspace(rootB, TEMPLATE);
    materializeWorkspace(bootRoot, BOOTSTRAP);
    materializeWorkspace(bootRoot2, BOOTSTRAP);
    materializeWorkspace(dirRoot, BOOTSTRAP);
    materializeWorkspace(dirRoot2, BOOTSTRAP);
    materializeWorkspace(skillsRoot, BOOTSTRAP);
    materializeWorkspace(editRoot, BOOTSTRAP);
    materializeWorkspace(colorRoot, BOOTSTRAP);
    materializeWorkspace(inspectRoot, BOOTSTRAP);
    materializeWorkspace(verifyRoot, BOOTSTRAP);
  });
  afterAll(() => {
    for (const r of [root, rootA, rootB, bootRoot, bootRoot2, dirRoot, dirRoot2, skillsRoot, editRoot, colorRoot, inspectRoot, verifyRoot]) {
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

  it("ANTI-TEMPLATE: 1ª geração não aceita o rascunho bootstrap (força a criação real)", async () => {
    let calls = 0;
    const model: ModelCaller = async () => {
      calls += 1;
      if (calls === 1) {
        // Finge que terminou SEM criar nada — o rascunho continua no projeto.
        return { ok: true, turn: { text: 'Pronto!\n{"signal":"TERMINATE"}', toolCalls: [] } };
      }
      // Depois do nudge, cria a identidade real.
      return { ok: true, turn: { text: "Vou criar o site real.", toolCalls: [writeCall("src/App.tsx", "export default function App(){return <main><h1>Eletrica Voltz</h1></main>}")] } };
    };
    const result = await runStudioTeam({
      instruction: "crie o site do eletricista", projectId: "pb", workspaceRoot: bootRoot,
      business: { name: "Eletrica Voltz", segment: "Eletricista" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(bootRoot), model,
    });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(readFileSync(join(bootRoot, "src/App.tsx"), "utf8")).not.toContain("prospector-bootstrap");
    expect(readFileSync(join(bootRoot, "src/App.tsx"), "utf8")).toContain("Eletrica Voltz");
    expect(result.touched).toContain("src/App.tsx");
  });

  it("ANTI-TEMPLATE: se o rascunho persistir, para em nº limitado e avisa (sem loop infinito)", async () => {
    let calls = 0;
    const model: ModelCaller = async () => {
      calls += 1;
      return { ok: true, turn: { text: 'Pronto.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    const result = await runStudioTeam({
      instruction: "crie o site", projectId: "pb2", workspaceRoot: bootRoot2, business: {}, ai: {},
      emit: vi.fn(), readWorkspace: () => readWorkspace(bootRoot2), model,
    });
    // Limitado: no máximo 2 nudges do guard × (nudge interno do Coder), nunca infinito.
    expect(calls).toBeLessThanOrEqual(9);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(result.reply).toMatch(/rascunho inicial/i);
    expect(readFileSync(join(bootRoot2, "src/App.tsx"), "utf8")).toContain("prospector-bootstrap");
  });

  it("DIREÇÃO DE ARTE: registrada no código → NÃO recebe nudge extra", async () => {
    let calls = 0;
    const model: ModelCaller = async () => {
      calls += 1;
      if (calls === 1) {
        const app = `// ART-DIRECTION: archetype=editorial; palette=#0f172a,#c8a25a; hero=split; grid=assimétrico\nexport default function App(){return <main><h1>Eletrica Voltz</h1></main>}`;
        return { ok: true, turn: { text: "Criei a direção.", toolCalls: [writeCall("src/App.tsx", app)] } };
      }
      return { ok: true, turn: { text: 'Concluído.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "crie o site", projectId: "dir-ok", workspaceRoot: dirRoot,
      business: { name: "Eletrica Voltz", segment: "Eletricistas" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(dirRoot), model,
    });
    // Sem nudge do guard: escreveu + terminou (2 chamadas), não reabriu para "direção".
    expect(calls).toBeLessThanOrEqual(2);
    expect(readFileSync(join(dirRoot, "src/App.tsx"), "utf8")).toContain("ART-DIRECTION:");
  });

  it("DIREÇÃO DE ARTE: sem o marcador, a 1ª geração é nudgeada (bounded)", async () => {
    let calls = 0;
    const model: ModelCaller = async () => {
      calls += 1;
      if (calls === 1) {
        // Substitui o bootstrap, mas SEM registrar direção de arte.
        return { ok: true, turn: { text: "pronto", toolCalls: [writeCall("src/App.tsx", "export default function App(){return <main>Site</main>}")] } };
      }
      return { ok: true, turn: { text: 'Pronto.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "crie o site", projectId: "dir-missing", workspaceRoot: dirRoot2,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(dirRoot2), model,
    });
    // Reabre para cobrar a direção (mais chamadas que o caso "com marcador").
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(calls).toBeLessThanOrEqual(9);
  });

  it("ECONOMIA DE API: as skills NÃO vão no prompt do Coder (são ferramenta consultável)", async () => {    const systems: string[] = [];
    const model: ModelCaller = async (input) => {
      systems.push(input.system);
      if (systems.length === 1) {
        return { ok: true, turn: { text: "vou criar", toolCalls: [writeCall("src/App.tsx", "// ART-DIRECTION: x\nexport default function App(){return <main>ok</main>}")] } };
      }
      return { ok: true, turn: { text: 'Concluído.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "crie o site", projectId: "econ", workspaceRoot: skillsRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(skillsRoot), model,
    });
    expect(systems.length).toBeGreaterThan(0);
    for (const s of systems) {
      // Nunca o CONTEÚDO das skills no prompt…
      expect(s).not.toContain("LUXURY DARK MODE");
      expect(s).not.toContain("SKILLS DE UI/UX");
      // …apenas a menção à ferramenta instalada (barata e estável).
      expect(s).toContain("design_skills");
    }
  });

  it("EDIÇÃO GLOBAL: pedido de cor/tema exige varredura — superficial recebe nudge", async () => {
    const genModel: ModelCaller = async () => ({
      ok: true,
      turn: { text: "ok", toolCalls: [writeCall("src/App.tsx", "// ART-DIRECTION: x\nexport default function App(){return <main>ok</main>}")] },
    });
    // 1) Primeira geração (estabelece o estado do projeto; isFirst=false depois).
    await runStudioTeam({
      instruction: "crie o site", projectId: "edit-1", workspaceRoot: editRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(editRoot), model: genModel,
    });

    // 2) Edição GLOBAL "superficial": só App.tsx, sem busca → deve ser cobrado.
    const captured: string[] = [];
    let calls = 0;
    const shallow: ModelCaller = async (input) => {
      calls += 1;
      for (const m of input.messages) if (typeof m.content === "string") captured.push(m.content);
      if (calls === 1) return { ok: true, turn: { text: "mudei a cor", toolCalls: [writeCall("src/App.tsx", "export default function App(){return <main style={{color:'red'}}>ok</main>}")] } };
      return { ok: true, turn: { text: 'Pronto.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "troque a cor do site para vermelho", projectId: "edit-1", workspaceRoot: editRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(editRoot), model: shallow,
    });
    expect(captured.some((c) => c.includes("Sua alteração parece LOCAL"))).toBe(true);

    // 3) Edição GLOBAL COM varredura (grep + css) → NÃO é cobrado.
    const captured2: string[] = [];
    let sweptCalls = 0;
    const swept: ModelCaller = async (input) => {
      sweptCalls += 1;
      for (const m of input.messages) if (typeof m.content === "string") captured2.push(m.content);
      if (sweptCalls === 1) {
        return { ok: true, turn: { text: "varri e apliquei", toolCalls: [
          { id: "g1", name: "grep_search", arguments: { pattern: "#0f172a" }, rawArguments: "{}" },
          { id: "w1", name: "write_file", arguments: { path: "src/index.css", content: ":root{--brand:#dc2626}" }, rawArguments: "{}" },
        ] } };
      }
      return { ok: true, turn: { text: 'Concluído.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "troque a cor do site para vermelho", projectId: "edit-2", workspaceRoot: editRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(editRoot), model: swept,
    });
    expect(captured2.some((c) => c.includes("Sua alteração parece LOCAL"))).toBe(false);
  });

  it("COR pedida: identidade antiga mantida no código → cobra com evidência da paleta", async () => {
    const blueApp = '// ART-DIRECTION: x\nexport default function App(){return <main className="bg-blue-600 text-blue-100">ok</main>}';
    const gen: ModelCaller = async () => ({ ok: true, turn: { text: "ok", toolCalls: [writeCall("src/App.tsx", blueApp)] } });
    await runStudioTeam({
      instruction: "crie o site", projectId: "color-1", workspaceRoot: colorRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(editRoot), model: gen,
    });

    const captured: string[] = [];
    let calls = 0;
    // Modelo TEIMOSO: mantém o azul, não aplica o vermelho.
    const stubborn: ModelCaller = async (input) => {
      calls += 1;
      for (const m of input.messages) if (typeof m.content === "string") captured.push(m.content);
      if (calls === 1) return { ok: true, turn: { text: "mudei", toolCalls: [writeCall("src/App.tsx", 'export default function App(){return <main className="bg-blue-600 text-blue-100">ok</main>}')] } };
      return { ok: true, turn: { text: 'Pronto.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "troque a cor do site para vermelho", projectId: "color-1", workspaceRoot: colorRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(colorRoot), model: stubborn,
    });
    expect(captured.some((c) => c.includes("Sua alteração parece LOCAL"))).toBe(true);
    expect(captured.some((c) => c.includes("NÃO aplicou a mudança de cor"))).toBe(true);
  });

  it("INSPEÇÃO: editar arquivo EXISTENTE sem lê-lo recebe nudge; lendo antes, não", async () => {
    const app = "// ART-DIRECTION: x\nexport default function App(){return <main>ok</main>}";
    const gen: ModelCaller = async () => ({ ok: true, turn: { text: "ok", toolCalls: [writeCall("src/App.tsx", app)] } });
    await runStudioTeam({
      instruction: "crie o site", projectId: "inspect-1", workspaceRoot: inspectRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(inspectRoot), model: gen,
    });

    // 1) Edita SEM ler o arquivo existente → cobra inspeção.
    const semLer: string[] = [];
    let c1 = 0;
    const blind: ModelCaller = async (input) => {
      c1 += 1;
      for (const m of input.messages) if (typeof m.content === "string") semLer.push(m.content);
      if (c1 === 1) return { ok: true, turn: { text: "mudei", toolCalls: [writeCall("src/App.tsx", "export default function App(){return <main>mudou</main>}")] } };
      return { ok: true, turn: { text: 'Pronto.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "mude o texto do título", projectId: "inspect-1", workspaceRoot: inspectRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(inspectRoot), model: blind,
    });
    expect(semLer.some((c) => c.includes("sem tê-los inspecionado"))).toBe(true);

    // 2) LÊ antes de editar → NÃO cobra inspeção.
    const comLeitura: string[] = [];
    let c2 = 0;
    const careful: ModelCaller = async (input) => {
      c2 += 1;
      for (const m of input.messages) if (typeof m.content === "string") comLeitura.push(m.content);
      if (c2 === 1) {
        return { ok: true, turn: { text: "vou ler", toolCalls: [
          { id: "r1", name: "read_file", arguments: { path: "src/App.tsx" }, rawArguments: "{}" },
        ] } };
      }
      if (c2 === 2) return { ok: true, turn: { text: "editei", toolCalls: [writeCall("src/App.tsx", "export default function App(){return <main>ok2</main>}")] } };
      return { ok: true, turn: { text: 'Concluído.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "mude o texto do título", projectId: "inspect-2", workspaceRoot: inspectRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(inspectRoot), model: careful,
    });
    expect(comLeitura.some((c) => c.includes("sem tê-los inspecionado"))).toBe(false);
  });

  it("VERIFICAÇÃO: pedido de correção sem observar o estado real → nudge de verificação", async () => {
    const app = "// ART-DIRECTION: x\nexport default function App(){return <main><img src=\"https://x/a.jpg\" alt=\"\" /></main>}";
    const gen: ModelCaller = async () => ({ ok: true, turn: { text: "ok", toolCalls: [writeCall("src/App.tsx", app)] } });
    await runStudioTeam({
      instruction: "crie o site", projectId: "verify-1", workspaceRoot: verifyRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(verifyRoot), model: gen,
    });

    // "Corrija as imagens" sem NENHUMA verificação (só escreveu) → cobra verificação.
    const capturado: string[] = [];
    let c = 0;
    const semVerificar: ModelCaller = async (input) => {
      c += 1;
      for (const m of input.messages) if (typeof m.content === "string") capturado.push(m.content);
      if (c === 1) return { ok: true, turn: { text: "corrigi", toolCalls: [writeCall("src/App.tsx", app.replace("a.jpg", "b.jpg"))] } };
      return { ok: true, turn: { text: 'Pronto, corrigi.\n{"signal":"TERMINATE"}', toolCalls: [] } };
    };
    await runStudioTeam({
      instruction: "corrija as imagens que estão quebradas", projectId: "verify-1", workspaceRoot: verifyRoot,
      business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
      readWorkspace: () => readWorkspace(verifyRoot), model: semVerificar,
    });
    expect(capturado.some((x) => x.includes("NÃO possui evidência de conclusão"))).toBe(true);
  });
});