// Agent Orchestrator (5.12) — coordena o ciclo autônomo do Web Design Agent.
// Puro e testável. O agente NÃO para na primeira resposta: ele planeja,
// executa múltiplas etapas coordenadas, revisa, refina e só então entrega.
// Os "efeitos" (IA, arquivos, build) são injetados por quem executa.

import { listFiles, readFile, searchFiles, writeFile, editFile, deleteFile, renameFile, type WorkspaceMap } from "./agent-workspace.ts";

export type AgentPhase =
  | "idle" | "analyzing" | "planning" | "implementing" | "building"
  | "reviewing" | "refining" | "validating" | "completed" | "failed";

export type AgentToolName =
  | "list_files" | "read_file" | "search_files" | "write_file" | "edit_file"
  | "delete_file" | "rename_file" | "run_build" | "inspect_result" | "save_project";

export interface AgentToolResult {
  ok: boolean;
  message: string;
  files?: WorkspaceMap;
  detail?: unknown;
}

export interface AgentStep {
  tool: AgentToolName;
  args: Record<string, unknown>;
  phase: Exclude<AgentPhase, "completed" | "failed">;
}

export interface AgentPlan {
  id: string;
  goal: string;
  steps: AgentStep[];
  memory?: string[];
}

export interface AgentLimits {
  maxBuildAttempts: number;
  maxRefinementCycles: number;
  maxIterations: number;
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxBuildAttempts: 2,
  maxRefinementCycles: 2,
  maxIterations: 10,
};

export interface OrchestratorState {
  phase: AgentPhase;
  plan: AgentPlan | null;
  currentStep: number;
  buildAttempts: number;
  refinementCycles: number;
  iterations: number;
  notes: string[];
  files: WorkspaceMap;
  error?: string;
  lastTool?: AgentToolResult;
}

export function createOrchestratorState(files?: WorkspaceMap): OrchestratorState {
  return { phase: "idle", plan: null, currentStep: 0, buildAttempts: 0, refinementCycles: 0, iterations: 0, notes: [], files: files ?? {} };
}

// Nomes das fases em linguagem natural para UI (sem expor detalhes).
export const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Pronto",
  analyzing: "Analisando o projeto…",
  planning: "Planejando a composição…",
  implementing: "Trabalhando no código…",
  building: "Gerando a versão do site…",
  reviewing: "Revisando o resultado…",
  refining: "Refinando detalhes…",
  validating: "Validando qualidade…",
  completed: "Finalizado",
  failed: "Não foi possível concluir",
};

export interface ToolRunner {
  (tool: AgentToolName, args: Record<string, unknown>, files: WorkspaceMap): AgentToolResult;
}

// Runner padrão das ferramentas de arquivo (pura, sincronizada).
export function runWorkspaceTool(tool: AgentToolName, args: Record<string, unknown>, files: WorkspaceMap): AgentToolResult {
  switch (tool) {
    case "list_files": {
      const names = listFiles(files);
      return { ok: true, message: `${names.length} arquivo(s)`, detail: names, files };
    }
    case "read_file": {
      const r = readFile(files, String(args.path ?? ""));
      return r.ok ? { ok: true, message: `Lido ${args.path}`, detail: r.content, files } : { ok: false, message: r.error, files };
    }
    case "search_files": {
      const found = searchFiles(files, String(args.query ?? ""));
      return { ok: true, message: `${found.length} resultado(s)`, detail: found.map((f) => f.path), files };
    }
    case "write_file": {
      const r = writeFile(files, String(args.path ?? ""), String(args.content ?? ""));
      return r.ok ? { ok: true, message: r.message ?? "", files: r.files } : { ok: false, message: r.error ?? "Erro", files };
    }
    case "edit_file": {
      const r = editFile(files, String(args.path ?? ""), {
        find: String(args.find ?? ""),
        replace: String(args.replace ?? ""),
        occurrence: typeof args.occurrence === "number" ? args.occurrence : undefined,
      });
      return r.ok ? { ok: true, message: r.message ?? "", files: r.files } : { ok: false, message: r.error ?? "Erro", files };
    }
    case "delete_file": {
      const r = deleteFile(files, String(args.path ?? ""));
      return r.ok ? { ok: true, message: r.message ?? "", files: r.files } : { ok: false, message: r.error ?? "Erro", files };
    }
    case "rename_file": {
      const r = renameFile(files, String(args.from ?? ""), String(args.to ?? ""));
      return r.ok ? { ok: true, message: r.message ?? "", files: r.files } : { ok: false, message: r.error ?? "Erro", files };
    }
    default:
      return { ok: false, message: `Ferramenta ${tool} não implementada no runner padrão.`, files };
  }
}

export interface OrchestratorHooks {
  // Executa a próxima etapa (retorna falso para parar o loop com sucesso antecipado).
  runStep: (state: OrchestratorState, step: AgentStep) => Promise<{ ok: boolean; files?: WorkspaceMap; note?: string }>;
  // Decide se o resultado final é aceitável (QA). Recebe o estado pós-execução.
  isResultAcceptable: (state: OrchestratorState) => Promise<boolean>;
  // Permite derivar nota de refinamento a partir do estado (opcional).
  refinementNote?: (state: OrchestratorState) => string;
}

// Ciclo autônomo: executa o plano; se ao final o QA reprovar, gera um passo de
// refinamento adicional (com nota) e repete — respeitando os limites.
export async function runAgent(
  initial: OrchestratorState,
  plan: AgentPlan,
  hooks: OrchestratorHooks,
  limits: AgentLimits = DEFAULT_AGENT_LIMITS,
): Promise<OrchestratorState> {
  const state: OrchestratorState = { ...initial, phase: "planning", plan, currentStep: 0, notes: [] };
  if (!plan?.steps?.length) {
    state.phase = "failed";
    state.error = "Plano vazio: nada a executar.";
    return state;
  }

  const pushNote = (n: string) => state.notes.push(n);

  while (state.iterations < limits.maxIterations) {
    state.iterations += 1;

    // Executa todos os passos do plano.
    for (; state.currentStep < plan.steps.length; state.currentStep++) {
      const step = plan.steps[state.currentStep];
      state.phase = step.phase;
      const res = await hooks.runStep(state, step);
      if (!res.ok) {
        state.phase = "failed";
        state.error = `Etapa ${step.tool} falhou: ${res.note ?? "sem detalhe"}`;
        state.lastTool = { ok: false, message: state.error };
        return state;
      }
      if (res.files) state.files = res.files;
      if (res.note) pushNote(res.note);
      state.lastTool = { ok: true, message: res.note ?? step.tool };
    }

    // QA / revisão do resultado.
    state.phase = "validating";
    const acceptable = await hooks.isResultAcceptable(state);
    if (acceptable) {
      state.phase = "completed";
      pushNote("Resultado validado.");
      return state;
    }

    // Refinamento automático com nota (não é só um relatório).
    if (state.refinementCycles >= limits.maxRefinementCycles) {
      state.phase = "completed";
      pushNote("Limite de refinamento atingido; entregando melhor versão.");
      return state;
    }
    state.refinementCycles += 1;
    state.currentStep = 0;
    const note = hooks.refinementNote ? hooks.refinementNote(state) : "Elevar o nível geral (composição, hierarquia, identidade, qualidade).";
    pushNote(`Refinamento ${state.refinementCycles}: ${note}`);
    state.phase = "refining";
    plan = { ...plan, id: plan.id, steps: [refinementStep(note)] };
    // estado.plan atualizado para inspeção
    state.plan = plan;
  }

  state.phase = limits.maxBuildAttempts === 0 ? "failed" : "completed";
  if (state.phase === "failed") state.error = "Limite de iterações do agente atingido.";
  return state;
}

function refinementStep(note: string): AgentStep {
  return { tool: "inspect_result", args: { note }, phase: "refining" };
}
