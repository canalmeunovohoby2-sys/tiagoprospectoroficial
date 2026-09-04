import type { Lead } from "@/data/types";

/**
 * Segment Category Confidence (Orvix)
 * -----------------------------------
 * Camada analítica adicional que roda ANTES do Fit Orvix e classifica
 * o quão compatível o lead é com o segmento pesquisado, usando tags
 * OSM, Google types, nome e categoria.
 *
 * Esta camada NÃO altera coleta, dedupe, filtros Orvix, Fit, CRM, IA
 * nem banco. Apenas recalibra classificação, pesos e auditoria.
 */

export type SegmentMatch =
  | "strong_match"
  | "medium_match"
  | "weak_match"
  | "false_positive_candidate";

/** Rótulo canônico da classificação. */
export type SegmentCategory =
  | "MATCH_FORTE"
  | "MATCH_PROVAVEL"
  | "MATCH_PROVAVEL_COM_CONFLITO"
  | "MATCH_FRACO"
  | "FORA_SEGMENTO";

export interface SegmentConfidence {
  score: number;         // score bruto (pode ser negativo antes do clamp)
  percent: number;       // 0–100 (score normalizado)
  match: SegmentMatch;
  category: SegmentCategory;
  label: string;         // rótulo curto legível
  emoji: string;
  positives: string[];   // sinais positivos aplicados (+peso)
  negatives: string[];   // sinais negativos aplicados (-peso)
  reason: string;        // motivo da classificação (1 linha)
  matchedTerm: string | null;     // termo (nome/categoria) que causou aceitação
  acceptanceTag: string | null;   // tag OSM/Google que causou aceitação
  reductionReasons: string[];     // motivos de redução da confiança
  conflict: boolean;              // true quando há sinal forte + negativo relevante
  conflictReason: string | null;  // descrição do conflito (quando aplicável)
}

export interface SegmentAuditInput {
  osm_tags?: Record<string, string> | null;
  google_types?: string[] | null;
  category?: string | null;
  included_type?: string | null;
  source?: string | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// ---------- Assinaturas por segmento ----------

type SegmentSignatureRule = {
  osm: Array<{ key: string; value?: string; weight: number; label?: string }>;
  googleTypes: Array<{ type: string; weight: number; label?: string }>;
  nameTerms: Array<{ term: string; weight: number }>;
  nameNegatives?: Array<{ pattern: RegExp; weight: number; label: string }>;
  osmNegatives?: Array<{ key: string; value?: RegExp; weight: number; label: string }>;
  /** Marcas nacionais / franquias — penalização fixa -20 quando reconhecidas. */
  nationalBrands?: Array<{ pattern: RegExp; label: string }>;
  /**
   * Regras explícitas de conflito para o segmento. Quando o `positive` casa
   * no nome/categoria E o `negative` também casa, marca o lead como
   * MATCH_PROVAVEL_COM_CONFLITO e injeta um motivo específico na auditoria.
   */
  conflictRules?: Array<{ positive: RegExp; negative: RegExp; label: string }>;
};

// ============================================================
// 1) SUPERMERCADO / MERCADO
// ============================================================
const SUPERMERCADO_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "supermarket", weight: 50, label: "shop=supermarket" },
    { key: "shop", value: "grocery", weight: 40, label: "shop=grocery" },
    { key: "shop", value: "convenience", weight: 20, label: "shop=convenience" },
    { key: "shop", value: "greengrocer", weight: 20, label: "shop=greengrocer" },
    { key: "shop", value: "deli", weight: 5, label: "shop=deli" },
  ],
  googleTypes: [
    { type: "supermarket", weight: 45, label: "Google: supermarket" },
    { type: "grocery_store", weight: 35, label: "Google: grocery_store" },
    { type: "convenience_store", weight: 18, label: "Google: convenience_store" },
  ],
  nameTerms: [
    { term: "supermercado", weight: 45 },
    { term: "supermarket", weight: 45 },
    { term: "mercadinho", weight: 30 },
    { term: "mercado", weight: 35 },
    { term: "hiper", weight: 35 },
    { term: "atacarejo", weight: 35 },
    { term: "atacadao", weight: 35 },
    { term: "mercearia", weight: 25 },
    { term: "minimercado", weight: 30 },
    { term: "hortifruti", weight: 20 },
    { term: "empório", weight: 15 },
    { term: "emporio", weight: 15 },
  ],
  nameNegatives: [
    { pattern: /\bestacionamento\b|parking\s?lot|\bparking\b/, weight: -60, label: "estacionamento" },
    { pattern: /bicicletario|bicicletário|bike\s?parking/, weight: -60, label: "bicicletário" },
    { pattern: /\bvazio\b|\bvago\b|\bvacant\b/, weight: -60, label: "imóvel vazio" },
    { pattern: /abandonad[oa]|desativad[oa]|disused/, weight: -50, label: "abandonado/desativado" },
    { pattern: /\bcondominio\b|\bcondomínio\b|residencial\b/, weight: -50, label: "condomínio" },
    { pattern: /shopping|mall|outlet/, weight: -40, label: "shopping/mall" },
  ],
  osmNegatives: [
    { key: "amenity", value: /^parking$/, weight: -60, label: "amenity=parking" },
    { key: "amenity", value: /^bicycle_parking$/, weight: -60, label: "amenity=bicycle_parking" },
    { key: "shop", value: /^vacant$/, weight: -60, label: "shop=vacant" },
    { key: "disused:shop", weight: -50, label: "disused:shop=*" },
    { key: "abandoned:shop", weight: -50, label: "abandoned:shop=*" },
    { key: "shop", value: /^mall$/, weight: -40, label: "shop=mall" },
  ],
  nationalBrands: [
    { pattern: /\bcarrefour\b|\bassa[ií]\b|\batacad[aã]o\b|\bextra\b|\bpao\s+de\s+a[cç]ucar\b|\bp[aã]o\s+de\s+a[cç]ucar\b|\bwalmart\b|\bsams?\s?club\b|\bmakro\b|\btenda\b|\bkoch\b|\bangeloni\b|\bbig\b|\bbistek\b/, label: "rede nacional (supermercado)" },
  ],
  conflictRules: [
    { positive: /supermercado|mercado|hiper/, negative: /shopping|mall|outlet|estacionamento|\bparking\b/, label: "supermercado + shopping/estacionamento" },
  ],
};

// ============================================================
// 2) PET SHOP
// ============================================================
const PETSHOP_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "pet", weight: 50, label: "shop=pet" },
    { key: "shop", value: "pet_food", weight: 45, label: "shop=pet_food" },
    { key: "shop", value: "pet_grooming", weight: 40, label: "shop=pet_grooming" },
    { key: "shop", value: "animal_feed", weight: 35, label: "shop=animal_feed" },
    { key: "healthcare", value: "veterinary", weight: 20, label: "healthcare=veterinary" },
    { key: "amenity", value: "veterinary", weight: 20, label: "amenity=veterinary" },
  ],
  googleTypes: [
    { type: "pet_store", weight: 45, label: "Google: pet_store" },
    { type: "veterinary_care", weight: 20, label: "Google: veterinary_care" },
  ],
  nameTerms: [
    { term: "pet shop", weight: 40 },
    { term: "petshop", weight: 40 },
    { term: "pet ", weight: 40 },
    { term: "racao", weight: 35 },
    { term: "ração", weight: 35 },
    { term: "banho", weight: 35 },
    { term: "tosa", weight: 35 },
    { term: "animal", weight: 25 },
    { term: "agropecuaria", weight: 25 },
  ],
  nameNegatives: [
    { pattern: /hospital(?!\s*vet)|pronto[-\s]?socorro/, weight: -50, label: "hospital humano" },
    { pattern: /clinica\s+medica|clínica\s+médica|clinica\s+humana/, weight: -50, label: "clínica médica" },
    { pattern: /farmacia|farmácia|drogaria/, weight: -40, label: "farmácia" },
    { pattern: /laboratorio|laboratório/, weight: -40, label: "laboratório" },
    { pattern: /shopping|mall|outlet/, weight: -40, label: "shopping/mall" },
  ],
  osmNegatives: [
    { key: "amenity", value: /^hospital$/, weight: -50, label: "amenity=hospital" },
    { key: "amenity", value: /^clinic$/, weight: -50, label: "amenity=clinic" },
    { key: "healthcare", value: /^(hospital|clinic|laboratory)$/, weight: -40, label: "healthcare=hospital/clinic/lab" },
    { key: "shop", value: /^pharmacy$/, weight: -40, label: "shop=pharmacy" },
  ],
  nationalBrands: [
    { pattern: /\bpetz\b|\bcobasi\b|\bpetlove\b|\bpetcamp\b/, label: "rede nacional (pet)" },
  ],
  conflictRules: [
    { positive: /\bpet\b|racao|ração|veterin/, negative: /hospital(?!\s*vet)|clinica\s+medica|clínica\s+médica|laboratorio|laboratório|farmacia|farmácia|drogaria/, label: "pet + hospital/laboratório/farmácia" },
  ],
};

// ============================================================
// 3) FARMÁCIA
// ============================================================
const FARMACIA_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "pharmacy", weight: 55, label: "shop=pharmacy" },
    { key: "amenity", value: "pharmacy", weight: 50, label: "amenity=pharmacy" },
    { key: "healthcare", value: "pharmacy", weight: 50, label: "healthcare=pharmacy" },
    { key: "shop", value: "chemist", weight: 30, label: "shop=chemist" },
  ],
  googleTypes: [
    { type: "pharmacy", weight: 45, label: "Google: pharmacy" },
    { type: "drugstore", weight: 35, label: "Google: drugstore" },
  ],
  nameTerms: [
    { term: "farmacia", weight: 45 },
    { term: "farmácia", weight: 45 },
    { term: "drogaria", weight: 45 },
    { term: "drugstore", weight: 35 },
    { term: "drogas", weight: 25 },
    { term: "farma ", weight: 20 },
  ],
  nameNegatives: [
    { pattern: /laboratorio|laboratório/, weight: -40, label: "laboratório" },
    { pattern: /hospital(?!\s*vet)|pronto[-\s]?socorro/, weight: -50, label: "hospital" },
    { pattern: /consultorio|consultório/, weight: -40, label: "consultório" },
    { pattern: /clinica\s+medica|clínica\s+médica/, weight: -40, label: "clínica médica" },
  ],
  osmNegatives: [
    { key: "amenity", value: /^hospital$/, weight: -50, label: "amenity=hospital" },
    { key: "amenity", value: /^clinic$/, weight: -40, label: "amenity=clinic" },
    { key: "healthcare", value: /^laboratory$/, weight: -40, label: "healthcare=laboratory" },
  ],
  nationalBrands: [
    { pattern: /\bdrogasil\b|\bdroga\s?raia\b|\bpachec[oa]\b|\bp[aá]guemenos\b|\bpanvel\b|\bnissei\b|\bultrafarma\b|\bvenancio\b|\bvenâncio\b/, label: "rede nacional (drogaria)" },
  ],
  conflictRules: [
    { positive: /farmacia|farmácia|drogaria|drugstore/, negative: /hospitalar|hospital(?!\s*vet)|laboratorio|laboratório|consultorio|consultório|clinica\s+medica|clínica\s+médica/, label: "farmácia + hospitalar/laboratório/clínica" },
  ],
};

// ============================================================
// 4) MATERIAL DE CONSTRUÇÃO
// ============================================================
const CONSTRUCAO_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "hardware", weight: 50, label: "shop=hardware" },
    { key: "shop", value: "building_material", weight: 50, label: "shop=building_material" },
    { key: "shop", value: "doityourself", weight: 40, label: "shop=doityourself" },
    { key: "shop", value: "paint", weight: 35, label: "shop=paint" },
    { key: "shop", value: "plumbing", weight: 35, label: "shop=plumbing" },
    { key: "shop", value: "electrical", weight: 35, label: "shop=electrical" },
    { key: "shop", value: "trade", weight: 25, label: "shop=trade" },
  ],
  googleTypes: [
    { type: "hardware_store", weight: 40, label: "Google: hardware_store" },
    { type: "home_improvement_store", weight: 35, label: "Google: home_improvement_store" },
  ],
  nameTerms: [
    { term: "material de construcao", weight: 40 },
    { term: "materiais de construcao", weight: 40 },
    { term: "material de construção", weight: 40 },
    { term: "material", weight: 40 },
    { term: "construção", weight: 40 },
    { term: "construcao", weight: 40 },
    { term: "ferragem", weight: 30 },
    { term: "ferragens", weight: 30 },
    { term: "depósito", weight: 30 },
    { term: "deposito", weight: 30 },
  ],
  nameNegatives: [
    { pattern: /construtora/, weight: -50, label: "construtora" },
    { pattern: /incorporadora/, weight: -50, label: "incorporadora" },
    { pattern: /engenharia|engenheiro/, weight: -40, label: "engenharia (sem loja)" },
    { pattern: /obra\s+civil|construcao\s+civil|construção\s+civil/, weight: -40, label: "construção civil sem loja" },
    { pattern: /\bcondominio\b|\bcondomínio\b|residencial\b/, weight: -50, label: "condomínio" },
  ],
  osmNegatives: [
    { key: "office", value: /^(construction|company|engineer)$/, weight: -40, label: "office=engenharia/construtora" },
  ],
  nationalBrands: [
    { pattern: /\bleroy\s?merlin\b|\bc&c\b|\bcasa\s?show\b|\btelhanorte\b|\bobramax\b|\bbalaroti\b|\bquero-?quero\b/, label: "rede nacional (construção)" },
  ],
  conflictRules: [
    { positive: /material|construcao|construção|ferragem/, negative: /construtora|incorporadora|engenharia|imobiliaria|imobiliária/, label: "material + construtora/engenharia/imobiliária" },
  ],
};

// ============================================================
// 5) ADEGA
// ============================================================
const ADEGA_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "alcohol", weight: 50, label: "shop=alcohol" },
    { key: "shop", value: "wine", weight: 50, label: "shop=wine" },
    { key: "shop", value: "beverages", weight: 45, label: "shop=beverages" },
  ],
  googleTypes: [
    { type: "liquor_store", weight: 40, label: "Google: liquor_store" },
  ],
  nameTerms: [
    { term: "adega", weight: 45 },
    { term: "distribuidora de bebidas", weight: 40 },
    { term: "bebidas", weight: 40 },
    { term: "vinhos", weight: 40 },
    { term: "wine", weight: 30 },
    { term: "distribuidora", weight: 25 },
  ],
  nameNegatives: [
    { pattern: /restaurante|churrascaria|pizzaria|lanchonete/, weight: -25, label: "restaurante" },
    { pattern: /\bbar\b/, weight: -25, label: "bar" },
    { pattern: /\bpub\b/, weight: -30, label: "pub" },
    { pattern: /karaoke|karaokê/, weight: -35, label: "karaokê" },
    { pattern: /shopping|mall|outlet/, weight: -40, label: "shopping/mall" },
  ],
  osmNegatives: [
    { key: "amenity", value: /^restaurant$/, weight: -25, label: "amenity=restaurant" },
    { key: "amenity", value: /^bar$/, weight: -25, label: "amenity=bar" },
    { key: "amenity", value: /^pub$/, weight: -30, label: "amenity=pub" },
    { key: "amenity", value: /^nightclub$/, weight: -35, label: "amenity=nightclub" },
  ],
  nationalBrands: [
    { pattern: /\bempor[iy]o\s+da\s+cerveja\b|\bevino\b|\bmistral\b|\bwine\.com\.br\b/, label: "rede nacional (bebidas)" },
  ],
  conflictRules: [
    { positive: /adega|vinho|bebidas/, negative: /\bbar\b|\bpub\b|restaurante|churrascaria|pizzaria|karaoke|karaokê/, label: "adega + bar/pub/restaurante" },
  ],
};

// ============================================================
// 6) AUTOPEÇAS
// ============================================================
const AUTOPECAS_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "car_parts", weight: 55, label: "shop=car_parts" },
    { key: "shop", value: "motorcycle_parts", weight: 45, label: "shop=motorcycle_parts" },
    { key: "shop", value: "tyres", weight: 30, label: "shop=tyres" },
  ],
  googleTypes: [
    { type: "auto_parts_store", weight: 40, label: "Google: auto_parts_store" },
  ],
  nameTerms: [
    { term: "autopecas", weight: 45 },
    { term: "autopeças", weight: 45 },
    { term: "auto peças", weight: 45 },
    { term: "auto pecas", weight: 45 },
    { term: "peças", weight: 35 },
    { term: "pecas", weight: 35 },
    { term: "acessorios automotivos", weight: 35 },
    { term: "acessórios automotivos", weight: 35 },
  ],
  nameNegatives: [
    { pattern: /concessionaria|concessionária/, weight: -25, label: "concessionária" },
    { pattern: /\boficina\b(?!.*(pecas|peças))/, weight: -30, label: "oficina pura" },
    { pattern: /lava\s?rapido|lava\s?rápido|lava\s?jato/, weight: -30, label: "lava rápido" },
  ],
  osmNegatives: [
    { key: "shop", value: /^car$/, weight: -25, label: "shop=car (concessionária)" },
    { key: "amenity", value: /^car_wash$/, weight: -30, label: "amenity=car_wash" },
  ],
  nationalBrands: [
    { pattern: /\bcanopus\b|\bautozone\b|\bpellegrino\b|\bdpaschoal\b|\bd\.?\s?paschoal\b/, label: "rede nacional (autopeças)" },
  ],
  conflictRules: [
    { positive: /autopecas|autopeças|pecas|peças/, negative: /concessionaria|concessionária|aluguel|lava\s?rapido|lava\s?jato/, label: "autopeças + concessionária/lava rápido/aluguel" },
  ],
};

// ============================================================
// 7) RESTAURANTE / LANCHONETE
// ============================================================
const RESTAURANTE_RULE: SegmentSignatureRule = {
  osm: [
    { key: "amenity", value: "restaurant", weight: 50, label: "amenity=restaurant" },
    { key: "amenity", value: "fast_food", weight: 45, label: "amenity=fast_food" },
  ],
  googleTypes: [
    { type: "restaurant", weight: 45, label: "Google: restaurant" },
    { type: "hamburger_restaurant", weight: 45, label: "Google: hamburger_restaurant" },
    { type: "meal_takeaway", weight: 25, label: "Google: meal_takeaway" },
  ],
  nameTerms: [
    { term: "restaurante", weight: 40 },
    { term: "lanchonete", weight: 40 },
    { term: "hamburguer", weight: 35 },
    { term: "hambúrguer", weight: 35 },
    { term: "churrascaria", weight: 35 },
    { term: "trattoria", weight: 25 },
    { term: "cantina", weight: 20 },
    { term: "cozinha", weight: 15 },
  ],
  nameNegatives: [
    { pattern: /\bdelivery\b\s+(app|online|virtual|dark\s?kitchen)|dark\s?kitchen/, weight: -30, label: "delivery puro / dark kitchen" },
    { pattern: /\bbar\b(?!.*(comida|restaurante|cozinha|prato))/, weight: -25, label: "bar sem comida" },
  ],
  osmNegatives: [],
  conflictRules: [
    { positive: /restaurante|lanchonete|hamburguer|hambúrguer/, negative: /supermercado|hipermercado|atacarejo|shopping|mall/, label: "restaurante + supermercado/shopping" },
  ],
};

// ============================================================
// 8) PADARIA
// ============================================================
const PADARIA_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "bakery", weight: 55, label: "shop=bakery" },
    { key: "craft", value: "bakery", weight: 50, label: "craft=bakery" },
  ],
  googleTypes: [
    { type: "bakery", weight: 45, label: "Google: bakery" },
  ],
  nameTerms: [
    { term: "padaria", weight: 45 },
    { term: "panificadora", weight: 40 },
    { term: "confeitaria", weight: 30 },
  ],
  nameNegatives: [
    { pattern: /supermercado|hipermercado|atacarejo/, weight: -20, label: "supermercado grande" },
    { pattern: /fabrica|fábrica|industrial|industria|indústria/, weight: -40, label: "fábrica industrial" },
  ],
  osmNegatives: [
    { key: "industrial", weight: -40, label: "industrial=*" },
  ],
};

// ============================================================
// 9) PAPELARIA
// ============================================================
const PAPELARIA_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "stationery", weight: 50, label: "shop=stationery" },
    { key: "shop", value: "books", weight: 40, label: "shop=books" },
  ],
  googleTypes: [
    { type: "book_store", weight: 40, label: "Google: book_store" },
    { type: "stationery_store", weight: 45, label: "Google: stationery_store" },
  ],
  nameTerms: [
    { term: "papelaria", weight: 45 },
    { term: "material escolar", weight: 35 },
  ],
  nameNegatives: [
    { pattern: /\blivraria\b(?!.*papelaria)/, weight: -20, label: "livraria pura" },
    { pattern: /editora/, weight: -40, label: "editora" },
  ],
  osmNegatives: [],
};

// ============================================================
// 10) ROUPAS / BOUTIQUE
// ============================================================
const ROUPAS_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "clothes", weight: 50, label: "shop=clothes" },
    { key: "shop", value: "boutique", weight: 50, label: "shop=boutique" },
    { key: "shop", value: "fashion", weight: 35, label: "shop=fashion" },
  ],
  googleTypes: [
    { type: "clothing_store", weight: 45, label: "Google: clothing_store" },
  ],
  nameTerms: [
    { term: "boutique", weight: 45 },
    { term: "roupas", weight: 40 },
    { term: "moda", weight: 35 },
    { term: "modas", weight: 35 },
    { term: "confeccoes", weight: 25 },
  ],
  nameNegatives: [
    { pattern: /shopping|mall|outlet/, weight: -25, label: "shopping/mall" },
    { pattern: /brecho|brechó/, weight: -20, label: "brechó" },
  ],
  osmNegatives: [
    { key: "shop", value: /^mall$/, weight: -25, label: "shop=mall" },
  ],
  nationalBrands: [
    { pattern: /\brenner\b|\briachuelo\b|\bmarisa\b|\bc\s?&\s?a\b|\bzara\b|\bhering\b|\bhavan\b/, label: "rede nacional (moda)" },
  ],
  conflictRules: [
    { positive: /roupas|moda|boutique/, negative: /shopping|mall|outlet/, label: "roupas + shopping/mall" },
  ],
};

// ============================================================
// 11) SALÃO / ESTÉTICA
// ============================================================
const SALAO_RULE: SegmentSignatureRule = {
  osm: [
    { key: "shop", value: "hairdresser", weight: 50, label: "shop=hairdresser" },
    { key: "shop", value: "beauty", weight: 50, label: "shop=beauty" },
    { key: "shop", value: "cosmetics", weight: 35, label: "shop=cosmetics" },
    { key: "shop", value: "massage", weight: 30, label: "shop=massage" },
    { key: "leisure", value: "spa", weight: 30, label: "leisure=spa" },
  ],
  googleTypes: [
    { type: "hair_care", weight: 45, label: "Google: hair_care" },
    { type: "beauty_salon", weight: 45, label: "Google: beauty_salon" },
    { type: "spa", weight: 30, label: "Google: spa" },
    { type: "nail_salon", weight: 40, label: "Google: nail_salon" },
  ],
  nameTerms: [
    { term: "salao", weight: 40 },
    { term: "salão", weight: 40 },
    { term: "estetica", weight: 40 },
    { term: "estética", weight: 40 },
    { term: "beleza", weight: 35 },
    { term: "cabeleireiro", weight: 40 },
    { term: "barbearia", weight: 40 },
    { term: "manicure", weight: 30 },
    { term: "spa ", weight: 25 },
  ],
  nameNegatives: [
    { pattern: /hospital|pronto[-\s]?socorro/, weight: -50, label: "hospital" },
    { pattern: /clinica\s+medica|clínica\s+médica/, weight: -40, label: "clínica médica" },
    { pattern: /academia|crossfit|musculacao|musculação/, weight: -25, label: "academia (foco fitness)" },
  ],
  osmNegatives: [
    { key: "amenity", value: /^hospital$/, weight: -50, label: "amenity=hospital" },
  ],
  nationalBrands: [
    { pattern: /\bjacques\s?janine\b|\bl'?oreal\b|\bboticario\b|\bboticário\b/, label: "rede nacional (beleza)" },
  ],
  conflictRules: [
    { positive: /salao|salão|estetica|estética|beleza|cabeleireiro/, negative: /hospital|clinica\s+medica|clínica\s+médica/, label: "estética + hospital/clínica médica" },
  ],
};

// ============================================================
// 12) SERVIÇOS (genérico — assinatura conservadora)
// ============================================================
const SERVICOS_RULE: SegmentSignatureRule = {
  osm: [
    { key: "office", value: "company", weight: 15, label: "office=company" },
    { key: "shop", value: "laundry", weight: 40, label: "shop=laundry" },
    { key: "shop", value: "dry_cleaning", weight: 40, label: "shop=dry_cleaning" },
  ],
  googleTypes: [
    { type: "laundry", weight: 40, label: "Google: laundry" },
    { type: "locksmith", weight: 35, label: "Google: locksmith" },
    { type: "electrician", weight: 30, label: "Google: electrician" },
    { type: "plumber", weight: 30, label: "Google: plumber" },
  ],
  nameTerms: [
    { term: "servicos", weight: 25 },
    { term: "serviços", weight: 25 },
    { term: "assistencia", weight: 35 },
    { term: "assistência", weight: 35 },
    { term: "conserto", weight: 35 },
    { term: "manutencao", weight: 30 },
    { term: "manutenção", weight: 30 },
    { term: "lavanderia", weight: 40 },
    { term: "chaveiro", weight: 40 },
  ],
  nameNegatives: [
    { pattern: /consultoria|advocacia|contabilidade/, weight: -25, label: "serviços profissionais (não PDV)" },
    { pattern: /construtora|incorporadora/, weight: -40, label: "construtora/incorporadora" },
  ],
  osmNegatives: [
    { key: "office", value: /^(lawyer|accountant|consulting|government|it)$/, weight: -30, label: "office=escritório profissional" },
  ],
  conflictRules: [
    { positive: /assistencia|assistência|conserto|manutencao|manutenção/, negative: /industrial|logistica|logística|construtora|incorporadora/, label: "serviços + indústria/logística/construtora" },
  ],
};

const RULES: Record<string, SegmentSignatureRule> = {
  supermercado: SUPERMERCADO_RULE,
  mercado: SUPERMERCADO_RULE,
  "pet shop": PETSHOP_RULE,
  petshop: PETSHOP_RULE,
  farmacia: FARMACIA_RULE,
  farmácia: FARMACIA_RULE,
  restaurante: RESTAURANTE_RULE,
  lanchonete: RESTAURANTE_RULE,
  padaria: PADARIA_RULE,
  adega: ADEGA_RULE,
  "material de construcao": CONSTRUCAO_RULE,
  "material de construção": CONSTRUCAO_RULE,
  autopecas: AUTOPECAS_RULE,
  autopeças: AUTOPECAS_RULE,
  papelaria: PAPELARIA_RULE,
  "loja de roupas": ROUPAS_RULE,
  "loja de roupa": ROUPAS_RULE,
  roupas: ROUPAS_RULE,
  "salao": SALAO_RULE,
  "salão": SALAO_RULE,
  "estetica": SALAO_RULE,
  "estética": SALAO_RULE,
  "salao/estetica": SALAO_RULE,
  "salão/estética": SALAO_RULE,
  "servicos": SERVICOS_RULE,
  "serviços": SERVICOS_RULE,
};

// ---------- Sinais negativos globais (compartilhados) ----------

type NegativeRule = { pattern: RegExp; weight: number; label: string };

const NAME_NEGATIVES: NegativeRule[] = [
  { pattern: /\bcondominio\b|\bcondomínio\b|residencial\b|edificio\b|edifício\b|empreendimento|\bpredio\b|\bprédio\b/, weight: -40, label: "condomínio/prédio/empreendimento" },
  { pattern: /\bbicicleta\b|bicicletario|bicicletário|bike\s?rack|bike\s?parking/, weight: -60, label: "bicicletário" },
  { pattern: /\bestacionamento\b|parking\s?lot|\bparking\b/, weight: -60, label: "estacionamento" },
  { pattern: /\bvago\b|\bvaga\b|\bvacant\b|\bvazio\b|imovel\s+vazio|im[oó]vel\s+vazio|abandoned|abandonad[oa]/, weight: -60, label: "imóvel vago/vacant/abandonado" },
  { pattern: /limpeza|higieniza|conservadora/, weight: -40, label: "empresa de limpeza" },
  { pattern: /industria|indústria|fabrica|fábrica|industrial/, weight: -50, label: "indústria/industrial" },
  { pattern: /logistica|logística|transportadora|distribuicao\s+geral|distribuição\s+geral/, weight: -50, label: "logística" },
  { pattern: /tecnologia|software|sistemas|datacenter|data\s?center|command\s?center/, weight: -50, label: "tecnologia/datacenter" },
];

const OSM_NEGATIVES: Array<{ key: string; value?: RegExp; weight: number; label: string }> = [
  { key: "building", value: /^(residential|apartments|house|dormitory)$/, weight: -50, label: "building=residencial" },
  { key: "landuse", value: /^(residential|industrial)$/, weight: -50, label: "landuse=residencial/industrial" },
  { key: "amenity", value: /^parking$/, weight: -60, label: "amenity=parking (estacionamento)" },
  { key: "amenity", value: /^bicycle_parking$/, weight: -60, label: "amenity=bicycle_parking (bicicletário)" },
  { key: "amenity", value: /^motorcycle_parking$/, weight: -60, label: "amenity=motorcycle_parking" },
  { key: "shop", value: /^vacant$/, weight: -60, label: "shop=vacant (loja vazia)" },
  { key: "disused:shop", weight: -50, label: "disused:shop=* (loja desativada)" },
  { key: "abandoned:shop", weight: -50, label: "abandoned:shop=* (loja abandonada)" },
  { key: "shop", value: /^department_store$/, weight: -20, label: "shop=department_store" },
  { key: "office", weight: -25, label: "office=*" },
];

// ---------- Núcleo ----------

function ruleFor(segment: string | null | undefined): SegmentSignatureRule | null {
  const k = norm(segment);
  if (!k) return null;
  return RULES[k] ?? null;
}

function matchOsm(
  tags: Record<string, string> | null | undefined,
  rule: SegmentSignatureRule,
): Array<{ label: string; weight: number }> {
  if (!tags) return [];
  const hits: Array<{ label: string; weight: number }> = [];
  for (const r of rule.osm) {
    const v = tags[r.key];
    if (v == null) continue;
    if (r.value == null || norm(v) === norm(r.value)) {
      hits.push({ label: r.label ?? `${r.key}=${r.value ?? "*"}`, weight: r.weight });
    }
  }
  return hits;
}

function matchGoogle(
  types: string[] | null | undefined,
  rule: SegmentSignatureRule,
): Array<{ label: string; weight: number }> {
  if (!types || types.length === 0) return [];
  const set = new Set(types.map(norm));
  const hits: Array<{ label: string; weight: number }> = [];
  for (const r of rule.googleTypes) {
    if (set.has(norm(r.type))) {
      hits.push({ label: r.label ?? `Google: ${r.type}`, weight: r.weight });
    }
  }
  return hits;
}

function matchName(
  haystack: string,
  rule: SegmentSignatureRule,
): Array<{ label: string; weight: number }> {
  const hits: Array<{ label: string; weight: number }> = [];
  for (const r of rule.nameTerms) {
    if (haystack.includes(norm(r.term))) {
      hits.push({ label: `nome/categoria: "${r.term.trim()}"`, weight: r.weight });
    }
  }
  return hits;
}

function matchNegatives(
  haystack: string,
  tags: Record<string, string> | null | undefined,
  rule?: SegmentSignatureRule | null,
): Array<{ label: string; weight: number }> {
  const hits: Array<{ label: string; weight: number }> = [];
  const seen = new Set<string>();
  const push = (label: string, weight: number) => {
    const k = `${label}|${weight}`;
    if (seen.has(k)) return;
    seen.add(k);
    hits.push({ label, weight });
  };

  for (const n of NAME_NEGATIVES) {
    if (n.pattern.test(haystack)) push(n.label, n.weight);
  }
  if (tags) {
    for (const n of OSM_NEGATIVES) {
      const v = tags[n.key];
      if (v == null) continue;
      if (n.value == null || n.value.test(norm(v))) push(n.label, n.weight);
    }
  }
  if (rule?.nameNegatives) {
    for (const n of rule.nameNegatives) {
      if (n.pattern.test(haystack)) push(n.label, n.weight);
    }
  }
  if (rule?.osmNegatives && tags) {
    for (const n of rule.osmNegatives) {
      const v = tags[n.key];
      if (v == null) continue;
      if (n.value == null || n.value.test(norm(v))) push(n.label, n.weight);
    }
  }
  return hits;
}

/**
 * Fallback: sem assinatura configurada — usa somente negativos globais.
 */
function fallbackConfidence(lead: Lead, audit: SegmentAuditInput | null | undefined): SegmentConfidence {
  const haystack = `${norm(lead.name)} ${norm(lead.category)} ${norm(audit?.category)}`;
  const negatives = matchNegatives(haystack, audit?.osm_tags ?? null, null);
  const rawNeg = negatives.reduce((s, h) => s + h.weight, 0);
  const score = 50 + rawNeg;
  const percent = Math.max(0, Math.min(100, Math.round(score)));
  return classify(
    score,
    percent,
    [],
    negatives,
    "Sem assinatura de segmento configurada — avaliação apenas por sinais negativos genéricos.",
  );
}

/** Threshold para considerar um positivo como "sinal forte". */
const STRONG_POSITIVE_THRESHOLD = 40;
/** Threshold para considerar um negativo como "categoria relevante" (conflito). */
const RELEVANT_NEGATIVE_THRESHOLD = -30;

function classify(
  score: number,
  percent: number,
  positives: Array<{ label: string; weight: number }>,
  negatives: Array<{ label: string; weight: number }>,
  overrideReason?: string,
  forcedConflictLabel?: string | null,
): SegmentConfidence {
  const hasStrongPositive = positives.some((p) => p.weight >= STRONG_POSITIVE_THRESHOLD);
  const relevantNegatives = negatives.filter((n) => n.weight <= RELEVANT_NEGATIVE_THRESHOLD);
  const hasRelevantNegative = relevantNegatives.length > 0;
  const isForcedConflict = !!forcedConflictLabel && hasStrongPositive;

  let match: SegmentMatch;
  let category: SegmentCategory;
  let label: string;
  let emoji: string;

  if (score >= 70 && hasStrongPositive && !hasRelevantNegative && !isForcedConflict) {
    match = "strong_match";
    category = "MATCH_FORTE";
    label = "MATCH_FORTE";
    emoji = "🟢";
  } else if (hasStrongPositive && (hasRelevantNegative || isForcedConflict) && score >= 20) {
    // Conflito: sinal forte + categoria negativa relevante → NUNCA vira FORTE.
    match = "medium_match";
    category = "MATCH_PROVAVEL_COM_CONFLITO";
    label = "MATCH_PROVAVEL (conflito)";
    emoji = "🟠";
  } else if (score >= 40 && positives.some((p) => p.weight > 0)) {
    match = "medium_match";
    category = "MATCH_PROVAVEL";
    label = "MATCH_PROVAVEL";
    emoji = "🟡";
  } else if (score >= 20) {
    match = "weak_match";
    category = "MATCH_FRACO";
    label = "MATCH_FRACO";
    emoji = "🟠";
  } else {
    match = "false_positive_candidate";
    category = "FORA_SEGMENTO";
    label = "FORA_SEGMENTO";
    emoji = "🔴";
  }

  const meaningfulPositives = positives.filter((p) => p.weight > 0);
  const sortedPos = [...meaningfulPositives].sort((a, b) => b.weight - a.weight);
  const bestPositive = sortedPos[0] ?? null;

  const bestName = sortedPos.find((p) => p.label.startsWith("nome/categoria:")) ?? null;
  const matchedTerm = bestName
    ? bestName.label.replace(/^nome\/categoria:\s*/, "").replace(/^"|"$/g, "")
    : null;

  const bestTag = sortedPos.find((p) => !p.label.startsWith("nome/categoria:")) ?? null;
  const acceptanceTag = bestTag?.label ?? null;

  const reductionReasons = negatives
    .slice()
    .sort((a, b) => a.weight - b.weight)
    .map((n) => `${n.label} (${n.weight})`);

  const posSummary = bestPositive ? bestPositive.label : null;
  const negSummary = negatives.length
    ? negatives.slice(0, 2).map((h) => h.label).join(" + ")
    : null;

  const conflict = category === "MATCH_PROVAVEL_COM_CONFLITO";
  const conflictReason = conflict
    ? forcedConflictLabel
      ? `Conflito de segmento: ${forcedConflictLabel}. Sinal forte (${bestPositive?.label ?? "positivo"}) coexiste com categoria oposta.`
      : `Sinal forte (${bestPositive?.label ?? "positivo"}) coexiste com categoria negativa relevante (${relevantNegatives
          .slice(0, 2)
          .map((n) => `${n.label} ${n.weight}`)
          .join(" + ")}).`
    : null;

  let reason: string;
  if (overrideReason) {
    reason = overrideReason;
  } else if (conflict) {
    reason = conflictReason ?? "Sinal forte com categoria negativa relevante.";
  } else if (match === "strong_match" && posSummary) {
    reason = `Sinais fortes de segmento (${posSummary}).`;
  } else if (match === "medium_match") {
    reason = posSummary
      ? `Sinais parciais de segmento (${posSummary})${negSummary ? ` — reduzido por ${negSummary}` : ""}.`
      : "Sinais parciais de segmento.";
  } else if (match === "weak_match") {
    reason = posSummary
      ? `Sinais fracos (${posSummary})${negSummary ? ` e alertas (${negSummary})` : ""}.`
      : `Poucos sinais de segmento${negSummary ? ` — alertas: ${negSummary}` : ""}.`;
  } else {
    reason = negSummary
      ? `Nenhum sinal positivo relevante + alertas (${negSummary}).`
      : "Nenhum sinal de segmento identificado.";
  }

  return {
    score,
    percent,
    match,
    category,
    label,
    emoji,
    positives: meaningfulPositives.map((h) => `${h.label} (+${h.weight})`),
    negatives: negatives.map((h) => `${h.label} (${h.weight})`),
    reason,
    matchedTerm,
    acceptanceTag,
    reductionReasons,
    conflict,
    conflictReason,
  };
}

export function computeSegmentConfidence(
  lead: Lead,
  segment: string | null | undefined,
  audit: SegmentAuditInput | null | undefined,
): SegmentConfidence {
  const rule = ruleFor(segment);
  const tags = audit?.osm_tags ?? null;
  const gTypes = audit?.google_types ?? null;
  const haystack = `${norm(lead.name)} ${norm(lead.category)} ${norm(audit?.category)}`;

  if (!rule) return fallbackConfidence(lead, audit);

  const osmHits = matchOsm(tags, rule);
  const gHits = matchGoogle(gTypes, rule);
  const nameHits = matchName(haystack, rule);
  const negatives = matchNegatives(haystack, tags, rule);

  const positives = [...osmHits, ...gHits, ...nameHits];

  // ---------- Marcas nacionais / franquias (-20, sem duplicar) ----------
  if (rule.nationalBrands) {
    const alreadyMarkedBrand = negatives.some((n) => /rede nacional/i.test(n.label));
    for (const b of rule.nationalBrands) {
      if (b.pattern.test(haystack) && !alreadyMarkedBrand) {
        negatives.push({ label: `${b.label} (franquia/rede)`, weight: -20 });
        break;
      }
    }
  }

  // ---------- Conflitos explícitos do segmento ----------
  let forcedConflictLabel: string | null = null;
  if (rule.conflictRules) {
    for (const c of rule.conflictRules) {
      if (c.positive.test(haystack) && c.negative.test(haystack)) {
        forcedConflictLabel = c.label;
        // registra na auditoria como negativo marcador (peso -1 apenas para exibição)
        negatives.push({ label: `conflito: ${c.label}`, weight: -1 });
        break;
      }
    }
  }

  // Proteção: nenhum segmento ganha score alto por palavra genérica isolada.
  if (positives.length === 0 && !/\b(loja|comercio|comércio|store|market|mercearia)\b/.test(haystack)) {
    negatives.push({ label: "nome sem relação comercial", weight: -30 });
  }

  const rawPos = positives.reduce((s, h) => s + h.weight, 0);
  const rawNeg = negatives.reduce((s, h) => s + h.weight, 0);
  const score = rawPos + rawNeg;
  const percent = Math.max(0, Math.min(100, Math.round(score)));

  return classify(score, percent, positives, negatives, undefined, forcedConflictLabel);
}

export function segmentConfidenceBadgeClass(match: SegmentMatch): string {
  switch (match) {
    case "strong_match":
      return "border-emerald-500/40 text-emerald-500 bg-emerald-500/5";
    case "medium_match":
      return "border-sky-500/40 text-sky-500 bg-sky-500/5";
    case "weak_match":
      return "border-amber-500/40 text-amber-500 bg-amber-500/5";
    case "false_positive_candidate":
      return "border-rose-500/50 text-rose-500 bg-rose-500/10";
  }
}
