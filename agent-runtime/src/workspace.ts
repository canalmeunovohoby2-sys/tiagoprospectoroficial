// Workspace físico do agente — materializa os arquivos de um Site Project em
// um diretório real e isolado (por projectId), aplica alterações do agente e
// lê o resultado de volta. Nada sai do root do projeto.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

export type FileMap = Record<string, string>;

const MAX_FILE_BYTES = 2_000_000;

/**
 * Caminhos SENSÍVEIS que nunca entram/saem do workspace: variáveis de ambiente
 * e credenciais em qualquer nível. Compartilhado com as tools (tools.ts).
 */
export function isSensitivePath(rel: string): boolean {
  const parts = String(rel ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((s) => {
    const name = s.toLowerCase();
    if (name === ".env" || name.startsWith(".env.")) return true;
    if (name === ".npmrc" || name === ".netrc" || name === ".git-credentials" || name === ".htpasswd") return true;
    if (name === "id_rsa" || name === "id_ed25519" || name === "id_dsa" || name === "id_ecdsa") return true;
    return false;
  });
}

function safeJoin(root: string, path: string): string | null {
  const clean = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  const abs = resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  // Bloqueia .env/credenciais em QUALQUER nível (consistente com tools.ts).
  if (isSensitivePath(parts.join("/"))) return null;
  return abs;
}

/** Versão pública de `safeJoin` para outros módulos (git, etc.). */
export function safeWorkspaceJoin(root: string, path: string): string | null {
  return safeJoin(root, path);
}

// Cria/atualiza o workspace em disco a partir de um mapa path->content.
// PRESERVA `.git` (histórico Git do projeto — Fase 6) e `node_modules`.
export function materializeWorkspace(root: string, files: FileMap): void {
  mkdirSync(root, { recursive: true });
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    rmSync(join(root, entry.name), { recursive: true, force: true });
  }
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
        if (rel.length > 500 || isSensitivePath(rel)) continue;
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
