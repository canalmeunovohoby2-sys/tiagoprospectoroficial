// Camada de IA compartilhada das Edge Functions do LeadHunter/Prospector.
// Provedor atual: Google Gemini (API oficial) via secret GEMINI_API_KEY.
// Para trocar de provedor no futuro, basta substituir generateText mantendo
// o contrato { text } — nenhuma edge function precisa conhecer o provedor.

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 55_000;

export type AiKind = "missing_key" | "rate_limit" | "auth" | "bad_request" | "timeout" | "empty" | "upstream";

export class AiError extends Error {
  status: number;
  kind: AiKind;
  detail?: string;

  constructor(message: string, status: number, kind: AiKind, detail?: string) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

export interface GenerateTextOptions {
  system?: string;
  user: string;
  temperature?: number;
  json?: boolean;
  maxOutputTokens?: number;
  model?: string;
}

export interface GenerateTextResult {
  text: string;
  model: string;
}

export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new AiError(
      "GEMINI_API_KEY ausente. Configure o secret GEMINI_API_KEY nas Edge Functions do Supabase.",
      500,
      "missing_key",
    );
  }

  const model = opts.model ?? Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 600);
      if (res.status === 429) {
        throw new AiError("Limite de uso da IA atingido. Tente novamente em instantes.", 429, "rate_limit", detail);
      }
      if (res.status === 401 || res.status === 403) {
        throw new AiError(
          "GEMINI_API_KEY inválida ou sem permissão para este modelo. Verifique a chave no Supabase.",
          res.status,
          "auth",
          detail,
        );
      }
      if (res.status === 400) {
        throw new AiError("Requisição de IA rejeitada (verifique o modelo/configuração).", 400, "bad_request", detail);
      }
      throw new AiError(`Falha na chamada da IA (HTTP ${res.status}).`, 500, "upstream", detail);
    }

    const data = await res.json().catch(() => null);
    const candidates = Array.isArray((data as { candidates?: unknown })?.candidates)
      ? (data as { candidates: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
      : [];
    const raw = candidates
      .map((c) => c?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "")
      .join("")
      .trim();

    if (!raw) {
      throw new AiError("A IA retornou resposta vazia.", 502, "empty");
    }

    return { text: raw, model };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (controller.signal.aborted) {
      throw new AiError("Tempo limite da requisição de IA excedido. Tente novamente.", 504, "timeout");
    }
    throw new AiError(e instanceof Error ? e.message : "Erro inesperado na chamada de IA", 500, "upstream");
  } finally {
    clearTimeout(timer);
  }
}

// Extrai um objeto JSON da resposta (aceita JSON puro ou texto embrulhado).
export function extractJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch { /* tenta bloco abaixo */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch { /* não é JSON */ }
  }
  return {};
}
