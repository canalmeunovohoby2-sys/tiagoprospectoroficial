import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface LeadInput {
  name: string;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  landingUrl?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const lead: LeadInput = body?.lead ?? {};
    if (!lead?.name) {
      return new Response(JSON.stringify({ error: "lead.name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `Você cria roteiros de vídeo curtos (Reels / Status de WhatsApp) para divulgar landing pages de pequenos negócios brasileiros. O roteiro vira voz por IA (CapCut/TTS) e é POSTADO PUBLICAMENTE — não é uma mensagem privada para o dono.

# OBJETIVO
- Vender a SOLUÇÃO e os RESULTADOS que o cliente final do nicho terá ao ter uma página assim.
- Despertar desejo: mostrar transformação, ganhos, autoridade, mais clientes, mais vendas, mais agendamentos.
- Estilo publicitário, energético, tipo Reels viral / status persuasivo.

# PROIBIÇÕES ABSOLUTAS
- NUNCA se apresentar. NUNCA escreva "Sou o Tiago", "Me chamo", "Aqui é o", "Eu sou", nem qualquer nome próprio.
- NUNCA diga "modelo de teste", "100% modificável", "100% editável", "sem compromisso", "demonstração", "fiz pra você ver".
- NUNCA fale do PROCESSO de edição (cores, textos, fotos, logo). Fale só do RESULTADO para o negócio.
- Sem markdown, sem bullets, sem emojis, sem "(pausa)", sem instruções de cena, sem URL falada.

# TOM
- Português brasileiro, humano, empolgado, direto, persuasivo.
- Frases curtas e impactantes que funcionam como locução de anúncio.

# DURAÇÃO
- 25 a 40 segundos de fala (≈ 70 a 110 palavras), em parágrafo único fluido.

# ESTRUTURA (parágrafo único, sem títulos)
1. Gancho forte focado em dor/desejo do nicho (ex.: "Imagina sua clínica com a agenda lotada todo mês…").
2. Apresente a página como a virada de chave: presença profissional, autoridade, confiança no digital.
3. Liste 2 ou 3 VANTAGENS concretas e específicas do nicho (mais agendamentos, mais reservas, mais vendas no WhatsApp, mais clientes recorrentes, posicionamento acima da concorrência, aparecer no Google, conversão real).
4. Reforce o resultado final: crescimento, mais faturamento, marca forte na cidade.
5. CTA curto e direto convidando a chamar no WhatsApp para levar isso pro negócio.

# RESPOSTA
- Apenas o texto do roteiro, parágrafo único, pronto pra colar no CapCut.
- Sem aspas, sem cabeçalho, sem assinatura, sem nome.`;

    const ctx = [
      `Nome do negócio: ${lead.name}`,
      lead.segment && `Segmento/nicho: ${lead.segment}`,
      lead.city && `Cidade: ${lead.city}${lead.state ? "/" + lead.state : ""}`,
      lead.landingUrl && `Link da landing (apenas referência, NÃO falar): ${lead.landingUrl}`,
    ].filter(Boolean).join("\n");

    const user = `Gere o roteiro falado seguindo TODAS as regras do sistema. Adapte os benefícios ao nicho do lead abaixo.

CONTEXTO DO LEAD:
${ctx}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.95,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha ao gerar roteiro", detail: text }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const script: string = (data?.choices?.[0]?.message?.content ?? "").trim();

    return new Response(JSON.stringify({ script }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
