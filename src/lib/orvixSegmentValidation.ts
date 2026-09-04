import type { Lead } from "@/data/types";

/**
 * Orvix ERP — Validação de segmento (in-memory).
 *
 * Filtra leads que não pertencem ao segmento escolhido pelo usuário antes de
 * exibi-los na listagem de resultados. Nada é removido do banco — apenas
 * ocultado na UI do módulo Orvix. Zero impacto em Landing Pages, busca ou
 * Edge Functions.
 */

export interface SegmentRule {
  /** Termos que confirmam que o lead pertence ao segmento. */
  accept: string[];
  /** Termos que denunciam pertencer a outro nicho (rejeitar mesmo que haja match fraco). */
  reject?: string[];
}

/**
 * Regras por segmento Orvix. Chave = rótulo do segmento (case-insensitive na leitura).
 * Sempre em minúsculas, sem acentos.
 */
export const ORVIX_SEGMENT_RULES: Record<string, SegmentRule> = {
  mercado: {
    accept: ["mercado", "supermerc", "hipermerc", "minimerc", "mercearia", "conveni", "empori"],
    reject: ["adega", "bar", "restaurante", "lanchonete", "pizzaria", "distribuidor", "fornecedor", "atacad", "farm", "pet"],
  },
  supermercado: {
    accept: ["supermerc", "hipermerc", "mercado", "atacarej"],
    reject: ["adega", "bar", "restaurante", "farm", "pet", "distribuidor"],
  },
  padaria: {
    accept: ["padaria", "panificad", "confeitar", "boulanger"],
    reject: ["restaurante", "pizzaria", "lanchonete", "mercado", "bar"],
  },
  restaurante: {
    accept: ["restaurante", "churrascaria", "cantina", "trattoria", "bistro", "self-service", "self service", "comida", "gastron"],
    reject: ["padaria", "sorveter", "lanchonete", "pizzaria", "mercado", "farm", "loja"],
  },
  lanchonete: {
    accept: ["lanchonete", "lanches", "hamburgu", "burger", "hot dog", "cafeteria", "sanduich"],
    reject: ["restaurante", "pizzaria", "padaria", "mercado", "adega"],
  },
  pizzaria: {
    accept: ["pizzaria", "pizza"],
    reject: ["restaurante", "lanchonete", "padaria", "mercado"],
  },
  adega: {
    accept: [
      "adega", "vinho", "vinhos", "wine", "bebidas",
      "distribuidora de bebidas",
      "emporio", "empório", "emporio de bebidas", "empório de bebidas",
      "wine shop", "wine bar",
      "casa de bebidas", "loja de vinhos",
    ],
    reject: ["mercado", "supermerc", "restaurante", "farm"],
  },
  farmácia: {
    accept: ["farmacia", "farmácia", "drogaria", "manipul"],
    reject: ["mercado", "pet", "loja", "restaurante"],
  },
  "pet shop": {
    accept: ["pet", "petshop", "pet shop", "agropec", "veterinari"],
    reject: ["mercado", "farm", "restaurante"],
  },
  papelaria: {
    accept: ["papelaria", "papelar", "material escolar", "escritori"],
    reject: ["mercado", "farm", "restaurante", "loja de rou"],
  },
  "loja de roupas": {
    accept: ["roupa", "moda", "boutique", "vestuari", "confec", "modas", "fashion"],
    reject: ["calçad", "calcad", "sapato", "otica", "óptica", "mercado"],
  },
  "loja de calçados": {
    accept: ["calçad", "calcad", "sapato", "tenis", "tênis", "sapatar"],
    reject: ["roupa", "moda", "boutique", "otica"],
  },
  "loja de presentes": {
    accept: ["presente", "utilidad", "bazar", "variedad", "1,99", "achados"],
    reject: ["mercado", "farm", "restaurante"],
  },
  autopeças: {
    accept: ["autopec", "autopeç", "auto peça", "auto peca", "peças automotivas", "acessorios automot", "acessórios automot", "retifica", "auto center", "mecanica", "mecânica"],
    reject: ["mercado", "restaurante", "farm", "loja de rou"],
  },
  "material de construção": {
    accept: ["material de constru", "construção", "construcao", "ferragem", "ferragens", "loja de tinta", "hidraulica", "hidráulica", "eletrica", "elétrica", "depos"],
    reject: ["mercado", "restaurante", "farm"],
  },
  depósito: {
    accept: ["deposito", "depósito", "atacad", "distribuidor"],
    reject: ["restaurante", "farm", "pet"],
  },
  "assistência técnica": {
    accept: ["assistencia tecnica", "assistência técnica", "conserto", "reparo", "manutenção", "manutencao", "eletronic", "celular"],
    reject: ["mercado", "restaurante", "farm", "loja de rou"],
  },
  ótica: {
    accept: ["otica", "óptica", "oticas", "óculos", "oculos"],
    reject: ["roupa", "calçad", "mercado", "farm"],
  },
  distribuidora: {
    accept: ["distribuidor", "distribuidora", "atacad", "atacarej", "fornecedor"],
    reject: ["restaurante", "farm", "pet", "loja de rou"],
  },
  conveniência: {
    accept: ["conveni", "24 horas", "24h", "posto"],
    reject: ["restaurante", "farm", "pet", "loja de rou"],
  },
};

/** Remove acentos e normaliza para lowercase. */
function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ruleFor(segment: string | null | undefined): SegmentRule | null {
  const key = norm(segment);
  if (!key) return null;
  // match direto
  if (ORVIX_SEGMENT_RULES[key]) return ORVIX_SEGMENT_RULES[key];
  // match por chave normalizada (as chaves acima também são normalizadas)
  const found = Object.entries(ORVIX_SEGMENT_RULES).find(([k]) => norm(k) === key);
  return found ? found[1] : null;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  /** Chave da regra aplicada (segmento normalizado). */
  ruleKey?: string | null;
  /** Termo específico do accept/reject que casou (ou nulo se nenhum). */
  matchedTerm?: string | null;
  /** Categoria da rejeição para agrupamento na auditoria. */
  rejectionCategory?: "reject_term_hit" | "no_accept_match" | "no_haystack" | null;
}

/**
 * Valida se um lead pertence ao segmento escolhido, analisando name, category
 * e segment. Se não houver regra para o segmento, aceita por padrão (fallback
 * seguro — evita ocultar tudo caso um segmento novo seja adicionado).
 */
export function validateOrvixLeadSegment(lead: Lead, targetSegment: string | null | undefined): ValidationResult {
  const key = norm(targetSegment);
  const rule = ruleFor(targetSegment);
  if (!rule) return { valid: true, ruleKey: null };

  const haystack = [lead.name, lead.category, lead.segment]
    .map(norm)
    .filter(Boolean)
    .join(" | ");

  if (!haystack) return { valid: true, ruleKey: key, rejectionCategory: null };

  const rejectHit = rule.reject?.find((term) => haystack.includes(norm(term)));
  const acceptHit = rule.accept.find((term) => haystack.includes(norm(term)));

  if (acceptHit) return { valid: true, ruleKey: key, matchedTerm: acceptHit };
  if (rejectHit) {
    return {
      valid: false,
      reason: `rejeitado por "${rejectHit}"`,
      ruleKey: key,
      matchedTerm: rejectHit,
      rejectionCategory: "reject_term_hit",
    };
  }
  return {
    valid: false,
    reason: "sem termos do segmento no nome/categoria",
    ruleKey: key,
    matchedTerm: null,
    rejectionCategory: "no_accept_match",
  };
}

/** Aplica o filtro a uma lista de leads. Retorna válidos, rejeitados e detalhes. */
export function filterLeadsByOrvixSegment<T extends Lead>(leads: T[], targetSegment: string | null | undefined): {
  valid: T[];
  rejected: T[];
  rejectionDetails: Map<string, ValidationResult>;
} {
  const valid: T[] = [];
  const rejected: T[] = [];
  const rejectionDetails = new Map<string, ValidationResult>();
  for (const l of leads) {
    const result = validateOrvixLeadSegment(l, targetSegment);
    if (result.valid) valid.push(l);
    else {
      rejected.push(l);
      rejectionDetails.set(l.id, result);
    }
  }
  return { valid, rejected, rejectionDetails };
}
