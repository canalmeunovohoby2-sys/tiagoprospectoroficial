import { beforeAll, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";
import { StudioChatPanel } from "@/components/sites/studio/StudioChatPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UnifiedChatItem } from "@/lib/studio/chatModel";
import type { UseStudioChatResult } from "@/hooks/studio/useStudioChat";

beforeAll(() => {
  // jsdom não implementa Element.scrollTo (usado pelo SiteChat legado).
  if (!Element.prototype.scrollTo) {
    (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  }
});

const items: UnifiedChatItem[] = [
  { kind: "user", id: "u1", text: "Adicione uma seção de depoimentos" },
  {
    kind: "activity",
    id: "run-1",
    status: "running",
    startedAt: 1,
    items: [
      { kind: "thought", id: "t1", agent: "Coder", content: "Vou analisar a estrutura.", at: 1 },
      { kind: "tool", id: "c1", agent: "Coder", name: "read_file", args: { path: "src/App.tsx" }, response: "ok", status: "done", at: 2 },
    ],
  },
  { kind: "assistant", id: "a1", text: "## Resumo\nA seção foi adicionada com **sucesso**." },
  { kind: "commit", id: "c1", message: "Adiciona seção de depoimentos", hash: "abc1234" },
];

function renderPanel(over: Partial<Parameters<typeof UnifiedChatPanel>[0]> = {}) {
  return render(
    <UnifiedChatPanel
      items={items}
      running={false}
      phase="complete"
      onSend={vi.fn()}
      {...over}
    />,
  );
}

describe("C2 · UnifiedChatPanel", () => {
  it("mostra conversa, activity e commit no mesmo fluxo", () => {
    renderPanel();
    expect(screen.getByText("Adicione uma seção de depoimentos")).toBeInTheDocument();
    expect(screen.getByText("Agent Activity")).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText(/Checkpoint: Adiciona seção de depoimentos/)).toBeInTheDocument();
  });

  it("renderiza Markdown do agente (título e negrito)", () => {
    renderPanel();
    expect(screen.getByRole("heading", { level: 2, name: "Resumo" })).toBeInTheDocument();
    expect(screen.getByText("sucesso").tagName).toBe("STRONG");
  });

  it("Enter envia e limpa; Shift+Enter quebra linha", () => {
    const onSend = vi.fn();
    renderPanel({ onSend });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "troque o título" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("troque o título");
    expect(box.value).toBe("");
  });

  it("não envia duplicado nem vazio", () => {
    const onSend = vi.fn();
    renderPanel({ onSend });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(box, { key: "Enter" }); // vazio
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "x" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter" }); // já limpo → não reenvia
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("estado running: input desabilitado e cancelar funciona", () => {
    const onCancel = vi.fn();
    renderPanel({ running: true, phase: "tool_running", currentAgent: "Coder", currentTool: "write_file", onCancel });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText(/Coder → write_file/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Cancelar execução"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("mostra erro quando houver", () => {
    renderPanel({ running: false, phase: "error", error: "Falha do modelo" });
    expect(screen.getByText("Falha do modelo")).toBeInTheDocument();
  });

  it("C6: oferece retry em erro/cancelado sem duplicar envio", () => {
    const onRetry = vi.fn();
    renderPanel({ running: false, phase: "error", error: "Falha do modelo", onRetry });
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("modo Visual Edits chama o toggle", () => {
    const onToggleVisual = vi.fn();
    renderPanel({ onToggleVisual, visualMode: false });
    fireEvent.click(screen.getByTitle("Edição visual"));
    expect(onToggleVisual).toHaveBeenCalled();
  });
});

const streamStub: UseStudioChatResult = {
  runs: [],
  phase: "complete",
  running: false,
  error: null,
  cancelled: false,
  currentAgent: null,
  currentTool: null,
  commits: [],
  events: [],
  items: [],
  route: null,
  plan: null,
  begin: () => {},
  finish: () => {},
  reset: () => {},
  handleEvent: () => {},
  appendCommit: () => {},
};

function chatProps() {
  return {
    messages: [{ role: "user" as const, text: "oi" }, { role: "assistant" as const, text: "olá" }],
    running: false,
    error: null,
    canUndo: false,
    dirty: false,
    onApply: vi.fn(),
    onRevert: vi.fn(),
    onQuickStrategy: vi.fn(),
    onNewConversation: vi.fn(),
  };
}

describe("C2 · StudioChatPanel (dispatch por project_kind)", () => {
  it("react usa o ChatPanel unificado (sem timeline paralela)", () => {
    render(
      <TooltipProvider>
        <StudioChatPanel {...chatProps()} projectKind="react" stream={streamStub} />
      </TooltipProvider>,
    );
    expect(screen.getByText("Construtor IA")).toBeInTheDocument();
    expect(screen.getByText("oi")).toBeInTheDocument();
    expect(screen.getByText("olá")).toBeInTheDocument();
    expect(screen.queryByText("Agent Activity")).toBeNull(); // run vazia não gera bloco
  });

  it("static continua no SiteChat legado", () => {
    render(
      <TooltipProvider>
        <StudioChatPanel {...chatProps()} projectKind="static" stream={streamStub} />
      </TooltipProvider>,
    );
    expect(screen.getByText("Construtor com IA")).toBeInTheDocument();
    expect(screen.queryByText("Construtor IA")).toBeNull();
  });
});

