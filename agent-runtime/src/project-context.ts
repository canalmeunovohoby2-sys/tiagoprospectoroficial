// ============================================================================
// CONTEXTO PERSISTENTE POR PROJETO (chat de edição).
//
// Fonte de verdade do TEXTO do site = workspace/arquivos reais. Este módulo só
// mantém MEMÓRIA COMPACTA (decisões/preferências) e HISTÓRICO ESTRUTURADO de
// alterações — injetados no prompt para dar continuidade a conversas longas sem
// reenviar o chat inteiro ao modelo. Tudo isolado por projectId.
// ============================================================================

/** conversation_id reservado ao CONTEXTO do projeto (não é uma conversa real). */
export const PROJECT_CONTEXT_CONV = "00000000-0000-0000-0000-0000000000c7";

export interface ChangeEntry {
  instruction: string;
  files: string[];
  summary: string;
  at: string;
}

export interface ProjectContext {
  memory: string[];
  changes: ChangeEntry[];
}

export const EMPTY_CONTEXT: ProjectContext = { memory: [], changes: [] };

const MAX_MEMORY = 30;
const MAX_CHANGES = 20;

export function makeChangeEntry(instruction: string, files: string[], summary: string, at: string): ChangeEntry {
  return {
    instruction: String(instruction ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    files: [...new Set((files ?? []).filter(Boolean))].slice(0, 20),
    summary: String(summary ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
    at: at || new Date().toISOString(),
  };
}

/** Acrescenta uma alteração (mais recente por último) com teto. */
export function appendChange(list: ChangeEntry[], entry: ChangeEntry, cap = MAX_CHANGES): ChangeEntry[] {
  const out = [...(list ?? []), entry];
  return out.slice(-Math.max(1, cap));
}

/** Linha COMPACTA de memória derivada de uma alteração (decisão a preservar). */
export function memoryLineFromChange(entry: ChangeEntry): string {
  const what = entry.summary || entry.files[0] || "alteração aplicada";
  return `"${entry.instruction || "alteração"}" → ${what}`;
}

/** Acrescenta uma decisão à memória, sem duplicar e com teto. */
export function appendMemory(list: string[], line: string, cap = MAX_MEMORY): string[] {
  const clean = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [...(list ?? [])];
  const base = (list ?? []).filter((x) => x && x !== clean);
  return [...base, clean].slice(-Math.max(1, cap));
}

/** Bloco de contexto injetado no prompt do agente (compacto). */
export function renderProjectContextBlock(ctx: ProjectContext): string {
  const memory = (ctx?.memory ?? []).filter(Boolean).slice(-MAX_MEMORY);
  const changes = (ctx?.changes ?? []).slice(-MAX_CHANGES);
  if (memory.length === 0 && changes.length === 0) return "";
  const parts: string[] = [
    "\nCONTEXTO PERSISTENTE DESTE PROJETO (use para entender referências como \"aquele botão\", \"a cor que definimos\", \"volta como estava antes\"):",
  ];
  if (memory.length) parts.push(`Decisões/preferências já registradas:\n- ${memory.join("\n- ")}`);
  if (changes.length) {
    parts.push(
      "Alterações recentes (mais novas por último):\n" +
        changes.map((e) => `- ${e.at}: "${e.instruction || ""}" → ${e.summary || "alterado"} [${(e.files ?? []).join(", ")}]`).join("\n"),
    );
  }
  parts.push("O ESTADO REAL DOS ARQUIVOS é a fonte de verdade; se a memória divergir, siga os arquivos.");
  return parts.join("\n") + "\n";
}

/** Normaliza um contexto vindo do servidor (defensivo). */
export function normalizeContext(raw: unknown): ProjectContext {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { memory?: unknown; changes?: unknown };
  const memory = Array.isArray(obj.memory) ? obj.memory.filter((x): x is string => typeof x === "string") : [];
  const changes = Array.isArray(obj.changes)
    ? (obj.changes as unknown[]).filter((c): c is ChangeEntry => !!c && typeof c === "object" && typeof (c as ChangeEntry).instruction === "string")
    : [];
  return { memory, changes };
}
