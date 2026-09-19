import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";
import {
  deriveAgentProgress,
  lastRealActivityDetail,
  AGENT_PROGRESS_MESSAGE,
  type UnifiedChatItem,
} from "@/lib/studio/chatModel";
import type { StudioStreamEvent } from "@/lib/studio/streamEvents";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function toolCall(name: string, path?: string): StudioStreamEvent {
  return {
    type: "agent_interaction",
    agent_name: "Coder",
    message_type: "tool_call",
    tool_name: name,
    tool_arguments: path ? { path } : {},
    timestamp: Date.now(),
  } as unknown as StudioStreamEvent;
}

// FASE 5 — comunicação/honestidade no chat + layout do Studio (Preview dominante).

describe("FASE 5 · comunicação real (sem atividade fake)", () => {
  it("I/M) sem evento real: mensagem honesta de espera — nunca 'Analisando o projeto'", () => {
    expect(AGENT_PROGRESS_MESSAGE.AWAITING).toMatch(/aguardando/i);
    const progress = deriveAgentProgress({ id: "r1", status: "running", startedAt: 1, events: [] } as never, true);
    expect(progress.message).toBe(AGENT_PROGRESS_MESSAGE.AWAITING);
    expect(progress.message).not.toMatch(/Analisando o projeto/);
  });

  it("J/K) ferramenta + arquivo reais viram a linha operacional", () => {
    const run = { id: "r1", status: "running", startedAt: 1, events: [toolCall("edit_file", "src/App.tsx")] };
    const progress = deriveAgentProgress(run as never, true);
    expect(progress.message).toContain("Alterando src/App.tsx");
    expect(progress.status).toBe("BUILDING");
  });

  it("M) a resposta final exibida é a do agente (sem reescrever)", () => {
    const items: UnifiedChatItem[] = [
      { kind: "user", id: "u1", text: "Deixa o header mais premium." },
      { kind: "assistant", id: "a1", text: "Pronto. Ajustei o header e verifiquei no Preview." },
    ];
    render(<UnifiedChatPanel items={items} running={false} phase="complete" onSend={vi.fn()} />);
    expect(screen.getByText("Pronto. Ajustei o header e verifiquei no Preview.")).toBeInTheDocument();
  });

  it("N) run com erro mostra o estado de erro, nunca 'Site concluído'", () => {
    const items: UnifiedChatItem[] = [
      {
        kind: "activity",
        id: "r1",
        status: "done",
        startedAt: 1,
        items: [],
        progress: { id: "agent-progress", status: "ERROR", message: AGENT_PROGRESS_MESSAGE.ERROR },
      },
    ];
    render(<UnifiedChatPanel items={items} running={false} phase="error" onSend={vi.fn()} />);
    expect(screen.getByText(AGENT_PROGRESS_MESSAGE.ERROR)).toBeInTheDocument();
    expect(screen.queryByText(AGENT_PROGRESS_MESSAGE.COMPLETED)).toBeNull();
  });

  it("U) enquanto trabalha, o chat mostra a atividade real e o input segue disponível", () => {
    const items: UnifiedChatItem[] = [
      {
        kind: "activity",
        id: "r1",
        status: "running",
        startedAt: 1,
        items: [],
        progress: { id: "agent-progress", status: "BUILDING", message: "⏳ Alterando src/App.tsx..." },
      },
    ];
    render(<UnifiedChatPanel items={items} running phase="coding" onSend={vi.fn()} />);
    expect(screen.getByText("⏳ Alterando src/App.tsx...")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("lastRealActivityDetail descreve só o que existiu de verdade", () => {
    expect(lastRealActivityDetail({ id: "r", status: "running", startedAt: 1, events: [] } as never)).toBe("");
    expect(lastRealActivityDetail({ id: "r", status: "running", startedAt: 1, events: [toolCall("browser_reload")] } as never)).toMatch(/Verificando o site/);
  });
});

describe("FASE 5 · layout do Studio (Preview dominante)", () => {
  const shell = read("src/components/sites/studio/StudioShell.tsx");
  const chat = read("src/components/sites/studio/UnifiedChatPanel.tsx");

  it("P) o painel principal (Preview) é maior que o chat (sidebar enxuta 22%)", () => {
    expect(shell).toMatch(/id="studio-chat" order=\{1\} defaultSize=\{22\}/);
    expect(shell).toMatch(/id="studio-main" order=\{2\} defaultSize=\{showChat \? 68 : 100\}/);
    expect(shell).toMatch(/id="studio-chat"[^>]*maxSize=\{30\}/);
  });

  it("V) controles essenciais continuam presentes (device/view/resizable)", () => {
    expect(shell).toContain("StudioPreviewPanel");
    expect(read("src/components/sites/studio/StudioPreviewPanel.tsx")).toContain("StudioDeviceSwitcher");
    expect(shell).toMatch(/ResizableHandle/);
    expect(shell).toMatch(/id="studio-explorer" order=\{1\} defaultSize=\{14\}/);
  });

  it("Q/X) sem overflow horizontal e sem espaçamento exagerado nos painéis", () => {
    expect(shell).toContain("overflow-hidden");
    expect(shell).toMatch(/min-w-0/);
    expect(shell).toContain("p-1.5"); // padding compacto do painel de chat
    expect(chat).not.toMatch(/px-6 py-6/);
    expect(chat).toContain("px-2.5 py-1.5"); // atividade compacta
    expect(chat).toContain("space-y-2.5"); // lista mais densa
  });

  it("W) a área de atividades é compacta e não empurra o Preview (item único, sem lista falsa)", () => {
    expect(chat).toMatch(/AGENT_PROGRESS_ID|item\.progress/);
    // um único item de progresso por run (nunca lista de etapas fixas)
    expect(chat).not.toMatch(/EDIT_STEPS|GENERATION_STEPS|setInterval/);
  });
});
