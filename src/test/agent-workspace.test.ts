import { describe, it, expect } from "vitest";
import {
  normalizePath, listFiles, readFile, searchFiles, writeFile, editFile,
  deleteFile, renameFile, fromSnapshot, isAllowedTextFile,
} from "../../supabase/functions/_shared/agent-workspace";
import {
  createOrchestratorState, runWorkspaceTool, runAgent, PHASE_LABEL,
  type AgentPlan, type OrchestratorState,
} from "../../supabase/functions/_shared/agent-orchestrator";

describe("Agent Workspace (5.12) — ferramentas de arquivo", () => {
  it("normaliza caminhos e impede escape do workspace", () => {
    expect(normalizePath("src/App.tsx")).toBe("src/App.tsx");
    expect(normalizePath("/etc/passwd")).toBeNull();
    expect(normalizePath("../secret.txt")).toBeNull();
    expect(normalizePath("../../etc/hosts")).toBeNull();
    expect(normalizePath("C:\\Windows\\x")).toBeNull();
    expect(normalizePath("src\\App.tsx")).toBe("src/App.tsx");
    expect(normalizePath("")).toBeNull();
  });

  it("bloqueia arquivos de segredo (.env)", () => {
    expect(isAllowedTextFile("src/.env")).toBe(false);
    expect(isAllowedTextFile("src/App.tsx")).toBe(true);
    expect(isAllowedTextFile(".env.production")).toBe(false);
  });

  it("lista, lê e busca arquivos", () => {
    const files = { "src/App.tsx": "export function App(){return 1}", "README.md": "site do cliente" };
    expect(listFiles(files)).toEqual(["README.md", "src/App.tsx"]);
    expect(readFile(files, "src/App.tsx").ok).toBe(true);
    expect(readFile(files, "x.ts").ok).toBe(false);
    const hits = searchFiles(files, "cliente");
    expect(hits.map((h) => h.path)).toContain("README.md");
  });

  it("escreve, edita, renomeia e exclui", () => {
    let files: Record<string, string> = {};
    files = writeFile(files, "src/index.ts", "const a = 1").files;
    files = editFile(files, "src/index.ts", { find: "const a = 1", replace: "const a = 2" }).files;
    expect(files["src/index.ts"]).toBe("const a = 2");
    const r = editFile(files, "src/index.ts", { find: "nao existe", replace: "x" });
    expect(r.ok).toBe(false);
    files = renameFile(files, "src/index.ts", "src/main.ts").files;
    expect(files["src/main.ts"]).toBe("const a = 2");
    expect(files["src/index.ts"]).toBeUndefined();
    files = deleteFile(files, "src/main.ts").files;
    expect(Object.keys(files).length).toBe(0);
  });

  it("protege contra escrita de caminhos inválidos e tamanho", () => {
    const r = writeFile({}, "../fora.ts", "x");
    expect(r.ok).toBe(false);
    const big = writeFile({}, "src/big.ts", "x".repeat(2_000_001));
    expect(big.ok).toBe(false);
  });

  it("snapshot ida-e-volta preserva apenas arquivos válidos", () => {
    const snapshot = { "src/App.tsx": "ok", "secreto/.env": "x", "../saiu.ts": "y", "num": 3 };
    const files = fromSnapshot(snapshot);
    expect(files["src/App.tsx"]).toBe("ok");
    expect(Object.keys(files).length).toBe(1);
  });
});

describe("Agent Orchestrator (5.12) — ciclo autônomo", () => {
  it("runner padrão executa ferramentas de arquivo", () => {
    const st = createOrchestratorState({});
    const out = runWorkspaceTool("write_file", { path: "a.ts", content: "x" }, st.files);
    expect(out.ok).toBe(true);
    expect(out.files?.["a.ts"]).toBe("x");
  });

  it("não aceita plano vazio", async () => {
    const st = createOrchestratorState({});
    const result = await runAgent(st, { id: "p", goal: "x", steps: [] }, {
      runStep: async () => ({ ok: true }),
      isResultAcceptable: async () => true,
    });
    expect(result.phase).toBe("failed");
  });

  it("executa plano até concluir e aplica refinamento quando reprovado", async () => {
    let touched = "";
    const plan: AgentPlan = {
      id: "p1", goal: "melhorar o site", steps: [
        { tool: "write_file", args: { path: "src/a.css", content: ".a{}" }, phase: "implementing" },
      ],
    };
    const st = createOrchestratorState({});
    let call = 0;
    const result = await runAgent(st, plan, {
      runStep: async (_state, step) => {
        call += 1;
        if (step.tool === "write_file") {
          touched = "write";
          return { ok: true, files: writeInto(_state.files, "src/a.css", ".a{}"), note: "css criado" };
        }
        if (step.tool === "inspect_result") {
          touched = "refine";
          return { ok: true, files: writeInto(_state.files, "src/a.css", ".a{color:red}"), note: step.args.note };
        }
        return { ok: true };
      },
      isResultAcceptable: async (state) => {
        // Reprova na 1ª, aprova após refinamento.
        return call >= 2;
      },
    }, { maxBuildAttempts: 2, maxRefinementCycles: 2, maxIterations: 10 });

    expect(result.phase).toBe("completed");
    expect(touched).toBe("refine");
    expect(result.notes.some((n) => n.includes("Refinamento 1"))).toBe(true);
  });

  it("respeita o limite de refinamento e entrega o melhor resultado", async () => {
    const plan: AgentPlan = {
      id: "p2", goal: "refinar", steps: [{ tool: "write_file", args: { path: "a.ts", content: "1" }, phase: "implementing" }],
    };
    const st = createOrchestratorState({});
    const result = await runAgent(st, plan, {
      runStep: async (_s, step) => step.tool === "write_file"
        ? { ok: true, files: writeInto(_s.files, "a.ts", "1"), note: "ok" }
        : { ok: true, files: writeInto(_s.files, "a.ts", "2"), note: "refine" },
      isResultAcceptable: async () => false,
    }, { maxBuildAttempts: 2, maxRefinementCycles: 2, maxIterations: 10 });
    expect(result.phase).toBe("completed");
    expect(result.refinementCycles).toBe(2);
  });

  it("fase com label amigável para UI", () => {
    expect(PHASE_LABEL.analyzing).toBe("Analisando o projeto…");
    expect(PHASE_LABEL.refining).toContain("Refinando");
  });
});

function writeInto(files: Record<string, string>, path: string, content: string): Record<string, string> {
  return { ...files, [path]: content };
}
