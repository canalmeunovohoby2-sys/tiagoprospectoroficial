// Transporte das operações Git do Studio (Fase 6) — fala com `POST /git` do
// Agent Runtime usando a MESMA autenticação/URL do `/run` (resolver + ticket).

import { editorRuntimeAuth, resolveEditorRuntime } from "@/lib/siteProjectsApi";

export interface StudioGitStatusEntry {
  path: string;
  index: string;
  worktree: string;
}
export interface StudioGitStatus {
  ok: boolean;
  repo: boolean;
  branch?: string;
  clean: boolean;
  entries: StudioGitStatusEntry[];
  created?: boolean;
  error?: string;
}
export interface StudioGitCommit {
  hash: string;
  short: string;
  message: string;
  author: string;
  email: string;
  date: string;
  files: string[];
}
export interface StudioGitLog {
  ok: boolean;
  repo: boolean;
  commits: StudioGitCommit[];
  error?: string;
}
export interface StudioGitDiffFile {
  path: string;
  additions: number;
  deletions: number;
}
export interface StudioGitDiff {
  ok: boolean;
  from: string;
  to: string;
  diff: string;
  files: StudioGitDiffFile[];
  truncated?: boolean;
  error?: string;
}
export interface StudioGitShow {
  ok: boolean;
  content: string;
  truncated?: boolean;
  error?: string;
}
export interface StudioGitCommitResult {
  ok: boolean;
  committed: boolean;
  hash?: string;
  short?: string;
  message?: string;
  files: string[];
  reason?: string;
  error?: string;
}
export interface StudioGitRestoreResult {
  ok: boolean;
  files: Record<string, string>;
  hash: string;
  committed: boolean;
  commitHash?: string;
  error?: string;
}

export interface StudioGitRequest {
  action: "status" | "log" | "diff" | "show" | "commit" | "restore";
  projectId: string;
  userId?: string;
  files?: Record<string, string>;
  limit?: number;
  from?: string;
  to?: string;
  path?: string;
  hash?: string;
  message?: string;
  instruction?: string;
  summary?: string;
  /** C4: Git do Studio é exclusivo de react (default). */
  projectKind?: "react";
  /** FASE 2 — revisão do workspace do cliente (snapshot atrasado é ignorado no runtime). */
  workspaceRevision?: number;
}

/**
 * Executa uma operação Git no runtime. Nunca lança: devolve `{ ok:false, error }`.
 */
export async function invokeStudioGit<T extends { ok: boolean; error?: string }>(input: StudioGitRequest): Promise<T> {
  const fail = (error: string): T => ({ ok: false, error } as T);
  try {
    const runtimeSel = await resolveEditorRuntime();
    if (runtimeSel.state === "none") return fail("Agent Runtime não configurado para este projeto.");
    if (runtimeSel.state === "ollama_local_missing") return fail("Agent Runtime Local não está em execução neste computador.");
    const token = await editorRuntimeAuth(runtimeSel, input.projectId);
    if (!token) return fail("Não foi possível autenticar as operações Git.");
    const res = await fetch(`${runtimeSel.url.replace(/\/$/, "")}/git`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...input, projectKind: input.projectKind ?? "react", user_id: input.userId }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return fail(`Git indisponível (HTTP ${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erro nas operações Git.");
  }
}
