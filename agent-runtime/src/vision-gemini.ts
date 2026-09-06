// Gemini Vision adapter (5.23) — analisador VISUAL especializado.
// DeepSeek continua executando o site; o Gemini é chamado SOMENTE para avaliar
// screenshots e devolver diagnóstico estruturado, que volta ao Agent Loop como
// tool result (texto). A chave vive no Supabase (gemini-vision edge function).
import { imageToDataUrl } from "./vision.js";

export interface VisualIssue {
  severity: "alta" | "media" | "baixa";
  area: string;
  description: string;
  fix: string;
}

export interface VisualReviewResult {
  ok: boolean;
  summary?: string;
  issues?: VisualIssue[];
  error?: string;
  usedVision: boolean; // true somente se o Gemini recebeu o screenshot de fato
}

export interface GeminiVisionInput {
  screenshotPath: string;
  viewport?: { width?: number; height?: number };
  context?: string;
  purpose?: string;
  projectId?: string;
}

const SUPABASE_URL = process.env.PROSPECTOR_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.PROSPECTOR_SUPABASE_ANON ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

// Analisa um screenshot com o Gemini (via edge function; chave no Supabase).
export async function visualReviewWithGemini(input: GeminiVisionInput): Promise<VisualReviewResult> {
  const img = await imageToDataUrl(input.screenshotPath);
  if (!img) {
    return { ok: false, usedVision: false, error: "Falha ao converter screenshot para base64." };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
      body: JSON.stringify({
        imageBase64: img.data,
        mediaType: img.mediaType,
        viewport: input.viewport,
        context: (input.context ?? "").slice(0, 800),
        purpose: input.purpose ?? "avaliar qualidade visual do site",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, usedVision: false, error: `Gemini falhou (HTTP ${res.status}): ${detail.slice(0, 300)}` };
    }
    const data = (await res.json()) as { ok?: boolean; analysis?: { summary?: string; issues?: VisualIssue[] }; error?: string };
    if (!data.ok || !data.analysis) {
      return { ok: false, usedVision: false, error: data.error ?? "Sem análise do Gemini." };
    }
    const issues = Array.isArray(data.analysis.issues) ? data.analysis.issues.slice(0, 6) : [];
    return {
      ok: true,
      usedVision: true, // Gemini recebeu o screenshot real
      summary: typeof data.analysis.summary === "string" ? data.analysis.summary : "",
      issues,
    };
  } catch (e) {
    return { ok: false, usedVision: false, error: e instanceof Error ? e.message : "Erro ao chamar Gemini." };
  }
}

// Formata o diagnóstico para o tool result (texto curto para o modelo).
export function formatVisualReview(r: VisualReviewResult): string {
  if (!r.ok || !r.usedVision) {
    return `VISUAL REVIEW NÃO EXECUTADO (sem suporte/imagem): ${r.error ?? "análise visual não ocorreu"}. Continue usando DOM/métricas/estrutura e informe honestamente.`;
  }
  const lines = [`VISUAL REVIEW (Gemini Vision)`, `Resumo: ${r.summary ?? ""}`];
  if (!r.issues || r.issues.length === 0) {
    lines.push("Problemas visuais: nenhum claro no screenshot.");
  } else {
    lines.push(`Problemas encontrados (${r.issues.length}):`);
    for (const issue of r.issues) {
      lines.push(`- [${issue.severity}] (${issue.area}) ${issue.description} → ${issue.fix}`);
    }
  }
  return lines.join("\n");
}
