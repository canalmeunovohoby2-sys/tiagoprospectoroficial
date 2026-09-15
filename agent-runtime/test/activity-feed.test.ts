import { describe, it, expect } from "vitest";
import { activityForEvent } from "../src/studio/agent-core/activity-feed";

// O card do chat precisa mostrar a AÇÃO/ARQUIVO reais daquele momento.
describe("atividade real do agente · cada evento vira a linha exata do momento", () => {
  const ev = (over: Record<string, unknown>) => ({ type: "agent_interaction", agent_name: "Coder", ...over }) as never;

  it("arquivo + ação exatos por ferramenta (nada de texto pronto)", () => {
    expect(activityForEvent(ev({ message_type: "tool_call", tool_name: "read_file", tool_arguments: { path: "src/App.tsx" } })))
      .toEqual({ phase: "reading", detail: "`src/App.tsx`" });
    expect(activityForEvent(ev({ message_type: "tool_call", tool_name: "edit_file", tool_arguments: { path: "src/components/Hero.tsx" } })))
      .toEqual({ phase: "editing", detail: "`src/components/Hero.tsx`" });
    expect(activityForEvent(ev({ message_type: "tool_call", tool_name: "write_file", tool_arguments: { path: "src/index.css" } })))
      .toEqual({ phase: "writing", detail: "`src/index.css`" });
    expect(activityForEvent(ev({ message_type: "tool_call", tool_name: "grep_search", tool_arguments: { pattern: "green" } }))?.phase).toBe("analyzing");
    expect(activityForEvent(ev({ message_type: "tool_call", tool_name: "run_command", tool_arguments: { action: "run" } }))?.phase).toBe("testing");
    expect(activityForEvent(ev({ message_type: "tool_call", tool_name: "visual_verify", tool_arguments: {} }))?.phase).toBe("verifying");
    expect(activityForEvent(ev({ message_type: "tool_call", tool_name: "design_skills", tool_arguments: { topic: "cro" } }))?.detail)
      .toMatch(/guia de design/i);
  });

  it("a frase do PRÓPRIO agente vira a mensagem do card (planner e coder)", () => {
    expect(activityForEvent(ev({ message_type: "thought", content: "Vou trocar o verde do header pelo vermelho" })))
      .toEqual({ phase: "thinking", detail: "Vou trocar o verde do header pelo vermelho" });
    expect(activityForEvent(ev({ agent_name: "Planner", message_type: "thought", content: "x" }))?.detail)
      .toMatch(/Planejando/);
    // nada útil → nenhuma linha
    expect(activityForEvent(ev({ message_type: "tool_response", tool_name: "read_file", content: "..." }))).toBeNull();
    expect(activityForEvent(ev({ message_type: "thought", content: "" }))).toBeNull();
    expect(activityForEvent({ type: "other" } as never)).toBeNull();
  });
});
