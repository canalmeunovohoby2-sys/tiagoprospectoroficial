// Lead Diagnóstico (5.33) — separa três eixos para NÃO confundir:
//   • qualidade (o negócio parece real/relevante?)
//   • completude (quantos dados existem?)
//   • oportunidade (score comercial em orvixOpportunityScore)
// Completude NUNCA elimina: um lead real sem WhatsApp/Instagram/site continua
// válido — apenas com menos dados.

export interface LeadCompleteness {
  pct: number;                    // 0–100
  present: string[];
  missing: string[];
}

const FIELDS: Array<{ key: string; label: string; take: (l: Record<string, unknown>) => boolean }> = [
  { key: "name", label: "nome", take: (l) => !!l.name },
  { key: "phone", label: "telefone", take: (l) => !!l.phone },
  { key: "whatsapp", label: "WhatsApp", take: (l) => !!l.whatsapp },
  { key: "instagram", label: "Instagram", take: (l) => !!l.instagram },
  { key: "website", label: "website", take: (l) => !!l.website },
  { key: "address", label: "endereço", take: (l) => !!l.address || !!l.google_url },
  { key: "reviews", label: "avaliações", take: (l) => Number(l.reviews_count ?? 0) > 0 },
  { key: "hours", label: "horário", take: (l) => Array.isArray(l.opening_hours) && (l.opening_hours as unknown[]).length > 0 },
];

export function dataCompleteness(lead: Record<string, unknown>): LeadCompleteness {
  const present: string[] = [];
  const missing: string[] = [];
  for (const f of FIELDS) {
    if (f.take(lead)) present.push(f.label);
    else missing.push(f.label);
  }
  return { pct: Math.round((present.length / FIELDS.length) * 100), present, missing };
}

// "Qualidade": evidências de que o negócio é REAL, localizado e relevante —
// independente de quantos dados existem.
export function businessQuality(lead: Record<string, unknown>): { score: number; label: "Alta" | "Média" | "Baixa" | "Não avaliado" } {
  const reviews = Number(lead.reviews_count ?? 0);
  const rating = typeof lead.rating === "number" ? lead.rating : null;
  let s = 0;
  if (reviews >= 10) s += 3;
  else if (reviews > 0) s += 1;
  if (rating != null && rating >= 4) s += 2;
  if (lead.phone || lead.whatsapp) s += 2;
  if (lead.address || lead.google_url) s += 2;
  if (lead.city && lead.state) s += 1;
  if (Array.isArray(lead.opening_hours) && (lead.opening_hours as unknown[]).length) s += 1;
  const score = Math.min(10, s);
  const label = score >= 8 ? "Alta" : score >= 4 ? "Média" : score > 0 ? "Baixa" : "Não avaliado";
  return { score, label };
}
