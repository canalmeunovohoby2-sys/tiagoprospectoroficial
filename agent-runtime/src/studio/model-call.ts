// Chamada de modelo SEM ferramentas, usada pelo PLANNER do Studio.
//
// Usa EXATAMENTE o provider/modelo/chave resolvidos pelo runtime para o usuário
// (runtime-ai-config → prepareExec). Não há fallback silencioso para Gemini/DeepSeek:
// se o provider falhar, devolve erro e o orquestrador segue sem plano (Coder direto).

export interface StudioModelCallInput {
  system: string;
  user: string;
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface StudioModelCallResult {
  ok: boolean;
  text: string;
  error?: string;
  providerUsed?: string;
  modelUsed?: string;
}

function textFromGemini(json: unknown): string {
  const j = (json ?? {}) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts: string[] = [];
  for (const c of j.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      if (typeof p?.text === "string" && p.text.trim()) parts.push(p.text.trim());
    }
  }
  return parts.join("\n").trim();
}

function textFromOpenAi(json: unknown): string {
  const j = (json ?? {}) as { choices?: Array<{ message?: { content?: unknown } }> };
  const out: string[] = [];
  for (const c of j.choices ?? []) {
    const con = c.message?.content;
    if (typeof con === "string" && con.trim()) out.push(con.trim());
    else if (Array.isArray(con)) {
      for (const x of con as Array<{ type?: string; text?: string }>) {
        if (x?.type === "text" && typeof x.text === "string" && x.text.trim()) out.push(x.text.trim());
      }
    }
  }
  return out.join("\n").trim();
}

/**
 * Executa uma única chamada de completion de texto no provider configurado.
 * Sem tools, sem streaming, com timeout. NUNCA troca de provider.
 */
export async function callStudioModel(input: StudioModelCallInput): Promise<StudioModelCallResult> {
  const provider = String(input.providerId ?? "").toLowerCase();
  const baseUrl = String(input.baseUrl ?? "").replace(/\/+$/, "");
  const model = String(input.modelId ?? "");
  if (!baseUrl || !model) {
    return { ok: false, text: "", error: "Provider/modelo não resolvidos para o planejamento." };
  }
  if (!input.apiKey && provider !== "ollama") {
    return { ok: false, text: "", error: "Sem API key do provider para o planejamento." };
  }
  const timeoutMs = input.timeoutMs ?? 60_000;
  try {
    if (provider === "gemini") {
      const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey ?? "")}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: input.maxTokens ? { maxOutputTokens: input.maxTokens } : undefined,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, text: "", error: `gemini HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
      }
      const text = textFromGemini(await res.json().catch(() => ({})));
      return text
        ? { ok: true, text, providerUsed: provider, modelUsed: model }
        : { ok: false, text: "", error: "gemini retornou resposta vazia.", providerUsed: provider, modelUsed: model };
    }

    // OpenAI-compatível: openai, deepseek, nvidia, openrouter, ollama.
    const url = `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        temperature: 0.2,
        stream: false,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, text: "", error: `provider HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    const text = textFromOpenAi(await res.json().catch(() => ({})));
    return text
      ? { ok: true, text, providerUsed: provider, modelUsed: model }
      : { ok: false, text: "", error: "provider retornou resposta vazia.", providerUsed: provider, modelUsed: model };
  } catch (e) {
    return { ok: false, text: "", error: e instanceof Error ? e.message : String(e) };
  }
}
