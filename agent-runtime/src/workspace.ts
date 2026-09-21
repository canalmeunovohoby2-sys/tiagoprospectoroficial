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
    // ASSET como DATA URL (vindo da árvore/persistência) → grava os BYTES REAIS:
    // o site (Vite/build) precisa de imagem de verdade no disco; texto `data:` no
    // arquivo quebraria a renderização fora da sessão do browser do agente.
    const dataUrl = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/s.exec(content.trim());
    if (dataUrl && /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|woff2?|ttf|otf|mp4|webm|mp3|wav|ogg)$/i.test(path)) {
      try {
        const bytes = Buffer.from(dataUrl[2].replace(/\s+/g, ""), "base64");
        if (bytes.length > 0 && bytes.length <= MAX_FILE_BYTES) { writeFileSync(abs, bytes); continue; }
      } catch { /* grava como texto */ }
    }
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
        // BINÁRIOS: ler como BYTES e expor como DATA URL — ler utf8 corrompia a
        // imagem (todo byte inválido virava EF BF BD) e o arquivo salvo deixava de
        // ser um JPEG/PNG válido. O data URL (ASCII) é o que o cliente persiste.
        if (BINARY_ASSET_RE.test(rel)) {
          try {
            const bytes = readFileSync(full);
            if (bytes.length > 0 && bytes.length <= MAX_FILE_BYTES) {
              const ext = (rel.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
              const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
              out[rel] = `data:${mime};base64,${bytes.toString("base64")}`;
            }
          } catch { /* ignora */ }
          continue;
        }
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

/** Extensões que são assets binários (viram data URL na saída para o cliente). */
const BINARY_ASSET_RE = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|zip|gz|7z|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|wasm|psd)$/i;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".bmp": "image/bmp",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".zip": "application/zip",
};

/**
 * Prepara o mapa de arquivos para o CLIENTE (NDJSON/`files` → árvore do Studio e
 * persistência). Assets binários NÃO podem ir como texto cru (o PNG quebrava o
 * Postgres: "unsupported Unicode escape sequence"), mas também NÃO podem sumir —
 * senão o arquivo não aparece na árvore do projeto. Solução: binário vira
 * **data URL (base64, ASCII)**; a materialização no runtime converte de volta para
 * bytes reais no disco a cada execução. Strings com NUL são descartadas.
 */
export function clientSafeFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [p, c] of Object.entries(files ?? {})) {
    if (typeof c !== "string") continue;
    if (BINARY_ASSET_RE.test(p)) {
      if (c.startsWith("data:")) { out[p] = c; continue; }          // já é ASCII seguro
      const ext = (p.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
      try {
        // Converte os BYTES (lidos como utf8) para base64 — NÃO checamos NUL aqui:
        // todo binário contém NUL e precisa chegar à árvore como data URL.
        out[p] = `data:${mime};base64,${Buffer.from(c, "utf8").toString("base64")}`;
      } catch { /* ignora */ }
      continue;
    }
    if (c.includes("\u0000")) continue;
    out[p] = c;
  }
  return out;
}
