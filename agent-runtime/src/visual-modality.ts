// Visual modality (6.0) — detecção EXPLÍCITA e provider-agnostic de suporte
// multimodal (entrada de imagem) do provider/modelo configurado pelo usuário.
// NÃO assume suporte: capacidade desconhecida → structured. NUNCA usa Gemini como
// fallback — analisa com o PROVIDER CONFIGURADO (ou evidência estruturada).
// Puro e testável.

export type VisualMode = "multimodal" | "structured";

// Nomes de modelo reconhecidamente capazes de visão (heurística; vazio/desconhecido → false).
const VISION_MODEL =
  /vision|vlm|multimodal|gpt-4o|gpt-4-turbo|gpt-4\.[0-9]*-vision|o3|o4|gemini-2\.5-flash|gemini-2\.5-pro|gemini-2\.0-flash|gemini-1\.5-flash|gemini-1\.5-pro|llava|qwen.*vl|qwen2\.5-vl|qwen3.*-vl|gemma.*vision|llama.*vision|minicpm-v|pixtral|idefics|internvl/i;

export function supportsMultimodal(providerId?: string, modelId?: string): boolean {
  const p = String(providerId ?? "").toLowerCase().trim();
  const m = String(modelId ?? "").toLowerCase().trim();
  if (!m) return false;
  // Família Gemini (somente se o PROVIDER configurado for gemini).
  if (p === "gemini") return /gemini-2\.5-flash|gemini-2\.5-pro|gemini-2\.0-flash|gemini-2\.0-pro|gemini-1\.5-flash|gemini-1\.5-pro/i.test(m) || VISION_MODEL.test(m);
  // OpenAI / OpenAI-compatible: só modelos de visão explícitos.
  if (p === "openai") return /gpt-4o|gpt-4-turbo|gpt-4-vision|o3|o4/i.test(m) && !/gpt-3\.5/i.test(m);
  // DeepSeek não é multimodal.
  if (p === "deepseek") return false;
  // Ollama: modelos de visão do Ollama (heuristic).
  if (p === "ollama") return /llava|qwen.*vl|qwen2\.5-vl|qwen3.*-vl|gemma.*vision|llama.*vision|minicpm-v/i.test(m);
  // NVIDIA (openai-compatible): modelos com visão.
  if (p === "nvidia") return /vision|vlm|llama-3\.2-[0-9]+b-vision/i.test(m);
  // OpenRouter / outros: não assumir → structured (capacidade desconhecida).
  return false;
}
