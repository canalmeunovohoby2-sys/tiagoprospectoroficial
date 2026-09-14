// Selector do StudioTeam (C1) — decide quem fala em seguida, sobre o ESTADO da
// conversa e o SINAL emitido (sem heurísticas rígidas de tamanho/nº de ações).
//
// Semântica DaveLovable:
//   sem mensagens / usuário → Coder (Coder-first)
//   Planner falou            → Coder (obrigatório)
//   Coder TERMINATE          → encerra
//   Coder DELEGATE_TO_PLANNER→ Planner
//   Coder SUBTASK_DONE       → Planner (revisa a estratégia)
//   Coder sem sinal          → Coder continua

import type { AgentSignal } from "./signals.js";

export type Speaker = "Coder" | "Planner" | "end";
export type LastSpeaker = "Coder" | "Planner" | "user" | null;

export interface SelectorInput {
  lastSpeaker: LastSpeaker;
  lastSignal?: AgentSignal | null;
  round: number;
  maxRounds: number;
  /** Quantas vezes o Planner já foi acionado nesta execução. */
  plansUsed: number;
  maxPlans: number;
}

export function selectNext(input: SelectorInput): Speaker {
  if (input.round >= input.maxRounds) return "end";
  const last = input.lastSpeaker;
  if (last === null || last === "user") return "Coder";
  if (last === "Planner") return "Coder";

  const signal = input.lastSignal ?? null;
  if (signal?.type === "TERMINATE") return "end";
  if (signal?.type === "DELEGATE_TO_PLANNER") return input.plansUsed < input.maxPlans ? "Planner" : "Coder";
  if (signal?.type === "SUBTASK_DONE") return input.plansUsed < input.maxPlans ? "Planner" : "Coder";
  return "Coder";
}
