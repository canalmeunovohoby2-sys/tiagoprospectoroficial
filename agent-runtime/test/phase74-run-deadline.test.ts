import { describe, it, expect } from "vitest";
import { resolveRunTimeoutMs } from "../src/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// FASE 7.4 — fim do "demora infinito": a run React tem deadline e devolve o que
// já aplicou; o abort do agente é acionado no limite.

const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");

describe("FASE 7.4 · limite de tempo da run", () => {
  it("resolveRunTimeoutMs: padrão 4 min, com limites seguros", () => {
    expect(resolveRunTimeoutMs(undefined)).toBe(240_000);
    expect(resolveRunTimeoutMs("")).toBe(240_000);
    expect(resolveRunTimeoutMs(60_000)).toBe(60_000);
    expect(resolveRunTimeoutMs(5_000)).toBe(30_000);      // piso
    expect(resolveRunTimeoutMs(9_999_999)).toBe(900_000); // teto
    expect(resolveRunTimeoutMs(0)).toBe(0);               // desligado
    expect(resolveRunTimeoutMs("abc")).toBe(0);           // inválido = desligado (nunca NaN)
  });

  it("o servidor aborta o agente no limite e devolve resultado PARCIAL honesto", () => {
    expect(server).toContain("resolveRunTimeoutMs()");
    expect(server).toContain('oldAgent.abort("timeout")');
    expect(server).toContain("Tempo limite atingido");
    expect(server).toContain("Atingi o tempo limite desta execução");
    // continua desinscrevendo o stream ao final (sem vazar listener)
    expect(server).toMatch(/finally \{[\s\S]{0,120}unsubscribeLive\(\)/);
    // e a run continua vindo ANTES de qualquer resposta ao cliente
    expect(server.indexOf("runTimeoutMs")).toBeLessThan(server.indexOf("liveBridge.flushFiles()"));
  });

  it("a conversa rápida NÃO é afetada pelo deadline (não usa agente/ferramentas)", () => {
    const reactBranch = server.slice(server.indexOf('String(body.projectKind ?? "") === "react"'));
    const fast = reactBranch.slice(reactBranch.indexOf("CAMINHO RÁPIDO DE CONVERSA"), reactBranch.indexOf("await withWorkspaceLock("));
    expect(fast).toContain("answerConversation(");
    expect(fast).not.toContain("runTimeoutMs");
  });
});
