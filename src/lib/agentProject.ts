// Agent Project (5.12) — expõe o ciclo do "Autonomous Web Design Agent" para a UI
// de forma enxuta e sem duplicar o fluxo existente:
// - ESTADOS DE PROGRESSO: fases reais (analisando/planejando/trabalhando/refinando/validando).
// - MATERIALIZAÇÃO: transforma a spec em arquivos reais do projeto (workspace) p/ ZIP.
// - FERRAMENTAS: runner puro (workspace) reutilizado pela UI em "modo técnico".
//
// A geração/edição por IA continua sendo feita pelas edge functions (generate-site /
// edit-site, que já executam múltiplas passadas com QA). Esta camada apenas conecta
// o ciclo autônomo à experiência, sem alterar o que já funciona.

import { buildProjectFiles } from "./siteExportCore";
import type { SiteSpec } from "@/data/siteProjects";
import {
  runWorkspaceTool, type AgentToolName, type AgentToolResult,
} from "../../supabase/functions/_shared/agent-orchestrator";
import {
  normalizePath, writeFile as wsWrite, editFile as wsEdit,
  type WorkspaceMap,
} from "../../supabase/functions/_shared/agent-workspace";

export type AgentPhaseLabel =
  | "idle" | "analyzing" | "planning" | "implementing" | "building"
  | "reviewing" | "refining" | "validating" | "completed" | "failed";

export type AgentProgress = { phase: AgentPhaseLabel; label: string; detail?: string };

// Rótulos amigáveis que a UI exibe enquanto o agente "trabalha".
export const AGENT_PROGRESS_LABEL: Record<AgentPhaseLabel, string> = {
  idle: "Pronto",
  analyzing: "Analisando o projeto…",
  planning: "Planejando a composição…",
  implementing: "Trabalhando no código…",
  building: "Montando os arquivos do site…",
  reviewing: "Revisando o resultado…",
  refining: "Refinando detalhes…",
  validating: "Validando qualidade…",
  completed: "Finalizado",
  failed: "Não foi possível concluir",
};

// Sequência de fases para a UI durante uma geração.
export const GENERATION_STEPS: AgentProgress[] = [
  { phase: "analyzing", label: AGENT_PROGRESS_LABEL.analyzing, detail: "Entendendo negócio, posicionamento e conversão…" },
  { phase: "planning", label: AGENT_PROGRESS_LABEL.planning, detail: "Definindo direção criativa e arquitetura da página…" },
  { phase: "implementing", label: AGENT_PROGRESS_LABEL.implementing, detail: "A IA está desenhando a experiência…" },
  { phase: "reviewing", label: AGENT_PROGRESS_LABEL.reviewing, detail: "Crítica de qualidade (anti-template/anti-PDF)…" },
  { phase: "refining", label: AGENT_PROGRESS_LABEL.refining, detail: "Corrigindo o que ficou abaixo do padrão…" },
  { phase: "building", label: AGENT_PROGRESS_LABEL.building, detail: "Materializando arquivos do projeto…" },
  { phase: "validating", label: AGENT_PROGRESS_LABEL.validating, detail: "Verificando coerência e dados reais…" },
];

export const EDIT_STEPS: AgentProgress[] = [
  { phase: "analyzing", label: AGENT_PROGRESS_LABEL.analyzing, detail: "Lendo estado atual e histórico da conversa…" },
  { phase: "planning", label: AGENT_PROGRESS_LABEL.planning, detail: "Decidindo o que alterar (preservando o aprovado)…" },
  { phase: "implementing", label: AGENT_PROGRESS_LABEL.implementing, detail: "Aplicando alterações coordenadas…" },
  { phase: "reviewing", label: AGENT_PROGRESS_LABEL.reviewing, detail: "Revisando impacto no restante do site…" },
  { phase: "refining", label: AGENT_PROGRESS_LABEL.refining, detail: "Refinando pontos de qualidade…" },
  { phase: "validating", label: AGENT_PROGRESS_LABEL.validating, detail: "Validando resultado…" },
];

// Materializa a spec em arquivos reais do projeto (Vite) — usado por ZIP/baixar.
export function materializeProjectFiles(spec: SiteSpec, externalAssets: string[] = []): Record<string, string> {
  try {
    return buildProjectFiles(spec as never, {}, externalAssets);
  } catch {
    return {};
  }
}

export function workspaceOf(files: Record<string, string> | undefined): WorkspaceMap {
  const out: WorkspaceMap = {};
  for (const [p, c] of Object.entries(files ?? {})) {
    const n = normalizePath(p);
    if (n && typeof c === "string") out[n] = c;
  }
  return out;
}

// Ferramentas para "modo técnico"/debug na UI (delegam ao runner puro).
export function agentTool(tool: AgentToolName, args: Record<string, unknown>, files: Record<string, string>): AgentToolResult {
  return runWorkspaceTool(tool, args, workspaceOf(files));
}

export function agentWriteFile(files: Record<string, string>, path: string, content: string): { ok: boolean; files: Record<string, string>; message: string } {
  const r = wsWrite(workspaceOf(files), path, content);
  if (r.ok) return { ok: true, files: { ...r.files }, message: r.message ?? "ok" };
  return { ok: false, files, message: r.error ?? "erro" };
}

export function agentEditFile(
  files: Record<string, string>, path: string, find: string, replace: string,
): { ok: boolean; files: Record<string, string>; message: string } {
  const r = wsEdit(workspaceOf(files), path, { find, replace });
  if (r.ok) return { ok: true, files: { ...r.files }, message: r.message ?? "ok" };
  return { ok: false, files, message: r.error ?? "erro" };
}
