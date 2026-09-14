import { describe, it, expect } from "vitest";
import { buildUnifiedChat, deriveStudioPhase, activitySummary, PHASE_LABEL, type StudioRun } from "@/lib/studio/chatModel";
import type { StudioInteractionEvent } from "@/lib/studio/streamEvents";

function thought(content: string, at = 1): StudioInteractionEvent {
  return { type: "agent_interaction", agent_name: "Coder", message_type: "thought", content, timestamp: at };
}
function toolCall(name: string, id: string, at = 2): StudioInteractionEvent {
  return { type: "agent_interaction", agent_name: "Coder", message_type: "tool_call", tool_name: name, tool_call_id: id, content: `usar ${name}`, timestamp: at };
}
function toolResponse(name: string, id: string, at = 3): StudioInteractionEvent {
  return { type: "agent_interaction", agent_name: "Coder", message_type: "tool_response", tool_name: name, tool_call_id: id, content: "ok", timestamp: at };
}
function run(id: number, over: Partial<StudioRun> = {}): StudioRun {
  return { id, startedAt: id * 100, status: "done", events: [], ...over };
}

describe("C2 · buildUnifiedChat", () => {
  it("intercala usuário → atividade → resposta", () => {
    const items = buildUnifiedChat({
      messages: [{ role: "user", text: "Adicione depoimentos" }, { role: "assistant", text: "Adicionado." }],
      runs: [run(1, { events: [thought("analisando"), toolCall("read_file", "1"), toolResponse("read_file", "1")], plan: "PLAN", filesUpdated: true })],
    });
    expect(items.map((i) => i.kind)).toEqual(["user", "activity", "assistant"]);
    const activity = items[1];
    if (activity.kind === "activity") {
      expect(activity.items).toHaveLength(2); // thought + tool par
      expect(activity.plan).toBe("PLAN");
      expect(activity.filesUpdated).toBe(true);
    }
  });

  it("mantém múltiplas execuções na ordem da conversa", () => {
    const items = buildUnifiedChat({
      messages: [
        { role: "user", text: "u1" }, { role: "assistant", text: "a1" },
        { role: "user", text: "u2" }, { role: "assistant", text: "a2" },
      ],
      runs: [run(1, { events: [thought("t1")] }), run(2, { events: [thought("t2")] })],
    });
    expect(items.map((i) => i.kind)).toEqual(["user", "activity", "assistant", "user", "activity", "assistant"]);
  });

  it("expõe commits e mensagens de sistema", () => {
    const items = buildUnifiedChat({
      messages: [{ role: "system", text: "Arquivos atualizados" }],
      runs: [],
      commits: [{ message: "Adiciona seção", hash: "abc1234" }],
    });
    expect(items[0].kind).toBe("system");
    expect(items[1].kind).toBe("commit");
    if (items[1].kind === "commit") expect(items[1].hash).toBe("abc1234");
  });

  it("não duplica conteúdo de arquivos (só atividade)", () => {
    const items = buildUnifiedChat({
      messages: [{ role: "user", text: "x" }, { role: "assistant", text: "y" }],
      runs: [run(1, { events: [toolCall("write_file", "1")], filesUpdated: true })],
    });
    const activity = items.find((i) => i.kind === "activity");
    expect(activity).toBeTruthy();
    if (activity?.kind === "activity") {
      expect(activity.items.every((it) => it.kind === "thought" || it.kind === "tool")).toBe(true);
    }
  });

  it("anexa runs sem mensagem de usuário (histórico antigo)", () => {
    const items = buildUnifiedChat({ messages: [], runs: [run(1, { events: [thought("só atividade")] })] });
    expect(items.map((i) => i.kind)).toEqual(["activity"]);
  });
});

describe("C2/C6 · deriveStudioPhase / rótulos", () => {
  it("idle sem runs", () => {
    expect(deriveStudioPhase({ running: false, runs: [] })).toBe("idle");
  });
  it("preparing ao iniciar sem atividade", () => {
    expect(deriveStudioPhase({ running: true, runs: [run(1, { status: "running", events: [] })] })).toBe("preparing");
  });
  it("coding com atividade do Coder", () => {
    expect(deriveStudioPhase({ running: true, runs: [run(1, { status: "running", events: [thought("x")] })], currentAgent: "Coder" })).toBe("coding");
  });
  it("planning quando o Planner atua", () => {
    expect(deriveStudioPhase({ running: true, runs: [run(1, { status: "running", events: [{ type: "agent_interaction", agent_name: "Planner", message_type: "thought", content: "p", timestamp: 1 }] })], currentAgent: "Planner" })).toBe("planning");
  });
  it("tool_running com ferramenta aberta (read_file)", () => {
    expect(deriveStudioPhase({ running: true, runs: [run(1, { status: "running", events: [toolCall("read_file", "1")] })], currentTool: "read_file" })).toBe("tool_running");
  });
  it("validating quando run_command está em execução", () => {
    expect(deriveStudioPhase({ running: true, runs: [run(1, { status: "running", events: [toolCall("run_command", "1")] })], currentTool: "run_command" })).toBe("validating");
  });
  it("files_ready após edição sem ferramenta aberta", () => {
    expect(deriveStudioPhase({ running: true, runs: [run(1, { status: "running", events: [thought("x")], filesUpdated: true })] })).toBe("files_ready");
  });
  it("committing quando o run registrou commit", () => {
    expect(deriveStudioPhase({ running: true, runs: [run(1, { status: "running", events: [thought("x")], committed: true })] })).toBe("committing");
  });
  it("complete/error/cancelled conforme a última run", () => {
    expect(deriveStudioPhase({ running: false, runs: [run(1, { status: "done" })] })).toBe("complete");
    expect(deriveStudioPhase({ running: false, runs: [run(1, { status: "error" })] })).toBe("error");
    expect(deriveStudioPhase({ running: false, runs: [run(1, { status: "cancelled" })] })).toBe("cancelled");
  });
  it("tem rótulo para todos os estados", () => {
    for (const p of ["idle", "preparing", "planning", "coding", "tool_running", "validating", "files_ready", "committing", "complete", "error", "cancelled"] as const) {
      expect(PHASE_LABEL[p]).toBeTruthy();
    }
  });
});

describe("C2 · activitySummary", () => {
  it("resume ferramentas e análises", () => {
    const summary = activitySummary(run(1, { events: [thought("a"), toolCall("read_file", "1"), toolResponse("read_file", "1")] }));
    expect(summary).toMatch(/ferramenta/);
  });
  it("sem atividade e sem plano", () => {
    expect(activitySummary(run(1, {}))).toBe("Sem atividade");
  });
});
