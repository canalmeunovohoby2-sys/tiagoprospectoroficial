// Vision support (5.22) — detecção honesta de capacidade multimodal do
// provider/modelo ativo + preparação do screenshot para envio ao modelo.
//
// REGRA: nunca fingir análise visual. Se o modelo não suportar imagens, o
// sistema NÃO envia o screenshot como imagem e sinaliza que a revisão visual
// não ocorreu (o agente continua com DOM/métricas/Quality Gate).
// Quando suportar (allowlist + flag), o screenshot vira ImageContent anexado
// ao próximo request do Agent Loop via hook beforeModel.

export const VISION_MODEL_HINTS = [
  // OpenAI (chat completions com image_url)
  "gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-4.5",
  // Google
  "gemini-2.5", "gemini-2.0", "gemini-1.5", "gemini-1.0",
  // Anthropic
  "claude-3", "claude-3.5", "claude-3.7", "claude-sonnet-4", "claude-opus-4", "claude-haiku",
  // Mistral / Qwen / Llama vision
  "pixtral", "qwen2-vl", "qwen3-vl", "qwen-vl", "llama-3.2", "gpt-oss-120b",
];

function envOn(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

export interface VisionConfig {
  provider: string;
  model: string;
  supported: boolean;
  reason: string;
}

/** Decide se o provider/modelo ativo consegue receber imagem. */
export function resolveVisionCapability(opts?: { provider?: string; model?: string }): VisionConfig {
  const provider = (opts?.provider ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek").toLowerCase();
  const model = (opts?.model ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat").toLowerCase();

  // Override explícito do operador (provedor vision configurado no runtime).
  if (envOn("PROSPECTOR_VISION") && process.env.PROSPECTOR_VISION_MODEL) {
    return { provider, model, supported: true, reason: "override explícito PROSPECTOR_VISION" };
  }

  // DeepSeek NÃO tem API de imagem — nunca declara visão (anti-falso).
  if (provider.includes("deepseek")) {
    return { provider, model, supported: false, reason: "deepseek não oferece entrada de imagem na API" };
  }

  // Allowlist por modelo.
  const hinted = VISION_MODEL_HINTS.some((h) => model.includes(h));
  if (hinted) {
    return { provider, model, supported: true, reason: "modelo na allowlist vision" };
  }

  return { provider, model, supported: false, reason: "modelo sem suporte conhecido a imagens" };
}

// Converte um arquivo PNG/JPEG em data URL base64 (limite de ~1.8MB).
export async function imageToDataUrl(filePath: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const fs = await import("node:fs");
    const buf = await fs.promises.readFile(filePath);
    if (buf.length > 2_500_000) return null; // grande demais p/ enviar
    const lower = filePath.toLowerCase();
    const mediaType = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" : lower.endsWith(".webp") ? "image/webp" : "image/png";
    return { data: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}
