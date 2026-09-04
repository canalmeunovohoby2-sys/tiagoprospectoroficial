import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError } from "../_shared/ai.ts";

interface LeadInput {
  name: string;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  has_website?: boolean;
  score_reasons?: string[];
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

    const system = `Você gera mensagens de prospecção ULTRA-CURTAS para WhatsApp (Micro-Copywriting). Tom humano, consultivo, leve, sem pressão — focado em abrir conversa naturalmente.

# ESTRUTURA FIXA OBRIGATÓRIA (4 frases curtas, em UM único parágrafo corrido — sem quebras extras)
Gere EXATAMENTE nesta ordem, adaptando ao contexto do lead. Use emojis contextuais (1 por frase, MÁXIMO 4 no total) posicionados de forma natural e coerente com o significado da frase — nunca decorativos ou aleatórios:

Olá, tudo bem? 👋 Dei uma olhada na presença digital da [Nome da Empresa] e tive uma ideia que poderia agregar bastante! 💡 Trabalho com desenvolvimento web e montei um conceito de site premium pensado especificamente para [TIPO DE NEGÓCIO]. 🚀 Gravei um vídeo bem curto mostrando a estrutura. 🎥 Se fizer sentido pra vocês, fico à disposição para conversar.

# REGRAS ESTRITAS (NÃO QUEBRE)
- USE emojis contextuais, escolhidos pelo SIGNIFICADO da frase. Guia por contexto (adapte ao segmento do lead):
  • Saudação: 👋 🙌
  • Ideia/observação sobre a presença digital: 💡 👀 ✨
  • Desenvolvimento/conceito premium: 🚀 🛠️ 💻 — ou emoji do nicho (⚖️ advocacia, 🦷 odonto, 🚗 estética automotiva, 💅 estética, 🍰 confeitaria, 🏋️ academia, 🍽️ restaurante, 📚 educação, 🏥 saúde, 🏡 imobiliária, 💇 salão)
  • Vídeo/demonstração: 🎥 🎬 📹
  • Fechamento (opcional): 🤝
- MÁXIMO 4 emojis no total (1 por frase). Nunca 2 emojis seguidos. Nunca emoji sem função semântica.
- Substitua [Nome da Empresa] pelo nome real do lead/empresa fornecido no contexto.
- Substitua [TIPO DE NEGÓCIO] pela descrição adaptada ao segmento do lead (ex.: "clínicas odontológicas", "escritórios de advocacia", "estúdios de estética automotiva", "restaurantes", "academias", "lojas de moda", "escolas de idiomas", "consultórios de psicologia", etc.). SEMPRE no plural genérico do nicho — nunca reutilize o nome da empresa aqui.
- NÃO inclua nenhum link, URL ou marcador de link na mensagem. A mensagem termina após "fico à disposição para conversar." — sem "[LINK]", sem "http", sem "Segue o link".
- Ortografia e acentuação PERFEITAS em português do Brasil (à disposição, olá, você, vídeo, específica, etc.).
- Texto CORRIDO em um único parágrafo (sem listas, sem títulos, sem quebras de linha internas). Máximo ~4 linhas visuais.
- Sem assinatura, sem "Atenciosamente", sem "Meu nome é", sem apresentar-se pelo nome.
- Se o lead JÁ POSSUI site (has_website=true), pode ajustar SUTILMENTE a primeira frase para "dei uma olhada no site atual da [Nome da Empresa] e tive uma ideia de repaginação que poderia agregar bastante" — mantendo o restante da estrutura idêntico.
- PROIBIDO: termos técnicos crus ("landing page", "funil", "conversão", "tráfego", "copywriting", "SEO"), clichês corporativos, citar preço, citar concorrentes, inventar dados ou métricas.
- Sem "Assunto:" mesmo se channel=email — apenas o parágrafo único.

${scoringDirective}

# AJUSTE DE TOM POR SCORING
Aplique o tom do scoring SOMENTE em escolhas sutis de palavras dentro da estrutura fixa (ex.: "conceito de site premium" pode virar "conceito de site sob medida" para leads mais modestos, ou "conceito de site premium com posicionamento executivo" para money_score alto). NUNCA adicione frases novas, NUNCA quebre a estrutura de parágrafo único, NUNCA ultrapasse 4 emojis contextuais.`;

    const ctx = [
      `Nome do lead/empresa: ${lead.name}`,
      lead.segment && `Segmento/nicho: ${lead.segment}`,
      lead.city && `Cidade: ${lead.city}`,
      lead.state && `Estado: ${lead.state}`,
      typeof lead.has_website === "boolean" && `Possui site atualmente: ${lead.has_website ? "sim" : "não"}`,
      lead.website && `Site atual: ${lead.website}`,
    ].filter(Boolean).join("\n");

    const user = `Gere a mensagem seguindo EXATAMENTE a estrutura fixa em parágrafo único. Substitua [Nome da Empresa] pelo nome real e [TIPO DE NEGÓCIO] pelo plural genérico do nicho adaptado ao segmento abaixo. NÃO inclua links, URLs nem marcador [LINK] — a mensagem deve terminar naturalmente após "fico à disposição para conversar.".

CONTEXTO DO LEAD (use só o que estiver presente):
${ctx}`;

    let message = "";
    try {
      const result = await generateText({
        system,
        user,
        temperature: 0.9,
        maxOutputTokens: 1200,
      });
      message = result.text;
    } catch (e) {
      if (e instanceof AiError) {
        return new Response(
          JSON.stringify({ error: e.message, kind: e.kind, detail: e.detail }),
          { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw e;
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
