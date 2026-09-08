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
import { assertGenerationQuality } from "./generation-gate.js";
import { readWorkspace } from "./workspace.js";
import type { WorkEvidence } from "./work-evidence.js";
import { editRegressionIssues, hasImageReferenceChange, requestsImageSwap } from "./regression-guard.js";

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
  const asks = /adiciona|adicionar|adicione|inclui|incluir|inclua|cria|criar|crie|coloca|colocar|coloque|muda|mudar|mude|troca|trocar|troque|remove|remover|remova|apaga|apagar|apague|deixa|deixar|deixe|faz|fazer|fa[cç]a|transforma|transformar|reconstruir|refina|refinar|refine|melhora|melhore|melhorar|aprimor|otimiz|reescreve|reescrever|substitui|substituir|insere|inserir|edita|editar|edite|implementa|implementar|aplica|aplicar|corrige|corrigir|arruma|arrumar|monta|montar|monte|premium|profissional|sofisticad|primeiro\s+mundo|site\s+completo|site\s+novo/i;
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

// Detecta PEDIDO DE CORREÇÃO DE DEFEITO/BUG em projeto existente. Exige o fluxo
// completo: reproduzir → investigar → corrigir → testar de novo. Nunca "pedir o
// código ao usuário" (o workspace já contém os arquivos do projeto).
export function isBugReport(instruction: string): boolean {
  const text = String(instruction ?? "").trim();
  if (!text) return false;
  const asks = /(bug|defeito|quebra|quebrad|tela preta|f[íi]ca preto|fica preta|escurece|desaparec|sumiu|some\b|n[aã]o funciona|n[aã]o est[áa] (abrindo|carregando|funcionando)|n[aã]o clica|clique n[aã]o|bot[aã]o n[aã]o|conserta|corrige|corrigir|arruma|arrumar|erro\b|erros?\s*de\s*console|erro de javascript|overlay|modal n[aã]o|menu n[aã]o|link n[aã]o|âncora? n[aã]o|n[aã]o aparece|n[aã]o renderiza|desalinh|some ao clicar|quando clico)/i;
  const justAsks = /^(o\s+que|como|qual|quando|onde|por\s+que|pode|poderia|voc[eê]\s+acha|diga|explique|resuma|liste)/i;
  if (justAsks.test(text)) return false;
  return asks.test(text);
}

// Detecta resposta do agente que PEDE o código/arquivos ao usuário (proibido:
// o workspace já tem o projeto).
export function replyAsksForCode(reply: string): boolean {
  const text = String(reply ?? "");
  return /(envie|mande|coloque|compartilhe|preciso\s+(que\s+voc[eê]\s+envie|ver\s+o\s+c[óo]digo|dos?\s+arquivos|do\s+html|do\s+css|do\s+js)|me\s+envie\s+(o|os|a)\s+(c[óo]digo|arquivos|html|css|js)|n[aã]o\s+tenho\s+acesso\s+aos?\s+(arquivos|c[óo]digo|html|js|css)|sem\s+acesso\s+ao\s+projeto)/i.test(text);
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
  // Bloqueia a PRIMEIRA tentativa (força o modelo a reavaliar); na segunda, se
  // ainda não houver mudança, o guard deixa finalizar e o runTask reescreve a
  // resposta final para ser HONESTA (nunca afirmar o que não aconteceu).
  const requestedChange = opts.instruction ? instructionRequestsChange(opts.instruction) : false;
  if (requestedChange && hasStart && !changed && opts.finishSkips === 0) {
    return {
      block: true,
      reason: `A instrução pedia uma alteração no site, mas NENHUM arquivo foi modificado nesta execução. Você NÃO pode afirmar que executou. Use as ferramentas (write_file/edit_file) para aplicar a alteração REAL e só então chame finish_task. Se o estado pedido JÁ estava correto ou não havia o que mudar, finalize dizendo isso claramente (sem afirmar que alterou).`,
    };
  }

  // 2) IMAGE SWAP GUARD (5.35): pedido explícito de trocar/substituir imagem só
  //    finaliza com evidência de que uma referência de imagem MUDOU no código.
  if (opts.mode === "edit" && hasStart && changed && opts.startFiles && requestedChange) {
    const wantsSwap = requestsImageSwap(opts.instruction ?? "");
    if (wantsSwap && !hasImageReferenceChange(opts.startFiles, files) && opts.finishSkips === 0) {
      return {
        block: true,
        reason: `Você foi solicitado a TROCAR/SUBSTITUIR uma imagem, mas o CONJUNTO de imagens no código não mudou (nenhuma URL de imagem foi substituída). Localize o elemento solicitado, altere de verdade a URL/path da imagem com edit_file e verifique no navegador antes de chamar finish_task. Se a imagem já era a correta, finalize dizendo que ela já estava assim.`,
      };
    }
  }

  // 3) DEPTH GUARD (5.28, modo edit): tarefas amplas — e pedidos de TROCA DE
  //    IMAGEM/FOTO — não finalizam sem evidência de que o agente ENTENDEU o
  //    estado atual (inspeção antes da 1ª alteração).
  //    VERACIDADE ABSOLUTA (6.0): QUALQUER edição que alterou arquivos exige
  //    verificação do resultado DEPOIS da última alteração (read-back ou
  //    browser/visual_review) — aplica-se a TODA tarefa de mudança, não só às
  //    amplas/imagem/bug. Texto do modelo NÃO é evidência.
  if (opts.mode === "edit" && requestedChange && hasStart && changed && opts.work) {
    const broad = isBroadQualityRequest(opts.instruction ?? "");
    const imageSwap = requestsImageSwap(opts.instruction ?? "");
    const bugFix = isBugReport(opts.instruction ?? "");
    if ((broad || imageSwap || bugFix) && opts.work.inspectedBeforeEdit === false) {
      return {
        block: true,
        reason: `Esta tarefa alterou arquivos, mas NÃO há evidência de que inspecionou o estado atual ANTES da primeira alteração. ${bugFix ? "Para um DEFEITO/BUG: reproduza o problema antes de mexer — abra o site no navegador (browser_open/browser_eval) e leia os arquivos envolvidos para confirmar a causa raiz. " : ""}ENTENDA o projeto: leia os arquivos relevantes com read_file (e, se envolver aparência/UX/imagem, abra o site no navegador) para localizar o elemento/foto exato — só então continue e finalize.`,
      };
    }
    if (opts.work.verifiedAfterLastEdit === false) {
      return {
        block: true,
        reason: `Esta tarefa alterou arquivos, mas NÃO há evidência de VERIFICAÇÃO do resultado DEPOIS da última alteração. Texto do modelo NÃO é evidência: releia o(s) arquivo(s) alterado(s) (read_file) e/ou execute browser_reload/browser_inspect/visual_review para CONFIRMAR que a mudança está realmente aplicada e atende ao objetivo antes de chamar finish_task.${bugFix ? " Para um DEFEITO/BUG: recarregue o site (browser_reload) e reproduza o mesmo passo (ex.: browser_eval no clique) para confirmar que o problema sumiu." : ""}`,
      };
    }
  }

  // 4) REGRESSION GUARD (5.30, modo edit): EDITAR ≠ RECONSTRUIR. Uma edição não
  //    pode desmontar o site existente (imagens, seções, nav, footer, CTAs,
  //    efeitos, responsividade, conteúdo). Se houver regressão grave, bloqueia a
  //    conclusão e o agente deve corrigir/restaurar antes de finalizar.
  if (opts.mode === "edit" && hasStart && changed && opts.startFiles) {
    const regressions = editRegressionIssues(opts.startFiles, files, opts.instruction ?? "");
    if (regressions.length > 0) {
      return {
        block: true,
        reason: `REGRESSÃO detectada na edição — você NÃO pode finalizar assim. EDITAR ≠ RECONSTRUIR: preserve o trabalho existente e modifique só o necessário. Corrija/restaure antes de chamar finish_task novamente:\n${regressions.map((r) => `- ${r}`).join("\n")}`,
      };
    }
  }

  // 5) QUALITY GATE (generate): estrutura mínima obrigatória.
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
