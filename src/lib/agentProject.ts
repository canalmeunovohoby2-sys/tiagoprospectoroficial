// Agent Project (5.12) — expõe o ciclo do "Autonomous Web Design Agent" para a UI
// de forma enxuta, sem duplicar o fluxo existente:
// - ESTADOS DE PROGRESSO: fases reais (analisando/planejando/trabalhando/refinando/validando).
// - MATERIALIZAÇÃO: transforma a spec em arquivos reais do projeto (workspace) p/ ZIP.
//
// C7: os helpers de "modo técnico" que importavam runners das Edge Functions
// (`supabase/functions/_shared/agent-*`) foram REMOVIDOS — não tinham nenhum
// consumidor e puxavam código de edge para o bundle do navegador. A geração/edição
// por IA continua nas edge functions (generate-site / edit-site) para o Static.

import { buildProjectFiles } from "./siteExportCore";
import type { SiteSpec } from "@/data/siteProjects";

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
