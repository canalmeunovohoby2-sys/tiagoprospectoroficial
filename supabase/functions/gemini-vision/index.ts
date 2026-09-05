// gemini-vision — analisador visual especializado (FASE 5.23).
// O Cline/DeepSeek continua sendo o executor. Esta edge function NÃO gera sites:
// ela recebe UM screenshot + contexto curto, chama o Gemini (modelo multimodal)
// e devolve um DIAGNÓSTICO visual estruturado e curto.
//
// Segurança: usa GEMINI_API_KEY (secret do Supabase); nunca expõe a chave;
// aceita apenas requests com imagem; limita tamanho (~2MB) e contexto.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MODEL = Deno.env.get("GEMINI_VISION_MODEL") ?? "gemini-3.6-flash";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MAX_IMAGE_BYTES = 2_200_000; // ~2MB base64

interface VisionRequest {
  imageBase64?: string;
  mediaType?: string;
  viewport?: { width?: number; height?: number };
  context?: string;      // curto: segmento/nome/objetivo
  purpose?: string;      // ex.: "geração inicial QA" | "verificação pós-correção"
}

function buildPrompt(r: VisionRequest): string {
  const viewport = r.viewport && r.viewport.width ? `Viewport: ${r.viewport.width}x${r.viewport.height}.` : "";
  const context = (r.context ?? "").slice(0, 800) || "(sem contexto adicional)";
  const purpose = r.purpose ?? "avaliar qualidade visual do site";
  return `Você é um revisor visual sênior (Art Director/UX) e recebeu um SCREENSHOT real do site.
${viewport}
Contexto do projeto: ${context}
Objetivo desta análise: ${purpose}.

Avalie e responda APENAS em JSON (sem markdown), neste formato exato:
{
  "ok": true,
  "summary": "1 frase em pt-BR resumindo a avaliação visual",
  "issues": [
    { "severity": "alta|media|baixa", "area": "hero|header|imagem|tipografia|cta|espacamento|composicao|footer|mobile|cor/contraste|outro", "description": "problema concreto observado no screenshot (pt-BR)", "fix": "recomendação acionável e concreta (pt-BR)" }
  ]
}

Regras:
- Só aponte problemas que você REALMENTE viu no screenshot (não invente).
- Máximo 4 issues; ordene por severidade; description e fix com no máximo 1 frase cada.
- Se não houver problema claro, retorne issues: [].
- Nunca invente dados factuais do negócio; fale apenas de aspectos visuais.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json().catch(() => ({}))) as VisionRequest;
    const img = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
    if (!img) {
      return new Response(JSON.stringify({ error: "imageBase64 é obrigatória" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada no projeto" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // limite de tamanho: estima bytes do base64 (len*3/4)
    const approxBytes = Math.round((img.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: "imagem grande demais (>~2MB)" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const mediaType = typeof body.mediaType === "string" && body.mediaType ? body.mediaType : "image/png";

    const payload = {
      contents: [
        {
          parts: [
            { text: buildPrompt(body) },
            { inlineData: { mimeType: mediaType, data: img } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2500 },
    };

    // 1 retry em 503 (overload transitório do Gemini).
    let upstream: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (upstream.status !== 503) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    if (!upstream) throw new Error("sem resposta do Gemini");

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Gemini falhou (${upstream.status})`, detail: errText.slice(0, 400) }), {
        status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await upstream.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join(" ") ?? "";
    const finishReason = data?.candidates?.[0]?.finishReason ?? "";

    // Extrai JSON: primeiro { até o último } do texto (robusto a fences/sufixo).
    let parsed: Record<string, unknown> = { ok: false, raw: text.slice(0, 1200) };
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { parsed = JSON.parse(text.slice(a, b + 1)); } catch { parsed = { ok: false, raw: text.slice(a, Math.min(text.length, a + 1200)) }; }
    }

    return new Response(JSON.stringify({ ok: true, analysis: parsed, raw_text: text, finishReason, model: MODEL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
