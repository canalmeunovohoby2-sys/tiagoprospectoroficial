import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { SiteChat } from "@/components/sites/editor/SiteChat";

// Simula a Web Speech API para exercitar o fluxo REAL do componente.
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
  stop() { /* onend real é assíncrono; aqui disparamos manualmente */ }
  final(text: string) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: true }] }); }
  interim(text: string) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: false }] }); }
  end() { this.onend?.(); }
  error(code: string) { this.onerror?.({ error: code }); }
}

const lastRec = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];
const mic = () => screen.getByTitle(/Gravar com voz|Parar gravação/);
const box = () => screen.getByPlaceholderText(/Deixa o hero/i) as HTMLTextAreaElement;

function renderChat() {
  return render(
    <SiteChat messages={[]} running={false} error={null} canUndo={false} dirty={false} onApply={() => {}} onRevert={() => {}} />,
  );
}

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition;
  // jsdom não implementa scrollTo
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});
afterEach(() => { cleanup(); });

describe("Gravador de voz do chat — só transcreve ao PARAR e UMA vez (silêncio não finaliza)", () => {
  it("1) falar → parar → uma transcrição; NADA aparece durante a gravação", () => {
    renderChat();
    fireEvent.click(mic());
    expect(FakeRecognition.instances).toHaveLength(1);
    act(() => lastRec().final("Bom dia"));
    expect(box().value).toBe("");
    fireEvent.click(mic()); // parar
    expect(box().value).toBe("Bom dia");
  });

  it("2) pausa longa (onend automático) NÃO finaliza nem insere; continua depois", () => {
    renderChat();
    fireEvent.click(mic());
    act(() => lastRec().final("Primeira parte"));
    expect(box().value).toBe("");
    act(() => lastRec().end()); // navegador encerrou por silêncio → reinicia
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(box().value).toBe("");
    act(() => lastRec().final("Segunda parte"));
    expect(box().value).toBe("");
    fireEvent.click(mic());
    expect(box().value).toBe("Primeira parte Segunda parte");
  });

  it("3) resultado provisório (interim) NÃO aparece no campo durante a gravação", () => {
    renderChat();
    fireEvent.click(mic());
    act(() => lastRec().interim("texto provisório"));
    expect(box().value).toBe("");
  });

  it("4) erro real (not-allowed) descarta: nenhum texto é inserido", () => {
    renderChat();
    fireEvent.click(mic());
    act(() => lastRec().final("será descartado"));
    act(() => lastRec().error("not-allowed"));
    expect(box().value).toBe("");
  });

  it("5) stop duplicado (onend tardio) NÃO gera duas transcrições", () => {
    renderChat();
    fireEvent.click(mic());
    act(() => lastRec().final("Única"));
    fireEvent.click(mic()); // parar
    expect(box().value).toBe("Única");
    act(() => lastRec().end()); // onend tardio da mesma sessão
    expect(box().value).toBe("Única");
  });

  it("6) nova gravação é independente e soma na ordem (sem misturar)", () => {
    renderChat();
    fireEvent.click(mic());
    act(() => lastRec().final("Um"));
    fireEvent.click(mic());
    expect(box().value).toBe("Um");
    fireEvent.click(mic()); // nova gravação
    act(() => lastRec().final("Dois"));
    fireEvent.click(mic());
    expect(box().value).toBe("Um Dois");
  });

  it("7) erro temporário (no-speech) continua gravando e não insere parcial", () => {
    renderChat();
    fireEvent.click(mic());
    act(() => lastRec().final("A"));
    act(() => lastRec().error("no-speech")); // reinicia a sessão
    expect(FakeRecognition.instances.length).toBeGreaterThanOrEqual(2);
    expect(box().value).toBe("");
    act(() => lastRec().final("B"));
    fireEvent.click(mic());
    expect(box().value).toBe("A B");
  });

  it("8) onend automático com gravação ativa reinicia (não transforma em finalização)", () => {
    renderChat();
    fireEvent.click(mic());
    act(() => lastRec().end());
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(FakeRecognition.instances[0].started).toBe(true);
    expect(box().value).toBe("");
  });
});
