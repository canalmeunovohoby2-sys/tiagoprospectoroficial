// Git REAL do workspace do projeto (Fase 6) — histórico/diff/commit/restore.
//
// Regras de segurança:
//  - opera SOMENTE dentro do root do projeto (cwd = workspace, sem shell);
//  - argumentos validados (hash/commit, caminhos relativos sem `..`, sem `.git`);
//  - ambiente sem segredos e sem prompt interativo (GIT_TERMINAL_PROMPT=0);
//  - timeout + limite de saída;
//  - `.gitignore` de segurança (nunca versiona .env/credenciais);
//  - NÃO é um executor de comandos arbitrários (run_command continua restrito).

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isSensitivePath, readWorkspace, safeWorkspaceJoin, type FileMap } from "../workspace.js";

export interface GitStatusEntry {
  path: string;
  index: string;
  worktree: string;
}
export interface GitStatusResult {
  ok: boolean;
  repo: boolean;
  branch?: string;
  clean: boolean;
  entries: GitStatusEntry[];
  error?: string;
}

export interface GitCommitInfo {
  hash: string;
  short: string;
  message: string;
  body?: string;
  author: string;
  email: string;
  date: string;
  files: string[];
}
export interface GitLogResult {
  ok: boolean;
  repo: boolean;
  commits: GitCommitInfo[];
  error?: string;
}

export interface GitDiffFile {
  path: string;
  additions: number;
  deletions: number;
}
export interface GitDiffResult {
  ok: boolean;
  from: string;
  to: string;
  diff: string;
  files: GitDiffFile[];
  truncated?: boolean;
  error?: string;
}

export interface GitCommitResult {
  ok: boolean;
  committed: boolean;
  hash?: string;
  short?: string;
  message?: string;
  files: string[];
  reason?: string;
  error?: string;
}

export interface GitShowResult {
  ok: boolean;
  content: string;
  truncated?: boolean;
  error?: string;
}

export interface GitRestoreResult {
  ok: boolean;
  files: FileMap;
  hash: string;
  committed: boolean;
  commitHash?: string;
  error?: string;
}

const MAX_OUTPUT = 200_000;
const GIT_TIMEOUT_MS = 20_000;

interface GitRun {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Executa `git` SEM shell, com cwd no workspace, sem segredos e com timeout. */
function runGit(root: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<GitRun> {
  return new Promise((resolve) => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v !== "string") continue;
      if (/key|token|secret|password|passwd|credential|api|auth|cookie|session/i.test(k)) continue;
      env[k] = v;
    }
    env.GIT_TERMINAL_PROMPT = "0";
    env.GIT_OPTIONAL_LOCKS = "0";
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_PAGER = "cat";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", args, { cwd: root, env, shell: false, windowsHide: true });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: e instanceof Error ? e.message : String(e), timedOut: false });
      return;
    }
    let out = "";
    let err = "";
    let done = false;
    const clamp = (s: string) => (s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) : s);
    const finish = (code: number | null, timedOut: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (timedOut) {
        try { child.kill("SIGKILL"); } catch { /* noop */ }
      }
      resolve({ code: code ?? -1, stdout: clamp(out), stderr: clamp(err), timedOut });
    };
    const timer = setTimeout(() => finish(null, true), timeoutMs);
    child.stdout?.on("data", (d) => { if (out.length < MAX_OUTPUT) out += String(d); });
    child.stderr?.on("data", (d) => { if (err.length < MAX_OUTPUT) err += String(d); });
    child.on("error", (e) => { err += `\n${e.message}`; finish(-1, false); });
    child.on("close", (code) => finish(code, false));
  });
}

function isSafeRev(rev: string): boolean {
  return rev === "HEAD" || rev === "" || /^[0-9a-f]{4,40}$/i.test(rev);
}

/** Normaliza e valida um caminho relativo seguro (sem `..`, sem `.git`, sem segredos). */
export function normalizeGitPath(path: unknown): string | null {
  const clean = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!clean || clean.length > 500) return null;
  const parts = clean.split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  if (parts.some((s) => s.toLowerCase() === ".git")) return null;
  if (isSensitivePath(parts.join("/"))) return null;
  return parts.join("/");
}

const GITIGNORE = [
  "node_modules/",
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  ".git-credentials",
  ".npmrc",
  ".netrc",
  ".htpasswd",
  "id_rsa",
  "id_ed25519",
  "id_dsa",
  "id_ecdsa",
  "",
].join("\n");

/** Inicializa o repositório Git do workspace, se ainda não existir. */
export async function ensureGitRepo(root: string): Promise<{ ok: boolean; created: boolean; error?: string }> {
  if (!root || !existsSync(root)) return { ok: false, created: false, error: "workspace não existe" };
  if (existsSync(join(root, ".git"))) return { ok: true, created: false };

  const version = await runGit(root, ["--version"]);
  if (version.code !== 0) return { ok: false, created: false, error: "git indisponível no runtime" };

  const init = await runGit(root, ["init"]);
  if (init.code !== 0) return { ok: false, created: false, error: (init.stderr || "falha ao inicializar o git").trim() };

  await runGit(root, ["config", "user.name", "TiagoProspector Studio"]);
  await runGit(root, ["config", "user.email", "studio@tiagoprospector.local"]);
  await runGit(root, ["config", "commit.gpgsign", "false"]);
  await runGit(root, ["config", "core.autocrlf", "false"]);

  // Padrões de segurança ficam em `.git/info/exclude` (dentro do .git) — NÃO
  // cria `.gitignore` no projeto, então nada vaza para `generated_code`/Explorer.
  try {
    const excludePath = join(root, ".git", "info", "exclude");
    const current = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
    if (!current.includes("# prospector-secrets")) {
      const sep = current && !current.endsWith("\n") ? "\n" : "";
      writeFileSync(excludePath, `${current}${sep}# prospector-secrets\n${GITIGNORE}`, "utf8");
    }
  } catch { /* noop */ }

  // Só cria o commit inicial se houver arquivos REAIS do projeto.
  const projectFiles = Object.keys(readWorkspace(root));
  if (projectFiles.length > 0) {
    await runGit(root, ["add", "-A"]);
    const staged = await runGit(root, ["diff", "--cached", "--name-only"]);
    if (staged.stdout.trim()) {
      await runGit(root, ["commit", "-m", "Estado inicial", "--no-verify"]);
    }
  }
  return { ok: true, created: true };
}

export async function gitStatus(root: string): Promise<GitStatusResult> {
  if (!existsSync(join(root, ".git"))) return { ok: true, repo: false, clean: true, entries: [] };
  const branchRes = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const st = await runGit(root, ["status", "--porcelain=v1"]);
  if (st.code !== 0) return { ok: false, repo: true, clean: false, entries: [], error: (st.stderr || "falha no git status").trim() };
  const entries: GitStatusEntry[] = st.stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const index = line.slice(0, 1);
      const worktree = line.slice(1, 2);
      let path = line.slice(3).trim();
      const arrow = path.indexOf(" -> ");
      if (arrow >= 0) path = path.slice(arrow + 4);
      return { path, index, worktree };
    });
  return { ok: true, repo: true, branch: branchRes.stdout.trim() || undefined, clean: entries.length === 0, entries };
}

export async function gitLog(root: string, limit = 50): Promise<GitLogResult> {
  if (!existsSync(join(root, ".git"))) return { ok: true, repo: false, commits: [] };
  const n = Math.min(Math.max(limit, 1), 200);
  // `%x1e` no INÍCIO de cada registro: o `--name-only` imprime os arquivos
  // DEPOIS do header, então o separador precisa vir antes do próximo header.
  const fmt = "%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s";
  const res = await runGit(root, ["log", "-n", String(n), `--pretty=format:${fmt}`, "--name-only"]);
  if (res.code !== 0) {
    if (/does not have any commits|unknown revision|bad default revision|ambiguous argument 'HEAD'/i.test(res.stderr)) {
      return { ok: true, repo: true, commits: [] };
    }
    return { ok: false, repo: true, commits: [], error: (res.stderr || "falha no git log").trim() };
  }
  const commits: GitCommitInfo[] = [];
  for (const record of res.stdout.split("\x1e")) {
    const text = record.replace(/^\n+/, "");
    if (!text.trim()) continue;
    const nl = text.indexOf("\n");
    const header = nl >= 0 ? text.slice(0, nl) : text;
    const filesPart = nl >= 0 ? text.slice(nl + 1) : "";
    const [hash, short, author, email, date, subject] = header.split("\x1f");
    if (!hash || !/^[0-9a-f]{4,40}$/i.test(hash)) continue;
    commits.push({
      hash,
      short: short || hash.slice(0, 7),
      message: subject || "(sem mensagem)",
      author: author || "",
      email: email || "",
      date: date || "",
      files: filesPart.split("\n").map((s) => s.trim()).filter(Boolean),
    });
  }
  return { ok: true, repo: true, commits };
}

async function diffFiles(root: string, from: string, to: string, path?: string): Promise<GitDiffFile[]> {
  const args = ["diff", "--numstat", from];
  if (to) args.push(to);
  if (path) args.push("--", path);
  const res = await runGit(root, args);
  if (res.code !== 0) return [];
  return res.stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const [add, del, ...rest] = line.split("\t");
      return { path: rest.join("\t").trim(), additions: Number(add) || 0, deletions: Number(del) || 0 };
    })
    .filter((f) => f.path);
}

export async function gitDiff(root: string, input: { from?: string; to?: string; path?: string } = {}): Promise<GitDiffResult> {
  const from = String(input.from ?? "HEAD").trim() || "HEAD";
  const to = String(input.to ?? "").trim();
  if (!existsSync(join(root, ".git"))) return { ok: false, from, to, diff: "", files: [], error: "sem repositório git" };
  if (!isSafeRev(from) || !isSafeRev(to)) return { ok: false, from, to, diff: "", files: [], error: "revisão inválida" };
  let rel: string | undefined;
  if (input.path !== undefined && input.path !== "") {
    const normalized = normalizeGitPath(input.path);
    if (!normalized) return { ok: false, from, to, diff: "", files: [], error: "caminho inválido" };
    rel = normalized;
  }
  const args = ["diff", "--no-color", "--unified=3", from];
  if (to) args.push(to);
  if (rel) args.push("--", rel);
  const res = await runGit(root, args);
  if (res.code !== 0 && res.code !== 1) {
    return { ok: false, from, to, diff: "", files: [], error: (res.stderr || "falha no git diff").trim() };
  }
  const files = await diffFiles(root, from, to, rel);
  return { ok: true, from, to, diff: res.stdout, files, truncated: res.stdout.length >= MAX_OUTPUT };
}

export async function gitShow(root: string, input: { hash: string; path: string }): Promise<GitShowResult> {
  const hash = String(input.hash ?? "").trim();
  if (!/^[0-9a-f]{4,40}$/i.test(hash) && hash !== "HEAD") return { ok: false, content: "", error: "hash inválido" };
  const rel = normalizeGitPath(input.path);
  if (!rel) return { ok: false, content: "", error: "caminho inválido" };
  const res = await runGit(root, ["show", `${hash}:${rel}`]);
  if (res.code !== 0) return { ok: false, content: "", error: (res.stderr || "arquivo não encontrado no commit").trim() };
  return { ok: true, content: res.stdout, truncated: res.stdout.length >= MAX_OUTPUT };
}

export async function gitCommit(root: string, message: string): Promise<GitCommitResult> {
  const msg = String(message ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 500);
  if (!msg) return { ok: false, committed: false, files: [], error: "mensagem de commit obrigatória" };
  const ensured = await ensureGitRepo(root);
  if (!ensured.ok) return { ok: false, committed: false, files: [], error: ensured.error };

  await runGit(root, ["add", "-A"]);
  const staged = await runGit(root, ["diff", "--cached", "--name-only"]);
  const files = staged.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  if (files.length === 0) return { ok: true, committed: false, files: [], reason: "sem alterações para commit" };

  const commit = await runGit(root, ["commit", "-m", msg, "--no-verify"]);
  if (commit.code !== 0) return { ok: false, committed: false, files, error: (commit.stderr || "falha no commit").trim() };
  const head = await runGit(root, ["rev-parse", "HEAD"]);
  const hash = head.stdout.trim();
  return { ok: true, committed: true, hash, short: hash.slice(0, 7), message: msg, files };
}

/**
 * Restaura o estado do projeto para um commit (time travel REAL):
 * remove arquivos que não existiam naquele commit, restaura os arquivos do
 * commit e registra a restauração como um novo commit.
 */
export async function gitRestore(root: string, input: { hash: string; path?: string; message?: string }): Promise<GitRestoreResult> {
  const hash = String(input.hash ?? "").trim();
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) return { ok: false, files: {}, hash, committed: false, error: "hash inválido" };
  const ensured = await ensureGitRepo(root);
  if (!ensured.ok) return { ok: false, files: {}, hash, committed: false, error: ensured.error };

  const treeRes = await runGit(root, ["ls-tree", "-r", "--name-only", hash]);
  if (treeRes.code !== 0) return { ok: false, files: {}, hash, committed: false, error: (treeRes.stderr || "commit não encontrado").trim() };

  const single = input.path !== undefined && input.path !== "" ? normalizeGitPath(input.path) : null;
  if (input.path !== undefined && input.path !== "" && !single) {
    return { ok: false, files: {}, hash, committed: false, error: "caminho inválido" };
  }

  if (single) {
    const co = await runGit(root, ["checkout", hash, "--", single]);
    if (co.code !== 0) return { ok: false, files: {}, hash, committed: false, error: (co.stderr || "falha no checkout").trim() };
  } else {
    const tree = new Set(treeRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean));
    // Remove arquivos atuais que não existiam no commit (restauração exata).
    for (const rel of Object.keys(readWorkspace(root))) {
      if (tree.has(rel)) continue;
      const abs = safeWorkspaceJoin(root, rel);
      if (abs) { try { rmSync(abs, { force: true }); } catch { /* noop */ } }
    }
    const co = await runGit(root, ["checkout", hash, "--", "."]);
    if (co.code !== 0) return { ok: false, files: {}, hash, committed: false, error: (co.stderr || "falha no checkout").trim() };
  }

  await runGit(root, ["add", "-A"]);
  const staged = await runGit(root, ["diff", "--cached", "--name-only"]);
  let committed = false;
  let commitHash: string | undefined;
  if (staged.stdout.trim()) {
    const msg = String(input.message ?? `Restore para ${hash.slice(0, 7)} (time travel)`).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 500);
    const c = await runGit(root, ["commit", "-m", msg, "--no-verify"]);
    committed = c.code === 0;
    if (committed) commitHash = (await runGit(root, ["rev-parse", "HEAD"])).stdout.trim();
  }
  return { ok: true, files: readWorkspace(root), hash, committed, commitHash };
}

/** Lê o conteúdo de um arquivo do workspace (para diffs do estado atual). */
export function readWorkspaceFile(root: string, path: string): string | null {
  const rel = normalizeGitPath(path);
  if (!rel) return null;
  const abs = safeWorkspaceJoin(root, rel);
  if (!abs || !existsSync(abs)) return null;
  try { return readFileSync(abs, "utf8"); } catch { return null; }
}
