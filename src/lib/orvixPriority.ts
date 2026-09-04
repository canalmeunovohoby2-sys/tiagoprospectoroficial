import type { Lead } from "@/data/types";
import { computeOrvixDiagnostic, type OrvixDiagnostic } from "./orvixDiagnostics";

/**
 * Orvix ERP — Camada comercial de priorização (in-memory).
 * Não altera scoring, banco, CRM ou busca. Apenas ordena/rotula os leads
 * do módulo Orvix pela melhor oportunidade de venda de ERP/PDV.
 */

export type OrvixPriorityTier = "high" | "medium" | "low";

export interface OrvixPriority {
  tier: OrvixPriorityTier;
  label: string;
  emoji: string;
  score: number;         // 0–100 (rank comercial)
  badgeClass: string;
  reasons: string[];
}

// Segmentos que costumam vender melhor um ERP/PDV.
const STRONG_SEGMENTS = new Set([
  "Supermercado", "Mercado", "Padaria", "Restaurante", "Lanchonete",
  "Pizzaria", "Farmácia", "Autopeças", "Material de Construção",
  "Distribuidora", "Depósito", "Conveniência",
]);

function badgeClassFor(tier: OrvixPriorityTier): string {
  switch (tier) {
    case "high":   return "border-primary/50 text-primary bg-primary/10";
    case "medium": return "border-amber-500/40 text-amber-500 bg-amber-500/10";
    default:       return "border-muted-foreground/30 text-muted-foreground bg-muted/30";
  }
}

export function computeOrvixPriority(
  lead: Lead,
  diag?: OrvixDiagnostic,
): OrvixPriority {
  const d = diag ?? computeOrvixDiagnostic(lead);
  const reasons: string[] = [];

  const strongSegment = STRONG_SEGMENTS.has(d.segmentLabel);
  const hasWhats = !!lead.whatsapp;
  const hasInsta = !!lead.instagram;
  const hasSite = !!(lead.has_website || lead.website);
  const reviews = Number(lead.reviews_count ?? 0);
  const rating = typeof lead.rating === "number" ? lead.rating : 0;

  // Score comercial começa com o ERP Score e recebe ajustes de fit comercial.
  let score = d.erpScore;
  reasons.push(`ERP Score: ${d.erpScore}`);

  if (strongSegment) { score += 6; reasons.push(`Segmento forte para ERP (${d.segmentLabel}): +6`); }
  if (hasWhats && reviews >= 50) { score += 4; reasons.push("WhatsApp + muitas avaliações: +4"); }
  if (!hasSite && (hasWhats || hasInsta)) { score += 4; reasons.push("Sem site, mas ativo em canais digitais: +4"); }
  if (reviews >= 200) { score += 3; reasons.push("Volume alto de avaliações (≥200): +3"); }
  if (rating >= 4.5 && reviews >= 50) { score += 2; reasons.push("Reputação sólida: +2"); }
  if (hasSite && d.erpScore < 60) { score -= 3; reasons.push("Já possui site e ERP Score baixo: −3"); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Combinação de "Alta oportunidade" quando o ERP Score sozinho não bateu 80.
  const strongCombo =
    strongSegment && hasWhats && reviews >= 50 && !hasSite;

  let tier: OrvixPriorityTier;
  if (d.erpScore >= 80 || strongCombo) tier = "high";
  else if (d.erpScore >= 50) tier = "medium";
  else tier = "low";

  if (strongCombo && d.erpScore < 80) {
    reasons.push("Combinação: segmento forte + WhatsApp + avaliações + sem site");
  }

  const label =
    tier === "high" ? "Alta oportunidade" :
    tier === "medium" ? "Boa oportunidade" : "Baixa oportunidade";
  const emoji = tier === "high" ? "🔥" : tier === "medium" ? "🟡" : "⚪";

  return { tier, label, emoji, score, badgeClass: badgeClassFor(tier), reasons };
}

const TIER_RANK: Record<OrvixPriorityTier, number> = { high: 3, medium: 2, low: 1 };

export function sortLeadsByOrvixPriority(leads: Lead[]): Lead[] {
  return [...leads]
    .map((l) => ({ l, p: computeOrvixPriority(l) }))
    .sort((a, b) => {
      const t = TIER_RANK[b.p.tier] - TIER_RANK[a.p.tier];
      if (t !== 0) return t;
      return b.p.score - a.p.score;
    })
    .map((x) => x.l);
}
