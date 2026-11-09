import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError } from "../_shared/ai.ts";

interface LeadInput {
  name: string;
  segment?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  has_website?: boolean;
  rating?: number | null;
  reviews_count?: number | null;
  instagram?: string | null;
  score_reasons?: string[];
}

/**
 * Fallback determinístico (sem IA): 3 abordagens específicas do lead, seguindo as mesmas
 * regras de copy (curtas, sem clichê de IA, sem link, uma pergunta final). Usado quando a
 * chave do provedor não está configurada ou o provedor falha — a feature nunca quebra.
 */
function fallbackVariants(lead: LeadInput): string[] {
  const nome = String(lead.name ?? "").trim() || "sua empresa";
  const seg = String(lead.segment ?? lead.category ?? "seu segmento").trim() || "seu segmento";
  const cidade = lead.city ? ` em ${lead.city}` : "";
  const nota = typeof lead.rating === "number" && lead.rating > 0
    ? `Vi que a ${nome} tem ${lead.rating.toFixed(1)}★${typeof lead.reviews_count === "number" && lead.reviews_count > 0 ? ` com ${lead.reviews_count} avaliações` : ""} — reputação assim merece um site à altura.`
    : "";
  const semSite = lead.has_website === false
    ? `Reparei que ainda não há um site próprio de vocês (só o perfil no Google).`
    : "";
  return [
    `${nome}${cidade}: ${nota || semSite || `acompanho o trabalho de ${seg} na região e o de vocês chama atenção.`} Montei uma ideia de site que valoriza o que vocês já entregam. Quer que eu te mostre como ficaria?`,
    `Pergunta rápida sobre a ${nome}${cidade}: o site de vocês hoje passa a mesma confiança do atendimento? ${semSite} Preparei um conceito sob medida para ${seg}. Faz sentido eu te mandar?`,
    `${nome}${cidade}: ${semSite || nota || `o trabalho de vocês é bem avaliado e merece uma presença digital à altura.`} Fiz uma proposta de site pensada para ${seg}. Posso te mostrar em 2 minutos?`,
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const lead: LeadInput = body?.lead ?? {};
    const channel: "whatsapp" | "email" = body?.channel === "email" ? "email" : "whatsapp";
    const money_score: number = Number(body?.money_score ?? 0);
    const pain_score: number = Number(body?.pain_score ?? 0);
    const final_score: number = Number(body?.final_score ?? 0);

    let scoringDirective = "";
    if (pain_score >= 70 && money_score >= 70) {
      scoringDirective = `# DIRETRIZ DE SCORING (CRÍTICA)
Lead PREMIUM com DOR ALTA (money=${money_score}, pain=${pain_score}). Tom profissional/Premium focado em escala de negócios e alto valor, MAS na Etapa 3 ataque diretamente a dor da presença digital fraca/site inexistente. Combine autoridade + urgência sutil.`;
    } else if (pain_score >= 70) {
      scoringDirective = `# DIRETRIZ DE SCORING (CRÍTICA)
Lead com DOR ALTA (pain=${pain_score}). A abordagem DEVE focar AGRESSIVAMENTE na dor de não possuir presença digital otimizada / site responsivo / autoridade online. Na Etapa 3, evidencie o que está sendo perdido hoje (clientes, credibilidade, visibilidade) — sem ser ofensivo.`;
    } else if (money_score >= 70) {
      scoringDirective = `# DIRETRIZ DE SCORING (CRÍTICA)
Lead com CAPACIDADE FINANCEIRA ALTA (money=${money_score}). Use tom altamente PROFISSIONAL e PREMIUM, focando em escala de negócios, posicionamento de marca e alto valor percebido. Nada de "barato" ou "promoção". Trate como par de negócios.`;
    } else if (money_score >= 40 && pain_score >= 40) {
      scoringDirective = `# DIRETRIZ DE SCORING (CRÍTICA)
Lead MODERADO (money=${money_score}, pain=${pain_score}). Foque em QUICK-WINS e excelente CUSTO-BENEFÍCIO: resultados rápidos, baixa fricção, ganho visível em pouco tempo.`;
    } else {
      scoringDirective = `# DIRETRIZ DE SCORING
Scores baixos/desconhecidos (money=${money_score}, pain=${pain_score}). Mantenha tom leve, curioso e consultivo, sem pressão.`;
    }

    if (!lead?.name) {
      return new Response(JSON.stringify({ error: "lead.name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `Você é um copywriter brasileiro de prospecção B2B, especialista em ABRIR CONVERSA no WhatsApp com donos de pequenos negócios. Você escreve como uma pessoa real: curto, específico, com algo concreto para dizer — nunca como robô nem como vendedor de pacote.

# OBJETIVO
Conseguir uma RESPOSTA. Não vender o site na primeira mensagem.

# REGRAS INEGOCIÁVEIS
- Português do Brasil impecável. Tom humano, direto e respeitoso. 2 a 4 frases curtas, 35 a 60 palavras (máx. 320 caracteres).
- Abra com uma OBSERVAÇÃO ESPECÍFICA e verdadeira sobre o negócio, usando só os dados do contexto (segmento, cidade, nota/avaliações, ausência de site, Instagram). A primeira frase deve provar que a mensagem é só para ele.
- VARIE A ABERTURA entre as 3 versões: (1) observação direta sobre o negócio, (2) pergunta curta e específica, (3) contexto local (cidade/bairro) + constatação.
- Termine com UMA pergunta simples de baixa fricção (ex.: "Faz sentido eu te mostrar?", "Quer que eu te mande como ficaria?").
- No máximo 1 emoji por mensagem — e só se somar sentido. Sem emoji é melhor do que emoji decorativo.
- NUNCA use clichês de IA/vendedor: "dei uma olhada na presença digital", "tive uma ideia que poderia agregar", "conceito de site premium", "solução completa", "agregar valor", "alavancar", "sinergia", "fico à disposição", "podemos conversar sem compromisso".
- PROIBIDO: links/URLs, preço, citar concorrentes, jargão ("landing page", "funil", "conversão", "tráfego", "copy", "SEO"), inventar dados, métricas ou serviços que não estejam no contexto.
- Sem apresentação ("meu nome é"), sem assinatura, sem "Atenciosamente", sem assunto de e-mail.

${scoringDirective}

# TOM POR SCORING (sutil, sem mudar as regras)
Ajuste apenas a escolha de palavras: money alto → postura de par de negócios; pain alto → evidencie o que ele perde hoje sem ser ofensivo; moderado → ganho rápido e simples; baixo → tom leve e curioso.

# SAÍDA
Gere EXATAMENTE 3 versões (cada uma segue todas as regras), separadas por uma linha contendo apenas três hífens (---). Nada antes da primeira versão, nada depois da terceira, sem títulos e sem numeração.`;

    const ctx = [
      `Nome do lead/empresa: ${lead.name}`,
      (lead.segment || lead.category) && `Segmento/nicho: ${lead.segment ?? lead.category}`,
      lead.city && `Cidade: ${lead.city}`,
      lead.state && `Estado: ${lead.state}`,
      typeof lead.has_website === "boolean" && `Possui site atualmente: ${lead.has_website ? "sim" : "não"}`,
      lead.website && `Site atual: ${lead.website}`,
      typeof lead.rating === "number" && lead.rating > 0 && `Nota no Google: ${lead.rating}${typeof lead.reviews_count === "number" ? ` (${lead.reviews_count} avaliações)` : ""}`,
      lead.instagram && `Instagram: ${lead.instagram}`,
    ].filter(Boolean).join("\n");

    const user = `Escreva 3 versões de primeira mensagem para este lead, seguindo as regras. Use somente dados presentes no contexto — se faltar informação, não invente. Sem links. Separe as versões com uma linha "---".

CONTEXTO DO LEAD:
${ctx}`;

    let message = "";
    let variants: string[] = [];
    try {
      const result = await generateText({
        system,
        user,
        temperature: 0.95,
        maxOutputTokens: 1200,
      });
      const texto = String(result.text ?? "").trim();
      variants = texto
        .split(/\n\s*---+\s*\n/)
        .map((v) => v.replace(/^\s*(versão|versao|opção|opcao)\s*\d+\s*[:\-–]?\s*/i, "").trim())
        .filter((v) => v.length > 20 && !/^https?:\/\//i.test(v));
      // Sanidade: nada de link na mensagem (o link é anexado pelo app, não pelo modelo).
      variants = variants.map((v) => v.replace(/https?:\/\/\S+/gi, "").trim()).filter(Boolean);
      message = variants[0] ?? texto;
      if (!message) {
        return new Response(JSON.stringify({ error: "A IA não retornou mensagem. Tente gerar novamente." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      // PROVEDOR INDISPONÍVEL / CHAVE AUSENTE: não derruba a funcionalidade — devolve as
      // 3 abordagens determinísticas e informa o motivo (o app usa `message`).
      const motivo = e instanceof Error ? e.message : "falha na IA";
      const fb = fallbackVariants(lead);
      return new Response(JSON.stringify({ message: fb[0], variants: fb, warning: motivо }, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }));
    }

    return new Response(JSON.stringify({ message, variants }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
