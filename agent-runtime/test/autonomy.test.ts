import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideFinishBlock } from "../src/completion-guard";

// AUTONOMIA TOTAL: a IA (qualquer provider configurado) é a autoridade final —
// o runtime apenas executa e reporta. Nenhum guard bloqueia a conclusão.

const base = {
  mode: "generate" as const,
  files: {} as Record<string, string>,
  startFiles: {} as Record<string, string>,
  instruction: "Troque o título principal do hero",
  finishSkips: 0,
};

describe("AUTONOMIA TOTAL — quem decide é o modelo", () => {
  it("autonomy=full NÃO bloqueia a conclusão (mesmo sem arquivos alterados)", () => {
    const d = decideFinishBlock({ ...base, autonomy: "full" });
    expect(d.block).toBe(false);
    expect(d.terminal).toBe(false);
  });

  it("autonomy=guarded mantém o guard com autoridade (não é sucesso automático)", () => {
    const d = decideFinishBlock({ ...base, autonomy: "guarded" });
    expect(d.block).toBe(true);
  });

  it("sem autonomy (compat) o comportamento antigo é preservado", () => {
    const d = decideFinishBlock({ ...base });
    expect(d.block).toBe(true);
  });

  it("a missão React carrega a AUTONOMIA TOTAL e o agente repassa ao guard", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain("AGENT_AUTONOMY");
    expect(server).toContain("AUTONOMIA TOTAL (você decide)");
    const agent = readFileSync(join(process.cwd(), "src/prospector-site-agent.ts"), "utf8");
    expect(agent).toContain('autonomy: options.autonomy === "full" ? "full" : "guarded"');
  });

  it("WATCHDOG: a run SEMPRE encerra no tempo limite (nunca fica pendurada)", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain("Promise.race([oldAgent.runTask(mission, { continueSession: resumed }), watchdog])");
    expect(server).toContain("partialAfterTimeout");
    // edição tem prazo CURTO (2 min) — pedido simples não fica 4 min aberto
    expect(server).toContain('runKind === "generate" ? resolveRunTimeoutMs() : Math.min(resolveRunTimeoutMs(), 120_000)');
  });

  it("EDIÇÃO DE ASSET: o prompt manda trocar só a referência (sem reescrever/build)", () => {
    const identity = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8");
    expect(identity).toContain("EDIÇÃO DE ASSET");
    expect(identity).toContain("NÃO reescreva App.tsx nem o site inteiro");
  });
});
