// AI Gateway — camada única e desacoplada de provedores (nvidia|deepseek|openai|gemini).
// Config por secrets/edge env: AI_PROVIDER, AI_FALLBACK_PROVIDER, AI_MODEL,
// AI_TEMPERATURE, AI_TOP_P, AI_MAX_TOKENS, AI_REASONING_EFFORT, AI_TIMEOUT_MS,
// AI_MAX_RETRIES e por provider (<PROVIDER>_API_KEY/<PROVIDER>_MODEL).
// Funções de negócio usam apenas generateText/extractJson.

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_NVIDIA_MODEL = "deepseek-ai/deepseek-v4-flash-0731";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Provider e modelo padrão do produto. O DeepSeek é o motor principal do
// Prospector; os demais ficam disponíveis para health check/fallback manual.
export const DEFAULT_PROVIDER: ProviderName = "deepseek";

export type ProviderName = "nvidia" | "deepseek" | "openai" | "gemini";
export type AiKind = "missing_key" | "rate_limit" | "auth" | "bad_request" | "timeout" | "empty" | "upstream" | "config";
export interface AIMessage { role: "system" | "user"; content: string }

export class AiError extends Error {
  status: number; kind: AiKind; detail?: string; provider?: string;
  constructor(message: string, status: number, kind: AiKind, detail?: string, provider?: string) {
    super(message); this.status = status; this.kind = kind; this.detail = detail; this.provider = provider;
  }
}
export class AIProviderError extends AiError {}
export class AIProviderTimeoutError extends AIProviderError {
  constructor(detail?: string, provider?: string) { super("O provedor de IA excedeu o tempo de resposta.", 504, "timeout", detail, provider); }
}
export class AIProviderRateLimitError extends AIProviderError {
  constructor(detail?: string, provider?: string) { super("Limite de uso do provedor de IA atingido. Tente novamente em instantes.", 429, "rate_limit", detail, provider); }
}
export class AIProviderUnavailableError extends AIProviderError {
  constructor(status: number, detail?: string, provider?: string) { super(`Provedor de IA indisponível (HTTP ${status}).`, status, "upstream", detail, provider); }
}
export class AIProviderConfigurationError extends AIProviderError {
  constructor(message: string, provider?: string) { super(message, 500, "config", undefined, provider); }
}

export interface NormalizedAIResponse { content: string; provider: ProviderName; model: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; }
export interface GenerateTextOptions {
  system?: string; user: string; temperature?: number; topP?: number; json?: boolean;
  maxOutputTokens?: number; model?: string; provider?: ProviderName | "auto";
  timeoutMs?: number; reasoningEffort?: "low" | "medium" | "high"; fallbackProvider?: ProviderName;
  /** Chave custom por chamada (server-side). Usada no lugar da env para este provider. */
  apiKey?: string;
  /** Chaves por provider (ex.: fallback em provider diferente). Nunca vai ao cliente. */
  apiKeys?: Partial<Record<ProviderName, string>>;
}
export interface GenerateTextResult { text: string; model: string; provider: ProviderName; fallbackUsed?: boolean }

const TRANSIENT = new Set<AiKind>(["rate_limit", "upstream", "timeout"]);
function getEnv(key: string): string | undefined {
  const deno = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return deno?.env?.get(key);
}
function numEnv(key: string, fallback: number): number {
  const raw = Number(getEnv(key) ?? ""); return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}
function textFrom(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : "")).join("");
  return "";
}
function normError(provider: ProviderName, status: number, raw: string): AIProviderError {
  const d = (raw || "").slice(0, 400);
  if (status === 401 || status === 403) return new AIProviderError(`Credencial ${provider} inválida ou sem autorização.`, status, "auth", d, provider);
  if (status === 429) return new AIProviderRateLimitError(d, provider);
  if (status === 408 || status === 504) return new AIProviderTimeoutError(d, provider);
  if (status >= 500 || status === 529) return new AIProviderUnavailableError(status, d, provider);
  if (status === 400) return new AIProviderError("Requisição de IA rejeitada (verifique o modelo/configuração).", 400, "bad_request", d, provider);
  return new AIProviderError(`Falha no provedor (HTTP ${status}).`, status, "upstream", d, provider);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url: string, init: RequestInit, provider: ProviderName, timeoutMs: number, maxRetries: number): Promise<Response> {
  const retries = Math.max(0, Math.min(maxRetries, 3));
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response | null = null;
    let err: AIProviderError | null = null;
    try {
      res = await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || ctrl.signal.aborted);
      err = aborted ? new AIProviderTimeoutError(undefined, provider) : new AIProviderError("Erro de rede no provedor de IA.", 0, "upstream", e instanceof Error ? e.message : "network", provider);
    } finally {
      clearTimeout(timer);
    }
    if (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * (attempt + 1));
      continue;
    }
    const transient = res!.status === 429 || res!.status === 529 || res!.status === 408 || res!.status === 504 || res!.status >= 500;
    if (!transient || attempt >= retries) return res!;
    const d = await res!.text().catch(() => "");
    err = normError(provider, res!.status, d);
    if (attempt < retries) await sleep(500 * (attempt + 1));
    else throw err;
  }
}

function cfgFor(provider: ProviderName): { apiKeyEnv: string; modelEnv: string; defaultModel: string; baseUrl: string; defaultTimeout: number; type: "openai" | "gemini" } {
  switch (provider) {
    case "nvidia": return { apiKeyEnv: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL", defaultModel: DEFAULT_NVIDIA_MODEL, baseUrl: NVIDIA_BASE_URL, defaultTimeout: 150_000, type: "openai" };
    case "deepseek": return { apiKeyEnv: "DEEPSEEK_API_KEY", modelEnv: "DEEPSEEK_MODEL", defaultModel: DEFAULT_DEEPSEEK_MODEL, baseUrl: DEEPSEEK_BASE_URL, defaultTimeout: 120_000, type: "openai" };
    case "openai": return { apiKeyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: DEFAULT_OPENAI_MODEL, baseUrl: OPENAI_BASE_URL, defaultTimeout: 120_000, type: "openai" };
    case "gemini": return { apiKeyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: DEFAULT_GEMINI_MODEL, baseUrl: GEMINI_BASE, defaultTimeout: 55_000, type: "gemini" };
  }
}

async function parseOpenAi(res: Response, provider: ProviderName, model: string): Promise<NormalizedAIResponse> {
  const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: Record<string, unknown> }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null;
  if (!data) throw new AIProviderError("Resposta inválida do provedor.", 502, "empty", undefined, provider);
  const msg = data.choices?.[0]?.message && typeof data.choices[0].message === "object" ? data.choices[0].message : {};
  const content = textFrom(msg.content).trim();
  if (!content) throw new AIProviderError("O provedor retornou resposta vazia.", 502, "empty", undefined, provider);
  return { content, provider, model, usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens } : undefined };
}

async function openAiLike(opts: { messages: AIMessage[]; temperature: number; topP: number; maxTokens: number; json: boolean; provider: ProviderName; apiKey: string; baseUrl: string; model: string; timeoutMs: number; maxRetries: number; reasoningEffort?: string }): Promise<NormalizedAIResponse> {
  const body: Record<string, unknown> = { model: opts.model, messages: opts.messages, temperature: opts.temperature, top_p: opts.topP, max_tokens: opts.maxTokens, stream: false };
  if (opts.json && (opts.provider === "openai" || opts.provider === "deepseek")) body.response_format = { type: "json_object" };
  if (opts.provider === "nvidia") {
    const kwargs: Record<string, unknown> = {};
    if (getEnv("NVIDIA_THINKING") !== "false") {
      kwargs[getEnv("NVIDIA_THINKING_PARAM") ?? "enable_thinking"] = true;
      if (opts.reasoningEffort === "high" || opts.reasoningEffort === "medium" || opts.reasoningEffort === "low") kwargs.reasoning_effort = opts.reasoningEffort;
    }
    if (Object.keys(kwargs).length) body.chat_template_kwargs = kwargs;
  }
  const endpoint = `${opts.baseUrl}/chat/completions`;
  const call = async (b: Record<string, unknown>): Promise<NormalizedAIResponse> => {
    const res = await fetchRetry(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` }, body: JSON.stringify(b) }, opts.provider, opts.timeoutMs, opts.maxRetries);
    if (res.ok) return parseOpenAi(res, opts.provider, opts.model);
    const detail = await res.text().catch(() => "");
    if (opts.provider === "nvidia" && res.status === 400 && /chat_template_kwargs|unknown argument|reasoning_effort|extra_for_body/i.test(detail)) {
      const b2 = { ...b }; delete b2.chat_template_kwargs;
      const res2 = await fetchRetry(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` }, body: JSON.stringify(b2) }, opts.provider, opts.timeoutMs, 0);
      if (res2.ok) return parseOpenAi(res2, opts.provider, opts.model);
    }
    throw normError(opts.provider, res.status, detail);
  };
  return call(body);
}

async function geminiLike(opts: { messages: AIMessage[]; temperature: number; maxTokens: number; json: boolean; provider: ProviderName; apiKey: string; model: string; timeoutMs: number; maxRetries: number }): Promise<NormalizedAIResponse> {
  const gen: Record<string, unknown> = { temperature: opts.temperature, maxOutputTokens: opts.maxTokens };
  if (opts.json) gen.responseMimeType = "application/json";
  const payload: Record<string, unknown> = { contents: [{ role: "user", parts: [{ text: opts.messages[opts.messages.length - 1]?.content ?? "" }] }], generationConfig: gen };
  const sys = opts.messages.find((m) => m.role === "system")?.content;
  if (sys) payload.systemInstruction = { parts: [{ text: sys }] };
  const res = await fetchRetry(`${GEMINI_BASE}/models/${opts.model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey }, body: JSON.stringify(payload) }, opts.provider, opts.timeoutMs, opts.maxRetries);
  if (!res.ok) { const d = await res.text().catch(() => ""); throw normError(opts.provider, res.status, d); }
  const data = (await res.json().catch(() => null)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null;
  const raw = Array.isArray(data?.candidates) ? data.candidates.map((c) => c?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "").join("") : "";
  const content = raw.trim();
  if (!content) throw new AIProviderError("O provedor retornou resposta vazia.", 502, "empty", undefined, opts.provider);
  return { content, provider: opts.provider, model: opts.model };
}

function resolveProvider(opts: GenerateTextOptions): ProviderName {
  const asked = opts.provider === "auto" || !opts.provider ? (getEnv("AI_PROVIDER") ?? DEFAULT_PROVIDER) : opts.provider;
  if (asked === "nvidia" || asked === "deepseek" || asked === "openai" || asked === "gemini") return asked;
  throw new AIProviderConfigurationError(`AI_PROVIDER inválido: ${asked}`);
}

async function runProvider(provider: ProviderName, opts: GenerateTextOptions, temperature: number, topP: number, maxTokens: number, maxRetries: number, reasoningEffort: string | undefined, messages: AIMessage[]): Promise<NormalizedAIResponse> {
  const cfg = cfgFor(provider);
  const custom = opts.apiKeys?.[provider] ?? opts.apiKey;
  const key = custom ?? getEnv(cfg.apiKeyEnv);
  if (!key) throw new AIProviderConfigurationError(`Chave de API ausente para ${provider}. Configure nas Configurações ou como secret do Supabase.`, provider);
  const model = opts.model ?? getEnv("AI_MODEL") ?? getEnv(cfg.modelEnv) ?? cfg.defaultModel;
  const timeoutMs = opts.timeoutMs ?? numEnv("AI_TIMEOUT_MS", cfg.defaultTimeout);
  const common = { model, timeoutMs, maxRetries, provider, apiKey: key };
  if (cfg.type === "gemini") return geminiLike({ messages, temperature, maxTokens, json: !!opts.json, ...common });
  return openAiLike({ messages, temperature, topP, maxTokens, json: !!opts.json, baseUrl: cfg.baseUrl, reasoningEffort, ...common });
}

export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const primary = resolveProvider(opts);
  const hasPrimaryKey = opts.apiKeys?.[primary] ?? opts.apiKey ?? getEnv(cfgFor(primary).apiKeyEnv);
  if (!hasPrimaryKey) throw new AIProviderConfigurationError(`Chave de API ausente para ${primary}.`, primary);
  const temperature = opts.temperature ?? numEnv("AI_TEMPERATURE", 0.85);
  const topP = opts.topP ?? numEnv("AI_TOP_P", 0.95);
  const maxTokens = opts.maxOutputTokens ?? numEnv("AI_MAX_TOKENS", 4096);
  const maxRetries = numEnv("AI_MAX_RETRIES", 1);
  const reasoningEffort = opts.reasoningEffort ?? getEnv("AI_REASONING_EFFORT");
  const messages: AIMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  try {
    const r = await runProvider(primary, opts, temperature, topP, maxTokens, maxRetries, reasoningEffort, messages);
    console.info("[ai] ok", { provider: r.provider, model: r.model, len: r.content.length, fallback_used: false });
    return { text: r.content, model: r.model, provider: r.provider, fallbackUsed: false };
  } catch (e) {
    const err = e instanceof AiError ? e : new AIProviderError(e instanceof Error ? e.message : "erro", 500, "upstream");
    const fallbackName = opts.fallbackProvider ?? (getEnv("AI_FALLBACK_PROVIDER") as ProviderName | undefined);
    if (fallbackName && TRANSIENT.has(err.kind) && (fallbackName === "nvidia" || fallbackName === "deepseek" || fallbackName === "openai" || fallbackName === "gemini")) {
      try {
        const r = await runProvider(fallbackName, opts, temperature, topP, maxTokens, maxRetries, reasoningEffort, messages);
        console.info("[ai] ok", { provider: r.provider, model: r.model, len: r.content.length, fallback_used: true, primary });
        return { text: r.content, model: r.model, provider: r.provider, fallbackUsed: true };
      } catch (fb) {
        console.warn("[ai] error", { provider: primary, fallback: fallbackName, kind: err.kind, status: err.status });
        throw fb instanceof AiError ? fb : err;
      }
    }
    console.warn("[ai] error", { provider: primary, kind: err.kind, status: err.status });
    throw err;
  }
}

export function extractJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* noop */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* noop */ }
  }
  return {};
}
