import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";

// Simula a Web Speech API (transcrição) para exercitar o fluxo REAL do componente.
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((ev: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  started = false;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { /* onend é assíncrono no navegador; nos testes disparamos manualmente */ }
  final(text: string) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: true }] }); }
  interim(text: string) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: false }] }); }
  end() { this.onend?.(); }
  error(code: string) { this.onerror?.({ error: code }); }
}

const lastRec = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];
const micButton = () => screen.getByTitle("Gravar com voz");
const sendButton = () => screen.getByTitle("Enviar gravação");
const cancelButton = () => screen.getByTitle("Cancelar gravação");

function renderPanel(onSend: (t: string) => void = () => {}) {
  return render(
    <UnifiedChatPanel items={[]} running={false} phase="idle" onSend={onSend} />,
  );
}

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition;
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(async () => stream) },
    configurable: true,
  });
});
afterEach(() => { cleanup(); });

describe("Gravador de voz do Studio (estilo WhatsApp) — transcreve e envia como texto", () => {
  it("1) campo vazio mostra o mic; ao gravar, aparece a barra (timer) e o texto some", () => {
    renderPanel();
    expect(micButton()).toBeTruthy();
    fireEvent.click(micButton());
    expect(sendButton()).toBeTruthy();
    expect(cancelButton()).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByLabelText("tempo de gravação").textContent).toBe("0:00");
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("2) falar → enviar → entrega UMA transcrição e volta ao campo de texto", () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    fireEvent.click(micButton());
    act(() => lastRec().final("Crie um site para a clínica"));
    expect(onSend).not.toHaveBeenCalled(); // nada é enviado durante a gravação
    fireEvent.click(sendButton());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Crie um site para a clínica");
    expect(screen.getByRole("textbox")).toBeTruthy(); // barra fechou
  });

  it("3) interim NÃO é usado; enviar sem transcrição final → avisa e não envia", () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    fireEvent.click(micButton());
    act(() => lastRec().interim("texto provisório"));
    fireEvent.click(sendButton());
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/Não consegui transcrever/i)).toBeTruthy();
  });

  it("4) cancelar (lixeira) descarta: nada é enviado e volta ao campo", () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    fireEvent.click(micButton());
    act(() => lastRec().final("não deve ser enviado"));
    fireEvent.click(cancelButton());
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("5) pausa longa (onend automático) reinicia e as partes Somam na ordem", () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    fireEvent.click(micButton());
    act(() => lastRec().final("Primeira parte"));
    act(() => lastRec().end()); // navegador encerrou por silêncio → reinicia
    expect(FakeRecognition.instances.length).toBeGreaterThanOrEqual(2);
    act(() => lastRec().final("Segunda parte"));
    fireEvent.click(sendButton());
    expect(onSend).toHaveBeenCalledWith("Primeira parte Segunda parte");
  });

  it("6) microfone negado → avisa e não grava (sem enviar nada)", () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    fireEvent.click(micButton());
    act(() => lastRec().final("descartado"));
    act(() => lastRec().error("not-allowed"));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/Permita o acesso ao microfone/i)).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("7) navegador sem suporte a transcrição → avisa em vez de falhar", () => {
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = undefined;
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
    renderPanel();
    fireEvent.click(micButton());
    expect(screen.getByText(/não é suportado neste navegador/i)).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("8) duas gravações seguidas funcionam (regressão) e sessão antiga não interfere", () => {
    const onSend = vi.fn();
    renderPanel(onSend);
    fireEvent.click(micButton());
    act(() => lastRec().final("Um"));
    fireEvent.click(sendButton());
    expect(onSend).toHaveBeenLastCalledWith("Um");
    const old = FakeRecognition.instances[0];
    act(() => old.end()); // evento tardio da sessão antiga
    fireEvent.click(micButton());
    expect(lastRec()).not.toBe(old);
    act(() => lastRec().final("Dois"));
    fireEvent.click(sendButton());
    expect(onSend).toHaveBeenLastCalledWith("Dois");
    expect(onSend).toHaveBeenCalledTimes(2);
  });
});
