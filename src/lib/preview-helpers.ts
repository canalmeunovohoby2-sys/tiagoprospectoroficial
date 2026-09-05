// Helpers compartilhados de preview (5.14) — puros, usados pelo runtime de
// preview no front. (Funções de workspace ficam no edge _shared; aqui temos
// versões puras equivalentes para o browser sem acoplar a Deno.)

export type WorkspaceMap = Record<string, string>;

export function normalizePath(path: string): string | null {
  if (typeof path !== "string") return null;
  const raw = path.trim();
  if (!raw || raw.length > 500) return null;
  if (/^[a-zA-Z]:/.test(raw) || raw.startsWith("/") || raw.startsWith("~")) return null;
  const parts = raw.split(/[\\/]+/).filter((s) => s.length > 0 && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  return parts.join("/");
}

export function listFiles(files: WorkspaceMap): string[] {
  return Object.keys(files ?? {}).sort();
}

export function readFile(files: WorkspaceMap, path: string): string | null {
  const p = normalizePath(path);
  if (!p) return null;
  const c = files?.[p];
  return typeof c === "string" ? c : null;
}

// Balanceamento de pares em texto (remove strings/comentários para CSS/JS).
export function isBalancedJsSafe(src: string, openCh = "{", closeCh = "}"): boolean {
  if (typeof src !== "string") return false;
  let depth = 0;
  let inStr: string | null = null;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; i += 1; continue; }
    if (c === openCh) depth += 1;
    else if (c === closeCh) { depth -= 1; if (depth < 0) return false; }
    i += 1;
  }
  return depth === 0;
}
