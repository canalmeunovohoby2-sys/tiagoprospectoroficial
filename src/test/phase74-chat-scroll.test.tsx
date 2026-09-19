import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";
import type { UnifiedChatItem } from "@/lib/studio/chatModel";

// FASE 7.4 — a mensagem do usuário não pode "subir" sozinha: o chat só auto-rola
// quando o usuário já está no fim; se ele rolou para ler, a posição fica travada.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const items: UnifiedChatItem[] = [
  { kind: "user", id: "u1", text: "Deixa o header mais premium." },
  {
    kind: "activity",
    id: "a1",
    status: "running",
    startedAt: 1,
    items: [],
    progress: { id: "agent-progress", status: "BUILDING", message: "⏳ Alterando src/App.tsx..." },
  },
];

describe("FASE 7.4 · auto-scroll preso ao fim (stick to bottom)", () => {
  beforeEach(() => {
    // jsdom não implementa scrollIntoView: mockamos para observar as chamadas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Element.prototype as any).scrollIntoView = vi.fn();
  });

  it("rola para o fim quando o usuário já está no fim", () => {
    render(<UnifiedChatPanel items={items} running phase="coding" onSend={vi.fn()} />);
    // o efeito roda após a montagem; chamou porque sticky começa true
    expect((Element.prototype as unknown as { scrollIntoView: ReturnType<typeof vi.fn> }).scrollIntoView).toHaveBeenCalled();
  });

  it("NÃO rola quando o usuário rolou para cima (mensagem para de subir)", () => {
    const view = render(<UnifiedChatPanel items={items} running phase="coding" onSend={vi.fn()} />);
    const scroller = view.container.querySelector(".overflow-y-auto") as HTMLDivElement;
    expect(scroller).toBeTruthy();
    // simula: muito conteúdo e o usuário no TOPO (rolou para ler)
    Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true, writable: true });
    const spy = (Element.prototype as unknown as { scrollIntoView: ReturnType<typeof vi.fn> }).scrollIntoView;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    spy.mockClear();
    // novo item chega NA MESMA instância (não pode puxar a tela)
    view.rerender(<UnifiedChatPanel items={[...items, { kind: "assistant", id: "a2", text: "Ajustando..." }]} running phase="coding" onSend={vi.fn()} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("o componente implementa a guarda de 48px e o handler de scroll", () => {
    const chat = read("src/components/sites/studio/UnifiedChatPanel.tsx");
    expect(chat).toContain("stickToBottomRef");
    expect(chat).toContain("handleScroll");
    expect(chat).toMatch(/clientHeight < 48/);
    expect(chat).toMatch(/ref=\{scrollRef\} onScroll=\{handleScroll\}/);
  });
});
