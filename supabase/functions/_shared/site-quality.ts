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

// Garante que o content tenha os blocos padrão (mesmo vazios) para editabilidade.
export function ensureBaseContent(content: Record<string, unknown> | undefined): Record<string, unknown> {
  const base: Record<string, unknown> = content && typeof content === "object" ? content : {};
  for (const key of ["hero", "about", "services", "features", "numbers", "process", "faq", "trust", "cta", "contact", "footer"]) {
    if (!base[key] || typeof base[key] !== "object") base[key] = {};
  }
  return base;
}
