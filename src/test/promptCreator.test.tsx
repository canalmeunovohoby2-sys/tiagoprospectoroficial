import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PromptCreator } from "@/components/app/PromptCreator";

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText("Ex.: Studio Aurora"), { target: { value: "Clínica Sorriso" } });
  fireEvent.change(screen.getByPlaceholderText("Ex.: clínica odontológica"), { target: { value: "clínica odontológica" } });
}
const outputBox = () => screen.getByPlaceholderText(/O prompt premium aparecerá aqui/i) as HTMLTextAreaElement;

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => cleanup());

describe("PromptCreator (Studio) — gerar, copiar, editar, regenerar, limpar, usar no gerador", () => {
  it("gera o prompt premium e mostra o conteúdo", async () => {
    render(<PromptCreator />);
    fillRequired();
    fireEvent.click(screen.getByText(/GERAR PROMPT PREMIUM/i));
    await waitFor(() => expect(outputBox().value).toContain("BRIEFING PREMIUM"));
    expect(outputBox().value).toContain("Clínica Sorriso");
  });

  it("COPIAR PROMPT copia o texto gerado", async () => {
    render(<PromptCreator />);
    fillRequired();
    fireEvent.click(screen.getByText(/GERAR PROMPT PREMIUM/i));
    await waitFor(() => expect(outputBox().value.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText(/COPIAR PROMPT/i));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(outputBox().value));
  });

  it("permite EDIÇÃO manual do prompt", async () => {
    render(<PromptCreator />);
    fillRequired();
    fireEvent.click(screen.getByText(/GERAR PROMPT PREMIUM/i));
    await waitFor(() => expect(outputBox().value.length).toBeGreaterThan(0));
    fireEvent.change(outputBox(), { target: { value: outputBox().value + "\n\nEXTRA: estética editorial." } });
    expect(outputBox().value).toContain("EXTRA: estética editorial.");
  });

  it("REGENERAR muda a direção criativa (variante determinística)", async () => {
    render(<PromptCreator />);
    fillRequired();
    fireEvent.click(screen.getByText(/GERAR PROMPT PREMIUM/i));
    await waitFor(() => expect(outputBox().value.length).toBeGreaterThan(0));
    const v1 = outputBox().value;
    fireEvent.click(screen.getByText(/^Regenerar$/i));
    const v2 = outputBox().value;
    fireEvent.click(screen.getByText(/^Regenerar$/i));
    const v3 = outputBox().value;
    expect(v2 !== v1 || v3 !== v1).toBe(true);
  });

  it("LIMPAR zera o formulário e o resultado", async () => {
    render(<PromptCreator />);
    fillRequired();
    fireEvent.click(screen.getByText(/GERAR PROMPT PREMIUM/i));
    await waitFor(() => expect(outputBox().value.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText(/^Limpar$/i));
    expect(outputBox().value).toBe("");
    expect((screen.getByPlaceholderText("Ex.: Studio Aurora") as HTMLInputElement).value).toBe("");
  });

  it("USAR NO GERADOR DE SITE entrega o prompt ao fluxo existente", async () => {
    const onUse = vi.fn();
    render(<PromptCreator onUseInGenerator={onUse} />);
    fillRequired();
    fireEvent.click(screen.getByText(/GERAR PROMPT PREMIUM/i));
    await waitFor(() => expect(outputBox().value.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Usar no gerador de site/i }));
    expect(onUse).toHaveBeenCalledWith(outputBox().value.trim());
  });

  it("exige nome e segmento (botão desabilitado sem obrigatórios)", () => {
    render(<PromptCreator />);
    const btn = screen.getByText(/GERAR PROMPT PREMIUM/i).closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
