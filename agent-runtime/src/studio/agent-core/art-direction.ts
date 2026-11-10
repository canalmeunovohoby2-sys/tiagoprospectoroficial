// ============================================================================
// FASE 1 — DIREÇÃO DE ARTE INDIVIDUAL POR PROJETO (ArtDirectionSpec)
//
// A direção de arte é um PROCESSO com dados estruturados, não um texto a mais no
// prompt. Ela é produzida ANTES da geração e entregue ao agente como
// ESPECIFICAÇÃO EXECUTÁVEL (fontes, paleta, hero, grid, seções) — e a crítica
// visual (design-critique.ts) confere depois se o site CONSTRUÍDO a respeitou.
//
// Garantias:
// - 1 chamada de modelo no máximo (a geração não faz chamadas redundantes).
// - Timeout + validação de schema: entrada inválida NUNCA quebra a geração.
// - Fallback determinístico (cataloga existente) quando a IA falha/expira.
// - Cache por identidade do negócio (mesmo projeto reusa a mesma direção).
// - A direção NÃO é sobrescrita durante a montagem da missão.
// ============================================================================

import type { BusinessContext } from "../../tools.js";
import { buildDesignDirection } from "./design-direction.js";

// ---------- tipos ----------

export type PaletteRole = "fundo" | "superficie" | "texto" | "acento" | "destaque" | "apoio";

export interface ArtPaletteToken {
  role: PaletteRole;
  hex: string;
  use: string;
}

export interface ArtSectionPlanItem {
  id: string;
  purpose: string;
  layout: string;
}

export interface ArtReference {
  url: string;
  source: string;
  /** Princípio visual aproveitado (nunca cópia de layout/marca). */
  principle: string;
}

export interface ArtDirectionSpec {
  version: 1;
  seed: string;
  concept: string;
  personality: string;
  audience: string;
  positioning: string;
  visualLanguage: string;
  typography: {
    heading: string;
    body: string;
    pair: string;
    justification: string;
    weights: string;
    hierarchy: string;
  };
  palette: {
    tokens: ArtPaletteToken[];
    justification: string;
    avoid: string[];
  };
  photography: {
    direction: string;
    treatment: string;
    queries: string[];
    avoid: string[];
  };
  hero: {
    composition: string;
    layout: string;
    media: string;
    cta: string;
  };
  grid: {
    system: string;
    columns: string;
    spacing: string;
  };
  rhythm: string;
  density: string;
  components: {
    buttons: string;
    navigation: string;
    cards: string;
    graphics: string;
    borders: string;
  };
  motion: string;
  sectionPlan: ArtSectionPlanItem[];
  references: ArtReference[];
  antiTemplate: string[];
  meta: {
    source: "ai" | "fallback";
    researched: boolean;
    reason?: string;
    at: string;
  };
}

export interface ArtDirectionInput {
  business: BusinessContext;
  references?: ArtReference[];
  researched?: boolean;
  /** Completa um prompt via modelo (injetado — testável, sem chamadas no módulo). */
  complete?: (input: { system: string; user: string; maxTokens: number; temperature: number }) => Promise<string>;
  timeoutMs?: number;
  /** Ignora o cache (usado pela etapa de crítica/testes). */
  fresh?: boolean;
  now?: () => number;
}

// ---------- utilitários ----------

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  const t = String(s ?? "");
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Identidade estável do negócio (base do cache e da variação determinística). */
export function artDirectionKey(b: BusinessContext): string {
  return [
    b.name ?? "",
    b.segment ?? "",
    b.category ?? "",
    b.city ?? "",
    b.state ?? "",
    (b.services ?? []).join("|"),
    (b.about ?? "").slice(0, 120),
  ].join("::").toLowerCase();
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONT_RE = /^[A-Za-z0-9 .&'+-]{2,40}$/;

function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------- pools determinísticos (fallback) ----------

const FONT_PAIRS: Array<[string, string, string]> = [
  ["Fraunces", "Inter", "serif display com personalidade editorial + sans neutra legível"],
  ["Space Grotesk", "Inter", "sans geométrica contemporânea com presença, corpo neutro"],
  ["Lora", "Karla", "serif humanista acolhedora + sans limpa"],
  ["DM Serif Display", "DM Sans", "serif de contraste alto + sans geométrica"],
  ["Syne", "Manrope", "sans expressiva de vanguarda + corpo sóbrio"],
  ["Cormorant Garamond", "Work Sans", "serif clássica elegante + sans funcional"],
  ["Bricolage Grotesque", "Inter", "sans editorial contemporânea + corpo neutro"],
  ["Instrument Serif", "Geist", "serif expressiva + sans técnica"],
  ["Cardo", "Source Sans 3", "serif de leitura com caráter + sans objetiva"],
  ["Sora", "IBM Plex Sans", "sans técnica com personalidade + corpo neutro"],
];

const PALETTES: Array<{ tokens: Array<[PaletteRole, string, string]>; justification: string }> = [
  {
    tokens: [
      ["fundo", "#0F1115", "fundo escuro profundo"],
      ["superficie", "#181C22", "superfícies e blocos"],
      ["texto", "#F2EFE8", "texto principal"],
      ["acento", "#C8A25A", "acento com propósito (marca/destaque)"],
      ["apoio", "#8A8F98", "texto secundário"],
    ],
    justification: "contraste controlado com acento quente, sem clichê de nicho",
  },
  {
    tokens: [
      ["fundo", "#F6F3EC", "fundo quente claro"],
      ["superficie", "#FFFFFF", "blocos e cartões"],
      ["texto", "#161616", "texto principal"],
      ["acento", "#2F5D50", "acento profundo"],
      ["apoio", "#6B6B6B", "apoio"],
    ],
    justification: "claro com acento verde profundo; respiro sem bege genérico",
  },
  {
    tokens: [
      ["fundo", "#0B0F17", "fundo técnico escuro"],
      ["superficie", "#111827", "superfícies"],
      ["texto", "#E8EEF7", "texto"],
      ["acento", "#38BDF8", "acento técnico"],
      ["apoio", "#94A3B8", "apoio"],
    ],
    justification: "escuro técnico com acento frio, coerente com posicionamento digital",
  },
  {
    tokens: [
      ["fundo", "#FBF7F2", "fundo claro natural"],
      ["superficie", "#EFE6DA", "superfícies quentes"],
      ["texto", "#231F1C", "texto"],
      ["acento", "#B4552D", "acento terroso"],
      ["apoio", "#7A6F66", "apoio"],
    ],
    justification: "paleta terrosa com acento quente, sem rosa/bege padrão",
  },
  {
    tokens: [
      ["fundo", "#101010", "fundo monocromático"],
      ["superficie", "#1A1A1A", "superfícies"],
      ["texto", "#F5F5F5", "texto"],
      ["acento", "#E5E1DA", "acento luminoso discreto"],
      ["apoio", "#A3A3A3", "apoio"],
    ],
    justification: "monocromático sóbrio com tipografia como protagonista",
  },
  {
    tokens: [
      ["fundo", "#F4F1FA", "fundo claro frio"],
      ["superficie", "#FFFFFF", "superfícies"],
      ["texto", "#1B1633", "texto"],
      ["acento", "#6D4AFF", "acento saturado com propósito"],
      ["apoio", "#6E6A80", "apoio"],
    ],
    justification: "claro frio com acento saturado, posicionamento moderno",
  },
];

const VISUAL_LANGUAGES = [
  "editorial assimétrica",
  "institucional contemporânea",
  "imersiva com fotografia dominante",
  "comercial direta com hierarquia forte",
  "minimalista sofisticada",
  "expressiva com tipografia como imagem",
];

const HERO_LAYOUTS: Array<{ composition: string; layout: string; media: string; cta: string }> = [
  { composition: "hero assimétrico em duas colunas com headline à esquerda e imagem recortada à direita", layout: "split 55/45, sem centralização", media: "fotografia real do negócio quando existir", cta: "1 CTA primário + link secundário discreto" },
  { composition: "hero editorial full-width com tipografia grande sobre imagem com overlay controlado", layout: "full-bleed com coluna de texto alinhada à esquerda", media: "imagem ambiente com tratamento de cor", cta: "1 CTA sólido, sem segundo botão" },
  { composition: "hero institucional com texto e prova (endereço/atendimento) em faixa inferior", layout: "grid 12 colunas, conteúdo nas 7 primeiras", media: "foto corporativa/ambiente", cta: "CTA único com rótulo de ação clara" },
  { composition: "hero compacto acima da dobra com foco na oferta e navegação de serviços", layout: "faixa horizontal com navegação visível", media: "sem imagem de fundo; tipografia e cor conduzem", cta: "CTA primário e atalho de contato" },
];

const MODULES = {
  buttons: ["sólidos com raio pequeno (4-8px), sem pílula em tudo", "borda fina + preenchimento no hover, raio 6px", "botão tipográfico com sublinhado animado"],
  navigation: ["barra superior com contraste por borda inferior e itens curtos", "navegação lateral discreta em desktop (seções longas)", "top bar com logo à esquerda e CTA à direita, sem menu central"],
  cards: ["sem cartões: blocos separados por régua e espaço", "cartões apenas onde há conteúdo estruturado, raio 8px", "lista editorial com numeração, sem cards"],
  graphics: ["linhas e réguas como elementos estruturais", "numeração de seções como elemento gráfico", "blocos de cor sólida como contraste, sem degradês decorativos"],
  borders: ["cantos retos (0-4px) na maior parte dos elementos", "raio 8px apenas em mídia e cartões", "bordas de 1px como sistema, sem sombras difusas"],
};

const MOTIONS = [
  "reveals discretos por seção (fade+translate 8px), 180-240ms, sem looping",
  "hover com deslocamento de 2px e mudança de cor; sem animação de entrada em tudo",
  "transições de imagem (scale 1.02) e underline animado; sem bounce/elastic",
];

// ---------- fallback determinístico ----------

export function fallbackArtDirection(business: BusinessContext, reason = "fallback local"): ArtDirectionSpec {
  const key = artDirectionKey(business);
  const seed = hashString(key);
  const dir = buildDesignDirection({
    name: business.name,
    segment: business.segment,
    category: business.category,
    city: business.city,
    state: business.state,
    address: business.address,
    photos: business.photos,
    services: business.services,
  }, key);

  const [heading, body, pairWhy] = pick(FONT_PAIRS, seed);
  const pal = pick(PALETTES, seed >>> 3);
  const hero = pick(HERO_LAYOUTS, seed >>> 5);
  const lang = pick(VISUAL_LANGUAGES, seed >>> 7);

  const planIds = (dir.sectionPlan ?? []).map((s, i) => ({
    id: clean(String(s).split(/[—–]|-/)[0], 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `secao-${i + 1}`,
    purpose: clean(s, 120),
    layout: i % 3 === 0 ? "bloco full-width com hierarquia forte" : i % 3 === 1 ? "duas colunas com respiro" : "grid assimétrico",
  }));

  const services = (business.services ?? []).filter(Boolean);
  const sectionPlan = planIds.length >= 3 ? planIds : [
    { id: "abertura", purpose: "hero com proposta de valor e CTA", layout: "assimétrico" },
    { id: "atuacao", purpose: "o que a empresa faz, em linguagem concreta", layout: "duas colunas" },
    { id: "diferenciais", purpose: "por que escolher (com fatos reais apenas)", layout: "régua + blocos" },
    { id: "contato", purpose: "contato, endereço e horário", layout: "faixa final" },
  ];

  return {
    version: 1,
    seed: key,
    concept: clean(dir.visualConcept || `${dir.personality} — ${lang}`, 240),
    personality: clean(dir.personality, 120),
    audience: services.length ? `pessoas e empresas que procuram ${services.slice(0, 3).join(", ")}` : "público local do segmento",
    positioning: clean(dir.differentiationRationale || `posicionamento ${dir.personality}`, 200),
    visualLanguage: lang,
    typography: {
      heading,
      body,
      pair: `${heading} + ${body}`,
      justification: pairWhy,
      weights: "heading 600-700; corpo 400-500; sem fontes finas por padrão",
      hierarchy: "H1 2.4-3.4rem, H2 1.6-2.2rem, corpo 1rem/1.65; contraste de peso entre display e texto",
    },
    palette: {
      tokens: pal.tokens.map(([role, hex, use]) => ({ role, hex, use })),
      justification: pal.justification,
      avoid: ["bege como padrão", "gradiente decorativo", "paleta de nicho automática"],
    },
    photography: {
      direction: dir.imageStrategy || "fotografia real do negócio quando disponível",
      treatment: "tratamento coerente com a paleta, sem filtro artificial",
      queries: services.slice(0, 4).map((s) => `${s} ${business.city ?? ""}`.trim()),
      avoid: ["banco de imagens clichê", "imagem que não corresponde ao serviço"],
    },
    hero: { ...hero },
    grid: {
      system: clean(dir.grid, 120) || "grid 12 colunas com container 1120-1200px",
      columns: "12 colunas, conteúdo em 7-9 colunas; sem tudo centralizado",
      spacing: "escala 8px; seções com 96-128px de respiro vertical",
    },
    rhythm: clean(dir.rhythm, 120) || "alternância entre blocos densos e respiro amplo",
    density: clean(dir.density, 80) || "moderada",
    components: {
      buttons: pick(MODULES.buttons, seed >>> 9),
      navigation: pick(MODULES.navigation, seed >>> 11),
      cards: pick(MODULES.cards, seed >>> 13),
      graphics: pick(MODULES.graphics, seed >>> 15),
      borders: pick(MODULES.borders, seed >>> 17),
    },
    motion: pick(MOTIONS, seed >>> 19),
    sectionPlan: sectionPlan.slice(0, 9),
    references: [],
    antiTemplate: [
      "não usar hero gigante centralizado com dois botões como default",
      "não repetir 3 cards iguais em todas as seções",
      "não usar bege/glass/gradiente sem justificativa",
      "não centralizar todo o texto da página",
    ],
    meta: { source: "fallback", researched: false, reason, at: new Date().toISOString() },
  };
}

// ---------- validação de schema ----------

const ROLES: PaletteRole[] = ["fundo", "superficie", "texto", "acento", "destaque", "apoio"];

function normRole(v: unknown): PaletteRole {
  const s = clean(v, 20).toLowerCase();
  return (ROLES.find((r) => s.includes(r)) ?? "apoio") as PaletteRole;
}

/** Valida e normaliza o JSON devolvido pela IA. Devolve null se inválido. */
export function validateArtDirection(raw: unknown, seed: string, references: ArtReference[]): ArtDirectionSpec | null {
  let obj: any = raw;
  if (typeof raw === "string") {
    const t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { obj = JSON.parse(t); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;

  const concept = clean(obj.concept, 240);
  const person = clean(obj.personality, 160);
  const visual = clean(obj.visualLanguage, 120);
  const th = obj.typography ?? {};
  const heading = clean(th.heading ?? th.display, 40);
  const body = clean(th.body, 40);
  if (!concept || !person || !visual || !FONT_RE.test(heading) || !FONT_RE.test(body)) return null;
  if (heading.toLowerCase() === body.toLowerCase()) return null;

  const palRaw = Array.isArray(obj.palette?.tokens) ? obj.palette.tokens : Array.isArray(obj.palette) ? obj.palette : [];
  const tokens: ArtPaletteToken[] = [];
  for (const t of palRaw.slice(0, 8)) {
    const hex = clean(t?.hex, 9);
    if (!HEX_RE.test(hex)) continue;
    tokens.push({ role: normRole(t?.role), hex: hex.toLowerCase(), use: clean(t?.use, 80) || "uso definido pela direção" });
  }
  if (tokens.length < 3) return null;

  const secRaw = Array.isArray(obj.sectionPlan) ? obj.sectionPlan : [];
  const sectionPlan: ArtSectionPlanItem[] = [];
  for (const s of secRaw.slice(0, 10)) {
    const id = clean(typeof s === "string" ? s : s?.id, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id) continue;
    sectionPlan.push({
      id,
      purpose: clean(typeof s === "string" ? s : s?.purpose, 140) || "seção definida pela direção",
      layout: clean(typeof s === "string" ? "" : s?.layout, 100) || "composição definida pela direção",
    });
  }
  if (sectionPlan.length < 3) return null;

  const hero = obj.hero ?? {};
  const grid = obj.grid ?? {};
  const comp = obj.components ?? {};
  const photo = obj.photography ?? {};
  const strs = (v: unknown, max: number[]): string[] =>
    (Array.isArray(v) ? v : []).map((x, i) => clean(x, max[i] ?? 80)).filter(Boolean).slice(0, 6);

  return {
    version: 1,
    seed,
    concept,
    personality: person,
    audience: clean(obj.audience, 200) || "público do segmento, conforme posicionamento",
    positioning: clean(obj.positioning, 240) || person,
    visualLanguage: visual,
    typography: {
      heading,
      body,
      pair: `${heading} + ${body}`,
      justification: clean(th.justification, 200) || "par escolhido pela direção do projeto",
      weights: clean(th.weights, 100) || "heading 600-700; corpo 400-500",
      hierarchy: clean(th.hierarchy, 200) || "H1 2.4-3.4rem, H2 1.6-2.2rem, corpo 1rem/1.65",
    },
    palette: {
      tokens,
      justification: clean(obj.palette?.justification, 200) || "paleta intencional do projeto",
      avoid: strs(obj.palette?.avoid, [60, 60, 60, 60]),
    },
    photography: {
      direction: clean(photo.direction, 200) || "fotografia coerente com o posicionamento",
      treatment: clean(photo.treatment, 160) || "tratamento coerente com a paleta",
      queries: strs(photo.queries, [60, 60, 60, 60, 60, 60]),
      avoid: strs(photo.avoid, [60, 60, 60, 60]),
    },
    hero: {
      composition: clean(hero.composition, 200) || "composição definida pela direção",
      layout: clean(hero.layout, 140) || "layout definido pela direção",
      media: clean(hero.media, 120) || "mídia coerente com a direção",
      cta: clean(hero.cta, 120) || "CTA único e claro",
    },
    grid: {
      system: clean(grid.system, 140) || "grid 12 colunas",
      columns: clean(grid.columns, 120) || "conteúdo em 7-9 colunas",
      spacing: clean(grid.spacing, 120) || "escala 8px, seções com respiro amplo",
    },
    rhythm: clean(obj.rhythm, 140) || "alternância de densidade",
    density: clean(obj.density, 80) || "moderada",
    components: {
      buttons: clean(comp.buttons, 140) || "botões coerentes com a direção",
      navigation: clean(comp.navigation, 140) || "navegação simples e clara",
      cards: clean(comp.cards, 140) || "sem cartões por padrão",
      graphics: clean(comp.graphics, 140) || "elementos gráficos com função",
      borders: clean(comp.borders, 140) || "cantos retos por padrão",
    },
    motion: clean(obj.motion, 160) || "motion discreto e funcional",
    sectionPlan,
    // REFERÊNCIAS: só as fornecidas por pesquisa REAL (nunca as "inventadas" pelo modelo).
    references: references.slice(0, 6),
    antiTemplate: strs(obj.antiTemplate, [90, 90, 90, 90, 90, 90]).length
      ? strs(obj.antiTemplate, [90, 90, 90, 90, 90, 90])
      : ["sem hero genérico", "sem 3 cards repetidos", "sem bege/gradiente sem função"],
    meta: { source: "ai", researched: references.length > 0, at: new Date().toISOString() },
  };
}

// ---------- geração (1 chamada de modelo, com cache/timeout/fallback) ----------

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 40;
const cache = new Map<string, { spec: ArtDirectionSpec; at: number }>();

export function clearArtDirectionCache(): void {
  cache.clear();
}

function systemPrompt(): string {
  return [
    "Você é um diretor de arte sênior de web design (nível de estúdio premiado).",
    "Sua tarefa: definir a DIREÇÃO DE ARTE EXECUTÁVEL de UM site, a partir dos dados REAIS deste negócio.",
    "Regras:",
    "- Derive o conceito do NEGÓCIO, do público e do posicionamento — NUNCA do nicho genérico.",
    "- Proibido o pacote padrão de IA: hero gigante centralizado, 3 cards repetidos, bege default, gradientes/glass sem função, cantos arredondados em tudo.",
    "- Variação precisa ter justificativa; não faça combinações aleatórias nem prejudique legibilidade/acessibilidade/conversão.",
    "- Fontes: apenas famílias disponíveis no Google Fonts (nomes reais). Diga por que o par combina com a marca.",
    "- Paleta: hex válidos com função (fundo/superficie/texto/acento/apoio). Nada de paleta de nicho automática.",
    "- NÃO invente avaliações, clientes, certificações, prêmios, números ou depoimentos.",
    "- Seja concreto: cada campo deve ser verificável no site construído.",
    "Responda SOMENTE com JSON válido (sem markdown), no formato:",
    JSON.stringify({
      concept: "conceito criativo em 1 frase (o que este site expressa)",
      personality: "personalidade da marca (3-6 adjetivos com sentido)",
      audience: "público-alvo interpretado",
      positioning: "posicionamento comercial derivado dos dados",
      visualLanguage: "linguagem visual (ex.: editorial assimétrica, institucional contemporânea...)",
      typography: { heading: "Google Font", body: "Google Font", justification: "por que este par", weights: "ex.: heading 600-700; corpo 400-500", hierarchy: "escala H1/H2/corpo" },
      palette: { tokens: [{ role: "fundo|superficie|texto|acento|destaque|apoio", hex: "#RRGGBB", use: "onde usar" }], justification: "por que esta paleta", avoid: ["cores/efeitos a evitar"] },
      photography: { direction: "que tipo de imagem/tema", treatment: "tratamento/cor", queries: ["3-5 buscas de imagem específicas"], avoid: ["o que evitar"] },
      hero: { composition: "como o hero é composto (sem clichê)", layout: "grid/alinhamento", media: "imagem/fundo/nenhum", cta: "estilo e quantidade de CTAs" },
      grid: { system: "sistema de grid", columns: "distribuição", spacing: "escala e respiro" },
      rhythm: "ritmo entre seções", density: "densidade de informação",
      components: { buttons: "estilo", navigation: "estilo", cards: "usar/evitar e como", graphics: "elementos gráficos", borders: "raios/bordas" },
      motion: "interações/animação com propósito",
      sectionPlan: [{ id: "slug", purpose: "o que a seção resolve", layout: "composição" }],
      antiTemplate: ["vícios a evitar NESTE projeto"],
    }),
    "sectionPlan: entre 4 e 9 seções, derivadas dos serviços/público/objetivo — ordem e quantidade NÃO devem ser as mesmas para todos os projetos.",
  ].join("\n");
}

function userPrompt(b: BusinessContext, references: ArtReference[], seed: string): string {
  return [
    `NEGÓCIO: ${b.name ?? "(sem nome)"}`,
    `SEGMENTO: ${b.segment ?? "(não informado)"}`,
    `CATEGORIA: ${b.category ?? "(não informado)"}`,
    `CIDADE: ${b.city ?? "-"} ${b.state ?? ""}`,
    `ENDEREÇO: ${b.address ?? "-"}`,
    `SOBRE: ${(b.about ?? "").slice(0, 800) || "(não informado)"}`,
    `SERVIÇOS: ${(b.services ?? []).join("; ") || "(não informados)"}`,
    `FOTOS REAIS DISPONÍVEIS: ${(b.photos ?? []).length}`,
    references.length
      ? `REFERÊNCIAS VISUAIS CONSULTADAS (extraia princípios; NÃO copie layout/marca/conteúdo):\n${references.map((r, i) => `${i + 1}. ${r.url} — ${r.principle}`).join("\n")}`
      : "REFERÊNCIAS: nenhuma consulta externa disponível — use seu repertório e não invente URLs.",
    `SEED (identidade do projeto): ${seed}`,
    "Gere a direção de arte específica deste projeto.",
  ].join("\n");
}

export async function generateArtDirection(input: ArtDirectionInput): Promise<ArtDirectionSpec> {
  const key = artDirectionKey(input.business);
  const now = input.now ? input.now() : Date.now();
  const refs = (input.references ?? []).filter((r) => /^https?:\/\//i.test(r.url ?? ""));

  if (!input.fresh) {
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) return { ...hit.spec, references: refs.length ? refs : hit.spec.references };
  }

  if (!input.complete) {
    const fb = fallbackArtDirection(input.business, "modelo indisponível");
    fb.references = refs;
    fb.meta.researched = input.researched === true;
    fb.meta.at = new Date(now).toISOString();
    return fb;
  }

  const timeoutMs = Math.max(5_000, Math.min(input.timeoutMs ?? 45_000, 90_000));
  const raw = await Promise.race([
    input.complete({
      system: systemPrompt(),
      user: userPrompt(input.business, refs, key),
      maxTokens: 1800,
      temperature: 0.9,
    }).catch(() => ""),
    new Promise<string>((resolve) => setTimeout(() => resolve(""), timeoutMs)),
  ]);

  const spec = validateArtDirection(raw, key, refs);
  if (!spec) {
    const fb = fallbackArtDirection(input.business, raw ? "resposta inválida do modelo" : "sem resposta do modelo (timeout/vazio)");
    fb.references = refs;
    fb.meta.researched = input.researched === true;
    fb.meta.at = new Date(now).toISOString();
    return fb;
  }

  spec.meta.researched = input.researched === true && refs.length > 0;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { spec, at: now });
  return spec;
}

// ---------- bloco executável para a missão ----------

export const ART_DIRECTION_SPEC_MARKER = "ART-DIRECTION-SPEC:";

/** Bloco injetado ANTES da instrução — especificação, não sugestão. */
export function formatArtDirectionBlock(spec: ArtDirectionSpec): string {
  const pal = spec.palette.tokens.map((t) => `  - ${t.role}: ${t.hex} — ${t.use}`).join("\n");
  const secs = spec.sectionPlan.map((s, i) => `  ${i + 1}. ${s.id} — ${s.purpose} (${s.layout})`).join("\n");
  const refs = spec.references.length
    ? spec.references.map((r) => `  - ${r.url} — princípio: ${r.principle}`).join("\n")
    : "  - (nenhuma consulta externa; repertório do modelo — não citar URLs inexistentes)";
  return [
    `${ART_DIRECTION_SPEC_MARKER} FASE 1 — ESPECIFICAÇÃO EXECUTÁVEL DESTE PROJETO`,
    `CONCEITO: ${spec.concept}`,
    `PERSONALIDADE: ${spec.personality}`,
    `PÚBLICO: ${spec.audience}`,
    `POSICIONAMENTO: ${spec.positioning}`,
    `LINGUAGEM VISUAL: ${spec.visualLanguage}`,
    `TIPOGRAFIA (OBRIGATÓRIA): ${spec.typography.pair} — importe exatamente estas famílias do Google Fonts.`,
    `  Justificativa: ${spec.typography.justification}`,
    `  Pesos: ${spec.typography.weights}`,
    `  Hierarquia: ${spec.typography.hierarchy}`,
    `PALETA (OBRIGATÓRIA — use estes hex como base):\n${pal}\n  Justificativa: ${spec.palette.justification}`,
    `FOTOGRAFIA: ${spec.photography.direction} | tratamento: ${spec.photography.treatment}`,
    `  Buscas de imagem sugeridas: ${spec.photography.queries.join(" | ") || "(definir pela direção)"}`,
    `HERO: ${spec.hero.composition} | layout: ${spec.hero.layout} | mídia: ${spec.hero.media} | CTA: ${spec.hero.cta}`,
    `GRID: ${spec.grid.system} | colunas: ${spec.grid.columns} | espaçamento: ${spec.grid.spacing}`,
    `RITMO: ${spec.rhythm} | DENSIDADE: ${spec.density}`,
    `COMPONENTES: botões: ${spec.components.buttons} | nav: ${spec.components.navigation} | cards: ${spec.components.cards} | gráficos: ${spec.components.graphics} | bordas: ${spec.components.borders}`,
    `MOVIMENTO: ${spec.motion}`,
    `PLANO DE SEÇÕES (ordem e conteúdo deste projeto — não use o esqueleto genérico):\n${secs}`,
    `REFERÊNCIAS (princípios, NUNCA cópia):\n${refs}`,
    `EVITAR NESTE PROJETO: ${spec.antiTemplate.join("; ")}`,
    `VERIFICAÇÃO PÓS-GERAÇÃO: a crítica visual vai conferir se o site usa estas fontes, esta paleta, este hero e estas seções. Não substitua estas decisões por defaults.`,
  ].join("\n");
}
