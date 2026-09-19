import { describe, it, expect } from "vitest";
import { createLiveStreamBridge, activityForTool, type LiveEventLike } from "../src/studio/live-events";

// FASE 1 — requisito C: eventos REAIS do agente chegam ao cliente DURANTE a run
// (nunca em bloco no fim) e nada é fabricado quando não há evento.

type Line = Record<string, unknown>;

function harness() {
  const lines: Line[] = [];
  let files: Record<string, string> = { "index.html": "<h1>antes</h1>" };
  const bridge = createLiveStreamBridge({
    writeLine: (obj) => lines.push(obj),
    readFiles: () => files,
    messageText: (m) => {
      const parts = (m as { content?: Array<{ type?: string; text?: string }> } | null)?.content ?? [];
      return parts.map((p) => (p?.type === "text" ? String(p.text ?? "") : "")).join("");
    },
    truncateText: (t) => t,
    editTools: new Set(["write_file", "edit_file"]),
    filesThrottleMs: 0,
  });
  return { lines, bridge, setFiles: (f: Record<string, string>) => { files = f; } };
}

const toolStart = (name: string, id: string, input: Record<string, unknown> = {}): LiveEventLike => ({ type: "tool-started", toolName: name, toolCall: { toolName: name, toolCallId: id, input } });
const toolEnd = (name: string, id: string, text = "ok"): LiveEventLike => ({ type: "tool-finished", toolName: name, toolCall: { toolName: name, toolCallId: id }, message: { content: [{ type: "text", text }] } });

describe("FASE 1 · streaming real (createLiveStreamBridge)", () => {
  it("C) eventos chegam ANTES do término da run (não são emitidos em bloco)", async () => {
    const { lines, bridge } = harness();
    let eventsAtRunStart = -1;
    let eventsBeforeResolve = -1;

    const run = async () => {
      eventsAtRunStart = lines.length;
      bridge.onEvent({ type: "turn-started" });
      bridge.onEvent(toolStart("read_file", "r1", { path: "src/App.tsx" }));
      bridge.onEvent(toolEnd("read_file", "r1", '{"ok":true}'));
      bridge.onEvent(toolStart("edit_file", "e1", { path: "index.html" }));
      bridge.onEvent(toolEnd("edit_file", "e1", '{"ok":true}'));
      return { messages: [{ role: "assistant", content: "Feito." }] };
    };

    const promise = run().then(() => {
      // ANTES deste then (fim da run), as linhas já foram escritas:
      eventsBeforeResolve = lines.length;
    });
    await promise;
    bridge.flushFiles();

    expect(eventsAtRunStart).toBe(0);
    expect(eventsBeforeResolve).toBeGreaterThan(0);
    expect(lines.some((l) => l.type === "activity")).toBe(true);
    expect(lines.some((l) => l.type === "agent_interaction" && l.message_type === "tool_call")).toBe(true);
    expect(lines.some((l) => l.type === "agent_interaction" && l.message_type === "tool_response")).toBe(true);
    expect(lines.some((l) => l.type === "files_ready")).toBe(true);
    expect(lines.some((l) => l.type === "reload_preview")).toBe(true);
  });

  it("não fabrica nada quando não há evento real", () => {
    const { lines, bridge } = harness();
    bridge.flushFiles();
    // flushFiles só reenvia o estado real dos arquivos; nenhuma atividade inventada
    expect(lines.filter((l) => l.type === "activity")).toHaveLength(0);
    expect(lines.filter((l) => l.type === "agent_interaction")).toHaveLength(0);
  });

  it("activity é derivada da ferramenta REAL (leitura/edição/verificação)", () => {
    expect(activityForTool("read_file", "src/App.tsx")).toEqual({ phase: "analyzing", detail: "Lendo src/App.tsx" });
    expect(activityForTool("edit_file", "src/App.tsx")).toEqual({ phase: "editing", detail: "Alterando src/App.tsx" });
    expect(activityForTool("browser_reload", "")?.phase).toBe("verifying");
    expect(activityForTool("web_search", "")?.phase).toBe("researching");
    expect(activityForTool("run_command", "")?.phase).toBe("validating");
    expect(activityForTool("", "")).toBeNull();
  });

  it("thought vem SÓ do texto real do modelo (e não repete o mesmo texto)", () => {
    const { lines, bridge } = harness();
    bridge.onEvent({ type: "assistant-message", message: { content: [{ type: "text", text: "Vou ajustar o hero." }] } });
    bridge.onEvent({ type: "assistant-message", message: { content: [{ type: "text", text: "Vou ajustar o hero." }] } });
    bridge.onEvent({ type: "assistant-message", message: { content: [{ type: "text", text: "" }] } });
    const thoughts = lines.filter((l) => l.type === "agent_interaction" && l.message_type === "thought");
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0].content).toBe("Vou ajustar o hero.");
  });

  it("mede o que foi realmente emitido (telemetria do bridge)", () => {
    const { bridge } = harness();
    bridge.onEvent({ type: "turn-started" });
    bridge.onEvent(toolStart("read_file", "r1", { path: "a.tsx" }));
    bridge.onEvent(toolEnd("read_file", "r1"));
    const s = bridge.stats();
    expect(s.activities).toBeGreaterThan(0);
    expect(s.toolCalls).toBe(1);
    expect(s.toolResponses).toBe(1);
    expect(s.assistantMessages).toBe(0);
  });
});
