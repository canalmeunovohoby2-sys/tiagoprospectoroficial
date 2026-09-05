// Workspace físico do agente — materializa os arquivos de um Site Project em
// um diretório real e isolado (por projectId), aplica alterações do agente e
// lê o resultado de volta. Nada sai do root do projeto.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

export type FileMap = Record<string, string>;

const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_FILES = 400;

function safeJoin(root: string, path: string): string | null {
  const clean = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  const abs = resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

// Cria o workspace em disco a partir de um mapa path->content.
export function materializeWorkspace(root: string, files: FileMap): void {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const [path, content] of Object.entries(files ?? {})) {
    const abs = safeJoin(root, path);
    if (!abs || !existsSync(root)) continue;
    if (typeof content !== "string" || content.length > MAX_FILE_BYTES) continue;
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
}

export function readWorkspace(root: string): FileMap {
  const out: FileMap = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(full);
      } else if (entry.isFile()) {
        const rel = relative(root, full).split(sep).join("/");
        if (rel.length > 500 || rel.includes(".env")) continue;
        const content = readFileSync(full, "utf8");
        if (content.length <= MAX_FILE_BYTES) out[rel] = content;
      }
    }
  };
  walk(root);
  return out;
}

export function resolveWorkspaceRoot(projectId: string, base?: string): string {
  const rootBase = base ?? process.env.PROSPECTOR_WORKSPACES ?? join(tmpdir(), "prospector-workspaces");
  const id = createHash("sha256").update(projectId).digest("hex").slice(0, 16);
  return join(rootBase, id);
}

export function ensureWorkspaceDir(projectId: string, files: FileMap): string {
  const root = resolveWorkspaceRoot(projectId);
  materializeWorkspace(root, files);
  return root;
}

export function cleanupWorkspace(projectId: string): void {
  const root = resolveWorkspaceRoot(projectId);
  rmSync(root, { recursive: true, force: true });
}

export { existsSync, statSync };
