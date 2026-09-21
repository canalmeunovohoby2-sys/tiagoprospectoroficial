import { describe, it, expect } from "vitest";
import { createLiveStreamBridge, resultForTool } from "../src/studio/live-events";

// CHAT: o que o usuário vê deve ser DECISÃO (texto real do modelo), EXECUÇÃO
// (tool real) e RESULTADO (tool concluída) — nunca mensagem genérica de espera.

function makeBridge() {
  const lines: Record<string, unknown>[] = [];
  const b = createLiveStreamBridge({
    writeLine: (l) => lines.push(l),
    readFiles: () => ({ "src/App.tsx": "x" }),
    messageText: (m) => String(m ?? ""),
    editTools: new Set(["edit_file", "write_file"]),
  });
  const activities = () => lines.filter((l) => l.type === "activity").map((l) => String(l.detail));
  return { lines, b, activities };
}

describe("CHAT · decisão/execução/resultado reais (sem mensagens genéricas)", () => {
  it("turn-started NÃO emite mensagem genérica de espera (fim do 'Analisando…' repetido)", () => {
    const { lines, b, activities } = makeBridge();
    b.onEvent({ type: "turn-started" });
    b.onEvent({ type: "turn-started" });
    b.onEvent({ type: "turn-started" });
    expect(activities()).toEqual([]);
    expect(JSON.stringify(lines)).not.toContain("Analisando");
  });

  it("EXECUÇÃO vem da tool real, com o arquivo real", () => {
    const { b, activities } = makeBridge();
    b.onEvent({ type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", input: { path: "src/App.tsx" } } });
    expect(activities().join(" | ")).toContain("src/App.tsx");
  });

  it("RESULTADO real por tool concluída; erro vira mensagem HUMANA (nunca sucesso)", () => {
    const ok = makeBridge();
    ok.b.onEvent({ type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", input: { path: "src/App.tsx" } } });
    ok.b.onEvent({ type: "tool-finished", toolName: "edit_file", toolCall: { toolName: "edit_file", input: { path: "src/App.tsx" } }, ok: true });
    expect(ok.activities().some((d) => /atualizado\.$/.test(d))).toBe(true);

    const fail = makeBridge();
    fail.b.onEvent({ type: "tool-finished", toolName: "edit_file", toolCall: { toolName: "edit_file", input: { path: "src/App.tsx" } }, ok: false });
    const errs = fail.activities();
    expect(errs.some((d) => /^Não consegui alterar/.test(d))).toBe(true);
    expect(errs.some((d) => /atualizado\.$/.test(d))).toBe(false);
  });

  it("verificação no navegador e comando têm resultado próprio", () => {
    expect(resultForTool("browser_inspect", "", true)?.detail).toBe("Verificação visual concluída.");
    expect(resultForTool("browser_inspect", "", false)?.detail).toContain("falhou");
    expect(resultForTool("run_command", "", true)?.detail).toBe("Comando concluído.");
    expect(resultForTool("tool_desconhecida", "", true)).toBeNull();
  });
});
