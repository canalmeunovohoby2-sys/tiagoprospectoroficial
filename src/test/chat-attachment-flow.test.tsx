import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";

function renderPanel(onSend: (...args: unknown[]) => void = () => {}) {
  return render(<UnifiedChatPanel items={[]} running={false} phase="idle" onSend={onSend as never} />);
}

const img = (name: string) => new File(["fake-bytes"], name, { type: "image/jpeg" });

function pickFiles(names: string[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: names.map(img) } });
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { cleanup(); });

describe("Chat do Studio · anexo de imagem NÃO envia mensagem (só no Enviar)", () => {
  it("1) selecionar imagem NÃO chama o Agent Runtime (onSend)", async () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    pickFiles(["imagem.jpg"]);
    await waitFor(() => expect(screen.getByText("imagem.jpg")).toBeInTheDocument());
    expect(onSend).not.toHaveBeenCalled();
  });

  it("2) selecionar cria apenas um ANEXO PENDENTE (com prévia)", async () => {
    renderPanel();
    pickFiles(["imagem.jpg"]);
    await waitFor(() => expect(screen.getByLabelText("anexos pendentes")).toBeInTheDocument());
    expect(screen.getByText("imagem.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("imagem.jpg")).toBeInTheDocument();
  });

  it("3) digitar depois da imagem funciona e Enviar manda texto + imagem JUNTOS", async () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    pickFiles(["imagem.jpg"]);
    await waitFor(() => expect(screen.getByText("imagem.jpg")).toBeInTheDocument());
    expect(onSend).not.toHaveBeenCalled();

    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "use essa imagem no hero" } });
    fireEvent.click(screen.getByTitle("Enviar"));

    expect(onSend).toHaveBeenCalledTimes(1);
    const [text, atts] = onSend.mock.calls[0] as [string, Array<{ dataUrl: string; label: string }>];
    expect(text).toBe("use essa imagem no hero");
    expect(atts).toHaveLength(1);
    expect(atts[0].label).toBe("imagem.jpg");
    expect(atts[0].dataUrl.startsWith("data:image")).toBe(true);
  });

  it("4) remover anexo antes de enviar: NÃO envia nada e não sobra pendente", async () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    pickFiles(["imagem.jpg"]);
    await waitFor(() => expect(screen.getByText("imagem.jpg")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Remover imagem.jpg"));
    await waitFor(() => expect(screen.queryByText("imagem.jpg")).toBeNull());
    expect(onSend).not.toHaveBeenCalled();
  });

  it("5) várias imagens pendentes somam e vão JUNTAS no Enviar", async () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    pickFiles(["a.jpg"]);
    await waitFor(() => expect(screen.getByText("a.jpg")).toBeInTheDocument());
    pickFiles(["b.png"]);
    await waitFor(() => expect(screen.getByText("b.png")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "três no total" } });
    fireEvent.click(screen.getByTitle("Enviar"));
    const [, atts] = onSend.mock.calls[0] as [string, Array<{ label: string }>];
    expect(atts.map((a) => a.label)).toEqual(["a.jpg", "b.png"]);
    expect(onSend).not.toHaveBeenCalledTimes(2);
  });

  it("6) texto sem imagem continua funcionando", () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "só texto" } });
    fireEvent.click(screen.getByTitle("Enviar"));
    expect(onSend).toHaveBeenCalledWith("só texto");
  });

  it("7) imagem sem texto pode ser enviada manualmente (instrução padrão)", async () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    pickFiles(["so-imagem.jpg"]);
    await waitFor(() => expect(screen.getByText("so-imagem.jpg")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Enviar"));
    const [text, atts] = onSend.mock.calls[0] as [string, Array<{ label: string }>];
    expect(text).toMatch(/Analise esta imagem/i);
    expect(atts[0].label).toBe("so-imagem.jpg");
  });

  it("8) nada é enviado durante a seleção/upload (sem envio automático)", async () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    pickFiles(["x.jpg"]);
    pickFiles(["y.jpg"]);
    await waitFor(() => expect(screen.getByText("y.jpg")).toBeInTheDocument());
    expect(onSend).not.toHaveBeenCalled();
    // envia depois, manualmente
    fireEvent.click(screen.getByTitle("Enviar"));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
