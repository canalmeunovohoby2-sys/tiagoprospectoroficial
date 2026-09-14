import { describe, it, expect } from "vitest";
import { toolResultReportsError, parseStructuredToolError, isTestContentRequest } from "../src/prospector-site-agent";

// Constroi um "message.content" no formato do SDK (array de tool-result).
function result(text: string, isError = false) {
  return [{ type: "tool-result", isError, content: text }];
}

describe("toolFailure - erro estrutural da ferramenta e falha real", () => {
  it("A) { error } estruturado -> toolFailure", () => {
    const d = toolResultReportsError(result(JSON.stringify({ error: "falhou" })));
    expect(d.isError).toBe(true);
    expect(d.message).toBe("falhou");
  });

  it("B) { ok:false, error } -> toolFailure", () => {
    const d = toolResultReportsError(result(JSON.stringify({ ok: false, error: "falhou" })));
    expect(d.isError).toBe(true);
    expect(d.message).toBe("falhou");
  });

  it("C) { ok:true } -> NAO e falha", () => {
    expect(toolResultReportsError(result(JSON.stringify({ ok: true }))).isError).toBe(false);
    expect(toolResultReportsError(result(JSON.stringify({ ok: true, path: "index.html" }))).isError).toBe(false);
  });

  it("D) texto normal que MENCIONA 'error' (sem campo estruturado) -> NAO e falha", () => {
    expect(toolResultReportsError(result("Nenhum error no console. Tudo certo.")).isError).toBe(false);
    expect(toolResultReportsError(result('<div class="error">erro de estilo</div>')).isError).toBe(false);
    expect(toolResultReportsError(result(JSON.stringify({ ok: true, notes: "error handling ok" }))).isError).toBe(false);
    expect(toolResultReportsError(result(JSON.stringify(["error", "erro"]))).isError).toBe(false);
  });

  it("E) SDK isError === true -> toolFailure", () => {
    const d = toolResultReportsError(result("boom", true));
    expect(d.isError).toBe(true);
    expect(d.message).toBe("boom");
  });

  it("F) SDK isError === false + resultado normal -> NAO e falha", () => {
    expect(toolResultReportsError(result("ok", false)).isError).toBe(false);
    expect(toolResultReportsError([{ type: "text", text: "oi" }]).isError).toBe(false); // nao e tool-result
    expect(toolResultReportsError(undefined).isError).toBe(false);
  });

  it("array de partes de texto no tool-result tambem e reconhecido", () => {
    const content = [{ type: "tool-result", isError: false, content: [{ type: "text", text: JSON.stringify({ error: "x" }) }] }];
    expect(toolResultReportsError(content).isError).toBe(true);
  });

  it("parseStructuredToolError: so campo `error` real conta", () => {
    expect(parseStructuredToolError(JSON.stringify({ error: "arquivo inexistente" }))).toBe("arquivo inexistente");
    expect(parseStructuredToolError(JSON.stringify({ ok: false }))).toBeNull();
    expect(parseStructuredToolError("menciona error no texto")).toBeNull();
    expect(parseStructuredToolError("{quebrado")).toBeNull();
  });
});

describe("Contexto de conteudo de TESTE/MOCKUP - autorizacao explicita", () => {
  it("reconhece pedidos explicitos de teste/mockup", () => {
    expect(isTestContentRequest("crie depoimentos de teste para eu ver o layout")).toBe(true);
    expect(isTestContentRequest("faz um mockup com clientes fict\u00edcios")).toBe(true);
    expect(isTestContentRequest("quero ver como fica com dados de exemplo")).toBe(true);
    expect(isTestContentRequest("\u00e9 s\u00f3 um prot\u00f3tipo para demonstra\u00e7\u00e3o")).toBe(true);
  });

  it("NAO autoriza conteudo ficticio sem pedido de teste", () => {
    expect(isTestContentRequest("adicione depoimentos de clientes reais")).toBe(false);
    expect(isTestContentRequest("troque a cor do bot\u00e3o para azul")).toBe(false);
    expect(isTestContentRequest("")).toBe(false);
  });
});
