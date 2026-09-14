// Transporte do Visual Edit (C3) — `POST /visual-edit` no Agent Runtime,
// com a MESMA autenticação/URL do `/run` e `/git`.

import { editorRuntimeAuth, resolveEditorRuntime } from "@/lib/siteProjectsApi";

export interface VisualEditChange {
  property: string;
  value: string;
}

export interface VisualEditRequest {
  projectId: string;
  userId?: string;
  projectKind: "react";
  files: Record<string, string>;
  file?: string;
  line?: number;
  selector?: string;
  tagName?: string;
  classes?: string[];
  text?: string;
  newText?: string;
  changes?: VisualEditChange[];
  scope?: string;
}

export interface VisualEditResponse {
  ok: boolean;
  applied: boolean;
  handoff?: "coder";
  reason?: string;
  error?: string;
  mode?: string;
  files?: Record<string, string>;
}

/** Executa uma edição visual determinística. Nunca lança. */
export async function invokeVisualEdit(input: VisualEditRequest): Promise<VisualEditResponse> {
  const fail = (error: string): VisualEditResponse => ({ ok: false, applied: false, error });
  try {
    const runtimeSel = await resolveEditorRuntime();
    if (runtimeSel.state === "none") return fail("Agent Runtime não configurado para este projeto.");
    if (runtimeSel.state === "ollama_local_missing") return fail("Agent Runtime Local não está em execução neste computador.");
    const token = await editorRuntimeAuth(runtimeSel, input.projectId);
    if (!token) return fail("Não foi possível autenticar a edição visual.");
    const res = await fetch(`${runtimeSel.url.replace(/\/$/, "")}/visual-edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...input, user_id: input.userId }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return fail(`Visual edit indisponível (HTTP ${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`);
    }
    return (await res.json()) as VisualEditResponse;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erro na edição visual.");
  }
}
