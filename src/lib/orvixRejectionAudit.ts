/**
 * Orvix — Auditoria de rejeições do filtro de segmento.
 *
 * Classifica cada lead rejeitado por `orvixSegmentValidation` em:
 *
 *  - `rejeicao_correta`      → há sinal forte de que o lead pertence a outro nicho
 *                              (termo denunciante bateu ou tags OSM / Google types
 *                              apontam explicitamente para outro segmento).
 *
 *  - `possivel_falso_negativo` → há sinal forte de que o lead PERTENCE ao segmento
 *                              alvo (Google type esperado, tag OSM esperada ou
 *                              includedType esperado usado na busca), mas o filtro
 *                              rejeitou por análise textual pobre.
 *
 *  - `duvidoso`               → nenhum sinal forte em qualquer direção.
 *
 * Puramente diagnóstico. NÃO altera regras de aceitação/rejeição.
 * NÃO persiste em banco. NÃO altera busca, scoring, CRM, IA ou layout.
 */

import type { Lead } from "@/data/types";
import type { ValidationResult } from "@/lib/orvixSegmentValidation";

// ─────────────────────────────────────────────────────────────
// Assinaturas esperadas por segmento (audit-only). Mantidas fora
// de `orvixSegmentValidation.ts` de propósito — este arquivo apenas
// classifica; não filtra e não muda nenhum resultado exibido.
// ─────────────────────────────────────────────────────────────

type SegmentSignature = {
  googleTypes: string[];
  osm: Array<{ key: string; value?: string }>; // sem `value` = qualquer valor
  includedTypes: string[];
};

const SIGNATURES: Record<string, SegmentSignature> = {
  "pet shop": {
    googleTypes: ["pet_store", "veterinary_care"],
    osm: [
      { key: "shop", value: "pet" },
      { key: "shop", value: "pet_grooming" },
      { key: "shop", value: "pet_food" },
      { key: "shop", value: "animal_feed" },
      { key: "shop", value: "animal_boarding" },
      { key: "shop", value: "agrarian" },
      { key: "amenity", value: "veterinary" },
      { key: "healthcare", value: "veterinary" },
    ],
    includedTypes: ["pet_store", "veterinary_care"],
  },
  adega: {
    googleTypes: ["liquor_store"],
    osm: [
      { key: "shop", value: "wine" },
      { key: "shop", value: "alcohol" },
      { key: "shop", value: "beverages" },
    ],
    includedTypes: ["liquor_store"],
  },
  mercado: {
    googleTypes: ["grocery_store", "supermarket", "convenience_store"],
    osm: [
      { key: "shop", value: "supermarket" },
      { key: "shop", value: "convenience" },
      { key: "shop", value: "grocery" },
      { key: "shop", value: "greengrocer" },
    ],
    includedTypes: ["grocery_store", "supermarket", "convenience_store"],
  },
  supermercado: {
    googleTypes: ["supermarket", "grocery_store"],
    osm: [
      { key: "shop", value: "supermarket" },
      { key: "shop", value: "grocery" },
    ],
    includedTypes: ["supermarket", "grocery_store"],
  },
  "material de construção": {
    googleTypes: ["hardware_store", "home_improvement_store"],
    osm: [
      { key: "shop", value: "hardware" },
      { key: "shop", value: "doityourself" },
      { key: "shop", value: "trade" },
      { key: "shop", value: "paint" },
      { key: "shop", value: "electrical" },
    ],
    includedTypes: ["hardware_store", "home_improvement_store"],
  },
  autopeças: {
    googleTypes: ["auto_parts_store", "car_repair"],
    osm: [
      { key: "shop", value: "car_parts" },
      { key: "shop", value: "car_repair" },
      { key: "shop", value: "tyres" },
      { key: "amenity", value: "car_repair" },
    ],
    includedTypes: ["auto_parts_store", "car_repair"],
  },
  farmácia: {
    googleTypes: ["pharmacy", "drugstore"],
    osm: [{ key: "amenity", value: "pharmacy" }, { key: "healthcare", value: "pharmacy" }],
    includedTypes: ["pharmacy", "drugstore"],
  },
  restaurante: {
    googleTypes: ["restaurant"],
    osm: [{ key: "amenity", value: "restaurant" }],
    includedTypes: ["restaurant"],
  },
  padaria: {
    googleTypes: ["bakery"],
    osm: [{ key: "shop", value: "bakery" }, { key: "craft", value: "bakery" }],
    includedTypes: ["bakery"],
  },
  pizzaria: {
    googleTypes: ["pizza_restaurant"],
    osm: [{ key: "cuisine", value: "pizza" }],
    includedTypes: ["pizza_restaurant"],
  },
  lanchonete: {
    googleTypes: ["fast_food_restaurant", "hamburger_restaurant", "sandwich_shop"],
    osm: [{ key: "amenity", value: "fast_food" }],
    includedTypes: ["fast_food_restaurant", "hamburger_restaurant", "sandwich_shop"],
  },
  "loja de roupas": {
    googleTypes: ["clothing_store"],
    osm: [{ key: "shop", value: "clothes" }, { key: "shop", value: "boutique" }],
    includedTypes: ["clothing_store"],
  },
  "loja de calçados": {
    googleTypes: ["shoe_store"],
    osm: [{ key: "shop", value: "shoes" }],
    includedTypes: ["shoe_store"],
  },
  papelaria: {
    googleTypes: ["book_store"],
    osm: [{ key: "shop", value: "stationery" }, { key: "shop", value: "books" }],
    includedTypes: ["book_store"],
  },
  ótica: {
    googleTypes: ["optician"],
    osm: [{ key: "shop", value: "optician" }],
    includedTypes: ["optician"],
  },
  conveniência: {
    googleTypes: ["convenience_store"],
    osm: [{ key: "shop", value: "convenience" }],
    includedTypes: ["convenience_store"],
  },
};

function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function sigFor(segment: string | null | undefined): SegmentSignature | null {
  const key = norm(segment);
  if (!key) return null;
  return SIGNATURES[key] ?? null;
}

export type RejectionClass = "rejeicao_correta" | "possivel_falso_negativo" | "duvidoso";

export interface RejectionAuditEntry {
  leadId: string;
  name: string;
  classification: RejectionClass;
  /** Sinais que suportam o segmento alvo (indicador de falso negativo). */
  positiveSignals: string[];
  /** Sinais de que o lead pertence a outro nicho (indicador de rejeição correta). */
  negativeSignals: string[];
  /** Metadados brutos usados na análise, para inspeção. */
  meta: {
    source: string | null;
    category: string | null;
    googleTypes: string[] | null;
    osmTags: Record<string, string> | null;
    includedType: string | null;
    synonym: string | null;
    rule: string | null;
    matchedTerm: string | null;
    reason: string | null;
    rejectionCategory: string | null;
  };
}

export interface PerLeadAudit {
  source?: string | null;
  synonym?: string | null;
  included_type?: string | null;
  rule?: string | null;
  osm_tags?: Record<string, string> | null;
  category?: string | null;
  google_types?: string[] | null;
  confidence?: number | null;
}

function osmMatchesSignature(
  tags: Record<string, string> | null | undefined,
  sig: SegmentSignature,
): { hit: boolean; key?: string; value?: string } {
  if (!tags) return { hit: false };
  for (const entry of sig.osm) {
    const v = tags[entry.key];
    if (v == null) continue;
    if (entry.value == null) return { hit: true, key: entry.key, value: v };
    if (norm(v) === norm(entry.value)) return { hit: true, key: entry.key, value: v };
  }
  return { hit: false };
}

export function classifyRejection(
  lead: Lead,
  validation: ValidationResult,
  audit: PerLeadAudit | undefined,
  targetSegment: string | null | undefined,
): RejectionAuditEntry {
  const sig = sigFor(targetSegment);
  const googleTypes = audit?.google_types ?? null;
  const osmTags = audit?.osm_tags ?? null;
  const includedType = audit?.included_type ?? null;

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  if (sig) {
    // Positivos: Google types
    if (googleTypes && googleTypes.length > 0) {
      const gtSet = new Set(googleTypes.map((t) => norm(t)));
      const matches = sig.googleTypes.filter((t) => gtSet.has(norm(t)));
      if (matches.length > 0) positiveSignals.push(`google_type=${matches.join("|")}`);
    }
    // Positivos: OSM tags
    const osmHit = osmMatchesSignature(osmTags, sig);
    if (osmHit.hit) positiveSignals.push(`osm=${osmHit.key}=${osmHit.value}`);

    // Positivos: includedType usado na busca (só conta se o Google trouxe
    // este lead através de um includedType esperado — evidência de intenção).
    if (includedType) {
      const itSet = new Set(sig.includedTypes.map(norm));
      if (itSet.has(norm(includedType))) positiveSignals.push(`included_type=${includedType}`);
    }
  }

  // Negativos: termo denunciante bateu na regra.
  if (validation.rejectionCategory === "reject_term_hit" && validation.matchedTerm) {
    negativeSignals.push(`reject_term="${validation.matchedTerm}"`);
  }

  // Negativos: Google types "concorrentes" fortes (restaurante/mercado/farm) quando
  // o alvo NÃO é aquele tipo.
  if (sig && googleTypes) {
    const targetSet = new Set(sig.googleTypes.map(norm));
    const conflictTypes = ["restaurant", "pharmacy", "clothing_store", "car_repair"];
    for (const t of googleTypes.map(norm)) {
      if (conflictTypes.includes(t) && !targetSet.has(t)) {
        negativeSignals.push(`google_type_conflita=${t}`);
      }
    }
  }

  let classification: RejectionClass;
  if (positiveSignals.length > 0 && negativeSignals.length === 0) {
    classification = "possivel_falso_negativo";
  } else if (positiveSignals.length > 0 && negativeSignals.length > 0) {
    // Empate → duvidoso (evita afirmar falso negativo com evidência conflitante).
    classification = "duvidoso";
  } else if (negativeSignals.length > 0) {
    classification = "rejeicao_correta";
  } else {
    classification = "duvidoso";
  }

  return {
    leadId: lead.id,
    name: lead.name,
    classification,
    positiveSignals,
    negativeSignals,
    meta: {
      source: audit?.source ?? null,
      category: audit?.category ?? lead.category ?? null,
      googleTypes,
      osmTags,
      includedType,
      synonym: audit?.synonym ?? null,
      rule: audit?.rule ?? null,
      matchedTerm: validation.matchedTerm ?? null,
      reason: validation.reason ?? null,
      rejectionCategory: validation.rejectionCategory ?? null,
    },
  };
}

export interface RejectionAuditSummary {
  total: number;
  correct: number;
  falseNegatives: number;
  doubtful: number;
  entries: RejectionAuditEntry[];
}

export function buildRejectionAudit(
  rejectedLeads: Lead[],
  rejectionDetails: Map<string, ValidationResult>,
  perLead: Record<string, PerLeadAudit>,
  targetSegment: string | null | undefined,
): RejectionAuditSummary {
  const entries: RejectionAuditEntry[] = [];
  for (const l of rejectedLeads) {
    const det = rejectionDetails.get(l.id);
    if (!det) continue;
    const extId = (l as unknown as { external_id?: string }).external_id;
    const audit = extId ? perLead[extId] : undefined;
    entries.push(classifyRejection(l, det, audit, targetSegment));
  }
  return {
    total: entries.length,
    correct: entries.filter((e) => e.classification === "rejeicao_correta").length,
    falseNegatives: entries.filter((e) => e.classification === "possivel_falso_negativo").length,
    doubtful: entries.filter((e) => e.classification === "duvidoso").length,
    entries,
  };
}
