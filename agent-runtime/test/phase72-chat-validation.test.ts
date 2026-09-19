import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reactRunKind, buildConversationSystemPrompt, answerConversation, honestRunResult, conversationPayload } from "../src/server";
import { intentCoverage } from "../src/work-evidence";
import { createLiveStreamBridge, activityForTool } from "../src/studio/live-events";

// FASE 7.2 — VALIDAÇÃO FINAL DO CHAT. Cenários reais do roteiro + a regra de ouro:
// tudo que aparece no chat/atividade corresponde a evento REAL do runtime.

const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
const reactBranch = server.slice(server.indexOf('String(body.projectKind ?? "") === "react"'));
const fastPath = reactBranch.slice(reactBranch.indexOf("CAMINHO RÁPIDO DE CONVERSA"), reactBranch.indexOf("await withWorkspaceLock("));

describe("FASE 7.2 · CONVERSA (1-4)", () => {
  const perguntas = [
    "Quem descobriu o Brasil?",
    "O que é SEO?",
    "O que você consegue fazer neste projeto?",
    "Por que você escolheu essa cor?",
  ];

  it("as 4 perguntas são conversa (nenhuma vira trabalho)", () => {
    for (const p of perguntas) expect(reactRunKind({ firstGen: false, instruction: p }), p).toBe("conversation");
  });

  it("o prompt exige português do Brasil e proíbe trabalho", () => {
    const system = buildConversationSystemPrompt({ name: "Usinagem Precisão Ferro", segment: "Usinagem CNC", city: "Joinville", state: "SC" });
    expect(system).toMatch(/português do Brasil/i);
    expect(system).toMatch(/NÃO edite arquivos/i);
    expect(system).toContain("Usinagem Precisão Ferro");
  });

  it("sem ferramentas, sem edição, sem WebContainer/build/validação no caminho", () => {
    expect(fastPath).toContain("answerConversation(");
    expect(fastPath).not.toContain("makeAgent(");
    expect(fastPath).not.toContain("runTask(");
    expect(fastPath).not.toContain("createLiveStreamBridge");
    expect(fastPath).not.toContain("normalizeWorkspaceMapEmbeds");
    expect(fastPath).not.toContain("evidences");
    // nem pega o lock (não bloqueia nem é bloqueado por edição em andamento)
    expect(reactBranch.indexOf("CAMINHO RÁPIDO DE CONVERSA")).toBeLessThan(reactBranch.indexOf("await withWorkspaceLock("));
  });

  it("atividade mínima e VERDADEIRA: só 'Respondendo…' (nada de análise/edição fake)", () => {
    expect(fastPath).toContain('phase: "replying"');
    expect(fastPath).toContain("Respondendo…");
    expect(fastPath).not.toMatch(/phase: "(analyzing|editing|verifying|validating|researching|done)"/);
    const payload = conversationPayload({ reply: "Resposta", files: {} });
    expect(payload).toMatchObject({ runtime: "conversation", result_state: "conversation", changed: false, no_file_changes: true });
  });
});

describe("FASE 7.2 · EDIÇÃO (5-6)", () => {
  it("os 2 pedidos são trabalho (edit), não conversa", () => {
    expect(reactRunKind({ firstGen: false, instruction: 'Troque o título principal para "Nossa Empresa".' })).toBe("edit");
    expect(reactRunKind({ firstGen: false, instruction: "Adicione um botão de WhatsApp no hero." })).toBe("edit");
  });

  it("5) pedido com texto entre aspas é COBERTO pelo diff (verificado de verdade)", () => {
    const antes = { "src/App.tsx": "<h1>Bem-vindo</h1>" };
    const depoisOk = { "src/App.tsx": "<h1>Nossa Empresa</h1>" };
    const ok = intentCoverage('Troque o título principal para "Nossa Empresa".', antes, depoisOk, ["src/App.tsx"]);
    expect(ok.checked).toBe(true);
    expect(ok.confirmed).toBe(true);
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: true, intentConfirmed: ok.confirmed })).toBe("completed_verified");

    // título NÃO trocado → nunca "verificado"
    const depoisNao = { "src/App.tsx": "<h1>Bem-vindo</h1><!-- ajuste -->" };
    const nao = intentCoverage('Troque o título principal para "Nossa Empresa".', antes, depoisNao, ["src/App.tsx"]);
    expect(nao.checked).toBe(true);
    expect(nao.confirmed).toBe(false);
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: true, intentConfirmed: nao.confirmed })).toBe("completed_unverified");
  });

  it("6) atividade da edição identifica arquivo REAL e só mostra validação se ela ocorrer", () => {
    // edição de App.tsx com WhatsApp no conteúdo → atividade contextual e verdadeira
    expect(activityForTool("edit_file", "src/App.tsx", { newText: '<a href="https://wa.me/55">WhatsApp</a>' })?.detail).toMatch(/CTA do WhatsApp/);
    expect(activityForTool("read_file", "src/components/Hero.tsx")?.detail).toBe("Lendo Hero (src/components/Hero.tsx)");

    const lines: Record<string, unknown>[] = [];
    const bridge = createLiveStreamBridge({ writeLine: (o) => lines.push(o), readFiles: () => ({}), messageText: () => "ok", editTools: new Set(["edit_file"]) });
    bridge.onEvent({ type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", toolCallId: "e1", input: { path: "src/App.tsx" } } });
    const atividade = lines.filter((l) => l.type === "activity") as Array<{ phase: string }>;
    expect(atividade.map((a) => a.phase)).toEqual(["editing"]); // sem "validating" fake
    expect(lines.some((l) => l.type === "activity" && l.phase === "validating")).toBe(false);
  });

  it("resposta final usa o resultado REAL (verificado × não verificado × falha)", () => {
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: true, intentConfirmed: true })).toBe("completed_verified");
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: false, intentConfirmed: true })).toBe("completed_unverified");
    expect(honestRunResult({ ok: true, touched: [], verified: false, intentConfirmed: true })).toBe("no_change");
    expect(honestRunResult({ ok: false, touched: ["src/App.tsx"], verified: true, intentConfirmed: true })).toBe("failed");
  });
});

describe("FASE 7.2 · durante a edição: 'O que você está fazendo agora?'", () => {
  it("é conversa — NÃO inicia uma segunda edição", () => {
    expect(reactRunKind({ firstGen: false, instruction: "O que você está fazendo agora?" })).toBe("conversation");
    // e o caminho de conversa não executa o agente (garantia estrutural)
    expect(fastPath).not.toContain("makeAgent(");
  });

  it("a resposta explica o ESTADO REAL da execução (evento ao vivo), sem inventar", () => {
    const comEstado = buildConversationSystemPrompt({ name: "Loja X" }, "Alterando o header (src/App.tsx)");
    expect(comEstado).toContain("AGORA MESMO");
    expect(comEstado).toContain("Alterando o header (src/App.tsx)");
    expect(comEstado).toMatch(/explique exatamente isso/i);

    const semEstado = buildConversationSystemPrompt({ name: "Loja X" });
    expect(semEstado).toMatch(/Nenhuma alteração está em andamento/i);
    expect(semEstado).not.toContain("AGORA MESMO");
  });

  it("o estado enviado pelo front é o último evento REAL (liveWork), e vai no corpo do /run", () => {
    const page = readFileSync(join(process.cwd(), "..", "src", "pages", "SiteProjectPage.tsx"), "utf8");
    expect(page).toContain("liveStatus:");
    expect(page).toMatch(/liveWork\[liveWork\.length - 1\]\?\.detail/);
    expect(server).toContain("liveStatus: typeof body.liveStatus");
  });
});

describe("FASE 7.2 · regra de ouro: nada fictício", () => {
  it("nenhum texto de trabalho é emitido sem o evento correspondente", async () => {
    const lines: Record<string, unknown>[] = [];
    const bridge = createLiveStreamBridge({ writeLine: (o) => lines.push(o), readFiles: () => ({}), messageText: () => "", editTools: new Set(["edit_file"]), filesThrottleMs: 0 });
    // conversa não passa pelo bridge; e sem eventos reais o bridge não inventa nada
    expect(bridge.stats().activities).toBe(0);
    expect(lines).toHaveLength(0);
    // sem provider, a conversa devolve vazio e NUNCA uma resposta inventada
    const reply = await answerConversation({ instruction: "Quem descobriu o Brasil?", business: {}, recent: [], exec: { providerId: "x", modelId: "y", apiKey: "z", baseUrl: "http://127.0.0.1:1" } });
    expect(reply).toBe("");
  });
});
