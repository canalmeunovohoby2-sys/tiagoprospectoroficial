import { describe, it, expect } from "vitest";
import { classifyCompletion, classifyToolResultFailure } from "../src/completion-guard";

const base = {
  mode: "generate" as const,
  terminalReason: null as string | null,
  verificationRequired: true,
  changeApplied: true,
  finishTaskCalled: false,
  toolFailure: false,
  toolFailureDetail: null as string | null,
  touched: ["index.html"],
};

describe("C7-fix · finish_task bloqueado pelo guard ≠ ferramenta quebrada", () => {
  it("Caso A — finish_task recusado é classificado como GUARD (não tool)", () => {
    const c = classifyToolResultFailure({ toolName: "finish_task", isError: true, message: "bloqueado pelo guard", readOnlyVerify: false });
    expect(c.kind).toBe("guard");
    expect(c.detail).toContain("bloqueado pelo guard");
  });

  it("Caso B — ferramenta de EDIÇÃO com erro continua sendo falha real (tool)", () => {
    const c = classifyToolResultFailure({ toolName: "edit_file", isError: true, message: "ENOENT", readOnlyVerify: false });
    expect(c.kind).toBe("tool");
    expect(c.detail).toBe("edit_file: ENOENT");
  });

  it("Caso B2 — ferramenta de verificação com erro é 'verify' (não invalida a alteração)", () => {
    const c = classifyToolResultFailure({ toolName: "browser_reload", isError: true, message: "refused", readOnlyVerify: true });
    expect(c.kind).toBe("verify");
  });

  it("sem erro ⇒ none", () => {
    expect(classifyToolResultFailure({ toolName: "write_file", isError: false, readOnlyVerify: false }).kind).toBe("none");
  });

  it("Caso A2 — generate com guard bloqueado: mensagem honesta (verificação), NUNCA 'ferramenta falhou'", () => {
    const v = classifyCompletion({ ...base, guardBlocked: true, guardBlockedDetail: "conclusão recusada pelo guard" });
    expect(v.ok).toBe(false);
    expect(v.unverified).toBe(true);
    expect(v.states.tool_failure).toBe(false);
    expect(v.states.guard_blocked).toBe(true);
    expect(v.reply).toMatch(/verifica[çc][ãa]o final|confirmar/i);
    expect(v.reply ?? "").not.toMatch(/ferramenta falhou/i);
    expect(v.error ?? "").not.toMatch(/ferramenta falhou/i);
  });

  it("Caso A3 — edit com guard bloqueado: honesto e sem 'ferramenta falhou'", () => {
    const v = classifyCompletion({ ...base, mode: "edit", guardBlocked: true, guardBlockedDetail: "x" });
    expect(v.ok).toBe(false);
    expect(v.error).toBeTruthy();
    expect(v.reply ?? "").not.toMatch(/ferramenta falhou/i);
  });

  it("falha REAL + guard bloqueado ⇒ a falha é preservada e narrada (não mascara)", () => {
    const v = classifyCompletion({ ...base, toolFailure: true, toolFailureDetail: "edit_file: ENOENT", guardBlocked: true });
    // FASE 7.11 — com alteração aplicada não é erro terminal, mas a falha NÃO é
    // escondida: fica em states (para a IA contar o parcial) e o run é "não verificado".
    expect(v.states.tool_failure).toBe(true);
    expect(v.unverified).toBe(true);
    expect(String(v.error ?? "")).not.toMatch(/ferramenta falhou/i);
  });

  it("Caso C — finish_task aprovado mantém o sucesso/relatório (nada muda)", () => {
    const v = classifyCompletion({ ...base, mode: "edit", finishTaskCalled: true, editedPaths: ["src/site.css"], verificationTools: ["browser_inspect"], renderVerified: true, visualEdit: true });
    expect(v.ok).toBe(true);
    expect(v.error).toBeNull();
    expect(v.states.verification_passed).toBe(true);
  });

  it("Caso C2 — generate sem finish_task mas com gate ok/produced segue 'unverified' (server decide)", () => {
    const v = classifyCompletion({ ...base, mode: "generate" });
    expect(v.unverified).toBe(true);
    expect(v.states.guard_blocked).toBe(false);
  });
});
