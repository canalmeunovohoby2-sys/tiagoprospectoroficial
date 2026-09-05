// Completion Guard (5.24) — impede conclusão prematura e "mentira" do agente.
// Arquitetural (hook beforeTool): a tool finish_task só é aceita quando há
// EVIDÊNCIA de execução (arquivos mudaram se a instrução pedia mudança) e, no
// modo generate, quando o Quality Gate está OK. Se não, bloqueia (skip) e
// devolve os problemas ao modelo para corrigir — com limite de retentativas.
import { assertGenerationQuality } from "./generation-gate";
import { readWorkspace } from "./workspace";

export interface FinishDecision {
  block: boolean;
  reason?: string;
}

export interface GuardCounters {
  finishSkips: number;
}

export const MAX_FINISH_SKIPS_DEFAULT = 4;

// Heurística: a instrução pede mudança real (não é pergunta/conversa)?
// Usada para detectar "afirmou que alterou mas nada mudou".
export function instructionRequestsChange(instruction: string): boolean {
  const text = String(instruction ?? "").trim();
  if (!text) return false;
  const asks = /adiciona|adicionar|inclui|incluir|cria|criar|coloca|muda|mudar|troca|trocar|deixa|deixar|faz|fazer|fazer\s+um|transforma|reconstruir|refina|refinar|melhora|melhorar|reescreve|substitui|remove|apaga|insere|edita|implementa|aplica|aplicar|corrige|corrigir|arruma|arrumar|monta|montar|premium|profissional|sofisticad|primeiro\s+mundo|site\s+completo|site\s+novo/i;
  const justAsks = /^(o\s+que|como|qual|quando|onde|por\s+que|pode|poderia|voc[eê]\s+acha|diga|explique|resuma|liste)/i;
  if (justAsks.test(text)) return false;
  return asks.test(text);
}

// Decide se finish_task deve ser bloqueado agora.
export function decideFinishBlock(opts: {
  mode: "edit" | "generate";
  files?: Record<string, string>;
  startFiles?: Record<string, string> | null;
  instruction?: string;
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
  const files = opts.files ?? (opts.workspaceRoot ? readWorkspace(opts.workspaceRoot) : {});

  // 1) EVIDÊNCIA: se a instrução pedia mudança e nenhum arquivo mudou nesta run,
  //    o agente não pode afirmar que executou. (aplica a edit E generate)
  const requestedChange = opts.instruction ? instructionRequestsChange(opts.instruction) : false;
  if (requestedChange && opts.startFiles) {
    const changed = JSON.stringify(opts.startFiles) !== JSON.stringify(files);
    if (!changed) {
      return {
        block: true,
        reason: `A instrução pedia uma alteração no site, mas NENHUM arquivo foi modificado nesta execução. Você NÃO pode afirmar que executou. Use as ferramentas (write_file/edit_file) para aplicar a alteração REAL e só então chame finish_task. Se não havia o que mudar, explique por quê sem afirmar que alterou.`,
      };
    }
  }

  // 2) QUALITY GATE (generate): estrutura mínima obrigatória.
  if (opts.mode !== "generate") return { block: false };
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
