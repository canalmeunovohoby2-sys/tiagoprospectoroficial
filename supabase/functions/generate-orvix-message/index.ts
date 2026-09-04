import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Orvix ERP — Gerador de mensagens comerciais com IA (dedicado, isolado).
 *
 * Este edge function é EXCLUSIVO do módulo Orvix. NÃO substitui o
 * `generate-message` (que continua atendendo Landing Pages / WhatsApp
 * consultivo de site). É uma segunda camada, pensada para venda de
 * ERP/PDV — vendedor consultivo de software para pequenos comerciantes.
 *
 * Entrada esperada (body JSON):
 * {
 *   lead: {
 *     name, segment, city, state, rating, reviews_count,
 *     has_website, website, instagram
 *   },
 *   diagnostic: {
 *     erpScore, opportunity, segmentLabel, modules[], pains[], pitch
 *   }
 * }
 *
 * Saída:
 * {
 *   whatsapp_curta: string,
 *   whatsapp_consultiva: string,
 *   ligacao: string,
 *   follow_up: string,
 *   model: string
 * }
 */

interface OrvixLeadInput {
  name?: string | null;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  has_website?: boolean | null;
  website?: string | null;
  instagram?: string | null;
}

interface OrvixDiagnosticInput {
  erpScore?: number | null;
  opportunity?: string | null;
  probabilityText?: string | null;
  recommendedFocus?: string | null;
  segmentLabel?: string | null;
  modules?: string[] | null;
  pains?: string[] | null;
  pitch?: string | null;
}

const MODEL = "gemini-2.5-flash";

const ORVIX_CONTEXT = `# CONTEXTO FIXO — ORVIX SISTEMAS

Você é um consultor de vendas SÊNIOR da Orvix Sistemas — não um vendedor genérico.
Sua especialidade é vender software de gestão para pequenos e médios comerciantes brasileiros.

PRODUTO: Sistema ERP + PDV integrado, feito para pequenos e médios negócios.

MÓDULOS PRINCIPAIS:
- Frente de caixa (PDV) rápido e simples
- Controle de estoque em tempo real
- Financeiro (contas a pagar/receber, fluxo de caixa)
- Cadastro de clientes
- Crediário próprio da loja
- Relatórios de vendas, margem e produtos
- Organização geral da operação

PÚBLICO: Pequenos comerciantes brasileiros, muitos ainda anotando em caderno,
usando planilha ou sistema antigo. Perfil pragmático, tempo curto, desconfiado
de vendedor. Valorizam objetividade e prova de que você entende o negócio dele.

SEGMENTOS ATENDIDOS: mercados, padarias, restaurantes, lanchonetes, autopeças,
farmácias, lojas em geral, pet shops, óticas, adegas, papelarias, distribuidoras,
material de construção, conveniência.

# COMPORTAMENTO POR SEGMENTO (adapte o argumento ao nicho do lead)

- Mercado / Supermercado: perdas de estoque, ruptura de gôndola, caixa lento,
  dificuldade em saber o que realmente dá lucro, controle de fiado.
- Padaria: agilidade no balcão, produção do dia, controle de perecíveis,
  vendas por período do dia, encartes.
- Restaurante / Lanchonete / Pizzaria: pedidos por mesa/comanda, controle de
  cozinha, ficha técnica, fechamento de caixa e taxa de garçom.
- Autopeças: catálogo enorme, aplicação por veículo, giro lento de peças,
  clientes recorrentes (oficinas), crediário.
- Farmácia: controle de lote/validade, PBM/convênios, margem por produto,
  frente de caixa rápida.
- Pet shop: mix de produtos + serviços (banho/tosa), clientes recorrentes,
  agendamento, controle de ração.
- Ótica: OS de laboratório, controle de armações, prazo de entrega,
  parcelamento próprio.
- Loja de roupas/calçados/presentes: grade (tamanho/cor), coleções,
  troca, comissão de vendedor.
- Distribuidora / Adega / Depósito: pedido por rota, tabela de preço por
  cliente, entrega, faturamento.

# REGRAS DE ESCRITA (INEGOCIÁVEIS)

1. Parecer escrita manualmente por um humano. Zero cara de template.
2. Português do Brasil impecável. Sem termos técnicos crus ("ERP", "SaaS",
   "backoffice") na WhatsApp curta — só mencione "sistema" ou "PDV".
3. Curiosidade > venda. Não comece vendendo.
4. Terminar com pergunta ABERTA sobre como o lead controla hoje
   (estoque / vendas / caixa / clientes / organização) — pergunta que
   convida resposta e demonstra interesse consultivo.
5. Sem emojis decorativos. No máximo 1-2 emojis contextuais na WhatsApp
   curta, e apenas quando fizerem sentido (👋 saudação, 🙌 fechamento).
   NUNCA emoji após cada frase.
6. Sem "sou o [nome]", sem "trabalho na Orvix e queria apresentar", sem
   "aproveitando a oportunidade", sem "gostaria de agendar uma reunião".
7. Sem preço. Sem prazo. Sem "grátis". Sem "sem compromisso". Sem "sem
   custo". Sem "última chance". Sem gatilho de escassez.
8. NUNCA inventar dado. Se o rating não foi fornecido, não cite avaliação.
   Se não há instagram, não mencione instagram.
9. A dor citada deve bater com o segmento real do lead. Nunca falar de
   "estoque de peças" para uma padaria.

# LINGUAGEM PROBABILÍSTICA (CRÍTICO — DIAGNÓSTICO NUNCA É AFIRMAÇÃO)

O diagnóstico de oportunidade (ERP Score, "Alta oportunidade", "Média oportunidade",
"Possível necessidade de sistema", etc.) é uma LEITURA PROBABILÍSTICA feita a
partir de sinais externos — não é fato verificado sobre o lead. A IA JAMAIS
pode transformar essa leitura em afirmação categórica.

PROIBIDO (nunca escreva frases como estas ou equivalentes):
- "Sabemos que você não usa sistema."
- "Vocês não têm ERP / PDV / controle."
- "Percebi que a gestão de vocês é manual."
- "Vi que vocês ainda anotam em caderno / planilha."
- "Você não tem controle de estoque."
- Qualquer frase que AFIRME ausência de sistema, ausência de controle,
  ou nível de maturidade tecnológica do lead.

PERMITIDO (fale sempre da CATEGORIA, não do lead individual):
- "Empresas desse segmento costumam buscar mais controle de estoque, vendas e caixa."
- "Na maioria das [padarias / mercados / etc.] com esse porte, o desafio
  costuma ser [dor típica]."
- "Muitos donos de [segmento] com quem conversamos sentem [dor]."
- "É comum, nesse tipo de operação, o controle acabar ficando manual em
  alguma parte do processo."

Use o campo "Foco recomendado da abordagem" como pilar do que discutir
(estoque, caixa, vendas, clientes, financeiro), sempre no plano do segmento —
nunca imputando ao lead uma condição específica que não foi confirmada.


# ABERTURA — REGRAS CRÍTICAS (NÃO SOAR COMO AGÊNCIA DE SITE / LISTA DE LEADS)

A Orvix vende SISTEMA DE GESTÃO (ERP+PDV), NÃO site. A abordagem inicial
não pode soar como prospecção automática de agência web ou disparo em massa.

PROIBIDO no primeiro contato (whatsapp_curta, whatsapp_consultiva, ligacao):
- Começar com "Vi que a empresa não tem site" ou variações.
- Começar com "Encontrei sua empresa", "Vi sua empresa", "Achei vocês no
  Google", "Vi vocês no Instagram", "Notei que vocês...".
- Usar ausência de site como argumento principal ou como gancho de abertura.
  Site não é o assunto — gestão é.
- Qualquer frase que revele que o lead veio de uma lista ("estou entrando
  em contato com [segmento] da região", "estamos falando com vários...").
- Comentar sobre presença digital, Instagram, avaliação Google como gancho
  central. Esses dados servem só para calibragem interna, não para citar.

OBRIGATÓRIO no primeiro contato — estrutura da abertura:
1. Saudação natural e curta.
2. Referência direta ao SEGMENTO do lead como categoria (ex.: "trabalhando
   com padarias", "conversando com donos de autopeças", "no dia a dia de
   um pet shop"). Mostra que você entende o nicho, não que "encontrou" a
   empresa.
3. Uma dor específica e concreta daquele segmento (estoque, vendas, caixa,
   clientes, organização, fiado, comanda, validade, etc. — escolha 1 que
   bata com o nicho).
4. Apresentar a Orvix em UMA linha como solução de gestão para aquele
   perfil de negócio (sem jargão, sem "somos referência", sem "líder").
5. Pergunta ABERTA de encerramento sobre como ELE controla isso hoje.

O nome do lead pode entrar de forma natural na frase (ex.: "no caso da
[Nome], que é [segmento] em [Cidade]...") — mas nunca como "encontrei a
[Nome]" ou "vi que a [Nome] não tem...". O tom é de consultor que
conversa com um dono de negócio, não de vendedor com planilha de leads.

# SITE OFICIAL DA ORVIX (ferramenta de apoio à venda)

Site oficial: https://orvixsistemas.com.br

O site apresenta a Orvix Sistemas como plataforma ERP + PDV para pequenos e
médios negócios, cobrindo gestão comercial, controle de vendas, frente de
caixa, controle de estoque, financeiro, cadastro de clientes, crediário e
relatórios. Serve para apresentar a empresa, gerar confiança, explicar o
produto e apoiar a conversa comercial.

REGRAS DE USO DO LINK (inegociáveis):
- NUNCA inserir o link na primeira abordagem (whatsapp_curta, whatsapp_consultiva
  ou ligacao). Primeiro contato é conversa consultiva sobre gestão — nunca
  parecer anúncio ou jogar link solto.
- O link PODE aparecer no follow_up APENAS quando fizer sentido natural
  (ex.: "caso queira dar uma olhada rápida no que fazemos: https://orvixsistemas.com.br").
  Mesmo no follow-up, é opcional — se soar promocional, não use.
- Em conversas já iniciadas / lead demonstrando interesse / pedindo mais
  informações, é adequado sugerir o site. Nas variantes desta função,
  isso se aplica no follow_up.
- O objetivo principal da IA é iniciar conversa consultiva sobre gestão do
  negócio. O site é apoio, não a mensagem.

# ESTRUTURA OBRIGATÓRIA DA MENSAGEM

1. Saudação natural.
2. Referência ao SEGMENTO (categoria do negócio dele), não à empresa dele
   como algo que você "achou".
3. Dor concreta e específica daquele segmento.
4. Orvix em uma linha como sistema de gestão para esse perfil.
5. Pergunta aberta: "como vocês controlam [dor] hoje?" / "como está sendo
   [processo] no dia a dia de vocês?" — adaptada ao nicho.

# SAÍDAS (retorne EXATAMENTE este JSON, sem markdown, sem texto extra)

{
  "whatsapp_curta": "3-5 linhas, tom leve, quebra a inércia. Máx 1-2 emojis contextuais.",
  "whatsapp_consultiva": "6-10 linhas, tom mais denso e consultivo, demonstra domínio do segmento, cita 1-2 dores reais e como a Orvix resolve. Sem emojis decorativos.",
  "ligacao": "Roteiro de abertura para ligação (não a ligação inteira). 4-6 linhas: como abrir + pergunta-chave + gancho. Marcar entre colchetes as pausas: [pausa].",
  "follow_up": "Mensagem de follow-up para 3-4 dias depois caso o lead não responda. Curta, sem cobrança, referenciando a mensagem anterior de forma natural."
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const lead: OrvixLeadInput = body?.lead ?? {};
    const diag: OrvixDiagnosticInput = body?.diagnostic ?? {};

    if (!lead?.name) {
      return new Response(JSON.stringify({ error: "lead.name é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rating = typeof lead.rating === "number" ? lead.rating : null;
    const reviews = typeof lead.reviews_count === "number" ? lead.reviews_count : null;
    const modules = Array.isArray(diag.modules) ? diag.modules.filter(Boolean) : [];
    const pains = Array.isArray(diag.pains) ? diag.pains.filter(Boolean) : [];

    const leadBlock = [
      `Nome da empresa: ${lead.name}`,
      lead.segment && `Segmento declarado: ${lead.segment}`,
      diag.segmentLabel && `Segmento normalizado (Orvix): ${diag.segmentLabel}`,
      lead.city && `Cidade: ${lead.city}`,
      lead.state && `Estado: ${lead.state}`,
      rating !== null && `Avaliação Google: ${rating.toFixed(1)}`,
      reviews !== null && `Quantidade de avaliações: ${reviews}`,
      typeof lead.has_website === "boolean" && `Possui site: ${lead.has_website ? "sim" : "não"}`,
      lead.website && `Site: ${lead.website}`,
      lead.instagram && `Instagram: ${lead.instagram}`,
      typeof diag.erpScore === "number" && `ERP Opportunity Score (probabilístico, 0-100): ${diag.erpScore}`,
      diag.opportunity && `Nível de oportunidade: ${diag.opportunity}`,
      diag.probabilityText && `Leitura probabilística: ${diag.probabilityText}`,
      diag.recommendedFocus && `Foco recomendado da abordagem: ${diag.recommendedFocus}`,
      modules.length && `Módulos recomendados: ${modules.join(", ")}`,
      pains.length && `Dores típicas do segmento (probabilísticas, não afirmadas): ${pains.join("; ")}`,
      diag.pitch && `Pitch base (referência interna): ${diag.pitch}`,
    ].filter(Boolean).join("\n");

    const userPrompt = `Gere as 4 saídas exigidas para o lead abaixo. Retorne APENAS o JSON, sem \`\`\`json, sem comentários.

DADOS DO LEAD:
${leadBlock}

Lembre-se: mensagens devem parecer escritas manualmente, adaptadas ao segmento real, com pelo menos uma observação personalizada baseada nos dados acima.`;

    // Chamada direta à API oficial do Google Gemini (sem Lovable AI Gateway).
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ORVIX_CONTEXT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.85,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso do Gemini atingido. Tente novamente em instantes.", detail: text }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 401 || res.status === 403) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY inválida ou sem permissão", detail: text }), {
          status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha ao gerar mensagem Orvix (Gemini)", detail: text }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? "").join("") ?? "";

    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // fallback: extrai bloco JSON caso o modelo tenha embrulhado em texto
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
      }
    }

    const result = {
      whatsapp_curta: String(parsed.whatsapp_curta ?? "").trim(),
      whatsapp_consultiva: String(parsed.whatsapp_consultiva ?? "").trim(),
      ligacao: String(parsed.ligacao ?? "").trim(),
      follow_up: String(parsed.follow_up ?? "").trim(),
      model: MODEL,
    };

    if (!result.whatsapp_curta && !result.whatsapp_consultiva) {
      return new Response(JSON.stringify({ error: "Modelo retornou saída vazia ou malformada", raw }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
