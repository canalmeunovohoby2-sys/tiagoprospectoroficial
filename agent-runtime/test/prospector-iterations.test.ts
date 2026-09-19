import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProspectorSiteAgent, reportedIterations } from "../src/prospector-site-agent";

// FASE 1 — requisito E: `iterations` deixa de ser 0 fixo e passa a refletir os
// turnos REAIS do SDK. Usa o seam `agentFactory` (agente falso que emite eventos
// reais do protocolo) — o comportamento de produção não muda.

describe("FASE 1 · iterations real", () => {
  let root = "";
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "prospector-iter-"));
    writeFileSync(join(root, "package.json"), "{}", "utf8");
    writeFileSync(join(root, "index.html"), "<h1>Antes</h1>", "utf8");
    writeFileSync(join(root, "src-app.tsx"), "export default () => null;", "utf8");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reporta o número real de turnos e conta edições reais", async () => {
    const listeners = new Set<(e: unknown) => void>();
    const emit = (e: unknown) => { for (const cb of listeners) cb(e); };
    const turns = 3;

    const fakeAgent = {
      abort: () => {},
      subscribe: (cb: (e: unknown) => void) => { listeners.add(cb); return () => listeners.delete(cb); },
      continue: async () => ({ messages: [] }),
      run: async () => {
        for (let i = 0; i < turns; i += 1) {
          emit({ type: "turn-started", iteration: i });
          emit({ type: "assistant-message", iteration: i, message: { content: [{ type: "text", text: `Turno ${i}` }] } });
          emit({ type: "turn-finished", iteration: i });
        }
        emit({ type: "tool-started", toolName: "write_file", toolCall: { toolName: "write_file", toolCallId: "c1", input: { path: "index.html" } } });
        writeFileSync(join(root, "index.html"), "<h1>Depois</h1>", "utf8");
        emit({ type: "tool-finished", toolName: "write_file", toolCall: { toolName: "write_file", toolCallId: "c1", input: { path: "index.html" } }, message: { content: [{ type: "text", text: '{"ok":true}' }] } });
        return { messages: [{ role: "assistant", content: "Alterei o título." }] };
      },
    };

    const agent = new ProspectorSiteAgent({
      workspaceRoot: root,
      business: {},
      mode: "edit",
      enableBrowser: false,
      agentFactory: () => fakeAgent,
    });

    const outcome = await agent.runTask("troque o título do hero");
    expect(outcome.iterations).toBe(turns);
    expect(outcome.iterations).toBeGreaterThan(0);
    expect(outcome.touched).toContain("index.html");
    expect(readFileSync(join(root, "index.html"), "utf8")).toContain("Depois");
    expect(outcome.events.length).toBeGreaterThan(0);
    expect(outcome.reply.length).toBeGreaterThan(0);
  });

  it("reportedIterations nunca mente para valores ausentes/negativos", () => {
    expect(reportedIterations(undefined)).toBe(0);
    expect(reportedIterations(null)).toBe(0);
    expect(reportedIterations({ totalMs: 1, turnCount: 0, toolMs: 0, modelMs: 0, tools: {} })).toBe(0);
    expect(reportedIterations({ totalMs: 1, turnCount: 5, toolMs: 0, modelMs: 0, tools: {} })).toBe(5);
  });
});
