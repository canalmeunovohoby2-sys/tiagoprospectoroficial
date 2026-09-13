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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolInputPath(e: WorkEventLike): string {
  const input = e?.toolCall?.input ?? e?.input;
  return typeof input?.path === "string" ? input.path : typeof input?.file === "string" ? input.file : "";
}

/** Extrai a evidência de trabalho da sequência de eventos tool-started da run. */
export function computeWorkEvidence(events: WorkEventLike[]): WorkEvidence {
  const seq = (events ?? []).filter(isWorkToolStarted).map((e) => ({ name: workToolName(e), path: toolInputPath(e) }));
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
