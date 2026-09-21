import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildUnifiedChat, type UnifiedChatItem } from "@/lib/studio/chatModel";
import { UnifiedChatPanel } from "@/components/sites/studio/UnifiedChatPanel";
import type { StudioRun } from "@/lib/studio/chatModel";
import type { StudioInteractionEvent } from "@/lib/studio/streamEvents";

// FASE UX — CHAT LIMPO: atividade é transitória.
// EXECUTANDO → atividade visível · FINALIZADO + resposta → atividade removida
// FINALIZADO sem resposta → atividade preservada (fallback seguro).

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const run = (status: StudioRun["status"], withTools = true): StudioRun => ({
  id: 1,
  status,
  startedAt: 1,
  events: withTools
    ? [
        { type: "agent_interaction", agent_name: "Coder", message_type: "tool_call", tool_name: "edit_file", tool_arguments: { path: "src/App.tsx" }, timestamp: 2 } as StudioInteractionEvent,
      ]
    : [],
});

const userMsg = { role: "user" as const, text: "deixe o header premium" };
const assistantMsg = { role: "assistant" as const, text: "Pronto: ajustei o header." };

describe("FASE UX · timeline limpa ao terminar", () => {
  it("RUNNING → a atividade aparece normalmente", () => {
    const items = buildUnifiedChat({ messages: [userMsg], runs: [run("running")] });
    expect(items.some((i) => i.kind === "activity")).toBe(true);
  });

  it("FINALIZADO + resposta assistant → atividade REMOVIDA e resposta mantida", () => {
    const items = buildUnifiedChat({ messages: [userMsg, assistantMsg], runs: [run("done")] });
    expect(items.some((i) => i.kind === "activity")).toBe(false);
    const assistant = items.find((i) => i.kind === "assistant");
    expect(assistant && "text" in assistant ? assistant.text : "").toContain("ajustei o header");
    // ordem preservada
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
  });

  it("FINALIZADO sem resposta → atividade PRESERVADA (nunca chat sem resultado)", () => {
    const items = buildUnifiedChat({ messages: [userMsg], runs: [run("done")] });
    expect(items.some((i) => i.kind === "activity")).toBe(true);
  });

  it("run com erro/cancelada segue a mesma regra (some quando há resposta)", () => {
    expect(buildUnifiedChat({ messages: [userMsg, assistantMsg], runs: [run("error")] }).some((i) => i.kind === "activity")).toBe(false);
    expect(buildUnifiedChat({ messages: [userMsg, assistantMsg], runs: [run("cancelled")] }).some((i) => i.kind === "activity")).toBe(false);
  });

  it("render final não mostra resíduos de raciocínio/progresso — só a resposta", () => {
    const items = buildUnifiedChat({ messages: [userMsg, assistantMsg], runs: [run("done")] });
    render(<UnifiedChatPanel items={items} running={false} phase="complete" onSend={vi.fn()} />);
    expect(screen.getByText("Pronto: ajustei o header.")).toBeInTheDocument();
    expect(screen.queryByText(/Raciocínio/)).toBeNull();
    expect(screen.queryByText(/COMPLETED|Site concluído/)).toBeNull();
  });
});

describe("FASE UX · nada de jargão técnico no chat", () => {
  it("a resposta de alteração aplicada usa nota humana curta (sem 'Validação reportou')", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).not.toContain("Validação reportou");
    expect(page).toContain("Alteração aplicada; verificação final pendente.");
    expect(page).toContain("setLiveWork([])");
  });

  it("bloqueio real (nada aplicado) também fala humano — sem detalhe técnico", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).not.toMatch(/Não consegui concluir essa alteração: \$\{reason\}/);
    expect(page).toContain("Não consegui aplicar essa alteração no site");
  });

  it("o erro sem arquivos aplicados traz a CAUSA REAL (fim do 'Diga continue')", () => {
    const guard = read("agent-runtime/src/completion-guard.ts");
    expect(guard).not.toContain('Diga \\"continue\\"');
    expect(guard).toContain("A execução terminou sem aplicar nenhum arquivo");
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain('const real = String(agentRes.errors?.[0] ?? "").trim();');
  });

  it("o card 'Executando agora' é limpo no fim da execução", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    // a ocorrência de LIMPEZA é a do finally (a última do arquivo)
    const idx = page.lastIndexOf("setLiveWork([])");
    expect(idx).toBeGreaterThan(-1);
    const tail = page.slice(idx, idx + 400);
    expect(tail).toMatch(/studioChat\.finish\(\)|setAiRunning\(false\)/);
  });
});
