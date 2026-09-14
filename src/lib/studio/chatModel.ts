// Modelo do ChatPanel unificado (C2).
//
// Junta, numa ÚNICA linha do tempo da conversa:
//   mensagem do usuário → Agent Activity (Coder/Planner/tools) → resposta do agente → commit.
//
// É PURO (testável): recebe as mensagens já existentes (aiMessages) + as runs de
// atividade registradas pelo `useStudioChat` + commits, e devolve itens prontos
// para render. NÃO é uma segunda fonte de execução — só apresenta.

import { buildInteractionItems, type StudioInteractionItem } from "./interactions";
import type { StudioInteractionEvent } from "./streamEvents";

export interface ChatConversationMessage {
  role: "user" | "assistant" | "system";
  text: string;
  image?: string;
  fileLabel?: string;
}

export type StudioRunStatus = "running" | "done" | "error" | "cancelled";

export interface StudioRun {
  id: number;
  startedAt: number;
  endedAt?: number;
  status: StudioRunStatus;
  events: StudioInteractionEvent[];
  plan?: string | null;
  filesUpdated?: boolean;
  committed?: boolean;
  error?: string | null;
}

export type UnifiedChatItem =
  | { kind: "user"; id: string; text: string; image?: string; fileLabel?: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "system"; id: string; text: string; tone: "info" | "error" | "success" }
  | {
      kind: "activity";
      id: string;
      items: StudioInteractionItem[];
      plan?: string | null;
      status: StudioRunStatus;
      filesUpdated?: boolean;
      startedAt: number;
    }
  | { kind: "commit"; id: string; message: string; hash?: string };

export interface BuildUnifiedChatInput {
  messages: ChatConversationMessage[];
  runs: StudioRun[];
  commits?: Array<{ message: string; hash?: string }>;
}

/** Junta mensagens + atividade das runs na ordem da conversa. */
export function buildUnifiedChat(input: BuildUnifiedChatInput): UnifiedChatItem[] {
  const out: UnifiedChatItem[] = [];
  const runs = input.runs ?? [];
  let runIdx = 0;

  for (let i = 0; i < (input.messages ?? []).length; i += 1) {
    const m = input.messages[i];
    if (m.role === "user") {
      out.push({ kind: "user", id: `u-${i}`, text: m.text, image: m.image, fileLabel: m.fileLabel });
      const run = runs[runIdx];
      if (run) {
        out.push(toActivityItem(run));
        runIdx += 1;
      }
    } else if (m.role === "assistant") {
      out.push({ kind: "assistant", id: `a-${i}`, text: m.text });
    } else {
      out.push({ kind: "system", id: `s-${i}`, text: m.text, tone: "info" });
    }
  }

  // Runs sem mensagem de usuário correspondente (ex.: histórico antigo) → anexa.
  for (; runIdx < runs.length; runIdx += 1) {
    if (runs[runIdx].events.length || runs[runIdx].plan) out.push(toActivityItem(runs[runIdx]));
  }

  for (let c = 0; c < (input.commits ?? []).length; c += 1) {
    out.push({ kind: "commit", id: `c-${c}`, message: input.commits![c].message, hash: input.commits![c].hash });
  }
  return out;
}

function toActivityItem(run: StudioRun): UnifiedChatItem {
  return {
    kind: "activity",
    id: `run-${run.id}`,
    items: buildInteractionItems(run.events),
    plan: run.plan,
    status: run.status,
    filesUpdated: run.filesUpdated,
    startedAt: run.startedAt,
  };
}

export type StudioPhase =
  | "idle"
  | "preparing"
  | "planning"
  | "coding"
  | "tool_running"
  | "validating"
  | "files_ready"
  | "committing"
  | "complete"
  | "cancelled"
  | "error";

export interface DerivePhaseInput {
  running: boolean;
  runs: StudioRun[];
  currentTool?: string | null;
  currentAgent?: string | null;
}

/** Estado único de execução (fonte de verdade para o ChatPanel), pelos eventos REAIS. */
export function deriveStudioPhase(input: DerivePhaseInput): StudioPhase {
  const runs = input.runs ?? [];
  const last = runs.length ? runs[runs.length - 1] : null;
  if (input.running) {
    if (last?.committed) return "committing";
    if (input.currentTool === "run_command") return "validating";
    if (input.currentTool) return "tool_running";
    if (last?.filesUpdated) return "files_ready";
    if (last?.plan && input.currentAgent !== "Coder") return "planning";
    if (input.currentAgent === "Planner") return "planning";
    if (last && last.events.some((e) => e.agent_name === "Coder")) return "coding";
    return "preparing";
  }
  if (!last) return "idle";
  if (last.status === "error") return "error";
  if (last.status === "cancelled") return "cancelled";
  return "complete";
}

export const PHASE_LABEL: Record<StudioPhase, string> = {
  idle: "Pronto",
  preparing: "Preparando…",
  planning: "Planejando…",
  coding: "Codificando…",
  tool_running: "Executando ferramenta…",
  validating: "Verificando…",
  files_ready: "Arquivos atualizados",
  committing: "Salvando checkpoint…",
  complete: "Concluído",
  cancelled: "Cancelado",
  error: "Erro",
};

/** Resumo curto da atividade (para o cabeçalho recolhível). */
export function activitySummary(run: StudioRun): string {
  const items = buildInteractionItems(run.events);
  const tools = items.filter((i) => i.kind === "tool").length;
  const thoughts = items.filter((i) => i.kind === "thought").length;
  if (tools === 0 && thoughts === 0) return run.plan ? "Plano criado" : "Sem atividade";
  const parts: string[] = [];
  if (tools) parts.push(`${tools} ferramenta(s)`);
  if (thoughts) parts.push(`${thoughts} análise(s)`);
  return parts.join(" · ");
}
