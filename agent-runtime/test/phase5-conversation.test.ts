import { describe, it, expect } from "vitest";
import { reactRunKind, buildConversationSystemPrompt, buildReactMission, honestRunResult } from "../src/server";
import { instructionRequestsChange } from "../src/completion-guard";
import { createLiveStreamBridge, activityForTool } from "../src/studio/live-events";

// FASE 5 — comportamento conversacional + comunicação operacional real.
// A/B/C/D/E/F (classificação), G/H (continuidade), I–L (atividade real),
// M/N (honestidade), O (conversa não dispara edição).

describe("FASE 5 · conversa vs trabalho", () => {
  it("A) saudação não vira trabalho e não pede alteração", () => {
    for (const msg of ["Oi", "Boa tarde", "oi, tudo bem?"]) {
      expect(reactRunKind({ firstGen: false, instruction: msg }), msg).toBe("conversation");
      expect(instructionRequestsChange(msg), msg).toBe(false);
    }
  });

  it("B) perguntas factuais/gerais são conversa", () => {
    for (const msg of ["Quem descobriu o Brasil?", "O que é responsividade?", "O que é SEO?"]) {
      expect(reactRunKind({ firstGen: false, instruction: msg }), msg).toBe("conversation");
      expect(instructionRequestsChange(msg), msg).toBe(false);
    }
  });

  it("C) pergunta sobre o projeto é conversa (e recebe contexto do negócio)", () => {
    const msg = "Como está estruturado o meu site?";
    expect(reactRunKind({ firstGen: false, instruction: msg })).toBe("conversation");
    const system = buildConversationSystemPrompt({ name: "Usinagem Precisão Ferro", segment: "Usinagem CNC", city: "Joinville", state: "SC" });
    expect(system).toContain("Usinagem Precisão Ferro");
    expect(system).toContain("Usinagem CNC");
    expect(system).toContain("Joinville/SC");
    expect(system).toMatch(/NÃO edite arquivos/i);
  });

  it("D) pergunta sobre alteração anterior é conversa (usa histórico)", () => {
    const msg = "O que você mudou no header?";
    expect(reactRunKind({ firstGen: false, instruction: msg })).toBe("conversation");
    const mission = buildReactMission({
      continuityBlock: "\nCONVERSA RECENTE (contexto de continuidade):\n- Usuário: Deixa o header mais premium.\n- Assistente: Ajustei o header e verifiquei.",
      directionBlock: "DIREÇÃO CRIATIVA",
      instruction: msg,
    });
    expect(mission).toContain("Deixa o header mais premium");
    expect(mission).toContain("Ajustei o header");
  });

  it("F) pergunta sobre o PROCESSO do agente não executa alteração", () => {
    for (const msg of ["Me explica o que você está fazendo.", "Por que você escolheu essa cor?", "Como você fez isso?"]) {
      expect(reactRunKind({ firstGen: false, instruction: msg }), msg).toBe("conversation");
      expect(instructionRequestsChange(msg), msg).toBe(false);
    }
  });

  it("E) pedidos de edição continuam indo para o trabalho real", () => {
    for (const msg of ["Troque o botão do WhatsApp para verde.", "Mude o header.", "Deixa o header mais premium.", "Adicione uma seção de depoimentos."]) {
      expect(reactRunKind({ firstGen: false, instruction: msg }), msg).toBe("edit");
    }
    expect(reactRunKind({ firstGen: true, instruction: "Gere o site" })).toBe("generate");
  });

  it("F) pedido MISTO (pergunta + autorização) executa, mas o pedido cru chega ao agente", () => {
    const msg = "O que você acha desse hero? Se você achar que está ruim, pode melhorar.";
    expect(reactRunKind({ firstGen: false, instruction: msg })).toBe("edit");
    const mission = buildReactMission({ instruction: msg });
    expect(mission).toContain(msg);
  });

  it("O) conversa não gera resultado de alteração nem progresso de edição", () => {
    // conversa ⇒ estado próprio; nunca "completed_verified"
    expect(honestRunResult({ ok: true, touched: [], verified: false, intentConfirmed: true })).toBe("no_change");
    // e a decisão de conversa não depende de tools: sem eventos, nada é emitido
    const lines: unknown[] = [];
    const bridge = createLiveStreamBridge({ writeLine: (o) => lines.push(o), readFiles: () => ({}), messageText: () => "", editTools: new Set(["edit_file"]) });
    expect(bridge.stats().activities).toBe(0);
    expect(lines).toHaveLength(0);
  });
});

describe("FASE 5 · comunicação operacional real (sem atividade fake)", () => {
  it("I) sem evento real não existe atividade", () => {
    const lines: Record<string, unknown>[] = [];
    const bridge = createLiveStreamBridge({ writeLine: (o) => lines.push(o), readFiles: () => ({}), messageText: () => "ok", editTools: new Set(["edit_file"]) });
    bridge.onEvent({ type: "turn-started" }); // fronteira de turno real (não é atividade de tool)
    expect(lines.filter((l) => l.type === "activity")).toHaveLength(1);
    expect(bridge.stats().toolCalls).toBe(0);
    expect(bridge.stats().toolResponses).toBe(0);
  });

  it("J/K) ferramenta real + arquivo real aparecem na atividade", () => {
    const lines: Record<string, unknown>[] = [];
    const bridge = createLiveStreamBridge({ writeLine: (o) => lines.push(o), readFiles: () => ({}), messageText: () => "ok", editTools: new Set(["edit_file"]) });
    bridge.onEvent({ type: "tool-started", toolName: "read_file", toolCall: { toolName: "read_file", toolCallId: "r1", input: { path: "src/components/Header.tsx" } } });
    bridge.onEvent({ type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", toolCallId: "e1", input: { path: "src/App.tsx", oldText: "<header class=\"top\">" } } });
    const activities = lines.filter((l) => l.type === "activity") as Array<{ phase: string; detail: string }>;
    expect(activities[0].phase).toBe("analyzing");
    expect(activities[0].detail).toContain("src/components/Header.tsx");
    expect(activities[1].phase).toBe("editing");
    expect(activities[1].detail).toMatch(/o header/i);
  });

  it("L) componente/seção reais são reconhecidos a partir do conteúdo da edição", () => {
    expect(activityForTool("edit_file", "src/components/Header.tsx")?.detail).toBe("Alterando Header (src/components/Header.tsx)");
    expect(activityForTool("edit_file", "src/App.tsx", { newText: '<a href="https://wa.me/55">Falar</a>' })?.detail).toMatch(/CTA do WhatsApp/);
    expect(activityForTool("edit_file", "src/App.tsx", { newText: '<section id="servicos">' })?.detail).toMatch(/a seção servicos/i);
    expect(activityForTool("edit_file", "src/App.tsx", { newText: "<img src='x.jpg' />" })?.detail).toMatch(/galeria de imagens/i);
    // sem dica e sem componente reconhecível → caminho do arquivo (nunca inventa)
    expect(activityForTool("edit_file", "src/App.tsx")?.detail).toBe("Alterando src/App.tsx");
  });

  it("M/N) resultado honesto: falha nunca vira sucesso verificado", () => {
    expect(honestRunResult({ ok: false, touched: ["src/App.tsx"], verified: true, intentConfirmed: true })).toBe("failed");
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: false, intentConfirmed: true })).toBe("completed_unverified");
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: true, intentConfirmed: false })).toBe("completed_unverified");
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: true, intentConfirmed: true })).toBe("completed_verified");
  });
});
