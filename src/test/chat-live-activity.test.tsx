import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";
import type { UnifiedChatItem } from "@/lib/studio/chatModel";

// O card "Executando agora" (acima do campo de digitar) foi REMOVIDO: o trabalho
// real do agente aparece no FLUXO do chat (bloco de progresso), sem duplicação.

const activityItem = (message: string): UnifiedChatItem => ({
  kind: "activity",
  id: "a1",
  status: "running",
  startedAt: 1,
  items: [],
  progress: { id: "agent-progress", status: "BUILDING", message },
});

function renderPanel(over: Partial<React.ComponentProps<typeof UnifiedChatPanel>> = {}) {
  return render(<UnifiedChatPanel items={[]} running={false} phase="idle" onSend={() => {}} {...over} />);
}

afterEach(() => cleanup());

describe("Chat do Studio · atividade REAL no fluxo (sem o card)", () => {
  it("NÃO existe mais o card 'Executando agora' acima do campo de digitar", () => {
    renderPanel({
      running: true,
      phase: "coding",
      liveActivity: [{ phase: "editing", detail: "`src/App.tsx`" }],
    });
    expect(screen.queryByText("Executando agora")).toBeNull();
  });

  it("a ação REAL do momento aparece no fluxo do chat", () => {
    renderPanel({ running: true, phase: "coding", items: [activityItem("Alterando src/components/Hero.tsx")] });
    expect(screen.getByText(/Alterando src\/components\/Hero\.tsx/)).toBeTruthy();
    cleanup();
    renderPanel({ running: true, phase: "coding", items: [activityItem("Verificando o site no navegador (desktop/tablet/mobile)")] });
    expect(screen.getByText(/Verificando o site no navegador/)).toBeTruthy();
  });

  it("o resultado real da operação aparece no fluxo", () => {
    renderPanel({ running: true, phase: "coding", items: [activityItem("src/App.tsx atualizado.")] });
    expect(screen.getByText(/src\/App\.tsx atualizado\./)).toBeTruthy();
  });

  it("não expõe nome técnico de ferramenta", () => {
    renderPanel({
      running: true,
      phase: "coding",
      items: [activityItem("Alterando src/App.tsx")],
      liveActivity: [{ phase: "editing", detail: "write_file src/App.tsx" }],
    });
    expect(/write_file/.test(document.body.textContent ?? "")).toBe(false);
  });
});
