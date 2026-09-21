import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeUserFacing, looksInternalContext } from "../src/user-facing";
import { createLiveStreamBridge } from "../src/studio/live-events";

// O chat só pode mostrar conteúdo do USUÁRIO. Blocos internos (IDIOMA, MEMÓRIA DE
// DECISÕES, CONVERSA RECENTE, DIREÇÃO CRIATIVA, AUTONOMIA…) jamais aparecem.
describe("contexto interno × saída do usuário", () => {
  it("remove os blocos internos que o modelo ecoar (e mantém a resposta real)", () => {
    const vazado = [
      "IDIOMA (obrigatório): pense, planeje, narre e responda SEMPRE em português do Brasil.",
      "MEMÓRIA DE DECISÕES (preserve):",
      "- cliente quer tom industrial",
      "CONVERSA RECENTE (contexto de continuidade):",
      "- Usuário: troque a logo",
      "DIREÇÃO CRIATIVA DESTE NEGÓCIO (consequência dos DADOS REAIS deste cliente):",
      "",
      "Vou substituir a logo atual pela imagem enviada e preservar a transparência.",
    ].join("\n");
    const out = sanitizeUserFacing(vazado);
    expect(out).toContain("Vou substituir a logo atual");
    expect(out).not.toContain("IDIOMA (obrigatório)");
    expect(out).not.toContain("MEMÓRIA DE DECISÕES");
    expect(out).not.toContain("CONVERSA RECENTE");
    expect(out).not.toContain("DIREÇÃO CRIATIVA");
  });

  it("se só houver contexto interno, devolve vazio (o chamador usa mensagem honesta)", () => {
    const out = sanitizeUserFacing("IDIOMA (obrigatório): responda em pt-BR.\nAUTONOMIA TOTAL (você decide): ...");
    expect(out).toBe("");
  });

  it("resposta normal passa intacta", () => {
    const ok = "O mapa do Google não carrega dentro do preview do editor por isolamento (COEP). No site publicado ele funciona.";
    expect(sanitizeUserFacing(ok)).toBe(ok);
  });

  it("detecta blocos internos isoladamente", () => {
    expect(looksInternalContext("PEDIDO ATUAL (responda SOMENTE a isto): x")).toBe(true);
    expect(looksInternalContext("A capital da França é Paris.")).toBe(false);
  });

  it("thought com contexto interno NÃO é emitido no stream", () => {
    const lines: Record<string, unknown>[] = [];
    const b = createLiveStreamBridge({
      writeLine: (l) => lines.push(l),
      readFiles: () => ({}),
      messageText: (m) => String(m ?? ""),
      editTools: new Set<string>(),
    });
    b.onEvent({ type: "assistant-message", message: "IDIOMA (obrigatório): pense em pt-BR." });
    b.onEvent({ type: "assistant-message", message: "Vou trocar a logo atual pela enviada." });
    const thoughts = lines.filter((l) => l.message_type === "thought").map((l) => String(l.content));
    expect(thoughts).toEqual(["Vou trocar a logo atual pela enviada."]);
  });

  it("a missão e o prompt carregam as regras de isolamento (origem corrigida)", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain("PEDIDO ATUAL (responda SOMENTE a isto)");
    expect(server).toContain("sanitizeUserFacing");
    const identity = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8");
    expect(identity).toContain("NUNCA reproduza contexto interno");
  });
});
