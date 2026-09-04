import type { Lead } from "@/data/types";
import { validateOrvixLeadSegment } from "@/lib/orvixSegmentValidation";
import { resolveLeadMap } from "@/lib/leadMapLocation";

/**
 * Orvix — Lead Confidence Score (0–100).
 *
 * Índice de CONFIABILIDADE dos dados encontrados sobre o lead. Não afirma
 * que a empresa existe ou não existe — apenas mede quantos sinais reais
 * cruzam a favor do lead. Cálculo 100% em memória, sem persistência.
 *
 * Independente do ERP Score, da Prioridade Comercial e do scoring
 * Money/Pain/Intent. Nada aqui altera banco, busca ou IA.
 */

export type ConfidenceTier = "high" | "good" | "check" | "low";

export interface LeadConfidence {
  score: number;              // 0–100
  tier: ConfidenceTier;
  emoji: string;              // 🟢 🟡 🟠 🔴
  label: string;              // "Lead altamente confiável" ...
  source: "google" | "osm" | "unknown";
  isDuplicate: boolean;
  reasons: string[];          // motivos positivos ("Google Places oficial")
  warnings: string[];         // motivos de dúvida ("Sem telefone")
}

// Bounding box aproximado do Brasil — usado só para checar coordenadas absurdas.
const BR_LAT = { min: -34, max: 6 };
const BR_LON = { min: -74, max: -34 };

function isBrazilCoord(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= BR_LAT.min && lat <= BR_LAT.max && lon >= BR_LON.min && lon <= BR_LON.max;
}

function detectSource(lead: Lead): "google" | "osm" | "unknown" {
  const map = resolveLeadMap(lead);
  if (map.confidence === "validated") return "google";
  // google_url baseado em search?query=lat,lon é o padrão gerado pelo OSM
  if (map.confidence === "coords") return "osm";
  return "unknown";
}

function tierFromScore(score: number): ConfidenceTier {
  if (score >= 75) return "high";
  if (score >= 55) return "good";
  if (score >= 35) return "check";
  return "low";
}

function labelFor(tier: ConfidenceTier): string {
  switch (tier) {
    case "high":  return "Lead altamente confiável";
    case "good":  return "Lead confiável";
    case "check": return "Conferir informações";
    case "low":   return "Baixa confiabilidade";
  }
}

function emojiFor(tier: ConfidenceTier): string {
  switch (tier) {
    case "high":  return "🟢";
    case "good":  return "🟡";
    case "check": return "🟠";
    case "low":   return "🔴";
  }
}

export function confidenceBadgeClass(tier: ConfidenceTier): string {
  switch (tier) {
    case "high":  return "border-emerald-500/40 text-emerald-500 bg-emerald-500/10";
    case "good":  return "border-amber-500/40 text-amber-500 bg-amber-500/10";
    case "check": return "border-orange-500/40 text-orange-500 bg-orange-500/10";
    case "low":   return "border-rose-500/40 text-rose-500 bg-rose-500/10";
  }
}

/**
 * Calcula a confiança de um lead. `duplicateKeys` opcional traz os leads
 * já vistos (para detectar duplicidade dentro do resultado atual).
 */
export function computeLeadConfidence(
  lead: Lead,
  opts?: { targetSegment?: string | null; isDuplicate?: boolean },
): LeadConfidence {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // ---------- Fonte / Google Maps ----------
  const source = detectSource(lead);
  const map = resolveLeadMap(lead);

  if (source === "google") {
    score += 30;
    reasons.push("Google Places oficial");
    if ((lead.google_url ?? "").includes("place_id")) {
      score += 8;
      reasons.push("Place ID confirmado");
    }
    if (map.confidence === "validated") {
      score += 4;
      reasons.push("Google Maps oficial válido");
    }
  } else if (source === "osm") {
    score += 8;
    warnings.push("Obtido apenas por OpenStreetMap");
  } else {
    warnings.push("Fonte da localização desconhecida");
  }

  // ---------- Coordenadas ----------
  if (isBrazilCoord(lead.latitude, lead.longitude)) {
    score += 6;
    reasons.push("Coordenadas consistentes");
  } else if (lead.latitude != null || lead.longitude != null) {
    warnings.push("Coordenadas fora do padrão");
  }

  // ---------- Contatos ----------
  if (lead.phone && lead.phone.trim() !== "") {
    score += 10;
    reasons.push("Telefone encontrado");
  } else {
    warnings.push("Sem telefone");
  }
  if (lead.whatsapp && lead.whatsapp.trim() !== "") {
    score += 8;
    reasons.push("WhatsApp encontrado");
  }

  // ---------- Presença digital ----------
  if (lead.website || lead.has_website) {
    score += 6;
    reasons.push("Website encontrado");
  }
  if (lead.instagram) { score += 4; reasons.push("Instagram encontrado"); }
  if (lead.facebook)  { score += 2; reasons.push("Facebook encontrado"); }

  // ---------- Reputação ----------
  const reviews = Number(lead.reviews_count ?? 0);
  if (reviews >= 150) { score += 12; reasons.push(`${reviews} avaliações no Google`); }
  else if (reviews >= 50) { score += 8; reasons.push(`${reviews} avaliações`); }
  else if (reviews >= 10) { score += 4; reasons.push(`${reviews} avaliações`); }
  else warnings.push("Poucas ou nenhuma avaliação");

  const rating = typeof lead.rating === "number" ? lead.rating : null;
  if (rating !== null && rating >= 4.0) {
    score += 5;
    reasons.push(`Rating ${rating.toFixed(1)}`);
  }

  // ---------- Compatibilidade de segmento ----------
  if (opts?.targetSegment) {
    const v = validateOrvixLeadSegment(lead, opts.targetSegment);
    if (v.valid) {
      score += 10;
      reasons.push("Categoria compatível com o segmento");
    } else {
      score -= 6;
      warnings.push("Categoria pouco compatível com o segmento");
    }
  }

  // ---------- Duplicidade ----------
  const isDuplicate = !!opts?.isDuplicate;
  if (isDuplicate) {
    score -= 20;
    warnings.push("Possível duplicidade detectada");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier = tierFromScore(score);

  return {
    score,
    tier,
    emoji: emojiFor(tier),
    label: labelFor(tier),
    source,
    isDuplicate,
    reasons,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Estatísticas agregadas da busca                                             */
/* -------------------------------------------------------------------------- */

export interface ConfidenceStats {
  total: number;
  bySource: { google: number; osm: number; unknown: number };
  withPlaceId: number;
  withOfficialMap: number;
  byTier: { high: number; good: number; check: number; low: number };
}

/** Detecta duplicatas por chave estável (nome+cidade OR telefone OR coord). */
function duplicateSet(leads: Lead[]): Set<string> {
  const seen = new Map<string, string>(); // key -> firstId
  const dupIds = new Set<string>();
  for (const l of leads) {
    const keys: string[] = [];
    const nameKey = (l.name ?? "").toLowerCase().trim();
    const cityKey = (l.city ?? "").toLowerCase().trim();
    if (nameKey && cityKey) keys.push(`nc:${nameKey}|${cityKey}`);
    const phoneDigits = (l.phone ?? "").replace(/\D/g, "");
    if (phoneDigits.length >= 8) keys.push(`ph:${phoneDigits}`);
    if (typeof l.latitude === "number" && typeof l.longitude === "number") {
      keys.push(`geo:${l.latitude.toFixed(4)},${l.longitude.toFixed(4)}`);
    }
    for (const k of keys) {
      const first = seen.get(k);
      if (first && first !== l.id) {
        dupIds.add(l.id);
        break;
      }
      if (!first) seen.set(k, l.id);
    }
  }
  return dupIds;
}

export function computeConfidenceMap(
  leads: Lead[],
  targetSegment?: string | null,
): { map: Map<string, LeadConfidence>; stats: ConfidenceStats } {
  const dups = duplicateSet(leads);
  const map = new Map<string, LeadConfidence>();
  const stats: ConfidenceStats = {
    total: leads.length,
    bySource: { google: 0, osm: 0, unknown: 0 },
    withPlaceId: 0,
    withOfficialMap: 0,
    byTier: { high: 0, good: 0, check: 0, low: 0 },
  };
  for (const l of leads) {
    const c = computeLeadConfidence(l, { targetSegment, isDuplicate: dups.has(l.id) });
    map.set(l.id, c);
    stats.bySource[c.source] += 1;
    if ((l.google_url ?? "").includes("place_id")) stats.withPlaceId += 1;
    if (resolveLeadMap(l).confidence === "validated") stats.withOfficialMap += 1;
    stats.byTier[c.tier] += 1;
  }
  return { map, stats };
}
