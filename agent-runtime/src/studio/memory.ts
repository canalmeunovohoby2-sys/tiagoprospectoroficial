// Memória por PROJETO (C6) — preferências/decisões úteis para futuras interações.
//
// Armazenamento: arquivo IRMÃO do workspace (`<root>.agent-memory.json`), fora do
// projeto → nunca entra no `files_ready`, no Git, no ZIP nem na publicação.
// Isolamento: um arquivo por workspace (projectId). Nunca há memória global.
// Segurança: entradas são sanitizadas (rejeita segredos) e limitadas.
//
// A memória é CONTEXTO AUXILIAR — o código real (workspace) continua sendo a
// fonte de verdade e prevalece em caso de conflito.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type MemoryKind = "designPreferences" | "projectDecisions" | "userInstructions" | "importantComponents" | "notes";

export interface StudioMemory {
  version: 1;
  projectId: string;
  designPreferences: string[];
  projectDecisions: string[];
  userInstructions: string[];
  importantComponents: string[];
  notes: string[];
  updatedAt: string;
}

const MAX_ENTRIES = 40;
const MAX_ENTRY_CHARS = 300;
const MAX_TOTAL_CHARS = 12_000;

// Nunca persistir segredos/tokens/credenciais.
const SECRET_RE = /(?:NVIDIA|GEMINI|DEEPSEEK|OPENAI|SUPABASE|ANON|SERVICE|API)_?(?:KEY|SECRET|TOKEN)\s*[:=]|\bsk-[A-Za-z0-9_-]{12,}\b|\beyJ[A-Za-z0-9_-]{20,}\.|\bbearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\.env\b|process\.env\.[A-Z0-9_]+/i;

export function memoryFilePath(workspaceRoot: string): string {
  return join(dirname(workspaceRoot), `${basename(workspaceRoot)}.agent-memory.json`);
}

export function emptyMemory(projectId: string): StudioMemory {
  return {
    version: 1, projectId,
    designPreferences: [], projectDecisions: [], userInstructions: [], importantComponents: [], notes: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Sanitiza uma entrada; devolve null quando vazia/sensível/grande demais. */
export function sanitizeMemoryEntry(text: unknown): string | null {
  let value = String(text ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (value.length < 3) return null;
  if (value.length > MAX_ENTRY_CHARS) value = value.slice(0, MAX_ENTRY_CHARS).trim();
  if (SECRET_RE.test(value)) return null;
  return value;
}

function sanitizeList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const clean = sanitizeMemoryEntry(item);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

/** Carrega a memória do projeto; ausente/corrompida → vazia (reconstruível). */
export function loadMemory(workspaceRoot: string, projectId: string): StudioMemory {
  const file = memoryFilePath(workspaceRoot);
  if (!existsSync(file)) return emptyMemory(projectId);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StudioMemory>;
    if (!parsed || parsed.projectId !== projectId) return emptyMemory(projectId);
    return {
      version: 1,
      projectId,
      designPreferences: sanitizeList(parsed.designPreferences),
      projectDecisions: sanitizeList(parsed.projectDecisions),
      userInstructions: sanitizeList(parsed.userInstructions),
      importantComponents: sanitizeList(parsed.importantComponents),
      notes: sanitizeList(parsed.notes),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyMemory(projectId);
  }
}

/** Grava a memória (atômica), com sanitização e limites. */
export function saveMemory(workspaceRoot: string, memory: StudioMemory): StudioMemory {
  const safe: StudioMemory = {
    version: 1,
    projectId: memory.projectId,
    designPreferences: sanitizeList(memory.designPreferences),
    projectDecisions: sanitizeList(memory.projectDecisions),
    userInstructions: sanitizeList(memory.userInstructions),
    importantComponents: sanitizeList(memory.importantComponents),
    notes: sanitizeList(memory.notes),
    updatedAt: new Date().toISOString(),
  };
  try {
    const file = memoryFilePath(workspaceRoot);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(safe, null, 2), "utf8");
    renameSync(tmp, file);
  } catch {
    /* memória é opcional — nunca falha a execução */
  }
  return safe;
}

export function clearMemory(workspaceRoot: string): void {
  try {
    const file = memoryFilePath(workspaceRoot);
    if (existsSync(file)) writeFileSync(file, JSON.stringify(emptyMemory(""), null, 2), "utf8");
  } catch { /* noop */ }
}

/** Adiciona uma entrada (dedupe) respeitando limite por seção. */
export function recordMemory(memory: StudioMemory, kind: MemoryKind, text: unknown): StudioMemory {
  const clean = sanitizeMemoryEntry(text);
  if (!clean) return memory;
  const list = memory[kind];
  if (list.includes(clean)) return memory;
  const next = [clean, ...list].slice(0, MAX_ENTRIES);
  return { ...memory, [kind]: next, updatedAt: new Date().toISOString() };
}

const DESIGN_HINT = /(cor|cores|azul|vermelho|verde|preto|branco|dourado|roxo|fonte|tipografia|layout|estilo|tema|bot[ãa]o|bordas?|arredond|minimalista|premium|elegante|moderno|escuro|claro)/i;

/**
 * Extrai atualizações de memória a partir da instrução do usuário — de forma
 * DETERMINÍSTICA e conservadora (só frases curtas e explícitas de preferência).
 */
export function extractMemoryUpdates(instruction: string): Array<{ kind: MemoryKind; text: string }> {
  const text = String(instruction ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 400) return [];
  const out: Array<{ kind: MemoryKind; text: string }> = [];
  const push = (kind: MemoryKind, t: string) => {
    const clean = sanitizeMemoryEntry(t);
    if (clean) out.push({ kind, text: clean });
  };
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (s.length > 220) continue;
    const pref = /\b(?:prefiro|preferir|use sempre|usar sempre|sempre use|sempre deixe|nunca use|nunca deixe|mantenha|deixe todos?)\b([\s\S]+)/i.exec(s);
    if (pref) {
      push(DESIGN_HINT.test(s) ? "designPreferences" : "userInstructions", s);
      continue;
    }
    const cor = /\bcor\b[^.!?]{0,40}?(?:é|e|:|=)\s*([#A-Za-z0-9][\s\S]+)/i.exec(s);
    if (cor) { push("designPreferences", s); continue; }
    const comp = /\b(?:o\s+)?componente\s+([A-Z][A-Za-z0-9_]+)\b/.exec(s);
    if (comp) { push("importantComponents", comp[1]); }
  }
  return out;
}

/** Bloco compacto de memória para o contexto do agente (auxiliar, não verdade). */
export function memoryContextBlock(memory: StudioMemory, max = 6): string {
  const sections: Array<[string, string[]]> = [
    ["Preferências de design", memory.designPreferences],
    ["Decisões do projeto", memory.projectDecisions],
    ["Instruções do usuário", memory.userInstructions],
    ["Componentes importantes", memory.importantComponents],
    ["Notas", memory.notes],
  ];
  const lines: string[] = [];
  let total = 0;
  for (const [label, list] of sections) {
    const items = list.slice(0, max);
    if (!items.length) continue;
    for (const item of items) {
      const line = `- (${label}) ${item}`;
      if (total + line.length > MAX_TOTAL_CHARS) break;
      lines.push(line);
      total += line.length;
    }
  }
  if (!lines.length) return "";
  return `\nMEMÓRIA DO PROJETO (preferências/contexto — o CÓDIGO REAL prevalece em conflito):\n${lines.join("\n")}\n`;
}
