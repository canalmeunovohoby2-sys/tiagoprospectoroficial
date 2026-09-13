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
import { classifyTask } from "./visual-task.js";

export type FinishBlockKind =
  | "evidence" | "image" | "inspect" | "verify" | "visual" | "regression" | "quality" | "console" | "images";

export interface FinishDecision {
  block: boolean;
  reason?: string;
  kind?: FinishBlockKind;
  /** true = o limite de tentativas foi atingido e ainda há gate crítico falhando.
   * O runtime DEVE encerrar a run com resposta honesta (nunca declarar sucesso). */
  terminal?: boolean;
}

export interface GuardCounters {
  finishSkips: number;
}

export const MAX_FINISH_SKIPS_DEFAULT = 4;
export const MAX_VISUAL_ITERATIONS_DEFAULT = 3;

// Heurística: a instrução pede mudança real (não é pergunta/conversa)?
// Usada para detectar "afirmou que alterou mas nada mudou".
//
// ESTRUTURAL (não depende de listar cada palavra): qualquer instrução que NÃO
// seja pergunta/explicação nem conversa fiada é tratada como pedido de alteração.
// Assim, pedidos naturais (ex.: "o site está muito parado, queria que as coisas
// aparecessem conforme eu rolo") armam os guards de evidência/verificação — quem
// decide a IMPLEMENTAÇÃO é o modelo, não uma palavra-chave.
const PURE_CHATTER = /^(ok(ay)?|beleza|blz|valeu|vlw|obrigad[oa]|brigad[oa]|muito obrigad[oa]|de nada|legal|bacana|show|perfeito|muito bom|ótimo|otimo|top|boa|certo|entendi|entendido|combinado|isso mesmo|isso|sim|não|nao|nada|tudo bem|bom dia|boa tarde|boa noite)[\s!.,?]*$/i;
const EXPLAIN_ASK = /^(me\s+)?(explica|explique|explicar|resuma|resume|resumir|liste|lista|listar|diga|dizer|conte|contar|fale|falar|descreva|descrever|mostre|mostrar|ensina|ensine|ensinar)\b/i;
// Sinal de AÇÃO/DESEJO: usado só para decidir se uma pergunta é, na verdade, um
// pedido ("pode colocar animações?"). NÃO é uma whitelist de tarefas.
const ACTION_HINT = /coloc|adicion|inclu|cria|criar|faz|fazer|fa[çc]a|muda|mudar|mude|troc|altera|ajust|deixa|deixar|deixe|remov|apaga|aument|diminu|reduz|move|moviment|anim|efeito|transi[çc]|hover|fade|reveal|scroll|\brol|desliz|aparec|surgi|entrar|entrando|din[aâ]mic|quero|queria|gostaria|preciso|implementa|aplica/i;
// Instruções de SOMENTE LEITURA (análise/relatório) NÃO são pedido de mudança.
const READ_ONLY = /somente\s+leitura|s[oó]\s+leitura|n[aã]o\s+altere\s+nenhum|n[aã]o\s+alterar\s+nenhum|n[aã]o\s+modifique\s+nenhum|n[aã]o\s+edite\s+nenhum|n[aã]o\s+use\s+(?:write_file|edit_file|delete_file|write|edit|delete)|apenas\s+(?:analis|relat|leitura)|somente\s+(?:analis|relat|leitura)/i;
const ANALYZE_LEAD = /^(?:fa[çc]a\s+uma\s+)?(?:an[aá]lise|analise|analisa|avalie|avalia|revise|revisa|audite|audita|diagnostique|inspecione)\b/i;

export function instructionRequestsChange(instruction: string): boolean {
  const text = String(instruction ?? "").trim();
  if (!text) return false;
  // Conversa fiada / agradecimento puro → não é pedido de alteração.
  if (PURE_CHATTER.test(text)) return false;
  // Análise/relatório SOMENTE LEITURA → não é pedido de alteração.
  if (READ_ONLY.test(text)) return false;
  if (ANALYZE_LEAD.test(text) && !ACTION_HINT.test(text)) return false;
  // Pergunta/explicação SEM sinal de ação → não é pedido de alteração.
  const looksQuestion = /\?\s*$/.test(text) || EXPLAIN_ASK.test(text);
  if (looksQuestion && !ACTION_HINT.test(text)) return false;
  // Qualquer outra instrução é tratada como pedido de alteração.
  return true;
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
// FASE 7 — CONFIABILIDADE: NÃO existe bypass por limite de tentativas. Os gates
// são avaliados em TODAS as tentativas. Ao atingir o limite, gates ainda falhos
// retornam `terminal: true` → o runtime encerra a run com resposta HONESTA e
// NUNCA declara sucesso sem prova.
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
  /** Iterações do ciclo visual já realizadas (verificação por renderização). */
  visualIterations?: number;
  /** Máximo de iterações visuais consecutivas (evita loop). */
  maxVisualIterations?: number;
  /** Erros de console observados no último inspect do browser (real, se houver). */
  consoleErrors?: string[] | null;
  /** Nº de imagens que falharam ao carregar no último inspect (real, se houver). */
  brokenImages?: number | null;
}): FinishDecision {
  const max = opts.maxFinishSkips ?? MAX_FINISH_SKIPS_DEFAULT;
  const terminal = opts.finishSkips >= max;
  const blocked = (kind: FinishBlockKind, reason: string): FinishDecision => ({ block: true, kind, reason, terminal });

  const files = opts.files ?? (opts.workspaceRoot ? readWorkspace(opts.workspaceRoot) : {});
  const hasStart = !!opts.startFiles;
  const changed = hasStart ? JSON.stringify(opts.startFiles) !== JSON.stringify(files) : true;
  const requestedChange = opts.instruction ? instructionRequestsChange(opts.instruction) : false;

  // 1) EVIDÊNCIA (aplica em TODAS as tentativas): pedia mudança e nada mudou.
  if (requestedChange && hasStart && !changed) {
    return blocked("evidence", `A instrução pedia uma alteração no site, mas NENHUM arquivo foi modificado nesta execução. Você NÃO pode afirmar que executou. Use as ferramentas (write_file/edit_file) para aplicar a alteração REAL e só então chame finish_task. Se o estado pedido JÁ estava correto ou não havia o que mudar, finalize dizendo isso claramente (sem afirmar que alterou).`);
  }

  // 2) IMAGE SWAP GUARD (5.35) — todas as tentativas.
  if (opts.mode === "edit" && hasStart && changed && opts.startFiles && requestedChange) {
    const wantsSwap = requestsImageSwap(opts.instruction ?? "");
    if (wantsSwap && !hasImageReferenceChange(opts.startFiles, files)) {
      return blocked("image", `Você foi solicitado a TROCAR/SUBSTITUIR uma imagem, mas o CONJUNTO de imagens no código não mudou (nenhuma URL de imagem foi substituída). Localize o elemento solicitado, altere de verdade a URL/path da imagem com edit_file e verifique no navegador antes de chamar finish_task. Se a imagem já era a correta, finalize dizendo que ela já estava assim.`);
    }
  }

  // 3) DEPTH + VERACIDADE ABSOLUTA (6.0) — todas as tentativas.
  if (opts.mode === "edit" && requestedChange && hasStart && changed && opts.work) {
    const broad = isBroadQualityRequest(opts.instruction ?? "");
    const imageSwap = requestsImageSwap(opts.instruction ?? "");
    const bugFix = isBugReport(opts.instruction ?? "");
    if ((broad || imageSwap || bugFix) && opts.work.inspectedBeforeEdit === false) {
      return blocked("inspect", `Esta tarefa alterou arquivos, mas NÃO há evidência de que inspecionou o estado atual ANTES da primeira alteração. ${bugFix ? "Para um DEFEITO/BUG: reproduza o problema antes de mexer — abra o site no navegador (browser_open/browser_eval) e leia os arquivos envolvidos para confirmar a causa raiz. " : ""}ENTENDA o projeto: leia os arquivos relevantes com read_file (e, se envolver aparência/UX/imagem, abra o site no navegador) para localizar o elemento/foto exato — só então continue e finalize.`);
    }
    if (opts.work.verifiedAfterLastEdit === false) {
      return blocked("verify", `Esta tarefa alterou arquivos, mas NÃO há evidência de VERIFICAÇÃO do resultado DEPOIS da última alteração. Texto do modelo NÃO é evidência: releia o(s) arquivo(s) alterado(s) (read_file) e/ou execute browser_reload/browser_inspect/visual_review para CONFIRMAR que a mudança está realmente aplicada e atende ao objetivo antes de chamar finish_task.${bugFix ? " Para um DEFEITO/BUG: recarregue o site (browser_reload) e reproduza o mesmo passo (ex.: browser_eval no clique) para confirmar que o problema sumiu." : ""}`);
    }
  }

  // 3b) BROWSER VERIFICATION OBRIGATÓRIA (FASE 7/7.1) — qualquer alteração
  //     VISUAL/ASSET (html/css/js ou imagem), tarefa VISUAL ou troca de imagem
  //     exige evidência REAL de renderização DEPOIS da última alteração. A
  //     evidência anterior à última edição é considerada STALE e não vale.
  const taskClass = classifyTask(opts.instruction ?? "");
  const imageSwapTask = requestsImageSwap(opts.instruction ?? "");
  const visualFilesChanged = !!opts.work?.visualEdit;
  const browserRequired = taskClass === "visual" || imageSwapTask || visualFilesChanged;
  if (opts.mode === "edit" && browserRequired && requestedChange && hasStart && changed && opts.work) {
    if (!opts.work.renderVerifiedAfterLastEdit) {
      const maxVis = opts.maxVisualIterations ?? MAX_VISUAL_ITERATIONS_DEFAULT;
      const exhausted = (opts.visualIterations ?? 0) >= maxVis;
      if (exhausted) {
        // Esgotou os ciclos SEM obter evidência real → FAILED_TO_VERIFY (terminal):
        // nunca "acabou as tentativas → pronto".
        return { block: true, kind: "visual", terminal: true, reason: `Alteração VISUAL/ASSET${opts.work.assetEdit ? " (imagem)" : ""}: o limite de ${maxVis} ciclos foi atingido e NÃO foi possível obter RENDER/INSPEÇÃO real do navegador depois da última alteração. A verificação FALHOU — não é possível concluir com segurança.` };
      }
      return blocked("visual", `Esta alteração afeta a RENDERIZAÇÃO${opts.work.assetEdit ? " (imagem/asset)" : ""} e NÃO há evidência real do navegador DEPOIS da última alteração (evidência anterior à edição é STALE). Obrigatório: browser_reload/browser_open → browser_inspect/browser_console/browser_links (ou browser_screenshot/visual_review/browser_measure) e confirmar console sem erros e imagens carregando antes de chamar finish_task. Não conclua apenas porque o código/arquivo mudou.`);
    }
  }

  // 3c) CONSOLE ERRORS — bloqueiam conclusão quando há evidência real do browser.
  if (Array.isArray(opts.consoleErrors) && opts.consoleErrors.length > 0) {
    const sample = opts.consoleErrors.slice(0, 8).map((e) => `- ${e}`).join("\n");
    return blocked("console", `O site renderizado apresenta ERROS DE CONSOLE (${opts.consoleErrors.length}). Não é possível declarar concluído com JavaScript/assets/módulos quebrados. Use browser_console para os detalhes, corrija a causa e valide de novo antes de finish_task:\n${sample}`);
  }

  // 3d) IMAGENS QUEBRADAS — bloqueiam conclusão quando há evidência real do browser.
  if (typeof opts.brokenImages === "number" && opts.brokenImages > 0) {
    return blocked("images", `O site renderizado tem ${opts.brokenImages} imagem(ns) que NÃO carregaram (referência inexistente/404). Corrija ou remova a referência (use browser_links para a lista) antes de finalizar.`);
  }

  // 4) REGRESSION GUARD (5.30) — todas as tentativas. EDITAR ≠ RECONSTRUIR.
  if (opts.mode === "edit" && hasStart && changed && opts.startFiles) {
    const regressions = editRegressionIssues(opts.startFiles, files, opts.instruction ?? "");
    if (regressions.length > 0) {
      return blocked("regression", `REGRESSÃO detectada na edição — você NÃO pode finalizar assim. EDITAR ≠ RECONSTRUIR: preserve o trabalho existente e modifique só o necessário. Corrija/restaure antes de chamar finish_task novamente:\n${regressions.map((r) => `- ${r}`).join("\n")}`);
    }
  }

  // 5) QUALITY GATE (generate) — todas as tentativas.
  if (opts.mode !== "generate") return { block: false };
  const gate = assertGenerationQuality(files, {
    segment: opts.segment ?? "",
    name: opts.name ?? "",
    businessHas: (field) => (field === "hours" ? !!opts.businessHasHours : true),
  });
  if (gate.ok) return { block: false };
  return blocked("quality", `A revisão automática ainda detecta problemas obrigatórios antes de finalizar. Corrija TODOS e só então chame finish_task novamente:\n${gate.issues.map((i) => `- ${i}`).join("\n")}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERPRETAÇÃO DA CONCLUSÃO (resposta final ao usuário)
//
// Regra central: "não verificado" ≠ "falhou". A ausência de finish_task é
// ausência de CONFIRMAÇÃO FORMAL — não é prova de que a alteração falhou.
// Só declaramos falha quando há EVIDÊNCIA concreta (gate bloqueou, regressão
// detectada ou erro real de ferramenta). Nada aqui relaxa os gates: eles rodam
// antes e continuam bloqueando; isto só traduz o estado final em linguagem
// honesta.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompletionState {
  mode: "edit" | "generate" | string;
  /** Motivo terminal de um guard concreto (gate/regressão/visual/console) — null quando não houve. */
  terminalReason: string | null;
  /** A missão pedia alteração/layout (verificação faz sentido). */
  verificationRequired: boolean;
  /** Algum arquivo mudou nesta execução. */
  changeApplied: boolean;
  /** finish_task executado E aprovado pelos gates. */
  finishTaskCalled: boolean;
  /** Alguma ferramenta terminou com erro real (tool-result isError). */
  toolFailure: boolean;
  toolFailureDetail?: string | null;
  /** Arquivos alterados nesta execução (para a mensagem honesta). */
  touched: string[];
  /** Arquivos realmente editados (work evidence) — usado no relatório. */
  editedPaths?: string[];
  /** Ferramentas de verificação executadas APÓS a última edição (nomes). */
  verificationTools?: string[];
  /** Houve verificação por RENDERIZAÇÃO real (browser) após a última edição. */
  renderVerified?: boolean;
  /** A alteração afeta renderização (html/css/js/assets). */
  visualEdit?: boolean;
}

export interface CompletionStates {
  change_applied: boolean;
  verification_required: boolean;
  verification_performed: boolean;
  verification_passed: boolean;
  regression_detected: boolean;
  tool_failure: boolean;
  finish_task_called: boolean;
}

export interface CompletionVerdict {
  ok: boolean;
  /** Mensagem honesta a exibir. `null` = use a resposta do modelo (sucesso normal). */
  reply: string | null;
  /** Só é preenchido quando é FALHA real — nunca para "não verificado". */
  error: string | null;
  unverified: boolean;
  states: CompletionStates;
}

// ── RELATÓRIO FINAL DA EDIÇÃO (closed-loop: o que mudou + verificação) ──────
export interface ChangeReportInput {
  editedPaths: string[];
  verificationTools: string[];
  renderVerified: boolean;
  visualEdit: boolean;
  /** finish_task aprovado = verificação formal concluída. */
  verified: boolean;
}

export function buildChangeReport(i: ChangeReportInput): string {
  const files = (i.editedPaths ?? []).filter(Boolean);
  const verifs = [...new Set(i.verificationTools ?? [])];
  const lines: string[] = [];
  lines.push("Fiz a alteração no projeto.");
  lines.push("Arquivos alterados:");
  lines.push(files.length ? files.slice(0, 15).map((f) => `- ${f}`).join("\n") : "- (nenhum arquivo registrado)");
  if (verifs.length > 0) {
    const how = i.renderVerified ? "render conferido no navegador" : "verificação por ferramentas";
    lines.push(`Verificação: ${how} (${verifs.join(", ")}).`);
  } else if (i.visualEdit) {
    lines.push("Verificação: não houve verificação visual no navegador nesta execução.");
  } else {
    lines.push("Verificação: não executada nesta execução.");
  }
  lines.push(
    i.verified
      ? "Resultado: alteração aplicada e validada."
      : "Resultado: alteração aplicada. A verificação final formal não foi concluída, então não vou afirmar que foi validada.",
  );
  if (i.visualEdit && !i.renderVerified) lines.push("Observação: confirme o resultado visual no navegador (desktop e mobile).");
  return lines.join("\n");
}

export function classifyCompletion(s: CompletionState): CompletionVerdict {
  const terminal = s.terminalReason ?? null;
  const unverified = !terminal && s.verificationRequired && !s.finishTaskCalled;
  const states: CompletionStates = {
    change_applied: s.changeApplied,
    verification_required: s.verificationRequired,
    verification_performed: s.finishTaskCalled,
    verification_passed: s.finishTaskCalled,
    regression_detected: !!terminal,
    tool_failure: s.toolFailure,
    finish_task_called: s.finishTaskCalled,
  };

  // 1) BLOQUEIO CONCRETO (gate/regressão/visual/console no limite): falha real.
  if (terminal) {
    return { ok: false, reply: terminal, error: terminal, unverified: false, states };
  }

  // 2) FALHA REAL DE FERRAMENTA: relata (não finge sucesso, não mascara).
  if (s.toolFailure) {
    const detail = s.toolFailureDetail ? ` Detalhe: ${s.toolFailureDetail}.` : "";
    const partial = s.changeApplied ? " A alteração pode ter ficado parcial." : "";
    const msg = `Não concluí a alteração: uma ferramenta falhou durante a execução.${partial}${detail}`.trim();
    return { ok: false, reply: msg, error: msg, unverified, states };
  }

  // 3) EDIÇÃO SEM falha concreta. Fecha o ciclo com um RELATÓRIO CLARO:
  //    o que mudou, arquivos, verificação e resultado. Se nada mudou apesar do
  //    pedido, explica objetivamente (sem "refaça"). Se foi só conversa/análise
  //    (não pedia alteração), deixa a resposta do modelo.
  if (s.mode !== "generate") {
    if (s.changeApplied) {
      const msg = buildChangeReport({
        editedPaths: (s.editedPaths && s.editedPaths.length ? s.editedPaths : s.touched).filter(Boolean),
        verificationTools: s.verificationTools ?? [],
        renderVerified: s.renderVerified === true,
        visualEdit: s.visualEdit === true,
        verified: s.finishTaskCalled,
      });
      return { ok: true, reply: msg, error: null, unverified, states };
    }
    if (s.verificationRequired) {
      const msg = "Nada foi alterado nesta execução. Se você pediu uma mudança, eu não localizei/apontei o elemento ou arquivo correspondente (ou a alteração já estava aplicada). Diga o texto, seção, elemento ou arquivo exato — ou uma referência mais específica — e eu aplico a alteração.";
      return { ok: true, reply: msg, error: null, unverified, states };
    }
    return { ok: true, reply: null, error: null, unverified: false, states };
  }

  // 4) GERAÇÃO sem finish_task: comportamento ATUAL preservado (o server decide).
  if (unverified) {
    const msg = "Não concluí a VERIFICAÇÃO FINAL desta alteração (finish_task não foi executado com os gates aprovados). Por segurança, NÃO declaro a tarefa como concluída — revise ou refaça a alteração.";
    return { ok: false, reply: msg, error: msg, unverified, states };
  }

  // 5) Geração com verificação formal concluída (ou nada a verificar).
  return { ok: true, reply: null, error: null, unverified: false, states };
}
