import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";

function renderPanel(over: Partial<React.ComponentProps<typeof UnifiedChatPanel>> = {}) {
  return render(
    <UnifiedChatPanel items={[]} running={false} phase="idle" onSend={() => {}} {...over} />,
  );
}
const card = () => screen.queryByText("Executando agora");

afterEach(() => cleanup());

describe("Chat do Studio · card de atividade (ação REAL do momento, não texto pronto)", () => {
  it("mostra a FRASE REAL do agente na fase thinking", () => {
    renderPanel({ running: true, phase: "coding", liveActivity: [{ phase: "thinking", detail: "Vou trocar o verde do header" }] });
    expect(screen.getByText(/Vou trocar o verde do header/)).toBeTruthy();
    expect(screen.queryByText(/Analisando a alteração/)).toBeNull();
    cleanup();
    // ação real de busca (não o rótulo genérico)
    renderPanel({ running: true, phase: "coding", liveActivity: [{ phase: "analyzing", detail: "Buscando no código…" }] });
    expect(screen.getByText(/Buscando no código/)).toBeTruthy();
  });

  it("mostra o ARQUIVO real sendo editado/lido/escrito", () => {
    renderPanel({ running: true, phase: "coding", liveActivity: [{ phase: "editing", detail: "`src/components/Hero.tsx`" }] });
    expect(screen.getByText(/Modificando `src\/components\/Hero\.tsx`/)).toBeTruthy();
    cleanup();
    renderPanel({ running: true, phase: "coding", liveActivity: [{ phase: "reading", detail: "`src/App.tsx`" }] });
    expect(screen.getByText(/Abrindo `src\/App\.tsx`/)).toBeTruthy();
  });

  it("cobre verificação no navegador e finalização", () => {
    renderPanel({ running: true, phase: "tool_running", liveActivity: [{ phase: "verifying", detail: "Verificando o site no navegador (desktop/tablet/mobile)…" }] });
    expect(screen.getByText(/Verificando no navegador/)).toBeTruthy();
    cleanup();
    renderPanel({ running: true, phase: "tool_running", liveActivity: [{ phase: "done", detail: "Finalizando…" }] });
    expect(screen.getByText(/Finalizando/)).toBeTruthy();
  });

  it("o card desaparece quando o agente termina e não expõe nome de ferramenta", () => {
    renderPanel({ running: true, phase: "coding", liveActivity: [{ phase: "editing", detail: "`x.tsx`" }] });
    expect(card()).toBeTruthy();
    cleanup();
    renderPanel({ running: false, phase: "complete" });
    expect(card()).toBeNull();
    cleanup();
    renderPanel({ running: true, phase: "tool_running", liveActivity: [{ phase: "editing", detail: "write_file src/App.tsx" }] });
    expect(/write_file/.test(document.body.textContent ?? "")).toBe(false);
  });
});
