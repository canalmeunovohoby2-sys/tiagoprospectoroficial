// ORCHESTRATOR do Site Studio — Router → (Planner) → Coder.
//
// Espelha o contrato funcional do DaveLovable (roteamento, plano visível,
// delegação de volta ao Planner), SEM AutoGen e usando a IA validada do
// Prospector. O Coder continua sendo o `ProspectorSiteAgent` (Cline) com TODOS
// os guards existentes; o Planner é uma chamada de modelo sem ferramentas.
//
// Streaming: cada etapa emite `agent_interaction`/`plan` pelo callback `emit`,
// que o servidor conecta ao NDJSON do `/run`. O servidor também observa os
// eventos das ferramentas do Coder (tool_call/tool_response/files_ready).

import type { AgentRunOutcome } from "../prospector-site-agent.js";
import type { BusinessContext } from "../tools.js";
import { routeStudioTask, type StudioRoute, type StudioRouteDecision } from "./router.js";
import { runStudioPlanner } from "./planner.js";
import { buildStudioCoderPrompt } from "./coder.js";

export type StudioEmit = (event: Record<string, unknown>) => void;

export interface StudioOrchestrationInput {
  instruction: string;
  mode: "edit" | "generate";
  /** Blocos de contexto já montados pelo runtime (memória/conversa/anexos). */
  contextPrefix: string;
  /** Caminhos dos arquivos do projeto (contexto do Planner). */
  filePaths: string[];
  business: BusinessContext;
  memory: string[];
  recentChanges: string[];
  ai: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };
  continueSession: boolean;
  /** Executa o Coder (agent.runTask), injetado pelo servidor. */
  runCoder: (prompt: string, opts: { continueSession: boolean }) => Promise<AgentRunOutcome>;
  emit: StudioEmit;
  isCancelled?: () => boolean;
}

export interface StudioOrchestrationResult {
  decision: StudioRouteDecision;
  route: StudioRoute;
  plan: string | null;
  planError: string | null;
  outcome: AgentRunOutcome | null;
  cancelled: boolean;
}

const now = () => Date.now();

function emitInteraction(emit: StudioEmit, agentName: string, messageType: "thought" | "tool_call" | "tool_response", content: string): void {
  emit({
    type: "agent_interaction",
    agent_name: agentName,
    message_type: messageType,
    content,
    timestamp: now(),
  });
}

export async function runStudioOrchestration(input: StudioOrchestrationInput): Promise<StudioOrchestrationResult> {
  const { emit } = input;
  const decision = routeStudioTask({ instruction: input.instruction, mode: input.mode });

  emitInteraction(emit, "Router", "thought", `Roteamento: ${decision.route === "planner" ? "Planner → Coder" : "Coder direto"}. ${decision.reason}`);
  emit({ type: "agent_route", route: decision.route, reason: decision.reason, signals: decision.signals, timestamp: now() });

  if (input.isCancelled?.()) {
    return { decision, route: decision.route, plan: null, planError: null, outcome: null, cancelled: true };
  }

  let plan: string | null = null;
  let planError: string | null = null;

  if (decision.route === "planner") {
    emitInteraction(emit, "Planner", "thought", "Analisando o pedido e montando o plano…");
    const planned = await runStudioPlanner({
      instruction: input.instruction,
      files: input.filePaths,
      business: input.business,
      memory: input.memory,
      recentChanges: input.recentChanges,
      providerId: input.ai.providerId,
      modelId: input.ai.modelId,
      apiKey: input.ai.apiKey,
      baseUrl: input.ai.baseUrl,
    });
    if (planned.ok && planned.plan.trim()) {
      plan = planned.plan.trim();
      emitInteraction(emit, "Planner", "thought", plan);
      emit({ type: "plan", agent_name: "Planner", plan, timestamp: now() });
    } else {
      planError = planned.error ?? "planner indisponível";
      emitInteraction(emit, "Planner", "thought", `Não foi possível montar o plano (${planError}). Executando direto com o Coder.`);
    }
    if (input.isCancelled?.()) {
      return { decision, route: decision.route, plan, planError, outcome: null, cancelled: true };
    }
  }

  const maxRounds = plan ? 2 : 1;
  let outcome: AgentRunOutcome | null = null;

  for (let round = 0; round < maxRounds; round += 1) {
    if (input.isCancelled?.()) {
      return { decision, route: decision.route, plan, planError, outcome, cancelled: true };
    }
    const prompt = buildStudioCoderPrompt({
      instruction: input.instruction,
      contextPrefix: input.contextPrefix,
      plan,
      projectFiles: input.filePaths,
      feedback: round > 0 ? outcome?.reply : undefined,
    });
    emitInteraction(emit, "Coder", "thought", round === 0 ? "Executando o plano no projeto…" : "Reavaliando o plano com o Coder…");
    outcome = await input.runCoder(prompt, { continueSession: round === 0 ? input.continueSession : true });

    if (input.isCancelled?.()) {
      return { decision, route: decision.route, plan, planError, outcome, cancelled: true };
    }

    const wantsReplan = /DELEGATE_TO_PLANNER/i.test(String(outcome?.reply ?? ""));
    if (!wantsReplan || round >= maxRounds - 1) break;

    // O Coder pediu nova estratégia → Planner revisa com o feedback do executor.
    const revised = await runStudioPlanner({
      instruction: input.instruction,
      files: input.filePaths,
      business: input.business,
      memory: input.memory,
      recentChanges: input.recentChanges,
      feedback: String(outcome?.reply ?? "").slice(0, 1_500),
      providerId: input.ai.providerId,
      modelId: input.ai.modelId,
      apiKey: input.ai.apiKey,
      baseUrl: input.ai.baseUrl,
    });
    if (revised.ok && revised.plan.trim()) {
      plan = revised.plan.trim();
      emitInteraction(emit, "Planner", "thought", `Plano revisado:\n${plan}`);
      emit({ type: "plan", agent_name: "Planner", plan, revised: true, timestamp: now() });
    } else {
      planError = revised.error ?? planError;
      break;
    }
  }

  return { decision, route: decision.route, plan, planError, outcome, cancelled: false };
}
