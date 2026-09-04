// Camada de IA compartilhada das Edge Functions do LeadHunter/Prospector.
// Ponto único de acesso a provedores de IA:
//   Application → AI Adapter → Provider (gemini | nvidia)
//
// - Gemini: API oficial generativelanguage.googleapis.com (secret GEMINI_API_KEY).
// - NVIDIA NIM: endpoint compatível OpenAI (secret NVIDIA_API_KEY), modelo
//   deepseek-ai/deepseek-v4-flash-0731.
//
// Nenhuma edge function implementa HTTP específico de provider.

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_NVIDIA_MODEL = "deepseek-ai/deepseek-v4-flash-0731";
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_REQUEST_TIMEOUT_MS = 55_000;
const NVIDIA_REQUEST_TIMEOUT_MS = 150_000;

export type ProviderName = "gemini" | "nvidia";
export type AiKind = "missing_key" | "rate_limit" | "auth" | "bad_request" | "timeout" | "empty" | "upstream";

export class AiError extends Error {
  status: number;
  kind: AiKind;
  detail?: string;
  provider?: string;

  constructor(message: string, status: number, kind: AiKind, detail?: string, provider?: string) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.detail = detail;
    this.provider = provider;
  }
}

export interface GenerateTextOptions {
  system?: string;
  user: string;
  temperature?: number;
  json?: boolean;
  maxOutputTokens?: number;
  model?: string;
  provider?: ProviderName | "auto";
  timeoutMs?: number;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  provider: ProviderName;
}

function getEnv(key: string): string | undefined {
  const deno = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return deno?.env?.get(key);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asTextFromParts(content: unknown): string {
  // OpenAI-compatible content pode vir como string ou array de parts.
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (isObj(p) && typeof p.text === "string") return p.text;
        return "";
      })
      .join("");
  }
  return "";
}

function normalizeStatusError(provider: ProviderName, status: number, rawDetail: string): AiError {
  const detail = (rawDetail || "").slice(0, 400);
  if (status === 401 || status === 403) {
    return new AiError(
      provider === "nvidia" ? "Credencial NVIDIA inválida ou sem autorização. Verifique a secret NVIDIA_API_KEY." : "Credencial Gemini inválida ou sem permissão para este modelo.",
      status,
      "auth",
      detail,
      provider,
    );
  }
  if (status === 429) {
    return new AiError("Limite de uso do provedor de IA atingido. Tente novamente em instantes.", 429, "rate_limit", detail, provider);
  }
  if (status === 408 || status === 504) {
    return new AiError("O provedor de IA excedeu o tempo de resposta.", status, "timeout", detail, provider);
  }
  if (status >= 500) {
    return new AiError(`Provedor de IA indisponível (HTTP ${status}).`, status, "upstream", detail, provider);
  }
  if (status === 400) {
    return new AiError("Requisição de IA rejeitada (verifique o modelo/configuração).", 400, "bad_request", detail, provider);
  }
  return new AiError(`Falha na chamada do provedor de IA (HTTP ${status}).`, status, "upstream", detail, provider);
}

// ---------------------------------------------------------------------------
// GEMINI
// ---------------------------------------------------------------------------

async function geminiGenerateText(opts: GenerateTextOptions, model: string): Promise<GenerateTextResult> {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    throw new AiError("GEMINI_API_KEY ausente. Configure o secret GEMINI_API_KEY nas Edge Functions do Supabase.", 500, "missing_key", undefined, "gemini");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
  try {
    const generationConfig: Record<string, unknown> = {
      temperature: opts.temperature ?? 0.85,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
    };
    if (opts.json) generationConfig.responseMimeType = "application/json";

    const payload: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig,
    };
    if (opts.system) payload.systemInstruction = { parts: [{ text: opts.system }] };

    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 600);
      throw normalizeStatusError("gemini", res.status, detail);
    }

    const data = await res.json().catch(() => null);
    const candidates = Array.isArray((data as { candidates?: unknown })?.candidates)
      ? (data as { candidates: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
      : [];
    const raw = candidates
      .map((c) => c?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "")
      .join("")
      .trim();
    if (!raw) throw new AiError("O provedor retornou resposta vazia.", 502, "empty", undefined, "gemini");
    return { text: raw, model, provider: "gemini" };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (controller.signal.aborted) throw new AiError("Tempo limite da requisição de IA excedido. Tente novamente.", 504, "timeout", undefined, "gemini");
    throw new AiError(e instanceof Error ? e.message : "Erro inesperado na chamada de IA", 500, "upstream", undefined, "gemini");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// NVIDIA NIM (DeepSeek V4 Flash 0731) — compatível com OpenAI Chat Completions
// ---------------------------------------------------------------------------

function nvidiaBody(opts: GenerateTextOptions, model: string): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  return {
    model,
    messages,
    temperature: 1,
    top_p: 0.95,
    max_tokens: opts.maxOutputTokens ?? 16384,
    stream: false,
  };
}

async function nvidiaGenerateText(opts: GenerateTextOptions, model: string): Promise<GenerateTextResult> {
  const apiKey = getEnv("NVIDIA_API_KEY");
  if (!apiKey) {
    throw new AiError("NVIDIA_API_KEY ausente. Configure o secret NVIDIA_API_KEY nas Edge Functions do Supabase.", 500, "missing_key", undefined, "nvidia");
  }

  const baseUrl = getEnv("NVIDIA_BASE_URL") ?? NVIDIA_BASE_URL;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? (Number(getEnv("NVIDIA_TIMEOUT_MS") ?? "") || NVIDIA_REQUEST_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const base = nvidiaBody(opts, model);
  // Reasoning habilitado conforme o exemplo oficial. Se o endpoint rejeitar o
  // parâmetro, fazemos uma única reexecução sem chat_template_kwargs.
  const withReasoning = { ...base, chat_template_kwargs: { thinking: true, reasoning_effort: "high" } };

  const doPost = async (body: Record<string, unknown>): Promise<Response> =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

  try {
    let res = await doPost(withReasoning);
    if (res.status === 400) {
      const errText = await res.text().catch(() => "");
      const lower = errText.toLowerCase();
      // Parâmetro de reasoning não suportado → tenta sem ele (uma única vez).
      if (lower.includes("chat_template_kwargs") || lower.includes("unknown argument") || lower.includes("extra_for_body") || lower.includes("reasoning_effort")) {
        res = await doPost(base);
      } else {
        throw normalizeStatusError("nvidia", 400, errText);
      }
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw normalizeStatusError("nvidia", res.status, detail);
    }

    const data = await res.json().catch(() => null);
    const choice = Array.isArray((data as { choices?: unknown })?.choices)
      ? (data as { choices: Array<{ message?: Record<string, unknown> }> }).choices[0]
      : undefined;
    const message = isObj(choice?.message) ? choice.message : {};
    const raw = asTextFromParts(message.content).trim();
    // reasoning / reasoning_content podem existir — são descartados de propósito.
    if (!raw) throw new AiError("O provedor retornou resposta vazia.", 502, "empty", undefined, "nvidia");
    return { text: raw, model, provider: "nvidia" };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (controller.signal.aborted) throw new AiError("Tempo limite da requisição de IA excedido.", 504, "timeout", undefined, "nvidia");
    throw new AiError(e instanceof Error ? e.message : "Erro inesperado na chamada de IA", 500, "upstream", undefined, "nvidia");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// ADAPTER (ponto único)
// ---------------------------------------------------------------------------

function resolveProvider(opts: GenerateTextOptions): { provider: ProviderName; model: string } {
  const asked = opts.provider === "auto" || !opts.provider ? (getEnv("AI_PROVIDER") ?? "gemini") : opts.provider;
  if (asked === "nvidia") {
    return { provider: "nvidia", model: opts.model ?? getEnv("NVIDIA_MODEL") ?? DEFAULT_NVIDIA_MODEL };
  }
  return { provider: "gemini", model: opts.model ?? getEnv("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL };
}

export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const { provider, model } = resolveProvider(opts);
  try {
    const result = provider === "nvidia"
      ? await nvidiaGenerateText(opts, model)
      : await geminiGenerateText(opts, model);
    // Log de resumo apenas — nunca conteúdo, nunca chaves, nunca authorization.
    console.info("[ai] ok", { provider, model, len: result.text.length });
    return result;
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(e instanceof Error ? e.message : "erro", 500, "upstream", undefined, provider);
    console.warn("[ai] error", { provider, kind: err.kind, status: err.status });
    throw err;
  }
}

// Extrai um objeto JSON da resposta (aceita JSON puro ou texto embrulhado,
// inclusive quando precedido de reasoning/blocos de código).
export function extractJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* tenta bloco abaixo */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* não é JSON */ }
  }
  return {};
}
