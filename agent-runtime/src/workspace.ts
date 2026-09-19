// Workspace físico do agente — materializa os arquivos de um Site Project em
// um diretório real e isolado (por projectId), aplica alterações do agente e
// lê o resultado de volta. Nada sai do root do projeto.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

export type FileMap = Record<string, string>;

const MAX_FILE_BYTES = 2_000_000;

/** Diretórios de artefatos gerados/deps — nunca entram no estado editável. */
export const GENERATED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".vite", ".cache", ".next"]);

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
        // Artefatos GERADOS (build) e deps nunca fazem parte do estado editável:
        // o build escreve dist/ e não pode voltar como "arquivo do projeto".
        if (GENERATED_DIRS.has(entry.name)) continue;
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

// ── LOCK por projeto (serializa operações que MATERIALIZAM/escrevem o workspace) ──
// Evita que /git, /build, /visual-edit ou autosave apaguem/reescrevam o workspace
// enquanto um /run (Coder) está escrevendo. Escopo mínimo: uma fila por projectId.
const workspaceLocks = new Map<string, Promise<unknown>>();

export function withWorkspaceLock<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const key = String(projectId || "default");
  const prev = workspaceLocks.get(key) ?? Promise.resolve();
  const next = prev.then(task, task);
  const guard = next.then(() => undefined, () => undefined);
  workspaceLocks.set(key, guard);
  void guard.then(() => {
    if (workspaceLocks.get(key) === guard) workspaceLocks.delete(key);
  });
  return next;
}

export function cleanupWorkspace(projectId: string): void {
  const root = resolveWorkspaceRoot(projectId);
  rmSync(root, { recursive: true, force: true });
}

// ── REVISÃO DO WORKSPACE (source of truth) ────────────────────────────────────
// Cada escrita REAL feita no workspace (run do agente, normalização de mapa,
// visual-edit) incrementa a revisão do projeto. O cliente recebe a revisão ao
// final de cada operação e a devolve na chamada seguinte:
//   - revisão do cliente == atual → o snapshot dele é o mais novo (edições do
//     editor) e pode ser materializado;
//   - revisão do cliente ANTIGA → existe trabalho mais novo no workspace; o
//     snapshot é IGNORADO (o disco vence) — nenhum endpoint reintroduz estado A
//     depois que o agente produziu B.
// Cliente sem revisão (versões antigas) mantém o comportamento anterior.
const workspaceRevisions = new Map<string, number>();

function revKey(projectId: string): string {
  return String(projectId || "default");
}

export function currentWorkspaceRevision(projectId: string): number {
  return workspaceRevisions.get(revKey(projectId)) ?? 0;
}

/** Registra que o workspace deste projeto mudou (agente/normalização/visual). */
export function bumpWorkspaceRevision(projectId: string): number {
  const key = revKey(projectId);
  const next = (workspaceRevisions.get(key) ?? 0) + 1;
  workspaceRevisions.set(key, next);
  return next;
}

/** O snapshot do cliente está atrasado em relação ao workspace atual? */
export function isStaleSnapshot(projectId: string, clientRevision: unknown): boolean {
  if (clientRevision === undefined || clientRevision === null || clientRevision === "") return false;
  const rev = Number(clientRevision);
  if (!Number.isFinite(rev)) return false;
  return rev < currentWorkspaceRevision(projectId);
}

function filesHash(files: FileMap): string {
  const h = createHash("sha256");
  for (const key of Object.keys(files ?? {}).sort()) {
    h.update(key);
    h.update("\u0000");
    h.update(String(files[key] ?? ""));
    h.update("\u0001");
  }
  return h.digest("hex");
}

/**
 * Sincroniza o snapshot do cliente com o workspace RESPEITANDO a revisão.
 * - snapshot atrasado → NÃO materializa (workspace vence) e não incrementa;
 * - snapshot atual/ausente → materializa; incrementa SÓ se o conteúdo mudou
 *   (operações somente leitura não invalidam a revisão do cliente).
 */
export function syncWorkspaceFromClient(
  projectId: string,
  files: FileMap,
  clientRevision?: unknown,
): { root: string; materialized: boolean; stale: boolean; revision: number } {
  const root = resolveWorkspaceRoot(projectId);
  if (isStaleSnapshot(projectId, clientRevision)) {
    return { root, materialized: false, stale: true, revision: currentWorkspaceRevision(projectId) };
  }
  const before = existsSync(root) ? filesHash(readWorkspace(root)) : "";
  materializeWorkspace(root, files);
  const after = filesHash(readWorkspace(root));
  if (after !== before) {
    return { root, materialized: true, stale: false, revision: bumpWorkspaceRevision(projectId) };
  }
  return { root, materialized: true, stale: false, revision: currentWorkspaceRevision(projectId) };
}

export { existsSync, statSync };
