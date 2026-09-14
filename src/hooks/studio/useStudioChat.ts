import { useCallback, useMemo, useState } from "react";
import { buildInteractionItems, type StudioInteractionItem } from "@/lib/studio/interactions";
import { deriveStudioPhase, type StudioPhase, type StudioRun, type StudioRunStatus } from "@/lib/studio/chatModel";
import type {
  StudioCompleteEvent,
  StudioInteractionEvent,
  StudioPlanEvent,
  StudioRouteEvent,
  StudioStreamEvent,
} from "@/lib/studio/streamEvents";

export interface StudioCommitItem {
  message: string;
  hash?: string;
}

export interface UseStudioChatResult {
  /** Todas as runs de atividade (histórico da conversa). */
  runs: StudioRun[];
  /** Estado único de execução. */
  phase: StudioPhase;
  running: boolean;
  error: string | null;
  cancelled: boolean;
  currentAgent: string | null;
  currentTool: string | null;
  commits: StudioCommitItem[];
  // Compat com a timeline atual (última run).
  events: StudioInteractionEvent[];
  items: StudioInteractionItem[];
  route: StudioRouteEvent | null;
  plan: string | null;
  begin: () => void;
  finish: (opts?: { error?: string | null; cancelled?: boolean }) => void;
  reset: () => void;
  handleEvent: (event: StudioStreamEvent) => void;
  appendCommit: (commit: StudioCommitItem) => void;
}

const MAX_EVENTS_PER_RUN = 400;

function lastRun(runs: StudioRun[]): StudioRun | null {
  return runs.length ? runs[runs.length - 1] : null;
}

function computeOpenTool(events: StudioInteractionEvent[]): string | null {
  const open = new Map<string, string>();
  for (const e of events) {
    if (e.message_type === "tool_call") {
      const id = e.tool_call_id || `${e.tool_name ?? "tool"}@${e.timestamp}`;
      open.set(id, e.tool_name || "tool");
    } else if (e.message_type === "tool_response") {
      const id = e.tool_call_id || "";
      if (id && open.has(id)) open.delete(id);
      else {
        const first = open.keys().next().value;
        if (first) open.delete(first);
      }
    }
  }
  const names = [...open.values()];
  return names.length ? names[names.length - 1] : null;
}

/**
 * Estado de streaming do Studio (C1/C2). Multi-run: NÃO limpa a atividade a cada
 * turno — o ChatPanel unificado apresenta a conversa inteira com a atividade de
 * cada execução no lugar certo.
 */
export function useStudioChat(): UseStudioChatResult {
  const [runs, setRuns] = useState<StudioRun[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [route, setRoute] = useState<StudioRouteEvent | null>(null);
  const [commits, setCommits] = useState<StudioCommitItem[]>([]);

  const begin = useCallback(() => {
    setRunning(true);
    setError(null);
    setCancelled(false);
    setRoute(null);
    setRuns((prev) => [...prev, { id: prev.length + 1, startedAt: Date.now(), status: "running", events: [] }]);
  }, []);

  const finish = useCallback((opts?: { error?: string | null; cancelled?: boolean }) => {
    setRunning(false);
    if (opts?.error) setError(opts.error);
    if (opts?.cancelled) setCancelled(true);
    setRuns((prev) => {
      if (!prev.length) return prev;
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last.status === "running") {
        const status: StudioRunStatus = opts?.cancelled ? "cancelled" : opts?.error ? "error" : "done";
        copy[copy.length - 1] = { ...last, status, endedAt: Date.now(), error: opts?.error ?? last.error };
      }
      return copy;
    });
  }, []);

  const reset = useCallback(() => {
    setRuns([]);
    setRunning(false);
    setError(null);
    setCancelled(false);
    setRoute(null);
    setCommits([]);
  }, []);

  const appendCommit = useCallback((commit: StudioCommitItem) => {
    setCommits((prev) => [...prev, commit]);
  }, []);

  const handleEvent = useCallback((event: StudioStreamEvent) => {
    switch (event.type) {
      case "agent_interaction":
        setRuns((prev) => {
          const base = prev.length ? prev : [{ id: 1, startedAt: Date.now(), status: "running" as StudioRunStatus, events: [] }];
          const copy = [...base];
          const last = copy[copy.length - 1];
          const events = [...last.events, event];
          copy[copy.length - 1] = { ...last, events: events.length > MAX_EVENTS_PER_RUN ? events.slice(events.length - MAX_EVENTS_PER_RUN) : events };
          return copy;
        });
        break;
      case "plan":
        setRuns((prev) => {
          if (!prev.length) return prev;
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], plan: (event as StudioPlanEvent).plan };
          return copy;
        });
        break;
      case "agent_route":
        setRoute(event);
        break;
      case "files_ready":
        setRuns((prev) => {
          if (!prev.length) return prev;
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last.filesUpdated) return prev; // registra uma vez por run (não duplica)
          copy[copy.length - 1] = { ...last, filesUpdated: true };
          return copy;
        });
        break;
      case "git_commit": {
        const c = event as unknown as { message?: string; commit_hash?: string; hash?: string };
        setCommits((prev) => [...prev, { message: c.message ?? "Checkpoint", hash: c.commit_hash ?? c.hash }]);
        setRuns((prev) => {
          if (!prev.length) return prev;
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], committed: true };
          return copy;
        });
        break;
      }
      case "complete": {
        const complete = event as StudioCompleteEvent;
        setRunning(false);
        if (complete.cancelled) setCancelled(true);
        if (complete.status === "error" && complete.error) setError(complete.error);
        setRuns((prev) => {
          if (!prev.length) return prev;
          const copy = [...prev];
          const last = copy[copy.length - 1];
          const status: StudioRunStatus = complete.cancelled ? "cancelled" : complete.status === "error" ? "error" : "done";
          copy[copy.length - 1] = { ...last, status, endedAt: Date.now(), error: complete.error ?? last.error };
          return copy;
        });
        break;
      }
      default:
        break;
    }
  }, []);

  const current = lastRun(runs);
  const currentTool = useMemo(() => (current ? computeOpenTool(current.events) : null), [current]);
  const currentAgent = current?.events.length ? current.events[current.events.length - 1].agent_name : null;
  const phase = useMemo(() => deriveStudioPhase({ running, runs, currentTool, currentAgent }), [running, runs, currentTool, currentAgent]);
  const events = useMemo(() => current?.events ?? [], [current]);
  const items = useMemo(() => buildInteractionItems(events), [events]);
  const plan = current?.plan ?? null;

  return {
    runs,
    phase,
    running,
    error,
    cancelled,
    currentAgent,
    currentTool,
    commits,
    events,
    items,
    route,
    plan,
    begin,
    finish,
    reset,
    handleEvent,
    appendCommit,
  };
}
