import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";

function renderPanel(over: Partial<React.ComponentProps<typeof UnifiedChatPanel>> = {}) {
  return render(
    <UnifiedChatPanel items={[]} running={false} phase="idle" onSend={() => {}} {...over} />,
  );
}

afterEach(() => cleanup());

describe("Chat do Studio · indicador AO VIVO no rodapé (o que o agente está fazendo)", () => {
  it("enquanto executa mostra emoji da AÇÃO + o que está fazendo (PT-BR)", () => {
    renderPanel({
      running: true,
      phase: "coding",
      liveActivity: [{ phase: "editing", detail: "Editando `src/App.tsx`" }],
    });
    const strip = screen.getByRole("status");
    expect(strip.textContent ?? "").toMatch(/🛠️/);
    expect(strip.textContent ?? "").toMatch(/Editando/);
  });

  it("mostra também ações de análise e leitura com seus emojis", () => {
    renderPanel({ running: true, phase: "preparing", liveActivity: [{ phase: "analyzing", detail: "Analisando projeto" }] });
    expect(screen.getByRole("status").textContent ?? "").toMatch(/🔎/);
    cleanup();
    renderPanel({ running: true, phase: "tool_running", liveActivity: [{ phase: "reading", detail: "Lendo `index.html`" }] });
    expect(screen.getByRole("status").textContent ?? "").toMatch(/📄/);
  });

  it("sem atividade detalhada usa o rótulo da fase (fallback) e some quando termina", () => {
    const { rerender } = renderPanel({ running: true, phase: "coding" });
    expect(screen.getByRole("status").textContent ?? "").toMatch(/Codificando/);
    rerender(<UnifiedChatPanel items={[]} running={false} phase="complete" onSend={() => {}} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("NÃO expõe nomes de ferramentas no indicador", () => {
    renderPanel({
      running: true,
      phase: "tool_running",
      liveActivity: [{ phase: "editing", detail: "write_file src/App.tsx" }],
    });
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).not.toMatch(/write_file|read_file|list_files|design_skills|run_command/);
  });
});
