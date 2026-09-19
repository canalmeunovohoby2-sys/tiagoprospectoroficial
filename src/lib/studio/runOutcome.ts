// Classificação PURA do resultado de uma run do `/run` (front).
//
// FASE 7.3 — corrige o falso "IA indisponível": uma CONVERSA bem-sucedida volta
// com `runtime/result_state = "conversation"` e SEM arquivos (`files: {}`), então
// o guard de "sem arquivos" NÃO pode tratá-la como falha. Regra geral: uma run
// que trouxe RESPOSTA válida nunca é "indisponível".

export interface RunResultLike {
  runtime?: string;
  result_state?: string;
  status?: string;
  reply?: string;
  files?: Record<string, string> | null;
  blocked_reason?: string;
  no_file_changes?: boolean;
  changed?: boolean;
  errors?: string[];
  interaction_blocked?: boolean;
}

export type RunOutcome = "conversation" | "blocked" | "failed" | "unavailable" | "changed" | "no_change";

const hasFiles = (res: RunResultLike): boolean => !!res.files && Object.keys(res.files).length > 0;
const hasReply = (res: RunResultLike): boolean => !!String(res.reply ?? "").trim();

/** O resultado veio do caminho de CONVERSA (sem tocar no projeto)? */
export function isConversationResult(res: RunResultLike | null | undefined): boolean {
  if (!res) return false;
  if (res.runtime === "conversation" || res.result_state === "conversation") return true;
  // Compatibilidade: resposta válida, nada alterado e nenhum arquivo = conversa.
  return hasReply(res) && res.status !== "error" && !res.changed && !hasFiles(res) && res.no_file_changes !== false;
}

export function classifyRunOutcome(res: RunResultLike | null | undefined): RunOutcome {
  if (!res) return "unavailable";
  if (res.blocked_reason) return "blocked";
  if (isConversationResult(res)) return "conversation";
  if (res.status === "error" && (res.errors?.length ?? 0) > 0 && !res.changed) return "failed";
  if (!hasFiles(res)) return hasReply(res) ? "no_change" : "unavailable";
  return res.changed ? "changed" : "no_change";
}
