// Estado do agente POR PROJETO (C1) — inspirado no `.agent_state.json` do
// DaveLovable. Fica FORA do diretório do projeto (irmão do workspace) para não
// poluir `files_ready`/`generated_code`/Explorer. Nunca guarda segredos/tokens.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface StudioStateMessage {
  role: "user" | "assistant" | "planner";
  content: string;
  at: string;
}

export interface StudioProjectState {
  version: 1;
  projectId: string;
  history: StudioStateMessage[];
  plan?: string;
  iterations: number;
  updatedAt: string;
}

const MAX_HISTORY = 40;
const MAX_MESSAGE_CHARS = 8_000;

export function stateFilePath(workspaceRoot: string): string {
  return join(dirname(workspaceRoot), `${basename(workspaceRoot)}.agent-state.json`);
}

export function emptyState(projectId: string): StudioProjectState {
  return { version: 1, projectId, history: [], iterations: 0, updatedAt: new Date().toISOString() };
}

function sanitize(message: StudioStateMessage): StudioStateMessage {
  return { role: message.role, content: String(message.content ?? "").slice(0, MAX_MESSAGE_CHARS), at: message.at };
}

/** Carrega o estado do projeto; se ausente/corrompido, devolve estado vazio. */
export function loadProjectState(workspaceRoot: string, projectId: string): StudioProjectState {
  const file = stateFilePath(workspaceRoot);
  if (!existsSync(file)) return emptyState(projectId);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StudioProjectState>;
    if (!parsed || parsed.projectId !== projectId || !Array.isArray(parsed.history)) return emptyState(projectId);
    return {
      version: 1,
      projectId,
      history: parsed.history.filter((m): m is StudioStateMessage => !!m && typeof m.content === "string" && typeof m.role === "string").slice(-MAX_HISTORY).map(sanitize),
      plan: typeof parsed.plan === "string" ? parsed.plan : undefined,
      iterations: Number.isFinite(parsed.iterations) ? Number(parsed.iterations) : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyState(projectId);
  }
}

/** Grava o estado (escrita atômica). Mantém só o histórico necessário. */
export function saveProjectState(workspaceRoot: string, state: StudioProjectState): void {
  const file = stateFilePath(workspaceRoot);
  const payload: StudioProjectState = {
    version: 1,
    projectId: state.projectId,
    history: state.history.slice(-MAX_HISTORY).map(sanitize),
    plan: state.plan,
    iterations: state.iterations,
    updatedAt: new Date().toISOString(),
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    renameSync(tmp, file);
  } catch {
    /* estado é opcional — nunca falha a execução por isso */
  }
}

export function clearProjectState(workspaceRoot: string): void {
  const file = stateFilePath(workspaceRoot);
  try { if (existsSync(file)) rmSync(file, { force: true }); } catch { /* noop */ }
}
