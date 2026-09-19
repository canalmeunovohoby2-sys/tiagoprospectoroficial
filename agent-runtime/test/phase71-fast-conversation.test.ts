import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reactRunKind, answerConversation, conversationPayload } from "../src/server";
import { instructionRequestsChange } from "../src/completion-guard";

// FASE 7.1 — CONVERSA RÁPIDA: a pergunta factual NÃO toca no projeto.
// Prova estrutural: o caminho rápido de conversa vem ANTES de qualquer trabalho
// de workspace/imagens/anexos no ramo React do /run.

const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
const reactBranch = server.slice(server.indexOf('String(body.projectKind ?? "") === "react"'));

const idx = (needle: string, from = reactBranch) => from.indexOf(needle);

describe("FASE 7.1 · conversa não dispara fluxo operacional", () => {
  it("1) pergunta factual é conversa; pedido de alteração continua trabalho", () => {
    expect(reactRunKind({ firstGen: false, instruction: "Quem descobriu o Brasil?" })).toBe("conversation");
    expect(instructionRequestsChange("Quem descobriu o Brasil?")).toBe(false);
    expect(reactRunKind({ firstGen: false, instruction: "troque a cor do header" })).toBe("edit");
    expect(reactRunKind({ firstGen: true, instruction: "Gere o site da minha empresa" })).toBe("generate");
  });

  it("2/3/4) o caminho rápido roda ANTES de sync do workspace, imagens e anexos", () => {
    const fastPath = idx("CAMINHO RÁPIDO DE CONVERSA");
    const sync = idx("syncWorkspaceFromClient(");
    const images = idx("validateBusinessImages(business)");
    const attach = idx("materializeAttachments(root");
    expect(fastPath).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(-1);
    expect(images).toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(-1);
    expect(fastPath).toBeLessThan(sync);
    expect(fastPath).toBeLessThan(images);
    expect(fastPath).toBeLessThan(attach);
    // e o lock também não é pego antes da decisão de conversa
    expect(fastPath).toBeLessThan(idx("await withWorkspaceLock("));
  });

  it("5) conversa usa o helper com tools: [] e uma única chamada ao modelo", () => {
    const helperStart = server.indexOf("export async function answerConversation");
    const helperEnd = server.indexOf("export function buildConversationSystemPrompt", helperStart);
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = server.slice(helperStart, helperEnd);
    expect(helper).toContain("tools: []");
    expect(helper).toContain("callModelWithTools");
    expect(helper.match(/callModelWithTools\(/g)?.length).toBe(1);
    // o caminho rápido usa o helper (nada de agente/ferramentas)
    const fast = reactBranch.slice(idx("CAMINHO RÁPIDO DE CONVERSA"), idx("await withWorkspaceLock("));
    expect(fast).toContain("answerConversation(");
    expect(fast).not.toContain("makeAgent(");
    expect(fast).not.toContain("runTask(");
  });

  it("6) conversa não gera atividade operacional falsa (só o estado honesto)", () => {
    const fast = reactBranch.slice(idx("CAMINHO RÁPIDO DE CONVERSA"), idx("await withWorkspaceLock("));
    expect(fast).toContain('phase: "replying"');
    expect(fast).toContain("Respondendo…");
    // nenhuma atividade de edição/análise/ferramenta no caminho de conversa
    expect(fast).not.toMatch(/phase: "(analyzing|editing|verifying|researching|validating|done)"/);
    expect(fast).not.toContain("agent_interaction");
    expect(fast).not.toContain("files_ready");
  });

  it("payload da conversa mantém o contrato: nothing changed + runtime conversation", () => {
    const payload = conversationPayload({ reply: "O Brasil foi 'descoberto' por…", files: {} });
    expect(payload.runtime).toBe("conversation");
    expect(payload.result_state).toBe("conversation");
    expect(payload.changed).toBe(false);
    expect(payload.no_file_changes).toBe(true);
    expect(payload.touched).toEqual([]);
  });

  it("8) o caminho de EDIÇÃO continua com workspace, sessão e ferramentas", () => {
    const afterFast = reactBranch.slice(idx("await withWorkspaceLock("));
    expect(afterFast).toContain("syncWorkspaceFromClient(");
    expect(afterFast).toContain("validateBusinessImages(business)");
    expect(afterFast).toContain("materializeAttachments(root");
    expect(afterFast).toContain("makeAgent(");
    expect(afterFast).toContain("runTask(");
    expect(afterFast).toContain("createLiveStreamBridge");
  });

  it("o evento start usa o nome REAL do motor (não studio-team)", () => {
    expect(reactBranch).toContain('runtime: "prospector-site-agent"');
    expect(reactBranch).not.toContain('{ type: "start", runtime: "studio-team" }');
  });

  it("answerConversation devolve '' quando não há provider (nunca inventa resposta)", async () => {
    const reply = await answerConversation({
      instruction: "Quem descobriu o Brasil?",
      business: { name: "Teste" },
      recent: [],
      exec: { providerId: "invalido", modelId: "invalido", apiKey: "invalida", baseUrl: "http://127.0.0.1:1" },
    });
    expect(reply).toBe("");
  });
});
