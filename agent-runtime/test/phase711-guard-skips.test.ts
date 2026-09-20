import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyToolResultFailure, classifyCompletion, type CompletionStates } from "../src/completion-guard";

// FASE 7.11 — fim definitivo do "Não concluí a alteração: uma ferramenta falhou…
// Detalhe: write_file" em execuções que, na verdade, foram orientadas pela guarda
// ou que JÁ alteraram o site.

const agent = readFileSync(join(process.cwd(), "src/prospector-site-agent.ts"), "utf8");

describe("FASE 7.11 · skip de guarda nunca é 'ferramenta quebrada'", () => {
  it("caso real: erro SEM mensagem (detalhe apenas 'write_file') com guardSkip=true → guard", () => {
    const r = classifyToolResultFailure({ toolName: "write_file", isError: true, message: undefined, readOnlyVerify: false, guardSkip: true });
    expect(r.kind).toBe("guard");
    expect(String(r.detail)).toBe("write_file");
  });

  it("a tag [guard] no texto basta, mesmo sem o flag (à prova de SDK)", () => {
    const r = classifyToolResultFailure({ toolName: "write_file", isError: true, message: "[guard] prefira edit_file", readOnlyVerify: false });
    expect(r.kind).toBe("guard");
  });

  it("erro REAL de ferramenta continua sendo 'tool' (não mascarar falha)", () => {
    expect(classifyToolResultFailure({ toolName: "write_file", isError: true, message: "ENOSPC: no space left on device", readOnlyVerify: false }).kind).toBe("tool");
    expect(classifyToolResultFailure({ toolName: "edit_file", isError: true, message: undefined, readOnlyVerify: false }).kind).toBe("tool");
  });
});

describe("FASE 7.11 · falha de ferramenta com site JÁ alterado não é erro terminal", () => {
  const base = {
    mode: "edit" as const,
    terminalReason: null as string | null,
    verificationRequired: true,
    changeApplied: true,
    finishTaskCalled: false,
    toolFailure: true,
    toolFailureDetail: "write_file" as string | null,
    touched: ["src/App.tsx"],
  };

  it("com alteração aplicada → ok (não verificado), sem mensagem de erro", () => {
    const v = classifyCompletion({ ...base });
    expect(v.ok).toBe(true);
    expect(v.error).toBeNull();
    expect(v.unverified).toBe(true);
    expect(v.states.tool_failure).toBe(true);
  });

  it("sem NENHUMA alteração aplicada → aí sim é falha real com detalhe", () => {
    const v = classifyCompletion({ ...base, changeApplied: false, touched: [] });
    expect(v.ok).toBe(false);
    expect(v.error ?? "").toMatch(/uma ferramenta falhou/i);
    expect(v.error ?? "").toMatch(/write_file/);
  });
});

describe("FASE 7.11 · as guardas estão instrumentadas no agente", () => {
  it("os três motivos de skip carregam [guard] e marcam lastGuardSkip", () => {
    expect((agent.match(/\[guard\]/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((agent.match(/this\.lastGuardSkip = true/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(agent).toContain("guardSkip: this.lastGuardSkip");
    expect(agent).toContain("private lastGuardSkip = false");
  });
});
