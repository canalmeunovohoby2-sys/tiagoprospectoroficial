// Tipos e parser dos eventos NDJSON emitidos pelo `/run` do Agent Runtime.
// Compatível com os eventos JÁ existentes (`start`/`ping`/`activity`/`result`) e
// com os novos da Fase 2 (`agent_interaction`/`agent_route`/`plan`/`files_ready`/
// `reload_preview`/`complete`).

export type StudioInteractionType = "thought" | "tool_call" | "tool_response";

export interface StudioInteractionEvent {
  type: "agent_interaction";
  agent_name: string;
  message_type: StudioInteractionType;
  content: string;
  tool_name?: string;
  tool_arguments?: unknown;
  tool_call_id?: string;
  iteration?: number;
  timestamp: number;
}

export interface StudioRouteEvent {
  type: "agent_route";
  route: "coder" | "planner";
  reason: string;
  signals?: Array<{ kind: string; detail?: string }>;
  timestamp?: number;
}

export interface StudioPlanEvent {
  type: "plan";
  agent_name?: string;
  plan: string;
  revised?: boolean;
  timestamp?: number;
}

export interface StudioFilesReadyEvent {
  type: "files_ready";
  files: Record<string, string>;
}

export interface StudioReloadPreviewEvent {
  type: "reload_preview";
  reason?: string;
  path?: string;
  timestamp?: number;
}

export interface StudioCompleteEvent {
  type: "complete";
  status: "ok" | "error";
  cancelled?: boolean;
  reply?: string;
  error?: string;
  errors?: string[];
  changed?: boolean;
  touched?: string[];
  files?: Record<string, string>;
  interaction_blocked?: boolean;
  orchestrated?: boolean;
  timestamp?: number;
}

export interface StudioActivityEvent {
  type: "activity";
  phase: string;
  detail: string;
}

export interface StudioGitCommitEvent {
  type: "git_commit";
  success?: boolean;
  message?: string;
  commit_hash?: string;
  hash?: string;
  commit_count?: number;
}

export interface StudioResultEvent {
  type: "result";
  [key: string]: unknown;
}

export interface StudioControlEvent {
  type: "start" | "ping";
  [key: string]: unknown;
}

export type StudioStreamEvent =
  | StudioInteractionEvent
  | StudioRouteEvent
  | StudioPlanEvent
  | StudioFilesReadyEvent
  | StudioReloadPreviewEvent
  | StudioCompleteEvent
  | StudioActivityEvent
  | StudioGitCommitEvent
  | StudioResultEvent
  | StudioControlEvent;

/** Faz o parse de uma linha NDJSON. Devolve null para linha vazia/inválida. */
export function parseStudioLine(raw: string): StudioStreamEvent | null {
  const text = raw.trim();
  if (!text) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const type = (obj as { type?: unknown }).type;
  if (typeof type !== "string" || !type) return null;
  return obj as StudioStreamEvent;
}

export function isStudioInteraction(event: StudioStreamEvent): event is StudioInteractionEvent {
  return event.type === "agent_interaction";
}
