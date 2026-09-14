import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { parseAgentSignal, stripAgentSignal } from "../src/studio/agent-core/signals";
import { selectNext } from "../src/studio/agent-core/selector";
import { buildFirstMessage, projectTree } from "../src/studio/agent-core/first-message";
import { loadProjectState, saveProjectState, stateFilePath, emptyState } from "../src/studio/agent-core/project-state";
import { buildCoderTools, CODER_TOOL_NAMES } from "../src/studio/agent-core/agent-tools";

describe("C1 · sinais estruturados", () => {
  it("lê sinal JSON (e ignora ruído em volta)", () => {
    expect(parseAgentSignal('Ajustei o título.\n{"signal":"TERMINATE"}')).toEqual({ type: "TERMINATE" });
    expect(parseAgentSignal('{"signal":"DELEGATE_TO_PLANNER","reason":"muitos arquivos"}')).toEqual({ type: "DELEGATE_TO_PLANNER", reason: "muitos arquivos" });
    expect(parseAgentSignal('{"signal":"SUBTASK_DONE","summary":"header pronto"}')).toEqual({ type: "SUBTASK_DONE", summary: "header pronto" });
  });

  it("aceita sentinelas em texto (compatibilidade DaveLovable)", () => {
    expect(parseAgentSignal("Tudo pronto. TERMINATE")).toEqual({ type: "TERMINATE" });
    expect(parseAgentSignal("SUBTASK_DONE")).toEqual({ type: "SUBTASK_DONE", summary: "subtarefa concluída" });
    expect(parseAgentSignal("nada aqui")).toBeNull();
  });

  it("remove o sinal do texto exibível", () => {
    expect(stripAgentSignal('Feito! {"signal":"TERMINATE"}').trim()).toBe("Feito!");
    expect(stripAgentSignal("Feito TERMINATE").trim()).toBe("Feito");
  });
});

describe("C1 · Selector", () => {
  const base = { round: 0, maxRounds: 10, plansUsed: 0, maxPlans: 3 };

  it("começa no Coder (Coder-first)", () => {
    expect(selectNext({ ...base, lastSpeaker: null })).toBe("Coder");
    expect(selectNext({ ...base, lastSpeaker: "user" })).toBe("Coder");
  });

  it("Planner falou → Coder (obrigatório)", () => {
    expect(selectNext({ ...base, lastSpeaker: "Planner" })).toBe("Coder");
  });

  it("Coder TERMINATE → encerra", () => {
    expect(selectNext({ ...base, lastSpeaker: "Coder", lastSignal: { type: "TERMINATE" } })).toBe("end");
  });

  it("Coder DELEGATE_TO_PLANNER → Planner", () => {
    expect(selectNext({ ...base, lastSpeaker: "Coder", lastSignal: { type: "DELEGATE_TO_PLANNER", reason: "x" } })).toBe("Planner");
  });

  it("Coder SUBTASK_DONE → Planner (revisa)", () => {
    expect(selectNext({ ...base, lastSpeaker: "Coder", lastSignal: { type: "SUBTASK_DONE", summary: "x" } })).toBe("Planner");
  });

  it("Coder sem sinal → continua no Coder; respeita limites", () => {
    expect(selectNext({ ...base, lastSpeaker: "Coder" })).toBe("Coder");
    expect(selectNext({ ...base, lastSpeaker: "Coder", lastSignal: { type: "DELEGATE_TO_PLANNER", reason: "x" }, plansUsed: 3 })).toBe("Coder");
    expect(selectNext({ ...base, lastSpeaker: "Coder", round: 10 })).toBe("end");
  });
});

describe("C1 · primeira mensagem", () => {
  const files = {
    "package.json": "{}",
    "index.html": "<div id=root></div>",
    "src/App.tsx": "export default function App(){return null}",
    "src/outro.ts": "x",
    ".env": "SECRET=1",
    "node_modules/x.js": "y",
    "assets/foto.png": "bin",
  };

  it("inclui árvore, arquivos-chave e o pedido; pula sensíveis/binários", () => {
    const msg = buildFirstMessage({ instruction: "Crie uma landing page", files });
    expect(msg).toContain("Pedido do usuário: Crie uma landing page");
    expect(msg).toContain("Árvore de arquivos");
    expect(msg).toContain("src/App.tsx");
    expect(msg).toContain("package.json");
    expect(msg).not.toContain(".env");
    expect(msg).not.toContain("node_modules");
  });

  it("trunca arquivos grandes (usa read_file depois)", () => {
    const big = { "src/App.tsx": "A".repeat(50_000) };
    const msg = buildFirstMessage({ instruction: "x", files: big, maxFileBytes: 1_000, maxTotalBytes: 5_000 });
    expect(msg).toContain("truncado");
  });

  it("ordena a árvore priorizando arquivos-base", () => {
    const tree = projectTree(files);
    expect(tree.indexOf("package.json")).toBeLessThan(tree.indexOf("src/App.tsx"));
    expect(tree).not.toContain(".env");
  });
});

describe("C1 · estado por projeto", () => {
  let rootA = "";
  let rootB = "";
  beforeAll(() => {
    rootA = mkdtempSync(join(tmpdir(), "prospector-state-a-"));
    rootB = mkdtempSync(join(tmpdir(), "prospector-state-b-"));
  });
  afterAll(() => {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
    try { rmSync(stateFilePath(rootA), { force: true }); } catch { /* noop */ }
    try { rmSync(stateFilePath(rootB), { force: true }); } catch { /* noop */ }
  });

  it("salva fora do workspace e recupera por projeto", () => {
    const st = emptyState("pA");
    st.history.push({ role: "user", content: "oi", at: new Date().toISOString() });
    st.plan = "PLAN: x";
    saveProjectState(rootA, st);
    expect(existsSync(stateFilePath(rootA))).toBe(true);
    // fica FORA do diretório do projeto (é um arquivo irmão, não dentro)
    expect(stateFilePath(rootA).startsWith(rootA + sep)).toBe(false);
    const loaded = loadProjectState(rootA, "pA");
    expect(loaded.history[0].content).toBe("oi");
    expect(loaded.plan).toBe("PLAN: x");
  });

  it("não mistura projetos", () => {
    saveProjectState(rootB, { ...emptyState("pB"), iterations: 7 });
    expect(loadProjectState(rootA, "pA").iterations).toBe(0);
    expect(loadProjectState(rootB, "pB").iterations).toBe(7);
  });

  it("estado ausente/corrompido → vazio (reconstruível)", () => {
    const rootC = mkdtempSync(join(tmpdir(), "prospector-state-c-"));
    try {
      expect(loadProjectState(rootC, "px").history).toEqual([]);
      writeFileSync(stateFilePath(rootC), "{lixo", "utf8");
      expect(loadProjectState(rootC, "px").history).toEqual([]);
      // projectId divergente também é recusado
      saveProjectState(rootC, emptyState("outro"));
      expect(loadProjectState(rootC, "px").projectId).toBe("px");
    } finally {
      rmSync(rootC, { recursive: true, force: true });
      try { rmSync(stateFilePath(rootC), { force: true }); } catch { /* noop */ }
    }
  });
});

describe("C1 · tools do Coder", () => {
  let root = "";
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), "prospector-coder-tools-")); });
  afterAll(() => { rmSync(root, { recursive: true, force: true }); });

  it("expõe os contratos exigidos", () => {
    const { list } = buildCoderTools({ workspaceRoot: root, business: {} });
    const names = list.map((t) => t.schema.name);
    for (const required of ["read_file", "write_file", "edit_file", "create_file", "delete_file", "rename_file", "move_file", "list_files", "list_dir", "glob_search", "grep_search", "file_search", "run_command"]) {
      expect(names).toContain(required);
    }
    expect(names.length).toBe(CODER_TOOL_NAMES.length);
  });

  it("executa no workspace real (write + read) e bloqueia path traversal", async () => {
    const { byName } = buildCoderTools({ workspaceRoot: root, business: {} });
    const write = await byName.get("write_file")!.execute({ path: "src/App.tsx", content: "export default function App(){return null}" });
    expect(JSON.parse(write).ok).toBe(true);
    expect(existsSync(join(root, "src/App.tsx"))).toBe(true);
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("App");

    const read = await byName.get("read_file")!.execute({ path: "src/App.tsx" });
    expect(read).toContain("export default");

    const escape = await byName.get("write_file")!.execute({ path: "../escape.ts", content: "x" });
    expect(JSON.parse(escape).error).toBeTruthy();
    expect(existsSync(join(root, "..", "escape.ts"))).toBe(false);
  });
});
