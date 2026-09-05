// Completion Guard (5.24) — impede conclusão prematura e "mentira" do agente.
// Arquitetural (hook beforeTool): a tool finish_task só é aceita quando há
// EVIDÊNCIA de execução (arquivos mudaram se a instrução pedia mudança) e, no
// modo generate, quando o Quality Gate está OK. Se não, bloqueia (skip) e
// devolve os problemas ao modelo para corrigir — com limite de retentativas.
//
// Depth Guard (5.28) — tarefas amplas de qualidade/transformação não podem
// finalizar com "mínimo esforço": exige evidência de que o agente INSPECIONOU o
// estado atual antes da primeira alteração e VERIFICOU o resultado depois da
// última alteração. NÃO impõe quantidade fixa de alterações nem número
// artificial de ferramentas — a complexidade real decide o trabalho.
import { assertGenerationQuality } from "./generation-gate";
import { readWorkspace } from "./workspace";
import type { WorkEvidence } from "./work-evidence";

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
  const asks = /adiciona|adicionar|inclui|incluir|cria|criar|coloca|muda|mudar|troca|trocar|deixa|deixar|faz|fazer|fazer\s+um|transforma|reconstruir|refina|refinar|refine|melhora|melhore|melhorar|aprimor|otimiz|reescreve|substitui|remove|apaga|insere|edita|implementa|aplica|aplicar|corrige|corrigir|arruma|arrumar|monta|montar|premium|profissional|sofisticad|primeiro\s+mundo|site\s+completo|site\s+novo/i;
  const justAsks = /^(o\s+que|como|qual|quando|onde|por\s+que|pode|poderia|voc[eê]\s+acha|diga|explique|resuma|liste)/i;
  if (justAsks.test(text)) return false;
  return asks.test(text);
}

// Pedido AMPLO de qualidade/transformação (não cirúrgico)? Ex.: "deixe o site
// premium", "melhore o mobile", "melhore esse site", "faça profissional".
// Pedidos específicos ("troca a cor do botão", "conserta o overflow do hero")
// NÃO são amplos — a quantidade de trabalho é decidida pela complexidade real.
export function isBroadQualityRequest(instruction: string): boolean {
  const text = String(instruction ?? "").trim();
  if (!text) return false;
  const justAsks = /^(o\s+que|como|qual|quando|onde|por\s+que|pode|poderia|voc[eê]\s+acha|diga|explique|resuma|liste)/i;
  if (justAsks.test(text)) return false;
  const goal = /premium|profissional|sofisticad|primeiro\s+mundo|alto\s+n[ií]vel|alta\s+qualidade|melhor|melhora|melhore|melhorar|aprimor|moderniz|otimiz|transform|redesenha|redesign|requint|upgrade|eleva|refin|renov/i;
  return goal.test(text);
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
  /** Evidência real de inspeção/verificação da run (Depth Guard 5.28). */
  work?: WorkEvidence;
}): FinishDecision {
  const max = opts.maxFinishSkips ?? MAX_FINISH_SKIPS_DEFAULT;
  if (opts.finishSkips >= max) {
    // limite de retentativas atingido → deixa finalizar (evita loop), mas avisa.
    return { block: false };
  }
  const files = opts.files ?? (opts.workspaceRoot ? readWorkspace(opts.workspaceRoot) : {});
  const hasStart = !!opts.startFiles;
  const changed = hasStart ? JSON.stringify(opts.startFiles) !== JSON.stringify(files) : true;

  // 1) EVIDÊNCIA: se a instrução pedia mudança e nenhum arquivo mudou nesta run,
  //    o agente não pode afirmar que executou. (aplica a edit E generate)
  const requestedChange = opts.instruction ? instructionRequestsChange(opts.instruction) : false;
  if (requestedChange && hasStart && !changed) {
    return {
      block: true,
      reason: `A instrução pedia uma alteração no site, mas NENHUM arquivo foi modificado nesta execução. Você NÃO pode afirmar que executou. Use as ferramentas (write_file/edit_file) para aplicar a alteração REAL e só então chame finish_task. Se não havia o que mudar, explique por quê sem afirmar que alterou.`,
    };
  }

  // 2) DEPTH GUARD (5.28, modo edit): tarefas amplas não finalizam sem evidência
  //    de que o agente ENTENDEU o estado atual (inspeção antes da 1ª alteração) e
  //    VERIFICOU o resultado (após a última alteração).
  if (opts.mode === "edit" && requestedChange && hasStart && changed && opts.work) {
    const broad = isBroadQualityRequest(opts.instruction ?? "");
    if (broad && opts.work.inspectedBeforeEdit === false) {
      return {
        block: true,
        reason: `Tarefa ampla de qualidade/transformação: você alterou arquivos, mas NÃO há evidência de que inspecionou o estado atual ANTES da primeira alteração. Para um resultado profissional: ENTENDA o projeto (leia os arquivos relevantes com read_file, use list_files/get_site_context e, se envolver aparência/UX, abra o site no navegador) e só então continue e finalize.`,
      };
    }
    if (broad && opts.work.verifiedAfterLastEdit === false) {
      return {
        block: true,
        reason: `Tarefa ampla de qualidade/transformação: você alterou arquivos, mas NÃO há evidência de que verificou o resultado DEPOIS da última alteração. Releia o(s) arquivo(s) alterado(s) ou execute browser_inspect/browser_reload/visual_review (Gemini) para confirmar o resultado e corrigir qualquer problema antes de chamar finish_task.`,
      };
    }
  }

  // 3) QUALITY GATE (generate): estrutura mínima obrigatória.
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
