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

describe("Chat do Studio · card de atividade (emoji + ação atual) acima do campo", () => {
  it("mostra o CARD 'Executando agora' com emoji da ação e o que está fazendo", () => {
    renderPanel({ running: true, phase: "coding", liveActivity: [{ phase: "editing", detail: "`src/App.tsx`" }] });
    expect(card()).toBeTruthy();
    expect(screen.getByText(/✏️ Modificando `src\/App\.tsx`/)).toBeTruthy();
  });

  it("cobre as ações reais (analisar, abrir, pesquisar, testar, finalizar)", () => {
    const cases: Array<[string, string, RegExp]> = [
      ["analyzing", "", /🔎 Analisando o projeto/],
      ["reading", "`index.html`", /📂 Abrindo `index\.html`/],
      ["researching", "", /🌐 Pesquisando na web/],
      ["testing", "", /🧪 Testando a alteração/],
      ["done", "", /✅ Finalizando/],
    ];
    for (const [phase, detail, re] of cases) {
      renderPanel({ running: true, phase: "tool_running", liveActivity: [{ phase, detail }] });
      expect(screen.getByText(re), `${phase}:${detail}`).toBeTruthy();
      cleanup();
    }
  });

  it("o card desaparece quando o agente termina", () => {
    renderPanel({ running: true, phase: "coding", liveActivity: [{ phase: "editing", detail: "`x.tsx`" }] });
    expect(card()).toBeTruthy();
    cleanup();
    renderPanel({ running: false, phase: "complete" });
    expect(card()).toBeNull();
  });

  it("NÃO mostra nomes de ferramentas no card", () => {
    renderPanel({ running: true, phase: "tool_running", liveActivity: [{ phase: "editing", detail: "write_file src/App.tsx" }] });
    expect(/"write_file"/.test(document.body.textContent ?? "")).toBe(false);
  });
});
