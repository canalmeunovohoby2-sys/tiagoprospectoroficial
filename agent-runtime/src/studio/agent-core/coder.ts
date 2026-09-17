// Coder (C1): agente com FERRAMENTAS que edita o projeto real.
// Não é wrapper do ProspectorSiteAgent — é um loop de tool-calling próprio,
// com sinais estruturados (TERMINATE/DELEGATE_TO_PLANNER/SUBTASK_DONE).

import type { ModelCaller, ModelMessage, ModelToolCall } from "./model.js";
import type { CoderTool } from "./agent-tools.js";
import { parseAgentSignal, stripAgentSignal, type AgentSignal } from "./signals.js";
import { instructionRequestsChange } from "../../completion-guard.js";

export interface RunCoderInput {
  model: ModelCaller;
  system: string;
  messages: ModelMessage[];
  tools: CoderTool[];
  ai: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };
  emit: (event: Record<string, unknown>) => void;
  /** Chamado quando ferramentas de edição alteram arquivos (→ files_ready). */
  onFilesChanged?: (paths: string[]) => void;
  /** Instrução original (para saber se a tarefa EXIGE alteração de arquivo). */
  instruction?: string;
  maxToolRounds?: number;
  signal?: AbortSignal;
}

export interface CoderToolUse {
  id: string;
  name: string;
  ok: boolean;
  /** Arquivo alvo (path/from) quando a ferramenta opera em um arquivo. */
  path?: string;
}

export interface RunCoderResult {
  text: string;
  signal: AgentSignal | null;
  toolUses: CoderToolUse[];
  touched: string[];
  produced: ModelMessage[];
  error?: string;
}

const EDIT_TOOLS = new Set(["write_file", "edit_file", "create_file", "delete_file", "rename_file", "move_file"]);

/** Limita o raciocínio exibido (evita despejar um chain-of-thought gigante no chat). */
function clip(text: string, limit = 1_500): string {
  const t = (text ?? "").trim();
  return t.length <= limit ? t : `${t.slice(0, limit).trimEnd()}…`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function joinFiles(paths: string[]): string {
  const head = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${head} (+${paths.length - 3})` : head;
}

/**
 * Pensamento HUMANIZADO quando o modelo não narrou a rodada: usa apenas o alvo
 * REAL das ferramentas (nunca o nome interno delas, que não deve aparecer no chat).
 */
function describeWork(calls: ModelToolCall[]): string {
  const paths = (filter: (c: ModelToolCall) => boolean) =>
    unique(calls.filter(filter).map((c) => pathOf(c.arguments ?? {}) ?? "").filter(Boolean));
  const writes = paths((c) => EDIT_TOOLS.has(c.name));
  const reads = paths((c) => !EDIT_TOOLS.has(c.name));
  if (writes.length) return `Aplicando a alteração em ${joinFiles(writes)}.`;
  if (reads.length) return `Inspecionando ${joinFiles(reads)} antes de alterar.`;
  return "Analisando o projeto antes de aplicar a alteração.";
}

function pathOf(args: Record<string, unknown>): string | null {
  for (const key of ["path", "from", "target_file", "filepath"]) {
    const v = args[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function runCoderTurn(input: RunCoderInput): Promise<RunCoderResult> {
  const maxRounds = input.maxToolRounds ?? 8;
  const toolMap = new Map(input.tools.map((t) => [t.schema.name, t]));
  const schemas = input.tools.map((t) => t.schema);

  let messages: ModelMessage[] = [...input.messages];
  const initialCount = input.messages.length;
  const toolUses: CoderToolUse[] = [];
  const touched = new Set<string>();
  let text = "";
  let signal: AgentSignal | null = null;
  // `produced` = EXATAMENTE o que foi acrescentado ao histórico neste turno, na
  // ordem correta (assistant com tool_calls SEGUIDO das mensagens `tool`). Sem isso,
  // quem remonta o histórico (team.ts) enviaria `assistant(tool_calls)` sem `tool`
  // → o provider rejeita com HTTP 400.
  const producedNow = (): ModelMessage[] => messages.slice(initialCount);
  // A tarefa exige alteração de arquivo? Se sim, não aceitamos "texto otimista"
  // como conclusão nem terminamos sem ter usado uma ferramenta de edição.
  const requiresChange = instructionRequestsChange(input.instruction ?? "");
  let nudges = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    if (input.signal?.aborted) {
      return { text, signal: { type: "TERMINATE", reason: "cancelado" }, toolUses, touched: [...touched], produced: producedNow() };
    }
    const result = await input.model({
      providerId: input.ai.providerId,
      modelId: input.ai.modelId,
      apiKey: input.ai.apiKey,
      baseUrl: input.ai.baseUrl,
      system: input.system,
      messages,
      tools: schemas,
      // Orçamento maior evita TRUNCAR argumentos de tools (arquivos grandes),
      // que resultariam em tool-call malformada e nenhuma alteração real.
      maxTokens: 8_000,
      timeoutMs: 180_000,
    });
    if (!result.ok || !result.turn) {
      const error = result.error ?? "modelo não retornou turno";
      input.emit({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: `Falha do modelo: ${error}`, timestamp: Date.now() });
      return { text, signal: null, toolUses, touched: [...touched], produced: producedNow(), error };
    }

    const turn = result.turn;
    const turnSignal = parseAgentSignal(turn.text);
    // Raciocínio exposto pelo provider (quando houver) → pensamento AO VIVO no chat.
    // É temporário: a UI o recolhe quando a resposta final chega.
    const reasoning = clip(turn.reasoning ?? "");
    if (reasoning) {
      input.emit({
        type: "agent_interaction", agent_name: "Coder", message_type: "thought",
        content: reasoning, timestamp: Date.now(),
      });
    }
    // O texto do modelo pode terminar com o objeto de controle
    // ({"signal":"TERMINATE"}). Ele NUNCA deve aparecer no chat do usuário.
    const visibleText = turn.text ? stripAgentSignal(turn.text) : "";
    // Texto que ACOMPANHA ferramentas é RACIOCÍNIO (o modelo explica o que vai
    // fazer e continua trabalhando). O texto final — sem ferramentas ou com sinal
    // de término — é a RESPOSTA e por isso NÃO entra no bloco de pensamento.
    if (visibleText && turn.toolCalls.length > 0 && !turnSignal) {
      input.emit({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: clip(visibleText), timestamp: Date.now() });
    }
    // Rodada sem narração do modelo: mostra o pensamento a partir do trabalho REAL
    // que ele decidiu fazer (arquivos reais; sem expor nomes de ferramentas).
    if (turn.toolCalls.length > 0 && !turnSignal && !reasoning && !visibleText) {
      input.emit({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: describeWork(turn.toolCalls), timestamp: Date.now() });
    }
    const assistantMessage: ModelMessage = { role: "assistant", content: turn.text, toolCalls: turn.toolCalls };

    signal = turnSignal;
    const noTools = turn.toolCalls.length === 0;
    const prematureTerminate = signal?.type === "TERMINATE";
    const canNudge = requiresChange && touched.size === 0 && nudges < 2 && round < maxRounds - 1;
    if (signal && !(prematureTerminate && canNudge)) {
      text = stripAgentSignal(turn.text) || text;
      break;
    }
    if (noTools) {
      // Sem ferramentas: se a tarefa exige alteração e nada foi escrito, força o
      // modelo a usar as ferramentas (nudge) em vez de encerrar com texto.
      if (canNudge) {
        nudges += 1;
        input.emit({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: "Nenhuma ferramenta foi chamada — vou aplicar a alteração no código agora.", timestamp: Date.now() });
        messages = [
          ...messages,
          { role: "assistant", content: turn.text },
          { role: "user", content: "Você ainda NÃO chamou nenhuma ferramenta de edição. Aplique a alteração REAL agora com write_file/edit_file/create_file e só depois responda. Responder apenas com texto NÃO conclui a tarefa." },
        ];
        continue;
      }
      text = stripAgentSignal(turn.text).trim();
      break;
    }

    // Executa as ferramentas reais (sequencial; reduz corridas).
    const toolMessages: ModelMessage[] = [];
    for (const call of turn.toolCalls as ModelToolCall[]) {
      input.emit({
        type: "agent_interaction", agent_name: "Coder", message_type: "tool_call",
        tool_name: call.name, tool_arguments: call.arguments, tool_call_id: call.id, content: `Chamando ${call.name}`, timestamp: Date.now(),
      });
      const tool = toolMap.get(call.name);
      let output: string;
      let ok = false;
      if (!tool) {
        output = JSON.stringify({ error: `ferramenta desconhecida: ${call.name}` });
      } else {
        try {
          output = await tool.execute(call.arguments ?? {});
          const parsed = (() => { try { return JSON.parse(output) as { ok?: boolean; error?: string }; } catch { return null; } })();
          ok = parsed ? parsed.ok !== false && !parsed.error : true;
        } catch (e) {
          output = JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
        }
      }
      toolUses.push({ id: call.id, name: call.name, ok, path: pathOf(call.arguments ?? {}) ?? undefined });
      if (ok && EDIT_TOOLS.has(call.name)) {
        const p = pathOf(call.arguments ?? {});
        if (p) touched.add(p);
        if (p) input.onFilesChanged?.([...touched]);
      }
      input.emit({
        type: "agent_interaction", agent_name: "Coder", message_type: "tool_response",
        tool_name: call.name, tool_call_id: call.id, content: output.length > 4_000 ? `${output.slice(0, 4_000)}… (+${output.length - 4_000})` : output, timestamp: Date.now(),
      });
      toolMessages.push({ role: "tool", toolCallId: call.id, name: call.name, content: output });
    }

    messages = [...messages, assistantMessage, ...toolMessages];
  }

  return { text, signal, toolUses, touched: [...touched], produced: producedNow() };
}
