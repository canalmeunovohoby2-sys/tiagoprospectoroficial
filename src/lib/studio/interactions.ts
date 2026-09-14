// Agrupamento dos eventos `agent_interaction` para renderização no ChatPanel:
// - "thought"  → bolha de raciocínio (AgentInteraction)
// - tool_call + tool_response → par agrupado (ToolExecutionBlock), casado por
//   `tool_call_id`; sem id, casa por ORDEM (call aberto mais recente).
//
// Módulo puro (testável) — não depende de React nem do runtime.

import type { StudioInteractionEvent } from "./streamEvents";

export interface StudioThoughtItem {
  kind: "thought";
  id: string;
  agent: string;
  content: string;
  at: number;
}

export interface StudioToolItem {
  kind: "tool";
  id: string;
  agent: string;
  name: string;
  args?: unknown;
  response?: string;
  status: "running" | "done" | "error";
  at: number;
}

export type StudioInteractionItem = StudioThoughtItem | StudioToolItem;

/** Heurística conservadora: resposta estruturada com erro real. */
export function toolResponseIsError(response: string | undefined): boolean {
  const t = (response ?? "").trim();
  if (!t.startsWith("{")) return false;
  try {
    const obj = JSON.parse(t) as { error?: unknown; ok?: unknown };
    if (typeof obj?.error === "string" && obj.error.trim()) return true;
    return obj?.ok === false && typeof obj?.error === "string";
  } catch {
    return false;
  }
}

export function buildInteractionItems(events: StudioInteractionEvent[]): StudioInteractionItem[] {
  const items: StudioInteractionItem[] = [];
  const openByCallId = new Map<string, StudioToolItem>();
  for (const event of events) {
    if (event.message_type === "thought") {
      if (!event.content.trim()) continue;
      items.push({
        kind: "thought",
        id: `t-${event.timestamp}-${items.length}`,
        agent: event.agent_name || "Coder",
        content: event.content,
        at: event.timestamp,
      });
      continue;
    }
    if (event.message_type === "tool_call") {
      const item: StudioToolItem = {
        kind: "tool",
        id: `c-${event.tool_call_id || event.timestamp}-${items.length}`,
        agent: event.agent_name || "Coder",
        name: event.tool_name || "ferramenta",
        args: event.tool_arguments,
        status: "running",
        at: event.timestamp,
      };
      items.push(item);
      if (event.tool_call_id) openByCallId.set(event.tool_call_id, item);
      continue;
    }
    // tool_response
    let target = event.tool_call_id ? openByCallId.get(event.tool_call_id) : undefined;
    if (!target) {
      // Sem id (ou id desconhecido): casa com o tool_call ABERTO mais recente do mesmo nome.
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const candidate = items[i];
        if (candidate.kind === "tool" && candidate.status === "running" && (!event.tool_name || candidate.name === event.tool_name)) {
          target = candidate;
          break;
        }
      }
    }
    if (target) {
      target.response = event.content;
      target.status = toolResponseIsError(event.content) ? "error" : "done";
      if (event.tool_call_id) openByCallId.delete(event.tool_call_id);
    } else {
      items.push({
        kind: "tool",
        id: `r-${event.tool_call_id || event.timestamp}-${items.length}`,
        agent: event.agent_name || "Coder",
        name: event.tool_name || "ferramenta",
        response: event.content,
        status: toolResponseIsError(event.content) ? "error" : "done",
        at: event.timestamp,
      });
    }
  }
  return items;
}

export interface StudioToolPairCount {
  calls: number;
  responses: number;
  open: number;
}

export function countToolPairs(events: StudioInteractionEvent[]): StudioToolPairCount {
  let calls = 0;
  let responses = 0;
  let open = 0;
  for (const e of events) {
    if (e.message_type === "tool_call") { calls += 1; open += 1; }
    else if (e.message_type === "tool_response") { responses += 1; if (open > 0) open -= 1; }
  }
  return { calls, responses, open };
}
