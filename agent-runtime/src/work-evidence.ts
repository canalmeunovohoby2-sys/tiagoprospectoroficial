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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCall?: { toolName?: string; input?: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input?: any;
}

export interface WorkEvidence {
  /** Houve leitura/inspeção do estado antes da primeira alteração? */
  inspectedBeforeEdit: boolean;
  /** Houve verificação (releitura/browser/visual_review) depois da última alteração? */
  verifiedAfterLastEdit: boolean;
  /** Quantas ações de alteração (write/edit/delete) foram executadas nesta run. */
  editActionCount: number;
  /** Arquivos realmente alterados nesta run (paths distintos). */
  editedPaths: string[];
}

export const EDIT_TOOLS = new Set(["write_file", "edit_file", "delete_file"]);
export const INSPECT_TOOLS = new Set([
  "list_files",
  "read_file",
  "get_site_context",
  "browser_open",
  "browser_inspect",
  "browser_console",
  "browser_links",
]);
export const VERIFY_TOOLS = new Set([
  "read_file",
  "browser_inspect",
  "browser_console",
  "browser_links",
  "browser_reload",
  "browser_screenshot",
  "visual_review",
]);

export function workToolName(e: WorkEventLike): string {
  return e?.toolName ?? e?.toolCall?.toolName ?? "";
}

export function isWorkToolStarted(e: WorkEventLike): boolean {
  return e?.type === "tool-started" && !!workToolName(e);
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
    return { inspectedBeforeEdit: false, verifiedAfterLastEdit: false, editActionCount: 0, editedPaths: [] };
  }
  const firstEdit = editIdxs[0];
  const lastEdit = editIdxs[editIdxs.length - 1];
  const inspectedBeforeEdit = seq.slice(0, firstEdit).some((s) => INSPECT_TOOLS.has(s.name));
  const verifiedAfterLastEdit = seq.slice(lastEdit + 1).some((s) => VERIFY_TOOLS.has(s.name));
  return {
    inspectedBeforeEdit,
    verifiedAfterLastEdit,
    editActionCount: editIdxs.length,
    editedPaths: [...editedPaths].sort(),
  };
}
