// Harness de auditoria (5.17): executa um comando no ProspectorSiteAgent e
// captura a SEQUÊNCIA REAL de tool calls + eventos + mensagens, para distinguir
// um coding agent (lê→edita→verifica) de uma chamada de IA superficial.
import { ensureWorkspaceDir, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

export interface AuditTrace {
  events: Array<{ type: string; toolName?: string; input?: unknown; file?: string }>;
  reply: string;
  touched: string[];
  ok: boolean;
  error?: string;
  filesAfter: FileMap;
  assistantTexts: string[];
}

export async function auditRun(opts: {
  projectId: string;
  files: FileMap;
  business?: Record<string, unknown>;
  instruction: string;
  memory?: string[];
  label?: string;
}): Promise<AuditTrace> {
  const root = ensureWorkspaceDir(opts.projectId, opts.files);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: (opts.business ?? {}) as never,
    maxIterations: 50,
    initialFiles: opts.files,
  });

  const trace: AuditTrace = { events: [], reply: "", touched: [], ok: false, filesAfter: {}, assistantTexts: [] };

  agent.subscribe((event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = event as any;
    switch (e.type) {
      case "tool-started": {
        const toolName = e.toolCall?.toolName ?? "";
        trace.events.push({ type: "tool-started", toolName, input: summarizeInput(e.toolCall?.input) });
        break;
      }
      case "tool-finished": {
        const toolName = e.toolCall?.toolName ?? "";
        trace.events.push({ type: "tool-finished", toolName, file: extractFile(e.toolCall?.input) });
        break;
      }
      case "assistant-message":
      case "message-added": {
        const text = extractAssistantText(e.message?.content ?? e.message?.content ?? []);
        if (text) trace.assistantTexts.push(text);
        break;
      }
      case "run-failed": {
        trace.events.push({ type: "run-failed", toolName: String(e.error ?? "erro") });
        break;
      }
      default:
        trace.events.push({ type: e.type });
    }
  });

  const memBlock = (opts.memory?.length ? `\nMEMÓRIA DE DECISÕES (preserve):\n- ${opts.memory.join("\n- ")}\n` : "");
  const out = await agent.runTask(`${memBlock}${opts.instruction}`);
  trace.ok = out.ok;
  trace.error = out.error;
  trace.reply = out.reply;
  trace.touched = out.touched;
  trace.filesAfter = out.files;
  cleanupWorkspace(opts.projectId);
  return trace;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeInput(input: any): unknown {
  if (!input || typeof input !== "object") return input;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = typeof v === "string" && (v as string).length > 220 ? (v as string).slice(0, 220) + "…" : v;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFile(input: any): string {
  if (input && typeof input === "object") return String(input.path ?? input.from ?? input.to ?? "");
  return "";
}

function extractAssistantText(parts: unknown[]): string {
  if (!Array.isArray(parts)) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (parts as any[]).filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join(" ");
}

export function summarizeTrace(label: string, t: AuditTrace): string {
  const seq = t.events
    .filter((e) => e.type === "tool-started")
    .map((e) => `${e.toolName}${e.file ? `(${e.file})` : ""}`)
    .join(" → ");
  return `\n### ${label}\nok=${t.ok} touched=[${t.touched.join(", ")}]\nSEQUÊNCIA TOOLS: ${seq || "(nenhuma tool)"}\nreply: ${t.reply.slice(0, 300)}`;
}
