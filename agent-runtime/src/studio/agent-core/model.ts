// Cliente de modelo COM ferramentas (C1) — OpenAI-compatível e Gemini.
//
// É o motor de tool-calling do novo Coder/Planner. Usa EXATAMENTE o provider/
// modelo/chave resolvidos pelo runtime (sem fallback silencioso). Devolve um
// turno tipado: texto + tool calls (argumentos já parseados).

export interface AgentToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  rawArguments: string;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Imagens (data URLs) anexadas ao usuário — multimodal quando o provider suporta. */
  images?: Array<{ mime: string; dataUrl: string }>;
  toolCalls?: ModelToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ModelTurn {
  text: string;
  toolCalls: ModelToolCall[];
}

export interface ModelCallInput {
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  system: string;
  messages: ModelMessage[];
  tools: AgentToolSchema[];
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelCallResult {
  ok: boolean;
  turn?: ModelTurn;
  error?: string;
}

export type ModelCaller = (input: ModelCallInput) => Promise<ModelCallResult>;

function safeJsonParse(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Argumentos truncados/malformados NÃO podem virar uma tool-call "válida":
    // devolve vazio para que a tool falhe explicitamente (nunca sucesso falso).
    return {};
  }
}

function openAiMessages(system: string, messages: ModelMessage[]) {
  const out: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || "",
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })) }
          : {}),
      });
    } else if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content });
    } else if (m.images?.length) {
      // Multimodal OpenAI-compatível: content como array texto + image_url.
      out.push({
        role: m.role,
        content: [
          { type: "text", text: m.content || "" },
          ...m.images.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function parseOpenAiTurn(json: unknown): ModelTurn {
  const j = (json ?? {}) as { choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> } }> };
  const message = j.choices?.[0]?.message ?? {};
  const text = typeof message.content === "string" ? message.content.trim() : "";
  const toolCalls: ModelToolCall[] = (message.tool_calls ?? []).map((tc, i) => {
    const raw = typeof tc.function?.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? {});
    return { id: tc.id ?? `call_${i}`, name: String(tc.function?.name ?? ""), arguments: safeJsonParse(raw), rawArguments: raw };
  }).filter((tc) => tc.name);
  return { text, toolCalls };
}

function geminiContents(system: string, messages: ModelMessage[]) {
  const contents: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "system") continue; // vai em systemInstruction
    if (m.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
      if (parts.length) contents.push({ role: "model", parts });
    } else if (m.role === "tool") {
      contents.push({ role: "user", parts: [{ functionResponse: { name: m.name ?? "tool", response: { result: m.content } } }] });
    } else {
      const parts: Record<string, unknown>[] = [{ text: m.content }];
      for (const img of m.images ?? []) {
        const base64 = img.dataUrl.includes(",") ? img.dataUrl.slice(img.dataUrl.indexOf(",") + 1) : img.dataUrl;
        parts.push({ inlineData: { mimeType: img.mime, data: base64 } });
      }
      contents.push({ role: "user", parts });
    }
  }
  if (contents.length === 0) contents.push({ role: "user", parts: [{ text: system }] });
  return contents;
}

function parseGeminiTurn(json: unknown): ModelTurn {
  const j = (json ?? {}) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> } }> };
  const parts = j.candidates?.[0]?.content?.parts ?? [];
  const texts: string[] = [];
  const toolCalls: ModelToolCall[] = [];
  parts.forEach((p, i) => {
    if (typeof p.text === "string" && p.text.trim()) texts.push(p.text.trim());
    if (p.functionCall?.name) {
      toolCalls.push({ id: `gemini_${i}`, name: p.functionCall.name, arguments: safeJsonParse(p.functionCall.args), rawArguments: JSON.stringify(p.functionCall.args ?? {}) });
    }
  });
  return { text: texts.join("\n").trim(), toolCalls };
}

/** Chama o modelo com ferramentas. NUNCA troca de provider. */
export async function callModelWithTools(input: ModelCallInput): Promise<ModelCallResult> {
  const provider = String(input.providerId ?? "").toLowerCase();
  const baseUrl = String(input.baseUrl ?? "").replace(/\/+$/, "");
  const model = String(input.modelId ?? "");
  if (!baseUrl || !model) return { ok: false, error: "Provider/modelo não resolvidos para o agente." };
  if (!input.apiKey && provider !== "ollama") return { ok: false, error: "Sem API key do provider para o agente." };
  const timeoutMs = input.timeoutMs ?? 120_000;

  try {
    if (provider === "gemini") {
      const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey ?? "")}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: geminiContents(input.system, input.messages),
          tools: input.tools.length ? [{ functionDeclarations: input.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] : undefined,
          generationConfig: { temperature: input.temperature ?? 0.3, ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}) },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `gemini HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
      }
      return { ok: true, turn: parseGeminiTurn(await res.json().catch(() => ({}))) };
    }

    // OpenAI-compatível (deepseek/openai/nvidia/openrouter/ollama).
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}) },
      body: JSON.stringify({
        model,
        messages: openAiMessages(input.system, input.messages),
        tools: input.tools.length ? input.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) : undefined,
        tool_choice: input.tools.length ? "auto" : undefined,
        temperature: input.temperature ?? 0.3,
        stream: false,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `provider HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { ok: true, turn: parseOpenAiTurn(await res.json().catch(() => ({}))) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
