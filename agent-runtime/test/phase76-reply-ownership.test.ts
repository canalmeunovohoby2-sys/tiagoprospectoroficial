import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { classifyEditKind } from "../src/completion-guard";

// FASE 7.6 — A RESPOSTA É DA IA (cérebro), não do template do código.
// Caso real: troca de cor que respondeu "Troquei a imagem" (template errado).

describe("FASE 7.6 · tipo do pedido (regressão do 'troquei a imagem')", () => {
  it("pedido de cor com verbo de troca é COLOR, nunca swap", () => {
    for (const msg of [
      "no site tem duas cores misturadas azul e laranja eu quero todas elas em vermelho",
      "troque o azul por vermelho",
      "mude todo esse azul do site por um laranja",
    ]) {
      expect(classifyEditKind(msg), msg).toBe("color");
    }
  });

  it("troca de imagem de verdade continua swap; enquadramento continua framing", () => {
    expect(classifyEditKind("troque a foto do hero por outra imagem")).toBe("swap");
    expect(classifyEditKind("a cabeça da modelo está cortada, ajuste o enquadramento")).toBe("framing");
  });
});

async function run(options: {
  modelReply: string;
  composeReply?: (input: { instruction: string; modelReply: string; facts: string }) => Promise<string>;
}) {
  const root = mkdtempSync(join(tmpdir(), "fase76-"));
  writeFileSync(join(root, "index.html"), "<h1>antes</h1>", "utf8");
  const listeners = new Set<(e: unknown) => void>();
  const emit = (e: unknown) => { for (const cb of listeners) cb(e); };
  const fakeAgent = {
    abort: () => {},
    subscribe: (cb: (e: unknown) => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    continue: async () => ({ messages: [] }),
    run: async () => {
      emit({ type: "turn-started", iteration: 0 });
      emit({ type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", toolCallId: "e1", input: { path: "index.html" } } });
      writeFileSync(join(root, "index.html"), "<h1>depois AZUL→VERMELHO</h1>", "utf8");
      emit({ type: "tool-finished", toolName: "edit_file", toolCall: { toolName: "edit_file", toolCallId: "e1", input: { path: "index.html" } }, message: { content: [{ type: "text", text: '{"ok":true}' }] } });
      emit({ type: "turn-finished", iteration: 0 });
      return { messages: options.modelReply ? [{ role: "assistant", content: options.modelReply }] : [] };
    },
  };
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: {},
    mode: "edit",
    enableBrowser: false,
    agentFactory: () => fakeAgent,
    composeReply: options.composeReply,
  });
  const outcome = await agent.runTask("no site tem duas cores azul e laranja, coloque todas elas em vermelho");
  rmSync(root, { recursive: true, force: true });
  return outcome;
}

describe("FASE 7.6 · redação final", () => {
  it("resposta vazia do agente → a IA escreve a resposta com os FATOS (nada de template)", async () => {
    let seenFacts = "";
    const outcome = await run({
      modelReply: "",
      composeReply: async (i) => { seenFacts = i.facts; return "Pronto! Troquei o azul e o laranja por vermelho em todo o site e conferi o resultado."; },
    });
    expect(outcome.reply).toContain("vermelho");
    expect(outcome.reply).not.toMatch(/troquei a imagem/i); // nunca o template errado
    // os fatos levados ao cérebro incluem pedido, tipo COLOR, arquivos e verificação
    expect(seenFacts).toMatch(/PEDIDO DO USUARIO/);
    expect(seenFacts).toMatch(/TIPO DO PEDIDO: color/);
    expect(seenFacts).toMatch(/index\.html/);
    expect(seenFacts).toMatch(/VERIFICACAO NO NAVEGADOR/);
  });

  it("não verificada → a IA é chamada para dar o tom honesto (mas continua sendo ela)", async () => {
    let called = 0;
    const outcome = await run({
      modelReply: "Pronto, apliquei as cores.",
      composeReply: async () => { called += 1; return "Apliquei a troca de cores; a conferência visual final ficou pendente — dá uma olhada no preview."; },
    });
    expect(called).toBe(1);
    expect(outcome.reply).toMatch(/cores/i);
  });

  it("se a IA falhar na redação, cai no texto de emergência (nunca fica sem resposta)", async () => {
    const outcome = await run({ modelReply: "", composeReply: async () => "" });
    expect(outcome.reply.trim().length).toBeGreaterThan(0);
    expect(outcome.reply).not.toMatch(/troquei a imagem/i);
  });
});
