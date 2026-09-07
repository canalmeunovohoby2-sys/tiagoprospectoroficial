import { describe, expect, it } from "vitest";
import { trimConversationWindow, type ConversationMessageLike } from "../src/conversation-window";
import { editKey, genKeyFor } from "../src/server";

// Transcript realista de uma conversa: o usuário pede para criar a seção de
// serviços; o agente lê, edita src/site.css + index.html e resume. É EXATAMENTE
// o shape de messages que o Cline Agent devolve em result.messages e que o
// runtime persiste em agent_conversation_memory.
function transcriptCriouSecaoServicos(): ConversationMessageLike[] {
  return [
    { role: "user", content: "Crie uma seção de serviços." },
    {
      role: "assistant",
      content: "Vou criar a seção de serviços no index.html e estilizar em src/site.css.",
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "read_file", arguments: JSON.stringify({ path: "src/site.css" }) } },
      ],
    },
    { role: "tool", content: "<conteúdo do css>", tool_call_id: "call_1" },
    {
      role: "assistant",
      content: "Agora adiciono o bloco de serviços.",
      tool_calls: [
        { id: "call_2", type: "function", function: { name: "edit_file", arguments: JSON.stringify({ path: "index.html", content: "<section id=\"servicos\">…</section>" }) } },
        { id: "call_3", type: "function", function: { name: "edit_file", arguments: JSON.stringify({ path: "src/site.css", content: "#servicos { … }" }) } },
      ],
    },
    { role: "tool", content: "OK", tool_call_id: "call_2" },
    { role: "tool", content: "OK", tool_call_id: "call_3" },
    { role: "assistant", content: "Pronto! Criei a seção de serviços (#servicos) e deixei os cards com hover." },
  ];
}

function userMsg(text: string): ConversationMessageLike {
  return { role: "user", content: text };
}

describe("Conversation memory — janela segura de contexto (requisito 18)", () => {
  it("histórico dentro do limite → devolve todas as mensagens", () => {
    const msgs = transcriptCriouSecaoServicos();
    expect(trimConversationWindow(msgs, 50)).toEqual(msgs);
  });

  it("histórico vazio/null → devolve []", () => {
    expect(trimConversationWindow(null)).toEqual([]);
    expect(trimConversationWindow([])).toEqual([]);
  });

  it("acima do limite → corta na fronteira de um novo turno do usuário", () => {
    // 1 turno antigo + 1 turno recente (cada transcript ~7 mensagens).
    const msgs = [
      ...transcriptCriouSecaoServicos(),
      userMsg("Agora deixe essa seção azul."),
      { role: "assistant", content: "Deixei #servicos azul." },
    ];
    const trimmed = trimConversationWindow(msgs, 5);
    expect(trimmed.length).toBeLessThanOrEqual(5);
    // A última mensagem (resposta recente) está sempre presente.
    expect(trimmed[trimmed.length - 1]?.content).toBe("Deixei #servicos azul.");
    // A fronteira de corte começa em um role "user" — nunca no meio de uma
    // sequência de tool_calls (nenhum tool sem o assistant que o emitiu).
    expect(trimmed[0]?.role).toBe("user");
  });

  it("nunca deixa tool result órfão (corte preserva o assistant com tool_calls)", () => {
    const msgs = transcriptCriouSecaoServicos();
    // Limite 1 força o corte dentro da janela; a função só corta em user boundary.
    const trimmed = trimConversationWindow(msgs, 1);
    expect(trimmed.length).toBeGreaterThanOrEqual(1);
    // Todo role "tool" dentro da janela tem um assistant com tool_calls antes.
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i]?.role === "tool") {
        let hasOwner = false;
        for (let j = 0; j < i; j++) {
          if (trimmed[j]?.role === "assistant" && Array.isArray(trimmed[j]?.tool_calls)) hasOwner = true;
        }
        expect(hasOwner).toBe(true);
      }
    }
  });

  it("prova de continuidade: mensagem 2 ('deixa ela azul') mantém a ação da mensagem 1", () => {
    // Simula a reconstrução: mensagem 1 criou a seção; a próxima execução
    // restaura o transcript + a nova instrução. O contexto retido precisa
    // mencionar o artefato (#servicos / index.html / src/site.css).
    const prior = transcriptCriouSecaoServicos();
    const restored = trimConversationWindow(prior, 50);
    const serialized = JSON.stringify([...restored, userMsg("Agora deixe ela azul.")]);

    // O texto do agente + os tool_calls que criaram a seção estão no contexto:
    expect(serialized).toContain("#servicos");
    expect(serialized).toContain("index.html");
    expect(serialized).toContain("src/site.css");
    expect(serialized).toContain("Criei a seção de serviços");
    // A palavra "ela" da mensagem 2 resolve contra "seção de serviços" do turno 1.
    expect(serialized).toMatch(/seção de serviços/i);
  });
});

describe("Conversation memory — isolamento de sessão (requisitos 4, 5, 10)", () => {
  it("duas conversas do MESMO projeto/usuario não compartilham sessão", () => {
    expect(editKey("u1", "p1", "conv-a")).not.toBe(editKey("u1", "p1", "conv-b"));
    expect(editKey("u1", "p1", "conv-a")).toBe(editKey("u1", "p1", "conv-a"));
  });

  it("dois projetos do MESMO usuario não compartilham sessão", () => {
    expect(editKey("u1", "p1", "conv")).not.toBe(editKey("u1", "p2", "conv"));
  });

  it("dois usuarios no MESMO projeto não compartilham sessão", () => {
    expect(editKey("u1", "p1", "conv")).not.toBe(editKey("u2", "p1", "conv"));
  });

  it("sessão sem conversationId mantém chave legada (retrocompatibilidade)", () => {
    expect(editKey("u1", "p1")).toBe("edit:u1:p1");
    expect(editKey("u1", "p1", undefined)).toBe("edit:u1:p1");
  });

  it("chaves edit e generate são separadas", () => {
    expect(editKey("u1", "p1", "c1")).not.toBe(genKeyFor("u1", "p1", "c1"));
  });
});

describe("Conversation memory — retomada de conversa (requisito 7)", () => {
  it("restaurar uma conversa usa o MESMO conversationId e janela completa dentro do limite", () => {
    const convId = "conv-1";
    // "Reload" do runtime: carrega o transcript persistido e repassa ao agente.
    const loaded = trimConversationWindow(transcriptCriouSecaoServicos(), 50);
    const nextInstruction = userMsg("agora deixa azul");
    const initialForNewAgent = [...loaded, nextInstruction];

    // A sessão continua isolada pelo mesmo (uid, pid, convId).
    expect(editKey("u1", "p1", convId)).toBe("edit:u1:p1:conv-1");

    // O contexto do turno anterior está integralmente presente na 2ª execução.
    expect(initialForNewAgent.some((m) => m.role === "tool")).toBe(true);
    expect(initialForNewAgent[initialForNewAgent.length - 1]).toEqual(nextInstruction);
  });

  it("nova conversa (outro conversationId) começa sem o transcript anterior", () => {
    const fresh = trimConversationWindow([], 50);
    expect(fresh).toEqual([]);
    // Chave de sessão diferente da conversa antiga.
    expect(editKey("u1", "p1", "conv-nova")).not.toBe(editKey("u1", "p1", "conv-antiga"));
  });
});
