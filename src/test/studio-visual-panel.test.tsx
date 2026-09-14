import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StudioVisualEditorPanel } from "@/components/sites/studio/StudioVisualEditorPanel";
import type { StudioSelection } from "@/lib/studio/types";

function selection(over: Partial<StudioSelection> = {}): StudioSelection {
  return {
    selector: "h1",
    tagName: "h1",
    text: "Clínica Bella",
    classes: ["hero-title"],
    source: "cliente/index.html:8",
    sourceLocation: { status: "resolved", file: "cliente/index.html", line: 8, confidence: "exact" },
    ...over,
  };
}

describe("Fase 5 · StudioVisualEditorPanel funcional", () => {
  it("aplica texto enviando plano + target (origem resolvida)", () => {
    const onApplyVisual = vi.fn();
    render(
      <StudioVisualEditorPanel
        open
        selection={selection()}
        onClose={vi.fn()}
        onApplyVisual={onApplyVisual}
        onAskAgent={vi.fn()}
        device="desktop"
      />,
    );
    const textarea = screen.getByDisplayValue("Clínica Bella");
    fireEvent.change(textarea, { target: { value: "Bella Odonto" } });
    fireEvent.click(screen.getByText("Aplicar texto"));
    expect(onApplyVisual).toHaveBeenCalledTimes(1);
    const [plan, target] = onApplyVisual.mock.calls[0];
    expect(plan).toEqual({ kind: "text", text: "Bella Odonto" });
    expect(target.sourceLocation).toMatchObject({ status: "resolved", file: "cliente/index.html", line: 8 });
  });

  it("aplica estilos enviando apenas propriedades preenchidas", () => {
    const onApplyVisual = vi.fn();
    render(
      <StudioVisualEditorPanel
        open
        selection={selection()}
        onClose={vi.fn()}
        onApplyVisual={onApplyVisual}
        onAskAgent={vi.fn()}
      />,
    );
    // O primeiro campo textual de estilo é "Fonte (px)".
    const sizeInput = screen.getByPlaceholderText("18px");
    fireEvent.change(sizeInput, { target: { value: "42px" } });
    fireEvent.click(screen.getByText("Aplicar estilos"));
    const [plan] = onApplyVisual.mock.calls[0];
    expect(plan.kind).toBe("style");
    expect(plan.changes).toEqual([{ property: "font-size", value: "42px" }]);
  });

  it("origem não resolvida esconde a edição direta e mantém 'Pedir ao agente'", () => {
    const onAskAgent = vi.fn();
    render(
      <StudioVisualEditorPanel
        open
        selection={selection({ sourceLocation: { status: "unresolved", reason: "sem pfsrc" } })}
        onClose={vi.fn()}
        onApplyVisual={vi.fn()}
        onAskAgent={onAskAgent}
      />,
    );
    expect(screen.queryByText("Aplicar estilos")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Deixe este bloco mais sofisticado…"), { target: { value: "deixe azul" } });
    fireEvent.click(screen.getByText("Enviar ao agente"));
    expect(onAskAgent).toHaveBeenCalledWith("deixe azul");
  });

  it("mostra a evidência/resultado da edição", () => {
    render(
      <StudioVisualEditorPanel
        open
        selection={selection()}
        onClose={vi.fn()}
        onApplyVisual={vi.fn()}
        onAskAgent={vi.fn()}
        editOutcome={{ ok: true, message: "texto atualizado em cliente/index.html · modo: html-text." }}
      />,
    );
    expect(screen.getByText(/texto atualizado em cliente\/index\.html/)).toBeInTheDocument();
  });
});
