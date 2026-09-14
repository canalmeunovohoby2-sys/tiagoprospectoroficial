import { describe, it, expect } from "vitest";
import {
  buildUnifiedChat, deriveAgentProgress, AGENT_PROGRESS_ID, AGENT_PROGRESS_MESSAGE,
  type AgentProgressStatus, type StudioRun,
} from "@/lib/studio/chatModel";
import type { StudioInteractionEvent } from "@/lib/studio/streamEvents";

function tool(name: string, at = 1): StudioInteractionEvent {
  return { type: "agent_interaction", agent_name: "Coder", message_type: "tool_call", tool_name: name, tool_call_id: `${name}-${at}`, timestamp: at };
}
function plannerThought(at = 1): StudioInteractionEvent {
  return { type: "agent_interaction", agent_name: "Planner", message_type: "thought", content: "plano", timestamp: at };
}
function run(events: StudioInteractionEvent[], over: Partial<StudioRun> = {}): StudioRun {
  return { id: 1, startedAt: 1, status: "running", events, ...over };
}

describe("Progresso do agente · UM status humanizado (PT-BR), sem ferramentas", () => {
  it("começa em ANALYZING e avança conforme as operações REAIS", () => {
    expect(deriveAgentProgress(run([]), true).status).toBe("ANALYZING");
    expect(deriveAgentProgress(run([tool("list_files"), tool("read_file")]), true).status).toBe("ANALYZING");
    // Planner e design_skills → direção visual
    expect(deriveAgentProgress(run([plannerThought()]), true).status).toBe("DESIGNING");
    expect(deriveAgentProgress(run([tool("design_skills")]), true).status).toBe("DESIGNING");
    // escritas → construir → integrar → refinar
    expect(deriveAgentProgress(run([tool("write_file", 1)]), true).status).toBe("BUILDING");
    expect(deriveAgentProgress(run([tool("write_file", 1), tool("edit_file", 2)]), true).status).toBe("INTEGRATING");
    expect(deriveAgentProgress(run([tool("write_file", 1), tool("edit_file", 2), tool("create_file", 3), tool("edit_file", 4)]), true).status).toBe("REFINING");
    // build/teste depois de escrever → validar
    expect(deriveAgentProgress(run([tool("write_file", 1), tool("run_command", 2)]), true).status).toBe("VALIDATING");
  });

  it("não valida antes de escrever (install inicial não vira 'validando')", () => {
    expect(deriveAgentProgress(run([tool("run_command")]), true).status).toBe("ANALYZING");
  });

  it("estados finais: concluído / erro / cancelado", () => {
    expect(deriveAgentProgress(run([tool("write_file")], { status: "done" }), false).status).toBe("COMPLETED");
    expect(deriveAgentProgress(run([], { status: "error" }), false).status).toBe("ERROR");
    expect(deriveAgentProgress(run([], { status: "cancelled" }), false).status).toBe("CANCELLED");
  });

  it("todas as mensagens são PT-BR e não citam ferramentas", () => {
    for (const status of Object.keys(AGENT_PROGRESS_MESSAGE) as AgentProgressStatus[]) {
      const msg = AGENT_PROGRESS_MESSAGE[status];
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/read_file|list_files|write_file|edit_file|design_skills|run_command|tool/i);
    }
    expect(AGENT_PROGRESS_MESSAGE.COMPLETED).toMatch(/Site concluído/i);
    expect(AGENT_PROGRESS_MESSAGE.DESIGNING).toMatch(/direção visual/i);
  });

  it("o item de progresso é ÚNICO (mesmo id) e é atualizado, não duplicado", () => {
    const early = buildUnifiedChat({
      messages: [{ role: "user", text: "crie o site" }],
      runs: [run([tool("design_skills")])],
    });
    const late = buildUnifiedChat({
      messages: [{ role: "user", text: "crie o site" }],
      runs: [run([tool("design_skills"), tool("write_file", 1), tool("edit_file", 2), tool("run_command", 3)])],
    });
    const earlyActivity = early.find((i) => i.kind === "activity");
    const lateActivity = late.find((i) => i.kind === "activity");
    expect(earlyActivity?.kind).toBe("activity");
    expect(lateActivity?.kind).toBe("activity");
    if (earlyActivity?.kind === "activity" && lateActivity?.kind === "activity") {
      expect(earlyActivity.progress.id).toBe(AGENT_PROGRESS_ID);
      expect(lateActivity.progress.id).toBe(AGENT_PROGRESS_ID);
      expect(earlyActivity.progress.status).toBe("DESIGNING");
      expect(lateActivity.progress.status).toBe("VALIDATING"); // mesmo item, evoluído
    }
  });

  it("não expõe nomes de ferramentas no modelo do chat (apenas itens internos da run)", () => {
    const items = buildUnifiedChat({
      messages: [{ role: "user", text: "x" }],
      runs: [run([tool("read_file"), tool("list_files")])],
    });
    const activity = items.find((i) => i.kind === "activity");
    if (activity?.kind === "activity") {
      // O progresso exibido NÃO menciona ferramentas…
      expect(activity.progress.message).not.toMatch(/read_file|list_files/);
    }
  });
});
