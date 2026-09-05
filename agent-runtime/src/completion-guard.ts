// Completion Guard (5.24) — impede conclusão prematura e "mentira" do agente.
// Arquitetural (hook beforeTool): no modo generate, a tool finish_task só é
// aceita quando a evidência real (arquivos + Quality Gate) está OK. Se não,
// o guard bloqueia (skip) e devolve os problemas ao modelo para corrigir —
// máximo de retentativas para não virar loop infinito.
import { assertGenerationQuality } from "./generation-gate";
import { readWorkspace } from "./workspace";

export interface FinishDecision {
  block: boolean;
  reason?: string;
}

export interface GuardCounters {
  finishSkips: number;
}

export const MAX_FINISH_SKIPS_DEFAULT = 3;

// Decide se finish_task deve ser bloqueado agora.
export function decideFinishBlock(opts: {
  mode: "edit" | "generate";
  files?: Record<string, string>;
  workspaceRoot?: string;
  segment?: string;
  name?: string;
  businessHasHours?: boolean;
  finishSkips: number;
  maxFinishSkips?: number;
}): FinishDecision {
  const max = opts.maxFinishSkips ?? MAX_FINISH_SKIPS_DEFAULT;
  if (opts.finishSkips >= max) {
    // limite de retentativas atingido → deixa finalizar (evita loop), mas avisa.
    return { block: false };
  }
  if (opts.mode !== "generate") {
    // No modo edição, mudanças cirúrgicas (ex.: trocar texto) não exigem o gate
    // de geração completa (imagens/CTA/etc). O agente trabalha nos arquivos.
    return { block: false };
  }
  const files = opts.files ?? (opts.workspaceRoot ? readWorkspace(opts.workspaceRoot) : {});
  const gate = assertGenerationQuality(files, {
    segment: opts.segment ?? "",
    name: opts.name ?? "",
    businessHas: (field) => (field === "hours" ? !!opts.businessHasHours : true),
  });
  if (gate.ok) return { block: false };
  return {
    block: true,
    reason: `A revisão automática ainda detecta problemas obrigatórios antes de finalizar. Corrija TODOS e só então chame finish_task novamente:\n${gate.issues.map((i) => `- ${i}`).join("\n")}`,
  };
}
