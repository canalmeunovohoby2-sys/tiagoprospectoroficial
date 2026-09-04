import type { Lead } from "@/data/types";

/**
 * Business Fit Score (Orvix) — camada analítica adicional.
 * ---------------------------------------------------------
 * Score 0–100 que diferencia "empresa encontrada" do "cliente ideal"
 * para venda de ERP/PDV. NÃO substitui ERP Score, Lead Confidence
 * ou Opportunity Score. Apenas classificação comercial.
 *
 * Sinais positivos:
 *  +15 comércio local independente
 *  +10 possui telefone / WhatsApp
 *  +10 sem website (oportunidade de digitalização)
 *  +10 poucos canais digitais
 *  +10 categoria compatível com pequeno varejo
 *
 * Sinais negativos:
 *  -25 rede nacional
 *  -20 franquia conhecida
 *  -20 shopping / mall
 *  -15 grande varejista
 *  -15 categoria corporativa
 */

export type BusinessFitTier = "ideal" | "good" | "neutral" | "poor";

export interface BusinessFitScore {
  score: number;             // 0–100 (base 50)
  tier: BusinessFitTier;
  emoji: string;
  label: string;
  reasons: string[];         // sinais positivos aplicados
  warnings: string[];        // sinais negativos aplicados
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Redes nacionais conhecidas (varejo/serviços)
const NATIONAL_CHAINS = [
  "carrefour", "extra", "pao de acucar", "assai", "atacadao", "sams club",
  "walmart", "big", "makro", "dia %", "dia supermercado", "grupo mateus",
  "casas bahia", "magazine luiza", "magalu", "americanas", "ponto frio",
  "havan", "renner", "riachuelo", "c&a", "marisa", "lojas cem",
  "droga raia", "drogasil", "pague menos", "drogaria sao paulo", "panvel",
  "leroy merlin", "telhanorte", "obramax", "c&c", "dicico",
  "petz", "cobasi", "petlove",
  "burger king", "mcdonald", "subway", "outback", "giraffas", "habibs",
  "starbucks", "kopenhagen", "cacau show",
];

// Franquias conhecidas
const FRANCHISES = [
  "subway", "mcdonald", "burger king", "bob's", "spoleto", "china in box",
  "casa do pao de queijo", "the coffee", "starbucks",
  "o boticario", "natura casa", "mm martan", "chilli beans",
  "cacau show", "kopenhagen", "brasil cacau", "sodie doces",
  "hering store", "puket", "usaflex", "arezzo",
  "5asec", "duo gourmet", "cinemark",
  "smart fit", "bio ritmo", "bodytech",
];

const MALL_TERMS = [
  "shopping center", "shopping", "mall",
  "outlet premium", "outlet", "galleria", "iguatemi", "morumbi shopping",
];

// Infraestrutura corporativa de grande porte — nunca é cliente ERP/PDV
const INFRA_CORPORATE_TERMS = [
  "command center", "data center", "datacenter",
  "centro de operacoes", "centro de operações",
  "operations center", "noc",
];

const CORPORATE_TERMS = [
  "ltda", "s.a.", "s/a", "holding", "corporate", "corporativo",
  "industria", "industrial", "atacadista", "atacado", "distribuidor",
  "logistica", "transportadora", "importadora", "exportadora",
  "consultoria", "assessoria", "escritorio", "advogados",
  "tecnologia", "sistemas", "software",
  "engenharia", "construtora", "incorporadora",
];

// Categorias compatíveis com pequeno varejo (ideal para ERP/PDV Orvix)
const SMALL_RETAIL_CATEGORIES = [
  "mercado", "mercearia", "minimercado", "hortifruti", "empório", "emporio",
  "padaria", "confeitaria", "doceria",
  "restaurante", "lanchonete", "pizzaria", "hamburgueria", "cafeteria", "bar",
  "adega", "distribuidora de bebidas",
  "farmacia", "drogaria",
  "pet shop", "petshop", "pet", "agropecuaria",
  "animal", "racao", "ração", "banho", "tosa",
  "papelaria", "livraria",
  "loja de roupas", "boutique", "moda",
  "calcados", "sapataria",
  "presentes", "utilidades",
  "autopecas", "auto peças",
  "material de construcao", "ferragens",
  "conveniencia", "tabacaria",
  "otica",
  "assistencia tecnica",
];


// Grandes varejistas (não redes, mas porte grande)
const BIG_RETAIL_TERMS = [
  "hipermercado", "hiper ", "atacarejo", "atacadao",
  "megastore", "mega loja", "home center",
];

/**
 * Marcas nacionais por segmento.
 * Camada de reconhecimento comercial: quando o NOME do estabelecimento
 * corresponde a uma marca de rede/franquia nacional, aplicamos uma
 * penalidade adicional (-20) para separar varejo independente grande
 * de rede corporativa. Complementa NATIONAL_CHAINS sem duplicar penalidade.
 */
const NATIONAL_BRAND_TERMS: Record<string, string[]> = {
  supermercado: [
    "carrefour", "extra", "pao de acucar", "assai", "atacadao", "sams club",
    "walmart", "big", "makro", "dia supermercado", "grupo mateus",
    "tenda atacado", "sao vicente", "guanabara", "mundial", "prezunic",
    "zaffari", "bourbon", "bh supermercados", "supermercados bh", "epa",
    "coop", "sonda", "st marche", "hirota",
  ],
  farmacia: [
    "droga raia", "drogasil", "raia drogasil", "pague menos", "extrafarma",
    "drogaria sao paulo", "drogaria pacheco", "panvel", "nissei",
    "droga leste", "farmacias sao joao", "drogaria araujo",
    "ultrafarma", "farmacias pague menos",
  ],
  petshop: [
    "petz", "cobasi", "petlove", "pet camp", "petcenter",
    "mundo animal", "seu dog", "pet z",
  ],
  moda: [
    "renner", "riachuelo", "c&a", "marisa", "hering store", "zara",
    "youcom", "farm", "animale", "leader", "pernambucanas",
    "lojas cem", "lojas cea", "lojas americanas",
  ],
  calcados: [
    "usaflex", "arezzo", "schutz", "anacapri", "mr cat", "constance",
    "paqueta", "esposende", "ortope",
  ],
  eletro: [
    "casas bahia", "magazine luiza", "magalu", "americanas", "ponto frio",
    "havan", "fast shop", "ricardo eletro",
  ],
  construcao: [
    "leroy merlin", "telhanorte", "obramax", "c&c", "dicico", "casa show",
    "balaroti", "quero quero",
  ],
  alimentacao: [
    "burger king", "mcdonald", "subway", "outback", "giraffas", "habibs",
    "spoleto", "bobs", "china in box", "starbucks", "the coffee",
    "casa do pao de queijo", "vivenda do camarao", "madero", "coco bambu",
    "divino fogao",
  ],
  doces: [
    "cacau show", "kopenhagen", "brasil cacau", "sodie doces", "chocolates brasil",
    "kopenhagen chocolates",
  ],
  cosmeticos: [
    "o boticario", "natura casa", "the beauty box", "sephora", "quem disse berenice",
  ],
  academia: [
    "smart fit", "bio ritmo", "bodytech", "selfit", "just fit", "bluefit",
  ],
  otica: [
    "chilli beans", "otica carol", "diniz", "otica dinis",
  ],
  cinema: [
    "cinemark", "cinepolis", "kinoplex", "cinesystem", "moviecom",
  ],
};

// Flatten para uma varredura única (todos os segmentos)
const ALL_NATIONAL_BRANDS: string[] = Array.from(
  new Set(Object.values(NATIONAL_BRAND_TERMS).flat().map((t) => t.toLowerCase()))
);

function detectNationalBrand(name: string): string | null {
  for (const brand of ALL_NATIONAL_BRANDS) {
    if (!brand) continue;
    // match exato por palavra/substring no nome — não usar haystack (endereço/categoria)
    // para evitar falsos positivos por endereço "Rua Renner 123".
    if (name.includes(norm(brand))) return brand;
  }
  return null;
}


function includesAny(text: string, list: string[]): string | null {
  for (const term of list) {
    if (!term) continue;
    if (text.includes(norm(term))) return term;
  }
  return null;
}

export function computeBusinessFit(lead: Lead): BusinessFitScore {
  const name = norm(lead.name);
  const cat = norm(lead.category);
  const addr = norm(lead.address);
  const haystack = `${name} ${cat} ${addr}`;

  let score = 50; // base neutra
  const reasons: string[] = [];
  const warnings: string[] = [];

  // === Sinais negativos (aplicados primeiro para clareza) ===
  const chain = includesAny(haystack, NATIONAL_CHAINS);
  if (chain) {
    score -= 25;
    warnings.push(`Rede nacional detectada (${chain.trim()})`);
  }

  const franchise = includesAny(haystack, FRANCHISES);
  if (franchise && franchise !== chain) {
    score -= 20;
    warnings.push(`Franquia conhecida (${franchise.trim()})`);
  }

  // Camada de reconhecimento de marcas nacionais por segmento (aplicada
  // sobre o NOME apenas). Complementa NATIONAL_CHAINS/FRANCHISES para
  // separar varejo independente grande de rede corporativa.
  const brand = detectNationalBrand(name);
  const alreadyPenalized =
    (chain && brand && norm(chain).includes(brand)) ||
    (franchise && brand && norm(franchise).includes(brand));
  if (brand && !alreadyPenalized) {
    score -= 20;
    warnings.push(`Marca nacional reconhecida (${brand})`);
  }


  const mall = includesAny(haystack, MALL_TERMS);
  if (mall) {
    score -= 35;
    warnings.push("Localizado em shopping/mall");
  }

  const bigRetail = includesAny(haystack, BIG_RETAIL_TERMS);
  if (bigRetail) {
    score -= 15;
    warnings.push("Perfil de grande varejista");
  }

  const infraCorp = includesAny(haystack, INFRA_CORPORATE_TERMS);
  if (infraCorp) {
    score -= 40;
    warnings.push(`Infraestrutura corporativa (${infraCorp.trim()})`);
  }

  const corporate = includesAny(haystack, CORPORATE_TERMS);
  if (corporate) {
    score -= 15;
    warnings.push(`Categoria corporativa (${corporate.trim()})`);
  }

  // === Sinais positivos ===
  const smallRetail = includesAny(haystack, SMALL_RETAIL_CATEGORIES);
  const looksIndependent =
    !chain && !franchise && !mall && !bigRetail && !corporate && !infraCorp;

  if (looksIndependent) {
    score += 15;
    reasons.push("Comércio local independente");
  }


  if (lead.phone || lead.whatsapp) {
    score += 10;
    reasons.push("Possui telefone/WhatsApp");
  }

  if (!lead.website && !lead.has_website) {
    score += 10;
    reasons.push("Sem website (oportunidade de digitalização)");
  }

  const digitalChannels = [lead.website, lead.instagram, lead.facebook].filter(Boolean).length;
  if (digitalChannels <= 1) {
    score += 10;
    reasons.push("Poucos canais digitais");
  }

  if (smallRetail) {
    score += 10;
    reasons.push(`Categoria compatível com pequeno varejo (${smallRetail.trim()})`);
  }

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier: BusinessFitTier;
  let emoji: string;
  let label: string;
  if (score >= 80) {
    tier = "ideal";
    emoji = "🎯";
    label = "Cliente ideal";
  } else if (score >= 65) {
    tier = "good";
    emoji = "✅";
    label = "Bom fit";
  } else if (score >= 45) {
    tier = "neutral";
    emoji = "➖";
    label = "Fit neutro";
  } else {
    tier = "poor";
    emoji = "⚠️";
    label = "Fit baixo";
  }

  return { score, tier, emoji, label, reasons, warnings };
}

export function businessFitBadgeClass(tier: BusinessFitTier): string {
  switch (tier) {
    case "ideal":
      return "border-emerald-500/40 text-emerald-500 bg-emerald-500/5";
    case "good":
      return "border-sky-500/40 text-sky-500 bg-sky-500/5";
    case "neutral":
      return "border-border/60 text-muted-foreground bg-transparent";
    case "poor":
      return "border-amber-500/40 text-amber-500 bg-amber-500/5";
  }
}
