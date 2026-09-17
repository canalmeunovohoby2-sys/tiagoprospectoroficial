import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";
import type { UnifiedChatItem } from "@/lib/studio/chatModel";
import { reasoningLabel, thoughtsOf, normalizeThought } from "@/lib/studio/reasoning";

function activityItem(status: "running" | "done"): UnifiedChatItem {
  return {
    kind: "activity",
    id: "run-1",
    status,
    startedAt: 1,
    items: [
      { kind: "thought", id: "t1", agent: "Coder", content: "Vou inspecionar o cabeçalho real do site.", at: 1 },
      { kind: "tool", id: "c1", agent: "Coder", name: "read_file", args: { path: "src/App.tsx" }, response: "ok", status: "done", at: 2 },
    ],
    progress: { id: "agent-progress", status: status === "running" ? "ANALYZING" : "COMPLETED", message: status === "running" ? "🔎 Analisando o projeto..." : "✅ Site concluído." },
  };
}

const answer: UnifiedChatItem = { kind: "assistant", id: "a1", text: "Troquei a cor do cabeçalho." };

function renderPanel(items: UnifiedChatItem[], running: boolean) {
  return render(
    <UnifiedChatPanel
      items={items}
      running={running}
      phase={running ? "coding" : "complete"}
      onSend={vi.fn()}
    />,
  );
}

describe("Raciocínio temporário no chat (estilo Kilo Code)", () => {
  it("enquanto trabalha: pensamento VISÍVEL e expandido, com indicador 'Pensando…'", () => {
    renderPanel([{ kind: "user", id: "u1", text: "troque a cor do header" }, activityItem("running")], true);
    expect(screen.getByText("Pensando…")).toBeInTheDocument();
    expect(screen.getByText("Vou inspecionar o cabeçalho real do site.")).toBeInTheDocument();
    // ferramentas internas continuam ocultas
    expect(screen.queryByText("read_file")).toBeNull();
  });

  it("ao concluir: o pensamento SAI e permanece a RESPOSTA final", () => {
    renderPanel([{ kind: "user", id: "u1", text: "troque a cor do header" }, activityItem("done"), answer], false);
    // pensamento recolhido → conteúdo fora do DOM
    expect(screen.queryByText("Vou inspecionar o cabeçalho real do site.")).toBeNull();
    expect(screen.queryByText("Pensando…")).toBeNull();
    // resposta permanece
    expect(screen.getByText("Troquei a cor do cabeçalho.")).toBeInTheDocument();
    // e o raciocínio continua acessível (recolhido) para quem quiser conferir
    expect(screen.getByText("Raciocínio")).toBeInTheDocument();
  });

  it("o raciocínio recolhido pode ser reaberto manualmente", () => {
    renderPanel([{ kind: "user", id: "u1", text: "troque a cor do header" }, activityItem("done"), answer], false);
    fireEvent.click(screen.getByRole("button", { name: /Raciocínio do agente/i }));
    expect(screen.getByText("Vou inspecionar o cabeçalho real do site.")).toBeInTheDocument();
  });

  it("conversa simples ('oi, boa noite') NÃO gera bloco de raciocínio", () => {
    renderPanel([
      { kind: "user", id: "u1", text: "oi, boa noite" },
      { kind: "assistant", id: "a1", text: "Boa noite! Como posso ajudar?" },
    ], false);
    expect(screen.queryByText("Raciocínio")).toBeNull();
    expect(screen.getByText("Boa noite! Como posso ajudar?")).toBeInTheDocument();
  });
});

describe("reasoning helpers (puros)", () => {
  it("thoughtsOf ignora ferramentas e pensamentos vazios", () => {
    const items = activityItem("done").kind === "activity" ? (activityItem("done") as Extract<UnifiedChatItem, { kind: "activity" }>).items : [];
    expect(thoughtsOf([...items, { kind: "thought", id: "t2", agent: "Coder", content: "   ", at: 3 }]).map((t) => t.id)).toEqual(["t1"]);
  });

  it("rótulos refletem o estado do streaming", () => {
    expect(reasoningLabel(true, 2)).toBe("Pensando…");
    expect(reasoningLabel(false, 1)).toBe("Raciocínio");
    expect(reasoningLabel(false, 3)).toBe("Raciocínio · 3 etapas");
  });

  it("normalizeThought limita o tamanho", () => {
    expect(normalizeThought("abc", 2)).toBe("ab…");
  });
});
