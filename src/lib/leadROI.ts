import type { Lead } from "@/data/types";

const PREMIUM_SEGMENTS = [
  "dentista", "odonto", "odontologia",
  "estetica", "estética", "clinica de estetica", "clínica de estética",
  "advogado", "advocacia", "escritorio de advocacia", "escritório de advocacia",
  "harmonizacao", "harmonização", "dermatologia", "dermatologista",
];

const BIG_CITIES = [
  "sao paulo", "são paulo",
  "rio de janeiro", "brasilia", "brasília",
  "salvador", "fortaleza", "belo horizonte", "manaus", "curitiba",
  "recife", "porto alegre", "goiania", "goiânia", "belem", "belém",
  "guarulhos", "campinas", "sao luis", "são luís", "maceio", "maceió",
  "duque de caxias", "natal", "teresina", "campo grande", "nova iguacu", "nova iguaçu",
  "sao bernardo do campo", "são bernardo do campo", "joao pessoa", "joão pessoa",
  "santo andre", "santo andré", "osasco", "jaboatao dos guararapes",
  "ribeirao preto", "ribeirão preto", "uberlandia", "uberlândia",
  "sorocaba", "contagem", "aracaju", "feira de santana", "cuiaba", "cuiabá",
  "joinville", "juiz de fora", "londrina", "aparecida de goiania",
  "ananindeua", "porto velho", "serra", "niteroi", "niterói",
  "caxias do sul", "macapa", "macapá", "vila velha", "florianopolis", "florianópolis",
  "santos", "maua", "mauá", "sao jose dos campos", "são josé dos campos",
];

function norm(s: string | null | undefined) {
  return (s ?? "").toString().trim().toLowerCase();
}

export type RoiTier = "high" | "medium" | "low";

export interface RoiResult {
  score: number;
  tier: RoiTier;
  label: string;
  emoji: string;
  reasons: string[];
}

export function calculateLeadROI(lead: Lead): RoiResult {
  let score = 0;
  const reasons: string[] = [];

  if (lead.has_website === false || !lead.website) {
    score += 40;
    reasons.push("Empresa sem site (+40)");
  }
  if (typeof lead.rating === "number" && lead.rating >= 4.7) {
    score += 15;
    reasons.push("Avaliação Google ≥ 4.7 (+15)");
  }
  if (typeof lead.reviews_count === "number" && lead.reviews_count > 100) {
    score += 20;
    reasons.push("Mais de 100 reviews (+20)");
  }
  const segNorm = norm(lead.segment) + " " + norm(lead.category);
  if (PREMIUM_SEGMENTS.some((p) => segNorm.includes(p))) {
    score += 25;
    reasons.push("Segmento premium (+25)");
  }
  if (lead.instagram) {
    score += 10;
    reasons.push("Instagram detectado (+10)");
  }
  if (lead.whatsapp) {
    score += 10;
    reasons.push("WhatsApp disponível (+10)");
  }
  if (BIG_CITIES.includes(norm(lead.city))) {
    score += 10;
    reasons.push("Cidade grande (+10)");
  }

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let tier: RoiTier = "low";
  if (score >= 70) tier = "high";
  else if (score >= 40) tier = "medium";

  const label = tier === "high" ? "Alto ROI" : tier === "medium" ? "Médio ROI" : "Baixo ROI";
  const emoji = tier === "high" ? "🟢" : tier === "medium" ? "🟡" : "⚪";

  return { score, tier, label, emoji, reasons };
}
