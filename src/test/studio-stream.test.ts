import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { parseStudioLine } from "@/lib/studio/streamEvents";
import type { StudioInteractionEvent } from "@/lib/studio/streamEvents";
import { buildInteractionItems, toolResponseIsError, countToolPairs } from "@/lib/studio/interactions";
import { useStudioChat } from "@/hooks/studio/useStudioChat";

function interaction(partial: Partial<StudioInteractionEvent>): StudioInteractionEvent {
  return {
    type: "agent_interaction",
    agent_name: "Coder",
    message_type: "thought",
    content: "",
    timestamp: Date.now(),
    ...partial,
  };
}

describe("Studio stream · parseStudioLine", () => {
  it("faz parse de eventos válidos e ignora lixo", () => {
    expect(parseStudioLine('{"type":"ping"}')?.type).toBe("ping");
    expect(parseStudioLine('{"type":"agent_interaction","agent_name":"Coder","message_type":"thought","content":"oi","timestamp":1}')?.type).toBe("agent_interaction");
    expect(parseStudioLine("")).toBeNull();
    expect(parseStudioLine("não é json")).toBeNull();
    expect(parseStudioLine("[1,2,3]")).toBeNull();
    expect(parseStudioLine('{"semTipo":true}')).toBeNull();
  });
});

describe("Studio stream · buildInteractionItems", () => {
  it("agrupa tool_call + tool_response por tool_call_id", () => {
    const events = [
      interaction({ message_type: "thought", content: "Analisando" }),
      interaction({ message_type: "tool_call", tool_name: "read_file", tool_call_id: "1", tool_arguments: { path: "index.html" }, timestamp: 10 }),
      interaction({ message_type: "tool_response", tool_name: "read_file", tool_call_id: "1", content: "ok", timestamp: 11 }),
    ];
    const items = buildInteractionItems(events);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe("thought");
    const tool = items[1];
    expect(tool.kind).toBe("tool");
    if (tool.kind === "tool") {
      expect(tool.name).toBe("read_file");
      expect(tool.status).toBe("done");
      expect(tool.response).toBe("ok");
    }
  });

  it("casa por ordem quando não há tool_call_id", () => {
    const events = [
      interaction({ message_type: "tool_call", tool_name: "edit_file", timestamp: 1 }),
      interaction({ message_type: "tool_response", tool_name: "edit_file", content: "aplicado", timestamp: 2 }),
    ];
    const items = buildInteractionItems(events);
    expect(items).toHaveLength(1);
    if (items[0].kind === "tool") {
      expect(items[0].response).toBe("aplicado");
      expect(items[0].status).toBe("done");
    }
  });

  it("marca erro estruturado e mantém resposta órfã", () => {
    const events = [
      interaction({ message_type: "tool_response", tool_name: "edit_file", content: '{"error":"falhou"}', timestamp: 1 }),
    ];
    const items = buildInteractionItems(events);
    expect(items[0].kind).toBe("tool");
    if (items[0].kind === "tool") expect(items[0].status).toBe("error");
    expect(toolResponseIsError('{"error":"x"}')).toBe(true);
    expect(toolResponseIsError('{"ok":true}')).toBe(false);
    expect(toolResponseIsError("texto normal")).toBe(false);
  });

  it("conta pares abertos/resolvidos", () => {
    const events = [
      interaction({ message_type: "tool_call", tool_call_id: "a" }),
      interaction({ message_type: "tool_call", tool_call_id: "b" }),
      interaction({ message_type: "tool_response", tool_call_id: "a" }),
    ];
    const counts = countToolPairs(events);
    expect(counts.calls).toBe(2);
    expect(counts.responses).toBe(1);
    expect(counts.open).toBe(1);
  });
});

describe("Studio stream · useStudioChat (Fase 2/3)", () => {
  it("consome thoughts/tools/plan/complete e ignora files_ready", () => {
    const { result } = renderHook(() => useStudioChat());

    act(() => result.current.begin());
    expect(result.current.running).toBe(true);

    act(() => result.current.handleEvent(
      interaction({ message_type: "thought", content: "Analisando" }),
    ));
    act(() => result.current.handleEvent(
      interaction({ message_type: "tool_call", tool_name: "edit_file", tool_call_id: "1" }),
    ));
    act(() => result.current.handleEvent({
      type: "files_ready",
      files: { "cliente/index.html": "<h1>x</h1>" },
    }));
    act(() => result.current.handleEvent(
      interaction({ message_type: "tool_response", tool_name: "edit_file", tool_call_id: "1", content: "ok" }),
    ));
    act(() => result.current.handleEvent({ type: "plan", plan: "PLAN:\n1. [ ] passo" }));

    expect(result.current.plan).toContain("PLAN:");
    expect(result.current.items).toHaveLength(2);
    const tool = result.current.items[1];
    if (tool.kind === "tool") expect(tool.status).toBe("done");

    act(() => result.current.handleEvent({ type: "complete", status: "ok", reply: "Feito." }));
    expect(result.current.running).toBe(false);
    expect(result.current.cancelled).toBe(false);
  });

  it("cancelamento via complete marca cancelled", () => {
    const { result } = renderHook(() => useStudioChat());
    act(() => result.current.begin());
    act(() => result.current.handleEvent({ type: "complete", status: "error", cancelled: true, error: "cancelado" }));
    expect(result.current.cancelled).toBe(true);
    expect(result.current.error).toBe("cancelado");
  });
});
