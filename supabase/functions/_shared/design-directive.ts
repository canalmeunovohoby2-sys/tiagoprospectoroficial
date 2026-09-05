// Design Directive — direção de arte, composição, imagem, motion e ritmo.
// Combinada com a Niche Design Intelligence para orientar a geração.
// Pura (sem Deno/rede) — reutilizada no edge e em testes.

import { getNicheDesign } from "./niche-design.ts";

export interface DesignDirective {
  displayArchetype: string;
  brandPersonality: string;
  heroStrategy: string;
  heroElements: string[];
  imageLanguage: string[];
  decorativeLanguage: string;
  motionLanguage: string;
  sectionRhythm: string;
  footerStrategy: string;
  navStrategy: string;
}

const DEFAULT_DIRECTIVE: DesignDirective = {
  displayArchetype: "Modern Premium",
  brandPersonality: "Profissional, confiável e contemporâneo",
  heroStrategy: "split premium com imagem contextual forte e detalhes de confiança",
  heroElements: ["eyebrow", "headline forte", "microcopy", "CTA principal", "imagem contextual"],
  imageLanguage: ["ambiente do negócio", "atendimento", "contexto comercial"],
  decorativeLanguage: "linhas finas, eyebrows, cantos arredondados estratégicos e espaçamento generoso",
  motionLanguage: "reveal suave por seção, hover com elevação sutil, zoom leve em imagens",
  sectionRhythm: "alternar seções tipográficas, image-led e listas; nunca repetir o mesmo bloco 3x",
  footerStrategy: "marca + headline/CTA + navegação + contato em colunas com base editorial",
  navStrategy: "header sticky com glass e CTA em destaque",
};

const OVERRIDES: Record<string, Partial<DesignDirective>> = {
  pet_care: {
    displayArchetype: "Local Business Premium (Pet Care)",
    brandPersonality: "Acolhedor, confiável e premium — cuidado real com os pets, sem infantilizar",
    heroStrategy: "split premium com fotografia contextual de banho/tosa/grooming e microcopy de cuidado",
    heroElements: ["eyebrow", "headline", "microcopy de bem-estar", "CTA de agendamento", "imagem de cuidado com pet", "selo local"],
    imageLanguage: ["grooming", "banho e tosa", "profissional cuidando do animal", "ambiente do pet shop", "atendimento", "cães e gatos em contexto comercial"],
    decorativeLanguage: "curvas suaves, cantos generosos, pequenos selos e marcadores; sofisticado, nunca infantil",
    motionLanguage: "reveal suave, cards com hover elevado, zoom leve em imagens de serviço",
    sectionRhythm: "hero → trust → serviços em showcase → processo → ambiente → CTA → contato; varia composições",
    footerStrategy: "marca + CTA de agendamento + navegação + contato",
    navStrategy: "header sticky com glass e CTA de agendamento",
  },
  saude_bem_estar: {
    displayArchetype: "Clinical Premium",
    brandPersonality: "Confiança, humanização e sofisticação no cuidado",
    heroStrategy: "split ou statement suave com imagem de ambiente clínico acolhedor e prova de confiança",
    heroElements: ["eyebrow", "headline", "microcopy", "CTA de agendamento", "imagem contextual", "informação de confiança"],
    imageLanguage: ["ambiente clínico", "profissional de saúde", "atendimento humanizado", "detalhes do ambiente", "paciente em contexto profissional"],
    decorativeLanguage: "linhas finas, marcas de seção, cantos médios, muito espaço",
    motionLanguage: "reveal calmo, hover sutil, sem excessos",
    sectionRhythm: "hero → trust → serviços → diferenciais → autoridade → contato; ritmo calmo",
    footerStrategy: "marca + CTA + navegação + contato/horários",
    navStrategy: "header minimal sticky",
  },
  profissional_consultivo: {
    displayArchetype: "Editorial Premium / Corporate",
    brandPersonality: "Autoridade, sobriedade e clareza",
    heroStrategy: "editorial statement com headline forte e pouca decoração",
    heroElements: ["eyebrow", "headline editorial", "CTA de consulta", "imagem arquitetônica sobria"],
    imageLanguage: ["escritório", "arquitetura", "advogado em contexto profissional", "reunião", "detalhes sofisticados"],
    decorativeLanguage: "linhas editoriais e numerais; quase nenhum ornamento",
    motionLanguage: "transições discretas; hover com sublinhado animado",
    sectionRhythm: "hero editorial → autoridade → áreas de atuação → processo → contato",
    footerStrategy: "marca + navegação + contato, base sóbria",
    navStrategy: "header editorial com links espaçados",
  },
  alimentacao: {
    displayArchetype: "Food & Beverage / Hospitality",
    brandPersonality: "Apetitoso, marcante e experiencial",
    heroStrategy: "hero split ou statement com fotografia gastronômica apetitosa e CTA de reserva/cardápio",
    heroElements: ["eyebrow", "headline display", "microcopy", "CTA de reserva", "fotografia de prato/ambiente"],
    imageLanguage: ["pratos", "ambiente do restaurante", "chef/cozinha", "atendimento", "mesa", "experiência gastronômica"],
    decorativeLanguage: "tipografia display, formas orgânicas discretas e tratamentos de imagem expressivos",
    motionLanguage: "reveal com stagger, cards com zoom de imagem no hover",
    sectionRhythm: "hero → especiais → experiência → ambiente → reservas → contato",
    footerStrategy: "marca + navegação + contato/reserva",
    navStrategy: "header transparente sobre hero com transição ao rolar",
  },
  arquitetura_design: {
    displayArchetype: "Architectural / Editorial",
    brandPersonality: "Refinado, minimalista, com senso de projeto",
    heroStrategy: "hero editorial assimétrico com imagens grandes e whitespace",
    heroElements: ["eyebrow", "headline editorial", "CTA de projeto", "imagens amplas"],
    imageLanguage: ["arquitetura", "interiores", "ambientes", "projeto", "composições espaciais"],
    decorativeLanguage: "grid editorial e numeração; quase nenhum elemento decorativo",
    motionLanguage: "reveal editorial de imagens; micro-interações discretas",
    sectionRhythm: "hero → seleção de projetos → serviços → processo → contato",
    footerStrategy: "marca + navegação + contato em base clean",
    navStrategy: "nav boxed/minimal",
  },
  automotivo: {
    displayArchetype: "Automotive Performance",
    brandPersonality: "Robusto, objetivo, técnico e confiável",
    heroStrategy: "split técnico com imagem de oficina/veículo e CTA de orçamento forte",
    heroElements: ["eyebrow técnico", "headline forte", "CTA de orçamento", "imagem da oficina", "informações de serviço"],
    imageLanguage: ["oficina", "mecânico", "elevador", "ferramentas", "diagnóstico", "detalhamento", "veículo em atendimento"],
    decorativeLanguage: "linhas e elementos técnicos; contraste alto",
    motionLanguage: "micro-interações rápidas; hovers com resposta imediata",
    sectionRhythm: "hero → serviços técnicos → processo → vantagens → contato",
    footerStrategy: "marca + navegação + contato + localização",
    navStrategy: "header direto com CTA",
  },
  beleza: {
    displayArchetype: "Beauty / Wellness Luxury",
    brandPersonality: "Sofisticado, elegante e pessoal",
    heroStrategy: "split elegante com imagem de ambiente/resultado e CTA de agendamento",
    heroElements: ["eyebrow", "headline refinado", "CTA de agendamento", "imagem de ambiente/detalhe"],
    imageLanguage: ["ambiente do salão", "profissional", "procedimento", "detalhe", "lifestyle"],
    decorativeLanguage: "cantos generosos, tons neutros, marcas finas",
    motionLanguage: "transições suaves e hover refinado",
    sectionRhythm: "hero → serviços → experiência → depoimentos (quando real) → contato",
    footerStrategy: "marca + navegação + contato",
    navStrategy: "header minimal/centered",
  },
};

export function getDesignDirective(segment: string): DesignDirective {
  const cluster = getNicheDesign(segment).cluster;
  return { ...DEFAULT_DIRECTIVE, ...(OVERRIDES[cluster] ?? {}) };
}

export interface MotionMeta {
  reveal: boolean;
  staggerCards: boolean;
  hoverLift: boolean;
  imageZoom: boolean;
  smoothScroll: boolean;
}

export function defaultMotionMeta(): MotionMeta {
  return { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true };
}

export function normalizeMotionMeta(raw: unknown): MotionMeta {
  const base = defaultMotionMeta();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const pick = (k: string, d: boolean): boolean => (typeof r[k] === "boolean" ? (r[k] as boolean) : d);
  return {
    reveal: pick("reveal", base.reveal),
    staggerCards: pick("staggerCards", base.staggerCards),
    hoverLift: pick("hoverLift", base.hoverLift),
    imageZoom: pick("imageZoom", base.imageZoom),
    smoothScroll: pick("smoothScroll", base.smoothScroll),
  };
}
