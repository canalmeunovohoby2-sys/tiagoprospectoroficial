import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureValidToolHistory, type ModelCaller, type ModelMessage, type ModelTurn } from "../src/studio/agent-core/model";
import { runCoderTurn } from "../src/studio/agent-core/coder";
import { buildCoderTools } from "../src/studio/agent-core/agent-tools";
import { runStudioTeam } from "../src/studio/team";
import { materializeWorkspace, readWorkspace } from "../src/workspace";

const MSG = (role: ModelMessage["role"], over: Partial<ModelMessage> = {}): ModelMessage => ({ role, content: "", ...over });
const call = (id: string, name = "write_file"): { id: string; name: string; arguments: Record<string, unknown>; rawArguments: string } =>
  ({ id, name, arguments: { path: `src/${id}.tsx`, content: "x" }, rawArguments: "{}" });

describe("ensureValidToolHistory · histórico válido para o provider", () => {
  it("mantém intacta uma sequência válida (assistant[tool_calls A,B] + tool A + tool B)", () => {
    const ok: ModelMessage[] = [
      MSG("user", { content: "oi" }),
      MSG("assistant", { content: "", toolCalls: [call("A"), call("B")] }),
      MSG("tool", { toolCallId: "A", content: "ok A" }),
      MSG("tool", { toolCallId: "B", content: "ok B" }),
      MSG("assistant", { content: "pronto" }),
    ];
    expect(ensureValidToolHistory(ok)).toEqual(ok);
  });

  it("RECUPERA tool_call sem resposta (o caso do HTTP 400) e preserva a ordem", () => {
    const broken: ModelMessage[] = [
      MSG("assistant", { content: "", toolCalls: [call("A"), call("B")] }),
      MSG("tool", { toolCallId: "A", content: "ok A" }),
      MSG("assistant", { content: "continuei" }), // ← B nunca respondeu
    ];
    const fixed = ensureValidToolHistory(broken);
    expect(fixed.map((m) => m.role)).toEqual(["assistant", "tool", "tool", "assistant"]);
    expect(fixed[1].toolCallId).toBe("A");
    expect(fixed[2].toolCallId).toBe("B"); // sintetizada, mantém o protocolo válido
    expect(fixed[2].content).toMatch(/ausente/i);
  });

  it("descarta `tool` órfã (sem tool_call correspondente)", () => {
    const orphan: ModelMessage[] = [
      MSG("user", { content: "oi" }),
      MSG("tool", { toolCallId: "Z", content: "sem dono" }),
      MSG("assistant", { content: "ok" }),
    ];
    const fixed = ensureValidToolHistory(orphan);
    expect(fixed.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("cobre: uma tool, múltiplas, tool seguida de tool e ferramenta com erro/vazia", () => {
    const one: ModelMessage[] = [MSG("assistant", { content: "", toolCalls: [call("A")] }), MSG("tool", { toolCallId: "A", content: "{}" })];
    expect(ensureValidToolHistory(one)).toEqual(one);

    const errored: ModelMessage[] = [MSG("assistant", { content: "", toolCalls: [call("A")] }), MSG("tool", { toolCallId: "A", content: '{"error":"falhou"}' })];
    expect(ensureValidToolHistory(errored)).toEqual(errored);

    const empty: ModelMessage[] = [MSG("assistant", { content: "", toolCalls: [call("A")] }), MSG("tool", { toolCallId: "A", content: "" })];
    expect(ensureValidToolHistory(empty)).toEqual(empty);

    const twoRounds: ModelMessage[] = [
      MSG("assistant", { content: "", toolCalls: [call("A")] }), MSG("tool", { toolCallId: "A", content: "1" }),
      MSG("assistant", { content: "", toolCalls: [call("B"), call("C")] }), MSG("tool", { toolCallId: "B", content: "2" }), MSG("tool", { toolCallId: "C", content: "3" }),
    ];
    expect(ensureValidToolHistory(twoRounds)).toEqual(twoRounds);
  });
});

let root = "";
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "tool-history-"));
  materializeWorkspace(root, { "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x", "src/App.tsx": "y" });
});
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe("runCoderTurn · produced inclui assistant+tool com os MESMOS ids (causa do 400)", () => {
  it("múltiplas tool calls numa rodada geram assistant(tool_calls) + tool por id", async () => {
    const { list } = buildCoderTools({ workspaceRoot: root, business: {} });
    const turn1: ModelTurn = {
      text: "vou escrever e ler",
      toolCalls: [
        { id: "call_1", name: "write_file", arguments: { path: "src/A.tsx", content: "export default function A(){return null}" }, rawArguments: "{}" },
        { id: "call_2", name: "read_file", arguments: { path: "src/App.tsx" }, rawArguments: "{}" },
      ],
    };
    let i = 0;
    const model: ModelCaller = async () => ({ ok: true, turn: i++ === 0 ? turn1 : { text: 'Feito. {"signal":"TERMINATE"}', toolCalls: [] } });
    const res = await runCoderTurn({ model, system: "s", messages: [{ role: "user", content: "crie" }], tools: list, ai: {}, emit: vi.fn(), instruction: "crie o site" });

    const roles = res.produced.map((m) => m.role);
    expect(roles).toEqual(["assistant", "tool", "tool"]);
    expect(res.produced[0].toolCalls?.map((c) => c.id)).toEqual(["call_1", "call_2"]);
    expect(res.produced[1].toolCallId).toBe("call_1");
    expect(res.produced[2].toolCallId).toBe("call_2");

    // Reconstrução do team: histórico continua VÁLIDO (nenhuma síntese necessária).
    const rebuilt = [{ role: "user" as const, content: "crie" }, ...res.produced];
    expect(ensureValidToolHistory(rebuilt)).toEqual(rebuilt);
  });
});

describe("StudioTeam · histórico enviado ao provider é sempre válido (nunca HTTP 400)", () => {
  it("em cada chamada ao modelo, todo assistant(tool_calls) tem suas respostas tool", async () => {
    const rootTeam = mkdtempSync(join(tmpdir(), "tool-history-team-"));
    materializeWorkspace(rootTeam, { "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x", "src/App.tsx": "y" });
    try {
      const captured: ModelMessage[][] = [];
      let calls = 0;
      const model: ModelCaller = async (input) => {
        captured.push(input.messages.map((m) => ({ ...m })));
        calls += 1;
        if (calls === 1) {
          // Coder dispara DUAS ferramentas na mesma mensagem (o caso crítico).
          return { ok: true, turn: { text: "vou usar ferramentas", toolCalls: [
            { id: "c1", name: "design_skills", arguments: { topic: "cro" }, rawArguments: "{}" },
            { id: "c2", name: "write_file", arguments: { path: "src/App.tsx", content: "// ART-DIRECTION: x\nexport default function App(){return <main>ok</main>}" }, rawArguments: "{}" },
          ] } };
        }
        return { ok: true, turn: { text: 'Concluído.\n{"signal":"TERMINATE"}', toolCalls: [] } };
      };
      await runStudioTeam({
        instruction: "crie o site", projectId: "th", workspaceRoot: rootTeam,
        business: { name: "Pet Amigo", segment: "Pet Shop" }, ai: {}, emit: vi.fn(),
        readWorkspace: () => readWorkspace(rootTeam), model,
      });

      expect(captured.length).toBeGreaterThanOrEqual(2);
      for (const history of captured) {
        // Se o histórico já fosse inválido, a rede de segurança acrescentaria itens.
        expect(ensureValidToolHistory(history)).toEqual(history);
        // E, explicitamente: todo id de tool_call tem resposta `tool` depois.
        history.forEach((m, idx) => {
          if (m.role !== "assistant" || !m.toolCalls?.length) return;
          const answered = new Set(history.slice(idx + 1).filter((x) => x.role === "tool").map((x) => x.toolCallId));
          for (const c of m.toolCalls) expect(answered.has(c.id)).toBe(true);
        });
      }
    } finally {
      rmSync(rootTeam, { recursive: true, force: true });
    }
  });
});
