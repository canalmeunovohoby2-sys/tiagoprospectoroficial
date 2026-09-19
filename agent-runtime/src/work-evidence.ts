// Work Evidence (5.28) — evidência REAL do trabalho do agente dentro de uma run.
// Usada pelo Completion Guard para impedir conclusão prematura em tarefas amplas:
// - inspecionou o estado ANTES da primeira alteração (entendeu o projeto)?
// - verificou o resultado DEPOIS da última alteração (testou o que fez)?
// Nenhum número fixo de alterações/ferramentas é exigido aqui — apenas a
// presença/ordem de ações de inspeção e verificação (complexidade real da tarefa
// continua sendo decidida pelo próprio agente).

export interface WorkEventLike {
  type?: string;
  toolName?: string;
  /** id do tool call (para correlacionar started→finished e marcar falha). */
  toolCallId?: string;
  /** false = a tool falhou/bloqueou → NÃO conta como trabalho concluído. */
  ok?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCall?: { toolCallId?: string; toolName?: string; input?: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input?: any;
}

export interface WorkEvidence {
  /** Houve leitura/inspeção do estado antes da primeira alteração? */
  inspectedBeforeEdit: boolean;
  /** Houve verificação (releitura/browser/visual_review) depois da última alteração? */
  verifiedAfterLastEdit: boolean;
  /** Houve verificação por RENDERIZAÇÃO real (browser_* e screenshot/visual_review/browser_measure)
   *  depois da última alteração? Usada p/ tarefas VISUAIS (não basta read-back). */
  renderVerifiedAfterLastEdit?: boolean;
  /** Quantas ações de alteração (write/edit/delete) foram executadas nesta run. */
  editActionCount: number;
  /** Arquivos realmente alterados nesta run (paths distintos). */
  editedPaths: string[];
  /** FASE 7.1 — algum arquivo alterado afeta a RENDERIZAÇÃO (html/css/js/jsx/ts/tsx)? */
  visualEdit?: boolean;
  /** FASE 7.1 — algum ASSET de imagem foi alterado/criado/removido? */
  assetEdit?: boolean;
}

// Extensões que afetam a renderização da página (exigem browser verification).
const VISUAL_EDIT_RE = /\.(html?|css|m?js|c?jsx?|tsx?)$/i;
// Assets de imagem (referências que precisam resolver no navegador).
const ASSET_EDIT_RE = /\.(png|jpe?g|webp|svg|gif|avif|ico)$/i;

export const EDIT_TOOLS = new Set(["write_file", "edit_file", "delete_file", "rename_file", "move_file"]);
export const INSPECT_TOOLS = new Set([
  "list_files",
  "read_file",
  "get_site_context",
  "browser_open",
  "browser_inspect",
  "browser_console",
  "browser_links",
  "browser_eval",
]);
export const VERIFY_TOOLS = new Set([
  "read_file",
  "browser_inspect",
  "browser_console",
  "browser_links",
  "browser_reload",
  "browser_screenshot",
  "browser_eval",
  "visual_review",
  "browser_measure",
  "run_command",
]);
// Verificação de RENDERIZAÇÃO real (browser/screenshot/measure) — o que conta
// como evidência VISUAL para tarefas de layout (FASE 3). read_file NÃO conta aqui.
export const RENDER_VERIFY_TOOLS = new Set([
  "browser_inspect",
  "browser_console",
  "browser_links",
  "browser_reload",
  "browser_screenshot",
  "browser_eval",
  "visual_review",
  "browser_measure",
]);

export function workToolName(e: WorkEventLike): string {
  return e?.toolName ?? e?.toolCall?.toolName ?? "";
}

export function isWorkToolStarted(e: WorkEventLike): boolean {
  // FASE 7 — tool-started ≠ tool-success: uma tool que falhou/bloqueou NÃO conta.
  return e?.type === "tool-started" && !!workToolName(e) && e.ok !== false;
}

/** Nomes (distintos, em ordem) das ferramentas de VERIFICAÇÃO executadas DEPOIS
 *  da última alteração — usados no relatório final ao usuário. */
export function verificationToolsAfterLastEdit(events: WorkEventLike[]): string[] {
  const seq = (events ?? []).filter(isWorkToolStarted).map((e) => workToolName(e));
  let lastEdit = -1;
  for (let i = 0; i < seq.length; i++) if (EDIT_TOOLS.has(seq[i])) lastEdit = i;
  if (lastEdit === -1) return [];
  const names: string[] = [];
  for (let i = lastEdit + 1; i < seq.length; i++) {
    if (VERIFY_TOOLS.has(seq[i]) && !names.includes(seq[i])) names.push(seq[i]);
  }
  return names;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolInputPath(e: WorkEventLike): string {
  const input = e?.toolCall?.input ?? e?.input;
  return typeof input?.path === "string" ? input.path : typeof input?.file === "string" ? input.file : "";
}

/** Extrai a evidência de trabalho da sequência de eventos tool-started da run. */
export function computeWorkEvidence(events: WorkEventLike[]): WorkEvidence {  const seq = (events ?? []).filter(isWorkToolStarted).map((e) => ({ name: workToolName(e), path: toolInputPath(e) }));
  const editIdxs: number[] = [];
  const editedPaths = new Set<string>();
  for (let i = 0; i < seq.length; i++) {
    if (EDIT_TOOLS.has(seq[i].name)) {
      editIdxs.push(i);
      if (seq[i].path) editedPaths.add(seq[i].path);
    }
  }
  if (editIdxs.length === 0) {
    return { inspectedBeforeEdit: false, verifiedAfterLastEdit: false, renderVerifiedAfterLastEdit: false, editActionCount: 0, editedPaths: [], visualEdit: false, assetEdit: false };
  }
  const firstEdit = editIdxs[0];
  const lastEdit = editIdxs[editIdxs.length - 1];
  const inspectedBeforeEdit = seq.slice(0, firstEdit).some((s) => INSPECT_TOOLS.has(s.name));
  const verifiedAfterLastEdit = seq.slice(lastEdit + 1).some((s) => VERIFY_TOOLS.has(s.name));
  const renderVerifiedAfterLastEdit = seq.slice(lastEdit + 1).some((s) => RENDER_VERIFY_TOOLS.has(s.name));
  const paths = [...editedPaths];
  const visualEdit = paths.some((p) => VISUAL_EDIT_RE.test(p) || ASSET_EDIT_RE.test(p));
  const assetEdit = paths.some((p) => ASSET_EDIT_RE.test(p));
  return {
    inspectedBeforeEdit,
    verifiedAfterLastEdit,
    renderVerifiedAfterLastEdit,
    editActionCount: editIdxs.length,
    editedPaths: paths.sort(),
    visualEdit,
    assetEdit,
  };
}

// ── FASE 2 · COBERTURA DO PEDIDO (pedido ↔ alteração real) ───────────────────
// Checagem PRAGMÁTICA (sem NLP): só valida quando o pedido contém um termo
// distintivo verificável (cor nomeada, hex ou trecho entre aspas). Se o pedido
// diz "troque o vermelho por azul" e NENHUM desses termos aparece no diff dos
// arquivos alterados, a alteração NÃO pode ser declarada verificada.
const COLOR_TERMS = new Set([
  "vermelho", "vermelha", "azul", "verde", "amarelo", "amarela", "laranja", "roxo", "roxa", "rosa",
  "preto", "preta", "branco", "branca", "cinza", "marrom", "dourado", "dourada", "prateado", "bege",
  "violeta", "turquesa", "red", "blue", "green", "yellow", "orange", "purple", "pink", "black",
  "white", "gray", "grey", "gold", "silver",
]);
const HEX_RE = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const QUOTED_RE = /["'“”‘’]([^"'“”‘’]{2,40})["'“”‘’]/g;

/** Termos verificáveis do pedido (cores, hex, trechos entre aspas). */
export function distinctiveTerms(instruction: string): string[] {
  const text = String(instruction ?? "").toLowerCase();
  const terms = new Set<string>();
  for (const m of text.matchAll(HEX_RE)) terms.add(m[0].toLowerCase());
  for (const m of text.matchAll(QUOTED_RE)) {
    const v = m[1].trim().toLowerCase();
    if (v.length >= 2) terms.add(v);
  }
  for (const w of text.split(/[^a-zà-ÿ0-9#]+/i)) if (COLOR_TERMS.has(w)) terms.add(w);
  return [...terms];
}

export interface IntentCoverage {
  /** Houve checagem (o pedido tem termo distintivo)? */
  checked: boolean;
  /** O termo do pedido aparece no diff? Sem termos → true (não bloqueia). */
  confirmed: boolean;
  terms: string[];
  matched: string[];
}

// Pedido de SUBSTITUIÇÃO ("troque X por Y"): a evidência precisa estar no estado
// FINAL (Y presente) ou na remoção real de X — não basta X continuar lá.
const REPLACE_VERB = /\b(troque|trocar|substitua|substituir|mude|mudar|altere|alterar|converta|converter|deixe)\b/;
const REPLACE_CONNECTOR = /\b(por|para|em)\b/;

function splitTermsByConnector(text: string, connectorIdx: number, terms: string[]): { sources: string[]; targets: string[] } {
  const sources: string[] = [];
  const targets: string[] = [];
  for (const t of terms) {
    const at = text.indexOf(t);
    if (at >= 0 && at > connectorIdx) targets.push(t);
    else sources.push(t);
  }
  return { sources, targets };
}

/** O resultado REAL cobre os termos distintivos do pedido? */
export function intentCoverage(
  instruction: string,
  before: Record<string, string> | null | undefined,
  after: Record<string, string> | null | undefined,
  touched: string[] | null | undefined,
): IntentCoverage {
  const terms = distinctiveTerms(instruction);
  if (terms.length === 0) return { checked: false, confirmed: true, terms: [], matched: [] };
  const b = before ?? {};
  const a = after ?? {};
  const paths = (touched ?? []).length
    ? (touched ?? [])
    : [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((p) => b[p] !== a[p]);
  const text = String(instruction ?? "").toLowerCase();
  const afterHay = paths.map((p) => a[p] ?? "").join("\n").toLowerCase();
  const diffHay = paths.map((p) => `${b[p] ?? ""}\n${a[p] ?? ""}`).join("\n").toLowerCase();

  const connectorIdx = text.search(REPLACE_CONNECTOR);
  const isReplace = connectorIdx >= 0 && REPLACE_VERB.test(text.slice(0, connectorIdx));
  if (isReplace) {
    const { sources, targets } = splitTermsByConnector(text, connectorIdx, terms);
    if (targets.length) {
      const targetIn = targets.filter((t) => afterHay.includes(t));
      // "vermelho→azul" cumpriu se "azul" está no resultado OU se "vermelho" sumiu.
      const sourceGone = sources.length > 0 && sources.every((t) => !afterHay.includes(t));
      return { checked: true, confirmed: targetIn.length > 0 || sourceGone, terms, matched: targetIn.length ? targetIn : sourceGone ? sources : [] };
    }
  }
  const matched = terms.filter((t) => diffHay.includes(t));
  return { checked: true, confirmed: matched.length > 0, terms, matched };
}
