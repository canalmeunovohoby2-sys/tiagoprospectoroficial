// Agent Workspace (5.12) — camada de arquivos do projeto (pura, testável).
// Cada Site Project tem um workspace isolado representado como um mapa
// path -> conteúdo (texto). O agente NÃO acessa o filesystem real nem outros
// projetos: ele opera sobre este "virtual FS" que depois é materializado no
// fluxo de export/publicação. Sem dependências de Deno/React.

export type WorkspaceFile = { path: string; content: string };
export type WorkspaceMap = Record<string, string>;

export type WorkspaceOpResult =
  | { ok: true; files: WorkspaceMap; message?: string }
  | { ok: false; error: string; files: WorkspaceMap };

const MAX_FILE_BYTES = 2_000_000; // ~2MB por arquivo (proteção)
const MAX_TOTAL_FILES = 400;

// Normaliza caminhos e impede escape do workspace (.., absoluto, backslash).
export function normalizePath(path: string): string | null {
  if (typeof path !== "string") return null;
  const raw = path.trim();
  if (!raw || raw.length > 500) return null;
  // Rejeita absoluto, drive windows e qualquer tentativa de subir de diretório.
  if (/^[a-zA-Z]:/.test(raw) || raw.startsWith("/") || raw.startsWith("~")) return null;
  const parts = raw.split(/[\\/]+/).filter((s) => s.length > 0 && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  return parts.join("/");
}

export function isAllowedTextFile(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  // Bloqueia binários/segredos desnecessários ao workspace do site.
  if (/(^|\/)(\.env|\.env\.[^/]+)$/.test(normalized)) return false;
  return true;
}

export function listFiles(files: WorkspaceMap): string[] {
  return Object.keys(files ?? {}).sort();
}

export function readFile(files: WorkspaceMap, path: string): { ok: true; content: string } | { ok: false; error: string } {
  const p = normalizePath(path);
  if (!p) return { ok: false, error: "Caminho inválido." };
  const content = files?.[p];
  if (content === undefined) return { ok: false, error: `Arquivo não encontrado: ${p}` };
  return { ok: true, content };
}

export function searchFiles(files: WorkspaceMap, query: string): WorkspaceFile[] {
  const q = (query ?? "").toLowerCase();
  if (!q) return [];
  return Object.entries(files ?? {})
    .filter(([p, c]) => p.toLowerCase().includes(q) || (typeof c === "string" && c.toLowerCase().includes(q)))
    .map(([path, content]) => ({ path, content: typeof content === "string" ? content : String(content) }))
    .slice(0, 60);
}

export function writeFile(files: WorkspaceMap, path: string, content: string): WorkspaceOpResult {
  const p = normalizePath(path);
  if (!p) return { ok: false, error: `Caminho inválido: ${path}`, files };
  if (!isAllowedTextFile(p)) return { ok: false, error: `Arquivo não permitido no workspace: ${p}`, files };
  if (typeof content !== "string") return { ok: false, error: "Conteúdo deve ser texto.", files };
  if (content.length > MAX_FILE_BYTES) return { ok: false, error: `Arquivo grande demais (>2MB): ${p}`, files };
  if (!files?.[p] && Object.keys(files).length >= MAX_TOTAL_FILES) {
    return { ok: false, error: `Limite de ${MAX_TOTAL_FILES} arquivos atingido.`, files };
  }
  const next = { ...files };
  next[p] = content;
  return { ok: true, files: next, message: `Escrito: ${p}` };
}

// Edição por padrão (replace em ocorrência única ou busca textual).
export function editFile(
  files: WorkspaceMap,
  path: string,
  opts: { find: string; replace: string; occurrence?: number },
): WorkspaceOpResult {
  const p = normalizePath(path);
  if (!p) return { ok: false, error: "Caminho inválido.", files };
  const current = files?.[p];
  if (current === undefined) return { ok: false, error: `Arquivo não encontrado: ${p}`, files };
  const { find, replace } = opts;
  if (typeof find !== "string" || find === "") return { ok: false, error: "find (trecho a substituir) é obrigatório.", files };
  const idx = opts.occurrence && opts.occurrence > 1 ? nthIndex(current, find, opts.occurrence) : current.indexOf(find);
  if (idx === -1) return { ok: false, error: `Trecho não encontrado em ${p}.`, files };
  const nextContent = current.slice(0, idx) + replace + current.slice(idx + find.length);
  if (nextContent.length > MAX_FILE_BYTES) return { ok: false, error: "Arquivo resultante grande demais.", files };
  const next = { ...files, [p]: nextContent };
  return { ok: true, files: next, message: `Editado: ${p}` };
}

function nthIndex(str: string, needle: string, n: number): number {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    const found = str.indexOf(needle, idx + 1);
    if (found === -1) return -1;
    idx = found;
  }
  return idx;
}

export function deleteFile(files: WorkspaceMap, path: string): WorkspaceOpResult {
  const p = normalizePath(path);
  if (!p) return { ok: false, error: "Caminho inválido.", files };
  if (files?.[p] === undefined) return { ok: false, error: `Arquivo não encontrado: ${p}`, files };
  const next = { ...files };
  delete next[p];
  return { ok: true, files: next, message: `Removido: ${p}` };
}

export function renameFile(files: WorkspaceMap, from: string, to: string): WorkspaceOpResult {
  const src = normalizePath(from);
  const dst = normalizePath(to);
  if (!src || !dst) return { ok: false, error: "Caminho inválido.", files };
  if (files?.[src] === undefined) return { ok: false, error: `Arquivo não encontrado: ${src}`, files };
  if (src === dst) return { ok: true, files, message: "Nada a renomear." };
  if (!isAllowedTextFile(dst)) return { ok: false, error: `Destino não permitido: ${dst}`, files };
  const next = { ...files };
  next[dst] = next[src];
  delete next[src];
  return { ok: true, files: next, message: `Renomeado: ${src} → ${dst}` };
}

// Snapshot serializável (para persistência em generated_code / versões).
export function toSnapshot(files: WorkspaceMap): WorkspaceMap {
  return { ...(files ?? {}) };
}
export function fromSnapshot(snapshot: unknown): WorkspaceMap {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const out: WorkspaceMap = {};
  for (const [k, v] of Object.entries(snapshot as Record<string, unknown>)) {
    const p = normalizePath(k);
    if (p && isAllowedTextFile(p) && typeof v === "string") out[p] = v;
  }
  return out;
}
