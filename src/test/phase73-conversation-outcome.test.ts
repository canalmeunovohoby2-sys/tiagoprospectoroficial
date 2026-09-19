import { describe, it, expect } from "vitest";
import { classifyRunOutcome, isConversationResult } from "@/lib/studio/runOutcome";

// FASE 7.3 — a CONVERSA nunca pode virar "IA indisponível".
// (Regressão real: o payload de conversa volta com `files: {}` e o guard de
// "sem arquivos" mostrava o aviso de runtime indisponível.)

describe("FASE 7.3 · resultado de conversa é resposta, não erro", () => {
  const conversa = { status: "ok", runtime: "conversation", result_state: "conversation", reply: "Boa noite! Como posso ajudar?", files: {}, changed: false, no_file_changes: true };

  it("conversa com files vazio é classificada como conversation (nunca unavailable)", () => {
    expect(classifyRunOutcome(conversa)).toBe("conversation");
    expect(isConversationResult(conversa)).toBe(true);
    expect(classifyRunOutcome(conversa)).not.toBe("unavailable");
  });

  it("compatibilidade: resposta válida + nada alterado + sem arquivos também é conversa", () => {
    expect(classifyRunOutcome({ status: "ok", reply: "Oi! Tudo bem?", files: {}, no_file_changes: true })).toBe("conversation");
  });

  it("run SEM resposta e SEM arquivos continua sendo unavailable (erro honesto)", () => {
    expect(classifyRunOutcome({ status: "ok", files: {} })).toBe("unavailable");
    expect(classifyRunOutcome(null)).toBe("unavailable");
    expect(classifyRunOutcome(undefined)).toBe("unavailable");
  });

  it("bloqueio, falha e mudança continuam com os rótulos corretos", () => {
    expect(classifyRunOutcome({ status: "error", blocked_reason: "IA não validada", files: {} })).toBe("blocked");
    expect(classifyRunOutcome({ status: "error", errors: ["deu ruim"], files: {} })).toBe("failed");
    expect(classifyRunOutcome({ status: "ok", files: { "src/App.tsx": "x" }, changed: true })).toBe("changed");
    expect(classifyRunOutcome({ status: "ok", files: { "src/App.tsx": "x" }, changed: false })).toBe("no_change");
    expect(classifyRunOutcome({ status: "ok", reply: "nada a mudar", files: { "index.html": "x" }, changed: false })).toBe("no_change");
  });

  it("edição real (com arquivos) NUNCA é classificada como conversa", () => {
    const edicao = { status: "ok", runtime: "prospector-site-agent", result_state: "completed_verified", reply: "Ajustei o header.", files: { "src/App.tsx": "<h1>x</h1>" }, changed: true };
    expect(isConversationResult(edicao)).toBe(false);
    expect(classifyRunOutcome(edicao)).toBe("changed");
  });
});
