// Sinais estruturados do agente (C1) — semântica do DaveLovable:
//   TERMINATE | DELEGATE_TO_PLANNER | SUBTASK_DONE
//
// O Coder é instruído a terminar a resposta com um objeto de controle em uma
// linha própria:  {"signal":"TERMINATE"}
// O parser aceita o JSON estruturado e, por robustez, também os sentinelas em
// texto (formato que o DaveLovable usa). Sempre devolve um tipo estruturado.

export type AgentSignal =
  | { type: "TERMINATE"; reason?: string }
  | { type: "DELEGATE_TO_PLANNER"; reason: string }
  | { type: "SUBTASK_DONE"; summary: string };

const SIGNAL_VALUES = new Set(["TERMINATE", "DELEGATE_TO_PLANNER", "SUBTASK_DONE"]);

function toSignal(value: unknown, extra: { reason?: unknown; summary?: unknown }): AgentSignal | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (!SIGNAL_VALUES.has(upper)) return null;
  if (upper === "TERMINATE") {
    return typeof extra.reason === "string" && extra.reason.trim() ? { type: "TERMINATE", reason: extra.reason.trim() } : { type: "TERMINATE" };
  }
  if (upper === "DELEGATE_TO_PLANNER") {
    const reason = typeof extra.reason === "string" ? extra.reason.trim() : "";
    return { type: "DELEGATE_TO_PLANNER", reason: reason || "tarefa complexa — precisa de plano" };
  }
  const summary = typeof extra.summary === "string" ? extra.summary.trim() : "";
  return { type: "SUBTASK_DONE", summary: summary || "subtarefa concluída" };
}

/** Extrai o sinal do texto do modelo (JSON estruturado primeiro; sentinelas depois). */
export function parseAgentSignal(text: unknown): AgentSignal | null {
  const source = String(text ?? "");
  if (!source.trim()) return null;

  // 1) JSON: qualquer objeto com `signal` (aceita ```json ... ``` em volta).
  const objectRe = /\{[^{}]*\}/g;
  let match: RegExpExecArray | null;
  while ((match = objectRe.exec(source))) {
    try {
      const obj = JSON.parse(match[0]) as Record<string, unknown>;
      if (obj && typeof obj === "object" && "signal" in obj) {
        const sig = toSignal(obj.signal, { reason: obj.reason, summary: obj.summary });
        if (sig) return sig;
      }
    } catch {
      /* não é JSON válido — tenta o próximo / sentinelas */
    }
  }

  // 2) Sentinelas em texto (compatível com o DaveLovable).
  if (/\bTERMINATE\b/.test(source)) return { type: "TERMINATE" };
  if (/\bDELEGATE_TO_PLANNER\b/.test(source)) {
    const line = source.split(/\r?\n/).find((l) => l.includes("DELEGATE_TO_PLANNER")) ?? "";
    const reason = line.replace(/.*DELEGATE_TO_PLANNER[:\s-]*/i, "").trim();
    return { type: "DELEGATE_TO_PLANNER", reason: reason || "tarefa complexa — precisa de plano" };
  }
  if (/\bSUBTASK_DONE\b/.test(source)) return { type: "SUBTASK_DONE", summary: "subtarefa concluída" };
  return null;
}

/** Remove o bloco de sinal do texto (para exibir só a resposta útil ao usuário). */
export function stripAgentSignal(text: unknown): string {
  let out = String(text ?? "");
  out = out.replace(/\{[^{}]*"signal"[^{}]*\}/gi, "");
  out = out.replace(/```json\s*\{[^{}]*"signal"[^{}]*\}\s*```/gi, "");
  out = out.replace(/\b(TERMINATE|DELEGATE_TO_PLANNER|SUBTASK_DONE)\b:?/g, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
