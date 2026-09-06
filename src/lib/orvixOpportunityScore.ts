import type { Lead } from "@/data/types";

/**
 * Business Opportunity Score (Orvix)
 * ----------------------------------
 * Score complementar (0–100) em memória, focado em identificar quais
 * estabelecimentos parecem os melhores candidatos para uma abordagem
 * comercial de ERP/PDV. NÃO substitui ERP Score nem Lead Confidence —
 * é uma leitura adicional de "oportunidade comercial".
 *
 * Sinais considerados:
 *  - Volume e qualidade de avaliações
 *  - Canais de contato (telefone, WhatsApp)
 *  - Presença digital (site, Instagram, Facebook)
 *  - Horário de funcionamento (operação ativa)
 *  - Múltiplas unidades (heurística por nome/categoria)
 *  - Compatibilidade com o segmento pesquisado
 *  - Bônus para empresas em crescimento
 *  - Bônus para pequenos negócios com organização
 *  - Penalizações por dados escassos / incompatibilidades
 *
 * Regras:
 *  - Nunca exclui automaticamente.
 *  - Sempre devolve motivos e alertas legíveis.
 */

export type OpportunityTier = "top" | "high" | "medium" | "low";

export interface OpportunityScore {
  score: number;               // 0–100
  tier: OpportunityTier;
  emoji: string;
  label: string;
  reasons: string[];           // sinais positivos
  warnings: string[];          // penalizações / atenção
  growth: boolean;             // empresa aparenta crescimento
  organizedSmall: boolean;     // pequeno negócio organizado
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function hasMultipleUnitsHeuristic(l: Lead): boolean {
  const n = norm(l.name);
  if (!n) return false;
  // sinais de rede/franquia/múltiplas unidades
  const patterns = [
    /\bunidade\b/, /\bfilial\b/, /\bmatriz\b/,
    /\bloja\s?\d+/, /\bii\b|\biii\b|\biv\b/,
    /\s-\s(centro|zona\s?(sul|norte|leste|oeste)|shopping)/,
  ];
  return patterns.some((r) => r.test(n));
}

function segmentCompatible(l: Lead, targetSegment: string | null): boolean | null {
  if (!targetSegment) return null;
  const seg = norm(targetSegment);
  const hay = [l.segment, l.category, l.name].map(norm).join(" ");
  if (!hay.trim()) return null;
  // compatível se qualquer token relevante do segmento aparecer
  const tokens = seg.split(/\s+/).filter((t) => t.length > 3);
  if (tokens.length === 0) return hay.includes(seg);
  return tokens.some((t) => hay.includes(t));
}

/**
 * Calcula o Business Opportunity Score de um lead.
 */
export function computeOpportunityScore(
  lead: Lead,
  targetSegment: string | null = null,
): OpportunityScore {
  let score = 40; // base neutra
  const reasons: string[] = [];
  const warnings: string[] = [];

  const reviews = Number(lead.reviews_count ?? 0);
  const rating = typeof lead.rating === "number" ? lead.rating : null;

  // --- Avaliações (volume) ---
  if (reviews >= 500) { score += 18; reasons.push(`+${reviews} avaliações — operação relevante`); }
  else if (reviews >= 200) { score += 14; reasons.push(`+${reviews} avaliações`); }
  else if (reviews >= 80) { score += 10; reasons.push(`${reviews} avaliações`); }
  else if (reviews >= 25) { score += 6; reasons.push(`${reviews} avaliações`); }
  else if (reviews >= 5) { score += 2; }
  else if (reviews === 0) { score -= 4; warnings.push("Sem avaliações públicas"); }

  // --- Rating ---
  if (rating != null) {
    if (rating >= 4.6) { score += 8; reasons.push(`Reputação excelente (${rating.toFixed(1)}★)`); }
    else if (rating >= 4.2) { score += 5; reasons.push(`Boa reputação (${rating.toFixed(1)}★)`); }
    else if (rating >= 3.5) { score += 2; }
    else if (rating > 0 && rating < 3.0) { score -= 5; warnings.push(`Reputação baixa (${rating.toFixed(1)}★)`); }
  }

  // --- Canais de contato ---
  const hasPhone = !!lead.phone;
  if (hasPhone) { score += 4; reasons.push("Telefone disponível"); }
  else { score -= 3; warnings.push("Sem telefone"); }
  if (lead.whatsapp) { score += 6; reasons.push("WhatsApp encontrado"); }

  // --- Presença digital vs. OPORTUNIDADE (5.31) ---
  // O Prospector vende presença digital: quem JÁ TEM site tem menos urgência,
  // quem NÃO TEM site é a oportunidade — desde que o negócio pareça real e
  // ativo (avaliações/canais/horário). Nunca elimina; só re-prioriza.
  const hasIg = !!lead.instagram;
  const hasFb = !!lead.facebook;
  const hasHoursArr = Array.isArray(lead.opening_hours) ? lead.opening_hours.length > 0 : false;
  const digitalChannels = (lead.website ? 1 : 0) + (hasIg ? 1 : 0) + (hasFb ? 1 : 0);
  if (lead.website) {
    score -= 4;
    warnings.push("Já possui site próprio — menor urgência comercial");
  } else {
    const realSignals = (lead.reviews_count ?? 0) > 0 || hasPhone || !!lead.whatsapp || hasIg || hasFb || hasHoursArr;
    if (realSignals) {
      score += 10;
      reasons.push("Sem site próprio — oportunidade de landing page");
    } else {
      score += 3;
      warnings.push("Sem site — confirmar se o negócio está ativo antes de abordar");
    }
  }
  if (hasIg) { score += 5; reasons.push("Instagram encontrado"); }
  if (hasFb) { score += 2; reasons.push("Facebook encontrado"); }

  // --- Horário de funcionamento (operação ativa) ---
  const hours = Array.isArray(lead.opening_hours) ? lead.opening_hours : null;
  if (hours && hours.length > 0) { score += 5; reasons.push("Horário de funcionamento publicado"); }

  // --- Múltiplas unidades ---
  const multi = hasMultipleUnitsHeuristic(lead);
  if (multi) { score += 8; reasons.push("Possíveis múltiplas unidades / rede"); }

  // --- Compatibilidade com segmento pesquisado ---
  const compat = segmentCompatible(lead, targetSegment);
  if (compat === true) { score += 6; reasons.push("Categoria compatível com o segmento"); }
  else if (compat === false) { score -= 8; warnings.push("Categoria pouco compatível com o segmento"); }

  // --- Empresa em crescimento (composto) ---
  const growth =
    reviews >= 100 &&
    (rating ?? 0) >= 4.0 &&
    digitalChannels >= 2 &&
    !!lead.phone;
  if (growth) { score += 8; reasons.push("Sinais de crescimento (reputação + canais + volume)"); }

  // --- Pequeno negócio organizado ---
  const organizedSmall =
    !growth &&
    reviews > 0 && reviews < 100 &&
    (rating ?? 0) >= 3.8 &&
    (digitalChannels >= 1 || !!lead.whatsapp) &&
    !!lead.phone;
  if (organizedSmall) { score += 5; reasons.push("Pequeno negócio organizado — bom potencial"); }

  // --- Informações conflitantes / negócio inativo ---
  const noContacts = !lead.phone && !lead.whatsapp && !lead.website && !lead.instagram && !lead.facebook;
  if (noContacts) { score -= 10; warnings.push("Nenhum canal de contato encontrado"); }
  if (reviews === 0 && !hours && !lead.website && !lead.phone) {
    score -= 6; warnings.push("Sinais de operação inativa");
  }

  // --- Clamp ---
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  let tier: OpportunityTier;
  let emoji: string;
  let label: string;
  if (score >= 78) { tier = "top"; emoji = "🔥"; label = "Ótima oportunidade"; }
  else if (score >= 60) { tier = "high"; emoji = "🟢"; label = "Boa oportunidade"; }
  else if (score >= 45) { tier = "medium"; emoji = "🟡"; label = "Oportunidade média"; }
  else { tier = "low"; emoji = "⚪"; label = "Baixa oportunidade"; }

  return { score, tier, emoji, label, reasons, warnings, growth, organizedSmall };
}

export function opportunityBadgeClass(tier: OpportunityTier): string {
  switch (tier) {
    case "top":    return "border-rose-500/40 text-rose-500 bg-rose-500/5";
    case "high":   return "border-emerald-500/40 text-emerald-500 bg-emerald-500/5";
    case "medium": return "border-amber-500/40 text-amber-500 bg-amber-500/5";
    case "low":    return "border-muted-foreground/30 text-muted-foreground bg-muted/20";
  }
}

/**
 * Constrói um mapa id -> OpportunityScore para uma lista de leads,
 * evitando recomputar dentro dos cards.
 */
export function computeOpportunityMap(
  leads: Lead[],
  targetSegment: string | null,
): Map<string, OpportunityScore> {
  const map = new Map<string, OpportunityScore>();
  for (const l of leads) map.set(l.id, computeOpportunityScore(l, targetSegment));
  return map;
}

export type OrvixSortMode =
  | "priority"       // padrão atual (mantém sortLeadsByOrvixPriority)
  | "opportunity"    // Business Opportunity Score
  | "confidence"     // Lead Confidence
  | "reviews"        // mais avaliações
  | "rating";        // melhor reputação

export interface SortContext {
  opportunity: Map<string, OpportunityScore>;
  confidence?: Map<string, { score: number }>;
}

export function sortLeadsBy(
  leads: Lead[],
  mode: OrvixSortMode,
  ctx: SortContext,
): Lead[] {
  const arr = [...leads];
  switch (mode) {
    case "opportunity":
      return arr.sort(
        (a, b) => (ctx.opportunity.get(b.id)?.score ?? 0) - (ctx.opportunity.get(a.id)?.score ?? 0),
      );
    case "confidence":
      return arr.sort(
        (a, b) => (ctx.confidence?.get(b.id)?.score ?? 0) - (ctx.confidence?.get(a.id)?.score ?? 0),
      );
    case "reviews":
      return arr.sort((a, b) => (b.reviews_count ?? 0) - (a.reviews_count ?? 0));
    case "rating":
      return arr.sort((a, b) => {
        const ra = a.rating ?? -1;
        const rb = b.rating ?? -1;
        if (rb !== ra) return rb - ra;
        return (b.reviews_count ?? 0) - (a.reviews_count ?? 0);
      });
    case "priority":
    default:
      return arr; // caller aplicará sortLeadsByOrvixPriority
  }
}
