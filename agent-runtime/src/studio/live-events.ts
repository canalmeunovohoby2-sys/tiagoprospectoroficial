// Ponte de eventos AO VIVO do agente → NDJSON do `/run` (caminho React).
//
// O QUE ESTE MÓDULO FAZ
// Traduz os eventos REAIS do agente (subscribe do SDK) em linhas de stream que o
// frontend já sabe consumir:
//   tool-started  → activity (analyzing/editing/verifying/...) + agent_interaction tool_call
//   tool-finished → agent_interaction tool_response (+ files_ready/reload_preview se editou)
//   turn-started  → activity "thinking" (fronteira real de turno do SDK)
//   assistant-message → agent_interaction thought (texto REAL do modelo)
//   turn-finished → files_ready final
//
// O QUE ELE NÃO FAZ (por princípio)
// - Não inventa eventos, não simula pensamento, não cria fases "de enfeite":
//   tudo vem do subscribe do agente. Sem evento real, nada é escrito.
// - Não expõe nomes de ferramentas ao usuário final: os tool_call/tool_response
//   vão no protocolo do ChatPanel (que agrupa e exibe atividade humanizada),
//   nunca como texto de conversa.

export interface LiveEventLike {
  type?: string;
  toolName?: string;
  toolCall?: { toolName?: string; toolCallId?: string; input?: Record<string, unknown> };
  toolCallId?: string;
  message?: unknown;
  iteration?: number;
}

export interface LiveStreamStats {
  activities: number;
  toolCalls: number;
  toolResponses: number;
  assistantMessages: number;
  filesReady: number;
}

export interface LiveStreamBridgeOptions {
  /** Escreve uma linha NDJSON no cliente (no-op quando não há stream). */
  writeLine: (obj: Record<string, unknown>) => void;
  /** Lê os arquivos REAIS do workspace (para files_ready). */
  readFiles: () => Record<string, string>;
  /** Extrai texto de uma mensagem do SDK (helper do server). */
  messageText: (message: unknown) => string;
  /** Trunca textos longos (helper do server). */
  truncateText?: (text: string) => string;
  /** Ferramentas que ALTERAM arquivos (disparam files_ready/reload_preview). */
  editTools: ReadonlySet<string>;
  /** Intervalo mínimo entre files_ready (padrão 1,2s). */
  filesThrottleMs?: number;
  now?: () => number;
}

export interface LiveStreamBridge {
  onEvent: (event: LiveEventLike) => void;
  /** Força um files_ready (usado ao final da run). */
  flushFiles: () => void;
  stats: () => LiveStreamStats;
}

const ANALYZE_TOOLS = new Set(["read_file", "list_files", "list_dir", "glob_search", "grep_search", "file_search", "get_site_context"]);
const VERIFY_TOOLS = new Set(["browser_open", "browser_reload", "browser_inspect", "browser_eval", "browser_screenshot", "visual_review", "visual_analyze", "visual_verify"]);

/** Nome de componente React plausível (Header, Hero, Servicos…). */
function componentName(path: string): string {
  const file = String(path ?? "").split("/").pop() ?? "";
  const name = file.replace(/\.(t|j)sx?$/i, "").replace(/\.(css|html)$/i, "");
  // Arquivos de entrada (App/main/index) não são "componente" — mostra o caminho.
  if (/^(app|main|index|pages?)$/i.test(name)) return "";
  return /^[A-Z][A-Za-z0-9]+$/.test(name) ? name : "";
}

/**
 * FASE 5 — contexto HUMANO da ação a partir de dados REAIS (path + conteúdo da
 * tool). Nunca inventa: sem dica, devolve o próprio caminho do arquivo.
 */
export function contextLabel(path: string, input?: Record<string, unknown>): string {
  const p = String(path ?? "").trim();
  const hay = [input?.oldText, input?.newText, input?.content, input?.query].map((v) => String(v ?? "")).join("\n").toLowerCase();
  const comp = componentName(p);
  const base = comp ? `${comp} (${p})` : p;
  if (!hay) return base;
  if (/wa\.me|whatsapp/.test(hay)) return `o CTA do WhatsApp${p ? ` (${p})` : ""}`;
  if (/<header|id=["']header|class=["'][^"']*header/.test(hay)) return `o header${p ? ` (${p})` : ""}`;
  if (/hero|banner principal/.test(hay)) return `o hero${p ? ` (${p})` : ""}`;
  if (/galeria|gallery|<img/.test(hay)) return `a galeria de imagens${p ? ` (${p})` : ""}`;
  if (/id=["']([a-z0-9-]+)["']/.test(hay)) {
    const id = hay.match(/id=["']([a-z0-9-]+)["']/)?.[1] ?? "";
    if (id && !["app", "root"].includes(id)) return `a seção ${id.replace(/-/g, " ")}${p ? ` (${p})` : ""}`;
  }
  if (/<footer|rodap|contato|contact/.test(hay)) return `o contato/rodapé${p ? ` (${p})` : ""}`;
  return base;
}

/** Atividade humanizada derivada da ferramenta REAL chamada (nunca inventada). */
export function activityForTool(tool: string, path: string, input?: Record<string, unknown>): { phase: string; detail: string } | null {
  if (!tool) return null;
  const label = contextLabel(path, input);
  if (tool === "write_file" || tool === "edit_file" || tool === "create_file" || tool === "delete_file" || tool === "rename_file" || tool === "move_file") {
    return { phase: "editing", detail: label ? `Alterando ${label}` : "Alterando os arquivos do projeto" };
  }
  if (ANALYZE_TOOLS.has(tool)) {
    return { phase: "analyzing", detail: label ? `Lendo ${label}` : "Analisando o projeto…" };
  }
  if (VERIFY_TOOLS.has(tool)) {
    return { phase: "verifying", detail: label && label !== "o header" ? `Verificando ${label}` : "Verificando o site renderizado" };
  }
  if (tool === "web_search") return { phase: "researching", detail: "Pesquisando referências" };
  if (tool === "run_command") return { phase: "validating", detail: "Rodando validação do projeto" };
  if (tool === "finish_task") return { phase: "done", detail: "Concluindo tarefa…" };
  return null;
}

export function createLiveStreamBridge(options: LiveStreamBridgeOptions): LiveStreamBridge {
  const throttle = options.filesThrottleMs ?? 1_200;
  const now = options.now ?? Date.now;
  const clip = options.truncateText ?? ((t: string) => t);
  let lastFilesAt = 0;
  let lastAssistant = "";
  const stats: LiveStreamStats = { activities: 0, toolCalls: 0, toolResponses: 0, assistantMessages: 0, filesReady: 0 };

  const emitFiles = (force: boolean) => {
    const t = now();
    if (!force && t - lastFilesAt < throttle) return;
    lastFilesAt = t;
    try {
      stats.filesReady += 1;
      options.writeLine({ type: "files_ready", files: options.readFiles() });
    } catch { /* leitura/escrita nunca derruba a run */ }
  };

  const onEvent = (event: LiveEventLike) => {
    try {
      const tool = String(event.toolName ?? event.toolCall?.toolName ?? "");
      const input = (event.toolCall?.input ?? {}) as Record<string, unknown>;
      const path = typeof input?.path === "string" ? input.path : typeof input?.file === "string" ? input.file : "";
      const toolCallId = String(event.toolCall?.toolCallId ?? event.toolCallId ?? "");

      if (event.type === "tool-started") {
        const activity = activityForTool(tool, path, input);
        if (activity) {
          stats.activities += 1;
          options.writeLine({ type: "activity", phase: activity.phase, detail: activity.detail });
        }
        if (tool) {
          stats.toolCalls += 1;
          options.writeLine({
            type: "agent_interaction", agent_name: "Coder", message_type: "tool_call",
            tool_name: tool, tool_arguments: input, tool_call_id: toolCallId, timestamp: now(),
          });
        }
        return;
      }

      if (event.type === "tool-finished") {
        if (tool) {
          stats.toolResponses += 1;
          options.writeLine({
            type: "agent_interaction", agent_name: "Coder", message_type: "tool_response",
            tool_name: tool, tool_call_id: toolCallId,
            content: clip(options.messageText(event.message)), timestamp: now(),
          });
        }
        if (options.editTools.has(tool)) {
          emitFiles(false);
          options.writeLine({ type: "reload_preview", reason: tool, path, timestamp: now() });
        }
        return;
      }

      if (event.type === "turn-started") {
        // Fronteira REAL de turno do SDK (o modelo vai ser consultado agora).
        stats.activities += 1;
        options.writeLine({ type: "activity", phase: "thinking", detail: "Analisando a próxima etapa…" });
        return;
      }

      if (event.type === "assistant-message") {
        const text = clip(options.messageText(event.message)).trim();
        // Só o texto que o MODELO realmente produziu (nunca fabricado). Dedup do
        // último texto para não repetir quando o SDK reemite o mesmo conteúdo.
        if (text && text !== lastAssistant) {
          lastAssistant = text;
          stats.assistantMessages += 1;
          options.writeLine({
            type: "agent_interaction", agent_name: "Coder", message_type: "thought",
            content: text, iteration: event.iteration, timestamp: now(),
          });
        }
        return;
      }

      if (event.type === "turn-finished") {
        emitFiles(true);
      }
    } catch { /* nunca derruba o stream por causa do indicador */ }
  };

  return { onEvent, flushFiles: () => emitFiles(true), stats: () => ({ ...stats }) };
}
