import type { Lead } from "@/data/types";

/**
 * Orvix ERP — Motor de Diagnóstico (in-memory).
 * Nada é persistido. Todo o cálculo acontece a partir dos dados já disponíveis
 * no lead (segmento, presença digital, rating, reviews, cidade).
 *
 * Isolado do scoring padrão (Money / Pain / Intent), que continua intacto.
 */

export type OrvixOpportunity = "Baixa" | "Média" | "Alta" | "Excelente";

export interface OrvixDiagnostic {
  segmentKey: string;          // chave normalizada
  segmentLabel: string;        // rótulo apresentável
  modules: string[];           // módulos Orvix recomendados
  pains: string[];             // dores prováveis
  pitch: string;               // argumento de venda longo (mantido)
  recommendedFocus: string;    // 1-linha: "Focar em X, Y e Z."
  probabilityText: string;     // "Possível necessidade de sistema", etc.
  erpScore: number;            // 0–100
  opportunity: OrvixOpportunity;
  reasons: string[];           // fatores que compuseram o score
}


/* -------------------------------------------------------------------------- */
/* Catálogo por segmento                                                       */
/* -------------------------------------------------------------------------- */

type SegmentProfile = {
  label: string;
  matchers: string[];   // termos que identificam o segmento
  modules: string[];
  pains: string[];
  pitch: string;
};

const PROFILES: SegmentProfile[] = [
  {
    label: "Supermercado",
    matchers: ["supermerc", "hipermerc", "atacad"],
    modules: ["PDV", "Estoque", "Financeiro", "Clientes", "Relatórios", "Fiscal"],
    pains: [
      "Controle manual de estoque",
      "Perda de mercadorias e ruptura",
      "Filas e caixa lento",
      "Falta de relatórios gerenciais",
      "Baixo controle financeiro",
    ],
    pitch:
      "A Orvix acelera o caixa, reduz perdas de estoque e entrega relatórios em tempo real — margem e giro sob controle.",
  },
  {
    label: "Mercado",
    matchers: ["mercad", "mercearia", "empório", "emporio", "minimercad"],
    modules: ["PDV", "Estoque", "Financeiro", "Clientes", "Relatórios"],
    pains: [
      "Controle manual de estoque",
      "Perda de mercadorias",
      "Caixa lento",
      "Falta de relatórios",
      "Falta de controle financeiro",
      "Cadastro desorganizado",
    ],
    pitch:
      "Com a Orvix o mercado ganha PDV rápido, estoque preciso e visão financeira diária — sem planilhas soltas.",
  },
  {
    label: "Padaria",
    matchers: ["padari", "confeit"],
    modules: ["PDV", "Produção", "Estoque", "Financeiro"],
    pains: [
      "Produção sem controle de ficha técnica",
      "Perda de matéria-prima",
      "Caixa manual",
      "Dificuldade em precificar",
    ],
    pitch:
      "A Orvix controla produção, ingredientes e caixa em um só lugar — cada fornada com custo real conhecido.",
  },
  {
    label: "Restaurante",
    matchers: ["restaurant", "self service", "self-service", "marmitaria"],
    modules: ["PDV", "Mesas", "Comanda", "Estoque", "Financeiro"],
    pains: [
      "Demora no atendimento",
      "Falta de controle de estoque",
      "Baixa gestão financeira",
      "Controle manual de comandas",
    ],
    pitch:
      "A Orvix organiza mesas, comandas e cozinha — atendimento mais ágil e caixa fechado no fim do dia.",
  },
  {
    label: "Lanchonete",
    matchers: ["lanchonet", "hamburgu", "burger", "snack"],
    modules: ["PDV", "Comanda", "Estoque", "Financeiro"],
    pains: [
      "Pedidos anotados em papel",
      "Perda de insumos",
      "Caixa sem fechamento diário",
    ],
    pitch:
      "Pedido, cozinha e caixa integrados: a Orvix acelera o giro nos horários de pico sem perder o controle.",
  },
  {
    label: "Pizzaria",
    matchers: ["pizzari", "pizza"],
    modules: ["PDV", "Delivery", "Comanda", "Estoque", "Financeiro"],
    pains: [
      "Confusão entre delivery e salão",
      "Perda de ingredientes",
      "Comandas manuais",
      "Falta de controle de motoboy",
    ],
    pitch:
      "Salão, balcão e delivery em uma tela só — a Orvix garante que nenhuma pizza (nem margem) se perca.",
  },
  {
    label: "Adega",
    matchers: ["adega", "vinho", "bebida"],
    modules: ["PDV", "Estoque", "Financeiro", "Clientes"],
    pains: [
      "Estoque por safra/lote sem controle",
      "Falta de fidelização",
      "Precificação manual",
    ],
    pitch:
      "A Orvix controla lote, curva ABC e clientes fiéis — sua adega vende mais e sabe exatamente o que gira.",
  },
  {
    label: "Farmácia",
    matchers: ["farmac", "drogari"],
    modules: ["PDV", "Estoque", "Financeiro", "Fiscal"],
    pains: [
      "Controle de validade manual",
      "Estoque sem rastreio de lote",
      "Dificuldade fiscal (SNGPC)",
      "Caixa lento em pico",
    ],
    pitch:
      "A Orvix atende exigências fiscais, controla lote e validade e acelera o balcão — farmácia sem risco de multa.",
  },
  {
    label: "Pet Shop",
    matchers: ["pet shop", "petshop", "pet"],
    modules: ["PDV", "Agenda", "Estoque", "Clientes", "Financeiro"],
    pains: [
      "Agenda de banho/tosa em papel",
      "Estoque de ração sem giro",
      "Falta de histórico do cliente/pet",
    ],
    pitch:
      "Agenda, banho, tosa e loja no mesmo sistema — a Orvix fideliza tutor e organiza a rotina do pet shop.",
  },
  {
    label: "Papelaria",
    matchers: ["papelari", "papelaria"],
    modules: ["PDV", "Estoque", "Financeiro", "Clientes"],
    pains: [
      "Muitos SKUs sem controle",
      "Sazonalidade escolar difícil de prever",
      "Caixa manual",
    ],
    pitch:
      "A Orvix organiza milhares de SKUs, prevê picos escolares e acelera o caixa — papelaria com margem previsível.",
  },
  {
    label: "Loja de Roupas",
    matchers: ["roupa", "moda", "boutique", "confec"],
    modules: ["PDV", "Estoque (grade)", "Clientes", "Financeiro"],
    pains: [
      "Grade de tamanho/cor sem controle",
      "Baixa fidelização",
      "Vendas sem histórico do cliente",
    ],
    pitch:
      "Estoque em grade, cliente identificado, PDV rápido — a Orvix transforma cada venda em recompra.",
  },
  {
    label: "Loja de Calçados",
    matchers: ["cal[çc]ad", "sapat", "tênis", "tenis"],
    modules: ["PDV", "Estoque (grade)", "Clientes", "Financeiro"],
    pains: [
      "Numeração sem controle preciso",
      "Reposição atrasada",
      "Falta de histórico do cliente",
    ],
    pitch:
      "A Orvix conhece cada par por numeração e histórico — reposição na hora certa e cliente atendido no tamanho certo.",
  },
  {
    label: "Loja de Presentes",
    matchers: ["presente", "utilidad", "bazar"],
    modules: ["PDV", "Estoque", "Financeiro", "Clientes"],
    pains: [
      "Sazonalidade (Natal, Dia das Mães) sem previsão",
      "Muitos SKUs difíceis de encontrar",
      "Precificação manual",
    ],
    pitch:
      "A Orvix organiza catálogo, prevê datas comemorativas e acelera o caixa — presente certo, margem garantida.",
  },
  {
    label: "Autopeças",
    matchers: ["autope[çc]a", "auto pe[çc]a", "pe[çc]a automot"],
    modules: ["Estoque", "PDV", "Financeiro", "Clientes", "Fiscal"],
    pains: [
      "Milhares de códigos sem catálogo",
      "Estoque parado ocupando capital",
      "Falta de histórico do veículo/cliente",
    ],
    pitch:
      "Catálogo, aplicação e giro sob controle — a Orvix reduz estoque parado e ganha velocidade no balcão.",
  },
  {
    label: "Material de Construção",
    matchers: ["constru[çc][ãa]o", "material de constru", "ferragem"],
    modules: ["PDV", "Estoque", "Orçamento", "Financeiro", "Fiscal"],
    pains: [
      "Orçamentos manuais e demorados",
      "Perda de venda por falta de estoque",
      "Entrega e crédito sem controle",
    ],
    pitch:
      "Orçamento em segundos, estoque preciso e crédito controlado — a Orvix ganha obra pela agilidade.",
  },
  {
    label: "Depósito",
    matchers: ["dep[óo]sito", "atacad"],
    modules: ["Estoque", "PDV", "Financeiro", "Fiscal"],
    pains: [
      "Volume alto sem rastreio",
      "Preço por atacado/varejo manual",
      "Fiscal complexo",
    ],
    pitch:
      "A Orvix controla volumes altos, políticas de preço e fiscal — depósito com margem defendida.",
  },
  {
    label: "Assistência Técnica",
    matchers: ["assist[êe]ncia", "conserto", "reparo"],
    modules: ["OS (Ordem de Serviço)", "Estoque", "Clientes", "Financeiro"],
    pains: [
      "Ordem de serviço em papel",
      "Peças sem controle de custo",
      "Falta de acompanhamento do cliente",
    ],
    pitch:
      "OS digital, peças controladas e cliente informado — a Orvix profissionaliza a assistência técnica.",
  },
  {
    label: "Ótica",
    matchers: ["[óo]tica", "ocul"],
    modules: ["PDV", "OS", "Estoque", "Clientes", "Financeiro"],
    pains: [
      "Pedido de lente sem rastreio",
      "Prazo de laboratório sem controle",
      "Ficha do cliente incompleta",
    ],
    pitch:
      "A Orvix acompanha cada pedido de lente e mantém a ficha do cliente sempre atualizada — ótica sem retrabalho.",
  },
  {
    label: "Distribuidora",
    matchers: ["distribuid"],
    modules: ["Estoque", "Pedido de Venda", "Financeiro", "Fiscal", "Rota"],
    pains: [
      "Pedido de vendedor em papel",
      "Rota e entrega sem controle",
      "Crédito e cobrança manuais",
    ],
    pitch:
      "Vendedor externo, rota e cobrança integrados — a Orvix profissionaliza a operação da distribuidora.",
  },
  {
    label: "Conveniência",
    matchers: ["conveni"],
    modules: ["PDV", "Estoque", "Financeiro"],
    pains: [
      "Alto giro sem controle preciso",
      "Perda por validade",
      "Caixa lento em pico",
    ],
    pitch:
      "PDV rápido, validade sob controle e caixa fechado — a Orvix mantém o giro da conveniência sem furos.",
  },
];

const GENERIC: SegmentProfile = {
  label: "Comércio",
  matchers: [],
  modules: ["PDV", "Estoque", "Financeiro", "Clientes"],
  pains: [
    "Controle manual das operações",
    "Falta de visão financeira consolidada",
    "Estoque sem precisão",
    "Cadastro de clientes desorganizado",
  ],
  pitch:
    "A Orvix centraliza vendas, estoque e financeiro em um só lugar — decisões rápidas com dados reais.",
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findProfile(lead: Lead): SegmentProfile {
  const haystack = normalize([lead.segment, lead.category, lead.name].filter(Boolean).join(" | "));
  for (const p of PROFILES) {
    for (const m of p.matchers) {
      if (haystack.includes(normalize(m))) return p;
    }
  }
  return GENERIC;
}

/* -------------------------------------------------------------------------- */
/* ERP Score                                                                  */
/* -------------------------------------------------------------------------- */

// Cidades grandes ganham leve bônus (mercado potencial maior)
const MAJOR_CITIES = new Set([
  "sao paulo", "rio de janeiro", "belo horizonte", "brasilia", "curitiba",
  "porto alegre", "salvador", "fortaleza", "recife", "manaus", "goiania",
  "campinas", "guarulhos", "sao bernardo do campo", "santos", "florianopolis",
]);

function opportunityFromScore(score: number): OrvixOpportunity {
  if (score >= 90) return "Excelente";
  if (score >= 70) return "Alta";
  if (score >= 40) return "Média";
  return "Baixa";
}

/**
 * Regras do ERP Score (0–100) — modo probabilístico:
 * NÃO afirma que o lead "não tem sistema"; mede sinais de operação
 * comercial que INDICAM maior probabilidade de precisar/trocar de ERP+PDV.
 *
 *  • base 30
 *  • +12 segmento identificado como compatível com ERP/PDV
 *  • +12 WhatsApp presente (operação comercial ativa)
 *  • +6  Instagram presente (divulgação ativa)
 *  • +5  Site próprio (negócio estabelecido — sinal positivo, não punição)
 *  • +5  2 ou mais canais digitais simultâneos (multi-canal)
 *  • rating: 4.7+ → +12 · 4.0–4.7 → +8 · <3.5 → −5
 *  • reviews: ≥200 → +14 · ≥50 → +8 · ≥10 → +4
 *  • cidade grande → +5
 *  • poucos sinais (nenhum canal digital e reviews<10) → −10
 */
export function computeOrvixDiagnostic(lead: Lead): OrvixDiagnostic {
  const profile = findProfile(lead);
  const reasons: string[] = [];
  let score = 30;
  reasons.push("Base inicial: 30");

  if (profile !== GENERIC) {
    score += 12;
    reasons.push(`Segmento compatível com ERP/PDV (${profile.label}): +12`);
  } else {
    reasons.push("Segmento genérico: sem bônus específico");
  }

  const hasWhats = !!lead.whatsapp;
  const hasInsta = !!lead.instagram;
  const hasSite = !!(lead.has_website || lead.website);

  if (hasWhats) { score += 12; reasons.push("WhatsApp ativo (indício de operação comercial): +12"); }
  if (hasInsta) { score += 6; reasons.push("Instagram presente (divulgação ativa): +6"); }
  if (hasSite)  { score += 5; reasons.push("Site próprio (negócio estabelecido): +5"); }

  const channels = [hasWhats, hasInsta, hasSite].filter(Boolean).length;
  if (channels >= 2) {
    score += 5;
    reasons.push(`Multi-canal digital (${channels} canais): +5`);
  }

  const rating = typeof lead.rating === "number" ? lead.rating : null;
  if (rating !== null) {
    if (rating >= 4.7) { score += 12; reasons.push(`Rating ${rating.toFixed(1)} (negócio consolidado): +12`); }
    else if (rating >= 4.0) { score += 8; reasons.push(`Rating ${rating.toFixed(1)}: +8`); }
    else if (rating < 3.5) { score -= 5; reasons.push(`Rating ${rating.toFixed(1)} baixo: −5`); }
  }

  const reviews = Number(lead.reviews_count ?? 0);
  if (reviews >= 200) { score += 14; reasons.push(`${reviews} avaliações (alto fluxo): +14`); }
  else if (reviews >= 50) { score += 8; reasons.push(`${reviews} avaliações (bom fluxo): +8`); }
  else if (reviews >= 10) { score += 4; reasons.push(`${reviews} avaliações (fluxo moderado): +4`); }

  const cityKey = normalize(lead.city ?? "");
  if (cityKey && MAJOR_CITIES.has(cityKey)) {
    score += 5;
    reasons.push("Cidade de grande porte: +5");
  }

  // Sinais insuficientes: sem nenhum canal digital E baixo volume de reviews
  if (channels === 0 && reviews < 10) {
    score -= 10;
    reasons.push("Poucos sinais de operação online: −10");
  }

  const erpScore = Math.max(0, Math.min(100, Math.round(score)));
  const opportunity = opportunityFromScore(erpScore);

  return {
    segmentKey: profile.label,
    segmentLabel: profile.label,
    modules: profile.modules,
    pains: profile.pains,
    pitch: profile.pitch,
    recommendedFocus: deriveRecommendedFocus(profile.pains),
    probabilityText: probabilityTextFor(opportunity),
    erpScore,
    opportunity,
    reasons,
  };
}

/* -------------------------------------------------------------------------- */
/* Linguagem de probabilidade (nunca afirma, apenas indica)                    */
/* -------------------------------------------------------------------------- */

function probabilityTextFor(op: OrvixOpportunity): string {
  switch (op) {
    case "Excelente": return "Alta probabilidade de precisar de um sistema de gestão";
    case "Alta":      return "Boa probabilidade de necessitar de sistema";
    case "Média":     return "Possível necessidade de sistema";
    case "Baixa":     return "Sinais insuficientes para inferir necessidade";
  }
}

export function opportunityEmoji(op: OrvixOpportunity): string {
  switch (op) {
    case "Excelente": return "🔥";
    case "Alta":      return "🟢";
    case "Média":     return "🟡";
    case "Baixa":     return "⚪";
  }
}

export function opportunityHeadline(op: OrvixOpportunity): string {
  switch (op) {
    case "Excelente": return "🔥 Excelente oportunidade";
    case "Alta":      return "🟢 Alta oportunidade";
    case "Média":     return "🟡 Média oportunidade";
    case "Baixa":     return "⚪ Baixa oportunidade";
  }
}

/* -------------------------------------------------------------------------- */
/* Foco recomendado (1 linha a partir das dores)                               */
/* -------------------------------------------------------------------------- */

const FOCUS_KEYWORDS: Array<{ pillar: string; rx: RegExp }> = [
  { pillar: "estoque",     rx: /estoque|matéria-prima|materia-prima|insumo|ingrediente|validade|lote|grade|numera[çc][ãa]o|sku/i },
  { pillar: "caixa",       rx: /caixa|fila|pdv|balc[ãa]o|fechamento/i },
  { pillar: "financeiro",  rx: /financ|margem|precifica|cobran[çc]a|cr[ée]dito|fluxo/i },
  { pillar: "vendas",      rx: /venda|giro|pedido|comanda|mesa|delivery|rota/i },
  { pillar: "clientes",    rx: /cliente|fideliza|ficha|hist[óo]rico|cadastro/i },
  { pillar: "fiscal",      rx: /fiscal|sngpc|nota/i },
  { pillar: "ordem de serviço", rx: /ordem de servi[çc]o|\bos\b|reparo|conserto/i },
  { pillar: "produção",    rx: /produ[çc][ãa]o|ficha t[ée]cnica|fornada/i },
  { pillar: "orçamento",   rx: /or[çc]amento/i },
];

function deriveRecommendedFocus(pains: string[]): string {
  const found: string[] = [];
  const text = pains.join(" | ");
  for (const { pillar, rx } of FOCUS_KEYWORDS) {
    if (rx.test(text) && !found.includes(pillar)) found.push(pillar);
    if (found.length >= 3) break;
  }
  if (found.length === 0) return "Focar em vendas, estoque e controle de caixa.";
  if (found.length === 1) return `Focar em ${found[0]}.`;
  if (found.length === 2) return `Focar em ${found[0]} e ${found[1]}.`;
  return `Focar em ${found[0]}, ${found[1]} e ${found[2]}.`;
}

export function opportunityBadgeClass(op: OrvixOpportunity): string {
  switch (op) {
    case "Excelente": return "border-emerald-500/40 text-emerald-500 bg-emerald-500/10";
    case "Alta":      return "border-primary/40 text-primary bg-primary/10";
    case "Média":     return "border-amber-500/40 text-amber-500 bg-amber-500/10";
    default:          return "border-muted-foreground/40 text-muted-foreground bg-muted/30";
  }
}

