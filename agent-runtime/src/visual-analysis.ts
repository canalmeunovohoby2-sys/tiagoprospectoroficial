// Visual Analysis (6.0) — envia a evidência ao PROVIDER/MODELO CONFIGURADO pelo
// usuário quando houver suporte multimodal. Se não houver (ou a chamada falhar),
// NÃO usa Gemini nem nenhum provider como fallback silencioso — devolve a
// evidência estruturada honesta. Nunca afirma que houve análise visual por imagem
// quando ela não aconteceu.
import type { VisualEvidence } from "./visual-evidence.js";
import { hasScreenshot, summarizeStructuredEvidence } from "./visual-evidence.js";
import { supportsMultimodal, type VisualMode } from "./visual-modality.js";

export interface VisualAnalysisResult {
  mode: VisualMode;
  /** true APENAS se uma análise visual por imagem foi realmente executada com sucesso. */
  performed: boolean;
  analysis: string;
  /** erro real (multimodal falhou) — preserva a evidência estruturada. */
  error?: string;
  providerUsed?: string;
  modelUsed?: string;
}

export interface VisualAnalysisInput {
  prompt: string;
  evidence: VisualEvidence;
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

function textOf(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const j = json as Record<string, unknown>;
  const parts: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string" && v.trim()) parts.push(v.trim()); };
  push((j as { output_text?: unknown }).output_text);
  push((j as { text?: unknown }).text);
  const cands = (j as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  for (const c of cands ?? []) for (const p of c.content?.parts ?? []) push(p?.text);
  const choices = (j as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  for (const c of choices ?? []) {
    const con = c.message?.content;
    if (typeof con === "string") push(con);
    else if (Array.isArray(con)) {
      for (const x of con) {
        if (x && typeof x === "object" && (x as { type?: string }).type === "text") push((x as { text?: string }).text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function callGeminiMultimodal(input: VisualAnalysisInput, baseUrl: string): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models/${input.model}:generateContent?key=${encodeURIComponent(input.apiKey ?? "")}`;
  const content = input.evidence.screenshot!.data;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: input.prompt },
          { inline_data: { mime_type: input.evidence.screenshot!.mimeType, data: content } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
  return textOf(await res.json().catch(() => ({})));
}

async function callOpenAiLikeMultimodal(input: VisualAnalysisInput, baseUrl: string): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const mime = input.evidence.screenshot!.mimeType;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey ?? ""}` },
    body: JSON.stringify({
      model: input.model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${input.evidence.screenshot!.data}` } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`provider HTTP ${res.status}`);
  return textOf(await res.json().catch(() => ({})));
}

async function callProviderMultimodal(input: VisualAnalysisInput): Promise<string> {
  const p = String(input.provider ?? "").toLowerCase();
  const base = input.baseUrl ?? "";
  // Gemini usa endpoint próprio; OpenAI-compat (openai/nvidia/ollama/openrouter)
  // usam /chat/completions com content Array + image_url. Nenhum fallback entre eles.
  if (p === "gemini") return callGeminiMultimodal(input, base);
  return callOpenAiLikeMultimodal(input, base);
}

export async function analyzeVisualEvidence(input: VisualAnalysisInput): Promise<VisualAnalysisResult> {
  const multi = supportsMultimodal(input.provider, input.model);
  const hasShot = hasScreenshot(input.evidence);
  const structured = summarizeStructuredEvidence(input.evidence);

  if (multi && hasShot && input.apiKey) {
    try {
      const analysis = await callProviderMultimodal(input);
      const done = analysis.trim().length > 0;
      return {
        mode: "multimodal",
        performed: done,
        analysis: done ? analysis : structured,
        error: done ? undefined : "análise multimodal retornou vazia; usando evidência estruturada.",
        providerUsed: input.provider,
        modelUsed: input.model,
      };
    } catch (e) {
      // Falha do provider multimodal → NÃO cai para Gemini/outro; usa structured honesta.
      return {
        mode: "structured",
        performed: false,
        analysis: structured,
        error: `análise multimodal falhou (${e instanceof Error ? e.message : String(e)}). Nenhuma análise visual por imagem foi realizada.`,
        providerUsed: input.provider,
        modelUsed: input.model,
      };
    }
  }

  // Não multimodal (ou sem screenshot/sem chave) → evidência estruturada honesta.
  const reason = !multi
    ? "provider/modelo não suporta entrada multimodal (ou capacidade desconhecida)"
    : !hasShot
      ? "nenhum screenshot real disponível"
      : "sem API Key do provider";
  return {
    mode: "structured",
    performed: false,
    analysis: structured,
    error: reason,
    providerUsed: input.provider,
    modelUsed: input.model,
  };
}
