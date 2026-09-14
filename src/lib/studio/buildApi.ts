// Transporte do Build de produção React (C5) — `POST /build` no Agent Runtime.

import { editorRuntimeAuth, resolveEditorRuntime } from "@/lib/siteProjectsApi";

export interface StudioBuildRequest {
  projectId: string;
  userId?: string;
  files: Record<string, string>;
}

export interface StudioBuildResult {
  ok: boolean;
  html?: string | null;
  error?: string | null;
  log?: string;
}

/** Executa o build de produção real. Nunca lança. */
export async function invokeStudioBuild(input: StudioBuildRequest): Promise<StudioBuildResult> {
  const fail = (error: string): StudioBuildResult => ({ ok: false, error });
  try {
    const runtimeSel = await resolveEditorRuntime();
    if (runtimeSel.state === "none") return fail("Agent Runtime não configurado para este projeto.");
    if (runtimeSel.state === "ollama_local_missing") return fail("Agent Runtime Local não está em execução neste computador.");
    const token = await editorRuntimeAuth(runtimeSel, input.projectId);
    if (!token) return fail("Não foi possível autenticar o build.");
    const res = await fetch(`${runtimeSel.url.replace(/\/$/, "")}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId: input.projectId, projectKind: "react", userId: input.userId, files: input.files }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return fail(`Build indisponível (HTTP ${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`);
    }
    return (await res.json()) as StudioBuildResult;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erro no build.");
  }
}
