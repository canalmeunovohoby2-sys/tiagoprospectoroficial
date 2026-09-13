import { describe, it, expect } from "vitest";
import { toolResultReportsError, parseStructuredToolError } from "../src/prospector-site-agent";

// Constrói um "message.content" no formato do SDK (array de tool-result).
function result(text: string, isError = false) {
  return [{ type: "tool-result", isError, content: text }];
}

describe("toolFailure — erro estrutural da ferramenta é falha real", () => {
  it("A) { error } estruturado → toolFailure", () => {
    const d = toolResultReportsError(result(JSON.stringify({ error: "falhou" })));
    expect(d.isError).toBe(true);
    expect(d.message).toBe("falhou");
  });

  it("B) { ok:false, error } → toolFailure", () => {
    const d = toolResultReportsError(result(JSON.stringify({ ok: false, error: "falhou" })));
    expect(d.isError).toBe(true);
    expect(d.message).toBe("falhou");
  });

  it("C) { ok:true } → NÃO é falha", () => {
    expect(toolResultReportsError(result(JSON.stringify({ ok: true }))).isError).toBe(false);
    expect(toolResultReportsError(result(JSON.stringify({ ok: true, path: "index.html" }))).isError).toBe(false);
  });

  it("D) texto normal que MENCIONA 'error' (sem campo estruturado) → NÃO é falha", () => {
    expect(toolResultReportsError(result("Nenhum error no console. Tudo certo.")).isError).toBe(false);
    expect(toolResultReportsError(result('<div class="error">erro de estilo</div>')).isError).toBe(false);
    expect(toolResultReportsError(result(JSON.stringify({ ok: true, notes: "error handling ok" }))).isError).toBe(false);
    expect(toolResultReportsError(result(JSON.stringify(["error", "erro"]))).isError).toBe(false);
  });

  it("E) SDK isError === true → toolFailure", () => {
    const d = toolResultReportsError(result("boom", true));
    expect(d.isError).toBe(true);
    expect(d.message).toBe("boom");
  });

  it("F) SDK isError === false + resultado normal → NÃO é falha", () => {
    expect(toolResultReportsError(result("ok", false)).isError).toBe(false);
    expect(toolResultReportsError([{ type: "text", text: "oi" }]).isError).toBe(false); // não é tool-result
    expect(toolResultReportsError(undefined).isError).toBe(false);
  });

  it("array de partes de texto no tool-result também é reconhecido", () => {
    const content = [{ type: "tool-result", isError: false, content: [{ type: "text", text: JSON.stringify({ error: "x" }) }] }];
    expect(toolResultReportsError(content).isError).toBe(true);
  });

  it("parseStructuredToolError: só campo `error` real conta", () => {
    expect(parseStructuredToolError(JSON.stringify({ error: "arquivo inexistente" }))).toBe("arquivo inexistente");
    expect(parseStructuredToolError(JSON.stringify({ ok: false }))).toBeNull();
    expect(parseStructuredToolError("menciona error no texto")).toBeNull();
    expect(parseStructuredToolError("{quebrado")).toBeNull();
  });
});
