// Quality Gate — regras anti-genérico aplicadas à spec gerada.
// Detecta resultados "pobres": poucas seções, sem CTA, copy clichê, hero vazio,
// conteúdo repetido. Puro (sem Deno) para uso no edge e em testes.

export interface SpecLike {
  sections?: Array<{ type?: string; id?: string }>;
  content?: Record<string, unknown>;
  calls_to_action?: unknown[];
  seo?: Record<string, unknown>;
  design_system?: Record<string, unknown>;
  [key: string]: unknown;
}

const GENERIC_PHRASES = [
  "transformando sonhos em realidade",
  "somos uma empresa especializada",
  "oferecemos soluções de qualidade",
  "excelência em",
  "a melhor opção do mercado",
  "temos a solução perfeita",
  "qualidade e compromisso",
  "preço justo",
  "atendimento diferenciado",
  "venha nos visitar e confira",
  "fale conosco e faça seu orçamento sem compromisso",
  "trabalhamos com as melhores marcas",
];

export function sectionTypes(spec: SpecLike): string[] {
  if (!Array.isArray(spec.sections)) return [];
  return spec.sections.map((s) => (s && typeof s.type === "string" ? s.type : "")).filter(Boolean);
}

export function textOf(spec: SpecLike): string {
  const parts: string[] = [];
  const content = spec.content && typeof spec.content === "object" ? spec.content : {};
  const walk = (v: unknown): void => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(content);
  const seo = spec.seo && typeof spec.seo === "object" ? spec.seo : {};
  if (typeof seo.title === "string") parts.push(seo.title);
  if (typeof seo.description === "string") parts.push(seo.description);
  return parts.join(" \n ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function qualityIssues(spec: SpecLike, opts?: { imageDriven?: boolean }): string[] {
  const issues: string[] = [];
  const types = sectionTypes(spec);
  const meaningful = types.filter((t) => t !== "hero").length;

  if (meaningful < 3) issues.push(`poucas_secoes (${meaningful} além do hero)`);

  const heroTitle = (() => {
    const c = spec.content?.hero;
    if (c && typeof c === "object" && typeof (c as Record<string, unknown>).title === "string") {
      return ((c as Record<string, unknown>).title as string).trim();
    }
    return "";
  })();
  if (!heroTitle) issues.push("hero_sem_titulo");

  const hasCta = Array.isArray(spec.calls_to_action) && spec.calls_to_action.length > 0;
  const hasCtaContent = (() => {
    const c = spec.content?.cta;
    if (c && typeof c === "object") {
      const r = c as Record<string, unknown>;
      return typeof r.title === "string" && (r.title as string).trim().length > 0;
    }
    return false;
  })();
  if (!hasCta && !hasCtaContent) issues.push("sem_cta");

  const hasContact = (() => {
    const c = spec.content?.contact;
    if (c && typeof c === "object") {
      const r = c as Record<string, unknown>;
      return typeof r.title === "string" && (r.title as string).trim().length > 0;
    }
    return false;
  })();
  if (!hasContact) issues.push("sem_secao_contato");

  const allText = textOf(spec);
  if (allText.length < 350) issues.push("conteudo_muito_curto");

  for (const phrase of GENERIC_PHRASES) {
    if (allText.includes(phrase)) {
      issues.push(`copy_generica: ${phrase}`);
      break;
    }
  }

  if (opts?.imageDriven && !hasUsableImages(spec)) {
    issues.push("sem_imagens_para_direcao_visual");
  }

  return issues;
}

// Detecta presença de imagem utilizável no spec (hero ou galeria).
export function hasUsableImages(spec: SpecLike): boolean {
  const hero = spec.content?.hero && typeof spec.content.hero === "object" ? (spec.content.hero as Record<string, unknown>) : {};
  const heroImage = hero.image;
  if (typeof heroImage === "string" && /^https?:\/\//i.test(heroImage)) return true;
  if (heroImage && typeof heroImage === "object" && typeof (heroImage as Record<string, unknown>).url === "string") return true;
  const gallery = spec.content?.gallery && typeof spec.content.gallery === "object" ? (spec.content.gallery as Record<string, unknown>) : {};
  const items = Array.isArray(gallery.items) ? gallery.items : [];
  return items.some((item) => {
    if (!item || typeof item !== "object") return false;
    const r = item as Record<string, unknown>;
    const img = r.image;
    if (typeof img === "string" && /^https?:\/\//i.test(img)) return true;
    if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string") return true;
    return false;
  });
}

export function qualityScore(spec: SpecLike): number {
  const issues = qualityIssues(spec);
  return Math.max(0, 100 - issues.length * 16);
}

// Heurísticas de qualidade premium (0-100) para a spec gerada.
// Vai além do gate anti-genérico: premia profundidade, diversidade de seções,
// consistência de design system, motion metadata e uso de imagens.
export function premiumScore(spec: SpecLike): number {
  let score = 0;
  const ds = spec.design_system && typeof spec.design_system === "object" ? spec.design_system : {};
  const content = spec.content && typeof spec.content === "object" ? spec.content : {};
  const block = (k: string): Record<string, unknown> =>
    content[k] && typeof content[k] === "object" ? (content[k] as Record<string, unknown>) : {};

  const types = sectionTypes(spec);
  const unique = new Set(types);
  const meaningful = types.filter((t) => t !== "hero").length;

  // 0-25: profundidade e diversidade de seções
  score += Math.min(15, meaningful * 3);
  score += Math.min(10, unique.size * 2);

  // 0-20: design system consistente
  const colors = ds.colors && typeof ds.colors === "object" ? ds.colors : {};
  const colorKeys = ["primary", "secondary", "accent", "background", "surface", "on_surface", "muted", "border"];
  const present = colorKeys.filter((k) => typeof (colors as Record<string, unknown>)[k] === "string").length;
  score += Math.min(12, present * 2);
  const typo = ds.typography && typeof ds.typography === "object" ? ds.typography : {};
  if (typeof (typo as Record<string, unknown>).heading_font === "string") score += 4;
  if (typeof (typo as Record<string, unknown>).body_font === "string") score += 4;
  const styleKeys = ["layout_archetype", "hero_variant", "card_style", "button_style", "navigation_style", "cta_treatment", "footer_style"];
  const stylePresent = styleKeys.filter((k) => typeof ds[k] === "string").length;
  score += Math.min(8, stylePresent);

  // 0-20: motion metadata presente e coerente
  const motion = ds.motion && typeof ds.motion === "object" ? (ds.motion as Record<string, unknown>) : {};
  const motionKeys: Array<keyof MotionMetaLike> = ["reveal", "staggerCards", "hoverLift", "imageZoom", "smoothScroll"];
  const motionPresent = motionKeys.filter((k) => typeof motion[k] === "boolean").length;
  score += Math.min(10, motionPresent * 2);
  const motionOn = motionKeys.filter((k) => motion[k] === true).length;
  if (motionOn >= 3) score += 10;
  else if (motionOn >= 1) score += 5;

  // 0-15: imagens utilizáveis (hero ou galeria)
  if (hasUsableImages(spec)) {
    score += 8;
    const gallery = block("gallery");
    const items = Array.isArray(gallery.items) ? gallery.items.length : 0;
    if (items >= 3) score += 4;
    else if (items >= 1) score += 2;
    const hero = block("hero");
    const heroImg = hero.image;
    if (heroImg && typeof heroImg === "object" && typeof (heroImg as Record<string, unknown>).alt === "string") score += 3;
  }

  // 0-10: qualidade de copy (comprimento + ausência de clichês)
  const allText = textOf(spec);
  if (allText.length >= 600) score += 5;
  else if (allText.length >= 350) score += 2;
  const hasGeneric = GENERIC_PHRASES.some((p) => allText.includes(p));
  if (hasGeneric) score -= 10;
  else score += 5;

  // 0-10: SEO + CTA consistente
  const seo = spec.seo && typeof spec.seo === "object" ? spec.seo : {};
  if (typeof (seo as Record<string, unknown>).title === "string" && String((seo as Record<string, unknown>).title).trim()) score += 3;
  if (typeof (seo as Record<string, unknown>).description === "string" && String((seo as Record<string, unknown>).description).trim().length >= 40) score += 3;
  if (Array.isArray(spec.calls_to_action) && spec.calls_to_action.length > 0) score += 2;
  const ctaBlock = block("cta");
  if (typeof ctaBlock.title === "string" && String(ctaBlock.title).trim()) score += 2;

  return Math.min(100, Math.max(0, score));
}

interface MotionMetaLike {
  reveal?: boolean;
  staggerCards?: boolean;
  hoverLift?: boolean;
  imageZoom?: boolean;
  smoothScroll?: boolean;
}

// Garante que o content tenha os blocos padrão (mesmo vazios) para editabilidade.
export function ensureBaseContent(content: Record<string, unknown> | undefined): Record<string, unknown> {
  const base: Record<string, unknown> = content && typeof content === "object" ? content : {};
  for (const key of ["hero", "about", "services", "features", "numbers", "process", "faq", "trust", "cta", "contact", "footer"]) {
    if (!base[key] || typeof base[key] !== "object") base[key] = {};
  }
  return base;
}

// =========================================================
// FASE 7.3 — AUTOMATIC PREMIUM QA
// Atua como Art Director + Senior Designer + UX/Frontend Reviewer.
// Heurísticas determinísticas sobre a spec (sem IA) para alimentar o gate
// e o ciclo de refinement. Retorna 0-100 por dimensão + problemas.
// =========================================================

export interface QaDimension {
  key: string;
  label: string;
  score: number; // 0-100
  issues: string[];
}

export interface PremiumQaReport {
  score: number;
  dimensions: QaDimension[];
  issues: string[];
  antiPdf: string[];
  antiTemplate: string[];
}

export function dsOf(spec: SpecLike): Record<string, unknown> {
  return spec.design_system && typeof spec.design_system === "object" ? spec.design_system : {};
}
function blockOf(content: Record<string, unknown>, key: string): Record<string, unknown> {
  const b = content[key];
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}
function arrLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

// Conta quantos blocos de cards (services/features/trust/testimonials) usam a
// mesma composição "icone + titulo + descricao" sem diferencial de layout.
function cardLikeSections(spec: SpecLike): string[] {
  const content = spec.content && typeof spec.content === "object" ? spec.content : {};
  const types = sectionTypes(spec);
  const out: string[] = [];
  for (const t of types) {
    if (t === "services" || t === "features" || t === "process" || t === "trust") {
      const block = blockOf(content, t);
      if (block && Object.keys(block).length > 0 && arrLen(block.items ?? block.steps) >= 2) out.push(t);
    }
  }
  return out;
}

function heroInfo(spec: SpecLike): { title: string; hasImage: boolean; hasCta: boolean } {
  const content = spec.content && typeof spec.content === "object" ? spec.content : {};
  const hero = blockOf(content, "hero");
  const title = typeof hero.title === "string" ? hero.title.trim() : "";
  const img = hero.image;
  const hasImage = !!img && (typeof img === "string" || (typeof img === "object" && typeof (img as Record<string, unknown>).url === "string"));
  const hasCta = typeof hero.primary_cta === "string" && hero.primary_cta.trim().length > 0;
  return { title, hasImage, hasCta };
}

function imageCounts(spec: SpecLike): { gallery: number; imageDriven: boolean } {
  const content = spec.content && typeof spec.content === "object" ? spec.content : {};
  const gallery = blockOf(content, "gallery");
  return { gallery: arrLen(gallery.items), imageDriven: dsOf(spec).image_driven !== false };
}

function typeScaleCoherent(spec: SpecLike): boolean {
  const typo = dsOf(spec).typography && typeof dsOf(spec).typography === "object"
    ? (dsOf(spec).typography as Record<string, unknown>) : {};
  return typeof typo.heading_font === "string" && typeof typo.body_font === "string";
}

function hasMotionMeta(spec: SpecLike): { present: number; on: number } {
  const motion = dsOf(spec).motion && typeof dsOf(spec).motion === "object" ? (dsOf(spec).motion as Record<string, unknown>) : {};
  const keys = ["reveal", "staggerCards", "hoverLift", "imageZoom", "smoothScroll"];
  const present = keys.filter((k) => typeof motion[k] === "boolean").length;
  const on = keys.filter((k) => motion[k] === true).length;
  return { present, on };
}

function colorsComplete(spec: SpecLike): number {
  const colors = dsOf(spec).colors && typeof dsOf(spec).colors === "object" ? (dsOf(spec).colors as Record<string, unknown>) : {};
  return ["primary", "secondary", "accent", "background", "surface", "on_surface", "muted", "border"]
    .filter((k) => typeof colors[k] === "string" && /^#[0-9a-f]{6}$/i.test(colors[k] as string)).length;
}

function sectionRhythmScore(spec: SpecLike): { score: number; issues: string[] } {
  const types = sectionTypes(spec).filter((t) => t !== "hero");
  const unique = new Set(types);
  const issues: string[] = [];
  // Repetição estrutural: 3+ seções "cartão" em sequência sem variação real.
  const sameKind = types.filter((t) => ["services", "features"].includes(t)).length;
  if (sameKind >= 2 && unique.size < 4) issues.push("rhythm: muitas seções de cards sem alternância");
  const score = unique.size >= 5 ? 100 : unique.size >= 4 ? 80 : unique.size >= 3 ? 55 : 25;
  return { score, issues };
}

function footerQuality(spec: SpecLike): { score: number; issues: string[] } {
  const content = spec.content && typeof spec.content === "object" ? spec.content : {};
  const footer = blockOf(content, "footer");
  const ds = dsOf(spec);
  const hasTagline = typeof footer.tagline === "string" && footer.tagline.trim().length > 0;
  const footerStyle = typeof ds.footer_style === "string" ? ds.footer_style : "";
  const nav = arrLen(spec.navigation);
  if (footerStyle === "simple" || footerStyle === "") {
    return { score: 45, issues: ["footer: estilo simples — prefira multi_column/editorial/dark com CTA"] };
  }
  const score = (hasTagline ? 40 : 10) + (nav >= 3 ? 30 : 15) + (footerStyle !== "simple" ? 30 : 0);
  return { score: Math.min(100, score), issues: hasTagline ? [] : ["footer: sem tagline/diferenciação de marca"] };
}

function headerQuality(spec: SpecLike): { score: number; issues: string[] } {
  const ds = dsOf(spec);
  const navStyle = typeof ds.navigation_style === "string" ? ds.navigation_style : "";
  const headerVariant = typeof ds.header_variant === "string" ? ds.header_variant : "";
  const ctaOnNav = arrLen(spec.calls_to_action) > 0;
  if (!headerVariant && (navStyle === "" || navStyle === "minimal")) {
    return { score: 55, issues: ["header: sem variante definida e nav minimal — risco de header genérico"] };
  }
  const score = (headerVariant ? 40 : 20) + (ctaOnNav ? 35 : 15) + (navStyle !== "minimal" ? 25 : 15);
  return { score: Math.min(100, score), issues: ctaOnNav ? [] : ["header: sem CTA visível na navegação"] };
}

export function antiPdfIssues(spec: SpecLike): string[] {
  const issues: string[] = [];
  const types = sectionTypes(spec);
  const content = spec.content && typeof spec.content === "object" ? spec.content : {};
  const cardSections = cardLikeSections(spec);
  if (cardSections.length >= 2 && types.length <= 6) issues.push("pdf: estrutura parece doc — poucas seções e várias listas de cards");
  if (types.filter((t) => ["trust", "services", "features"].includes(t)).length >= 2) {
    const textLen = textOf(spec).length;
    if (textLen < 500 && cardSections.length >= 2) issues.push("pdf: conteúdo curto com muita lista — pouco valor editorial");
  }
  const { title } = heroInfo(spec);
  if (!title) issues.push("pdf: hero sem título");
  const { present, on } = hasMotionMeta(spec);
  if (present === 0 || on === 0) issues.push("pdf: sem motion definido");
  const hasImg = imageCounts(spec);
  if (!hasImg.gallery && !hasUsableImages(spec)) issues.push("pdf: nenhuma imagem utilizável (parece documento)");
  const layoutMood = typeof dsOf(spec).layout_mood === "string" ? dsOf(spec).layout_mood : "";
  if (types.length >= 4 && !layoutMood) issues.push("pdf: layout sem mood — sem direção de arte clara");
  return issues;
}

export function antiTemplateIssues(spec: SpecLike): string[] {
  const issues: string[] = [];
  const ds = dsOf(spec);
  const types = sectionTypes(spec);
  const colors = ds.colors && typeof ds.colors === "object" ? (ds.colors as Record<string, unknown>) : {};
  // Paleta genérica padrão (teal default) sem identidade.
  const primary = typeof colors.primary === "string" ? colors.primary.toLowerCase() : "";
  if (primary === "#0f766e" || primary === "#134e4a") issues.push("template: cor primária padrão do sistema — sem identidade de marca");
  if (!ds.layout_archetype) issues.push("template: sem archetype definido");
  if (!ds.hero_variant) issues.push("template: hero_variant ausente");
  if (!types.some((t) => ["gallery", "process", "faq", "testimonials"].includes(t))) {
    issues.push("template: estrutura básica demais (hero+serviços+contato) — sem camada de diferenciação");
  }
  return issues;
}

const DIMENSION_BUILDERS: Array<(spec: SpecLike) => QaDimension> = [
  (spec) => {
    const issues: string[] = [];
    let score = 60;
    const colors = colorsComplete(spec);
    if (colors >= 8) score += 20; else if (colors >= 5) score += 8; else issues.push("identidade: paleta incompleta");
    if (dsOf(spec).visual_style && typeof dsOf(spec).visual_style === "string" && dsOf(spec).visual_style.length > 10) score += 20; else issues.push("identidade: visual_style ausente/curto");
    if (dsOf(spec).layout_archetype) score += 10; else issues.push("identidade: archetype ausente");
    return { key: "visual_identity", label: "Identidade visual", score: Math.min(100, score), issues };
  },
  (spec) => {
    const types = sectionTypes(spec);
    let score = 55;
    const issues: string[] = [];
    const varied = ["hero", "about", "services", "features", "numbers", "process", "faq", "gallery", "trust", "cta"].filter((t) => types.includes(t)).length;
    if (varied >= 6) score += 30; else if (varied >= 4) score += 15; else issues.push("composição: pouca variedade de blocos");
    if (types.filter((t) => t !== "hero").length >= 5) score += 15; else issues.push("composição: site raso");
    return { key: "composition", label: "Composição", score: Math.min(100, score), issues };
  },
  (spec) => {
    const issues: string[] = [];
    const score = typeScaleCoherent(spec) ? 85 : 45;
    if (!typeScaleCoherent(spec)) issues.push("tipografia: faltam heading_font/body_font");
    return { key: "typography", label: "Tipografia", score, issues };
  },
  (spec) => {
    const issues: string[] = [];
    const { imageDriven } = imageCounts(spec);
    let score = 50;
    const hasImg = hasUsableImages(spec);
    if (hasImg) score += 25; else if (imageDriven) issues.push("imagem: direção image-driven sem imagem");
    const gallery = imageCounts(spec).gallery;
    if (gallery >= 3) score += 25; else if (gallery >= 1) score += 10; else if (imageDriven) issues.push("imagem: galeria pobre");
    return { key: "image_relevance", label: "Relevância de imagem", score: Math.min(100, score), issues };
  },
  (spec) => {
    const issues: string[] = [];
    let score = 50;
    const urls = new Set<string>();
    const content = spec.content && typeof spec.content === "object" ? spec.content : {};
    const hero = blockOf(content, "hero");
    const addImg = (v: unknown) => {
      if (v && typeof v === "object") {
        const u = (v as Record<string, unknown>).url;
        if (typeof u === "string") urls.add(u);
      } else if (typeof v === "string") urls.add(v);
    };
    addImg(hero.image);
    const gallery = blockOf(content, "gallery");
    if (Array.isArray(gallery.items)) {
      for (const item of gallery.items) {
        if (item && typeof item === "object") {
          const img = (item as Record<string, unknown>).image;
          addImg(img);
        }
      }
    }
    if (urls.size >= 4) score += 40; else if (urls.size >= 2) score += 20; else if (urls.size === 1) score += 5;
    if (urls.size > 0 && urls.size < 3) issues.push("imagem: poucas imagens distintas (sem diversidade visual)");
    return { key: "image_diversity", label: "Diversidade de imagem", score: Math.min(100, score), issues };
  },
  (spec) => {
    const { title } = heroInfo(spec);
    const issues: string[] = [];
    const hasSub = (() => {
      const hero = spec.content?.hero;
      if (hero && typeof hero === "object") {
        const h = hero as Record<string, unknown>;
        return typeof h.subtitle === "string" && (h.subtitle as string).trim().length > 0;
      }
      return false;
    })();
    let score = 55;
    if (title) score += 20; else issues.push("hierarquia: hero sem título");
    if (hasSub) score += 15;
    const types = sectionTypes(spec);
    if (types.length > 1) score += 10;
    return { key: "hierarchy", label: "Hierarquia", score: Math.min(100, score), issues };
  },
  (spec) => {
    const { score, issues } = sectionRhythmScore(spec);
    return { key: "section_rhythm", label: "Ritmo de seções", score, issues };
  },
  (spec) => {
    const issues: string[] = [];
    const types = sectionTypes(spec);
    const hasCards = ["services", "features", "testimonials", "process"].some((t) => types.includes(t));
    const score = hasCards ? 85 : 55;
    if (!hasCards) issues.push("interação: poucos elementos interativos (cards/hover)");
    return { key: "interaction", label: "Interação", score, issues };
  },
  (spec) => {
    const { present, on } = hasMotionMeta(spec);
    const issues: string[] = [];
    const score = present >= 4 && on >= 3 ? 90 : present >= 2 ? 60 : 30;
    if (present < 4) issues.push("motion: metadata incompleto");
    if (on < 3) issues.push("motion: maioria das animações desativada — site estático");
    return { key: "motion", label: "Motion", score, issues };
  },
  (spec) => {
    const q = headerQuality(spec);
    return { key: "header_quality", label: "Header", score: q.score, issues: q.issues };
  },
  (spec) => {
    const q = footerQuality(spec);
    return { key: "footer_quality", label: "Footer", score: q.score, issues: q.issues };
  },
  (spec) => {
    const issues: string[] = [];
    const hasCta = Array.isArray(spec.calls_to_action) && spec.calls_to_action.length > 0;
    const ctaBlock = blockOf(spec.content && typeof spec.content === "object" ? spec.content : {}, "cta");
    let score = 55;
    if (hasCta) score += 25; else issues.push("cta: sem calls_to_action");
    if (typeof ctaBlock.title === "string" && (ctaBlock.title as string).trim()) score += 20; else issues.push("cta: bloco CTA vazio");
    return { key: "cta_quality", label: "CTA", score: Math.min(100, score), issues };
  },
  (spec) => {
    // Responsividade: avaliada por tokens (container, gutter, density) e não
    // por layout renderizado — aqui medimos a presença de decisões responsivas.
    const ds = dsOf(spec);
    const issues: string[] = [];
    let score = 60;
    const keys = ["container_width", "section_spacing", "visual_density"];
    const present = keys.filter((k) => typeof ds[k] === "string").length;
    score += present * 10;
    if (present < 3) issues.push("responsive: sem tokens de layout (container/spacing/density)");
    return { key: "responsive_quality", label: "Responsividade", score: Math.min(100, score), issues };
  },
  (spec) => {
    const issues: string[] = [];
    const ds = dsOf(spec);
    let score = 55;
    if (typeof ds.visual_style === "string" && ds.visual_style.length > 20) score += 15;
    if (ds.layout_archetype && ds.hero_variant) score += 15;
    if (typeof ds.colors === "object" && colorsComplete(spec) >= 8) score += 15;
    const all = [...antiTemplateIssues(spec), ...antiPdfIssues(spec)];
    if (all.length === 0) score += 10; else issues.push("originalidade: sinais de template/PDF presentes");
    return { key: "originality", label: "Originalidade", score: Math.min(100, score), issues };
  },
  (spec) => {
    const issues: string[] = [];
    const pdf = antiPdfIssues(spec);
    const tpl = antiTemplateIssues(spec);
    let score = 60;
    if (pdf.length === 0) score += 20; else issues.push(`premium: ${pdf[0]}`);
    if (tpl.length === 0) score += 20; else issues.push(`premium: ${tpl[0]}`);
    return { key: "premium_feel", label: "Sensação premium", score: Math.min(100, score), issues };
  },
];

export function premiumQA(spec: SpecLike): PremiumQaReport {
  const dimensions = DIMENSION_BUILDERS.map((build) => build(spec));
  const issues = dimensions.flatMap((d) => d.issues);
  const antiPdf = antiPdfIssues(spec);
  const antiTemplate = antiTemplateIssues(spec);
  const avg = dimensions.reduce((acc, d) => acc + d.score, 0) / Math.max(1, dimensions.length);
  const penalty = (antiPdf.length > 0 ? 6 : 0) + (antiTemplate.length > 0 ? 4 : 0);
  const score = Math.max(0, Math.min(100, Math.round(avg - penalty)));
  return { score, dimensions, issues, antiPdf, antiTemplate };
}

// Limiar usado pelo gate de geração/refinamento.
export const PREMIUM_QA_MIN = 60;

export function qaIssuesForRefinement(spec: SpecLike): string[] {
  const qa = premiumQA(spec);
  return [
    ...qa.antiPdf.map((i) => `[anti-pdf] ${i}`),
    ...qa.antiTemplate.map((i) => `[anti-template] ${i}`),
    ...qa.issues.slice(0, 8).map((i) => `[qa] ${i}`),
  ].slice(0, 14);
}
