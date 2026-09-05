// Premium Component Library (7.1) — vocabulário de componentes, variantes e
// estratégias de composição por cluster. Não é template: a Design Directive
// escolhe a combinação; a biblioteca fornece o catálogo e as regras de coerência.
// Puro (sem Deno) — usado por generate-site (prompt), preview e Premium QA.

// ---------------- Vocabulário de variantes ----------------
export const HEADER_VARIANTS = ["solid", "glass", "floating", "editorial", "minimal", "transparent"] as const;
export type HeaderVariant = (typeof HEADER_VARIANTS)[number];

export const HERO_VARIANTS_PREMIUM = [
  "split", "centered", "editorial", "statement", "service_first",
  "asymmetric", "layered", "collage", "typography_led", "cinematic",
] as const;
export type HeroVariantPremium = (typeof HERO_VARIANTS_PREMIUM)[number];

export const BUTTON_VARIANTS = ["solid", "outline", "soft", "ghost", "text", "accent"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const CARD_TYPES = ["service", "feature", "editorial", "image", "statistic", "testimonial", "process", "product"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const IMAGE_BLOCK_VARIANTS = ["rounded", "editorial_crop", "asymmetric", "framed", "full_bleed", "overlapping", "collage"] as const;
export type ImageBlockVariant = (typeof IMAGE_BLOCK_VARIANTS)[number];

export const CTA_VARIANTS = ["band", "primary_section", "inline", "split", "image", "immersive"] as const;
export type CtaVariant = (typeof CTA_VARIANTS)[number];

export const TESTIMONIAL_VARIANTS = ["card", "editorial_quote", "horizontal", "featured"] as const;
export type TestimonialVariant = (typeof TESTIMONIAL_VARIANTS)[number];

export const STATS_VARIANTS = ["inline", "large_numbers", "cards", "editorial"] as const;
export type StatsVariant = (typeof STATS_VARIANTS)[number];

export const GALLERY_VARIANTS = ["grid", "editorial", "asymmetric", "masonry", "featured"] as const;
export type GalleryVariant = (typeof GALLERY_VARIANTS)[number];

export const FOOTER_VARIANTS = ["multi_column", "large_cta", "editorial", "dark", "minimal"] as const;
export type FooterVariant = (typeof FOOTER_VARIANTS)[number];

export const COMPOSITION_PATTERNS = [
  "asymmetric_grid", "split_layout", "overlapping_cards", "image_typography",
  "full_width_sections", "editorial_layout", "large_typography", "floating_elements",
  "broken_grid", "whitespace", "layered_composition",
] as const;
export type CompositionPattern = (typeof COMPOSITION_PATTERNS)[number];

// ---------------- Plano de componentes por cluster ----------------
export interface ComponentPlan {
  header: HeaderVariant;
  hero: HeroVariantPremium;
  button: ButtonVariant;
  cardBySection: Record<string, CardType>;
  imageBlock: ImageBlockVariant;
  cta: CtaVariant;
  testimonials: TestimonialVariant;
  stats: StatsVariant;
  gallery: GalleryVariant;
  footer: FooterVariant;
  composition: CompositionPattern[];
  imageFocus: string[]; // temas de imagem do cluster (art direction)
  heroElements: string[]; // decoração/permitidos no hero
}

// Mapa base: cada cluster tem um plano coerente e DIFERENTE dos demais.
export const CLUSTER_COMPONENT_PLAN: Record<string, ComponentPlan> = {
  pet_care: {
    header: "glass", hero: "split", button: "soft", imageBlock: "rounded",
    cardBySection: { services: "image", features: "feature", process: "process" },
    cta: "band", testimonials: "card", stats: "cards", gallery: "asymmetric", footer: "multi_column",
    composition: ["asymmetric_grid", "image_typography", "floating_elements", "whitespace"],
    imageFocus: ["grooming", "banho e tosa", "profissional cuidando do animal", "ambiente do pet shop", "atendimento", "cães e gatos em contexto comercial"],
    heroElements: ["badge local", "imagem arredondada", "card flutuante de serviço"],
  },
  saude_bem_estar: {
    header: "minimal", hero: "editorial", button: "solid", imageBlock: "rounded",
    cardBySection: { services: "service", features: "feature", process: "process" },
    cta: "primary_section", testimonials: "editorial_quote", stats: "inline", gallery: "grid", footer: "editorial",
    composition: ["whitespace", "editorial_layout", "layered_composition"],
    imageFocus: ["ambiente clínico", "profissional de saúde", "atendimento humanizado", "detalhes do ambiente"],
    heroElements: ["eyebrow", "informação de confiança", "imagem suave"],
  },
  profissional_consultivo: {
    header: "editorial", hero: "editorial", button: "ghost", imageBlock: "editorial_crop",
    cardBySection: { services: "editorial", features: "editorial", process: "editorial" },
    cta: "inline", testimonials: "editorial_quote", stats: "editorial", gallery: "editorial", footer: "editorial",
    composition: ["editorial_layout", "large_typography", "whitespace", "image_typography"],
    imageFocus: ["escritório", "arquitetura", "reunião", "detalhes sofisticados"],
    heroElements: ["eyebrow", "headline editorial", "pouca decoração"],
  },
  alimentacao: {
    header: "transparent", hero: "cinematic", button: "accent", imageBlock: "full_bleed",
    cardBySection: { services: "product", features: "feature", process: "process" },
    cta: "immersive", testimonials: "featured", stats: "cards", gallery: "masonry", footer: "dark",
    composition: ["broken_grid", "large_typography", "image_typography", "full_width_sections"],
    imageFocus: ["pratos", "ambiente do restaurante", "chef/cozinha", "mesa", "experiência gastronômica"],
    heroElements: ["fotografia apetitosa", "selo", "reserva"],
  },
  automotivo: {
    header: "solid", hero: "service_first", button: "solid", imageBlock: "framed",
    cardBySection: { services: "service", features: "statistic", process: "process" },
    cta: "band", testimonials: "horizontal", stats: "large_numbers", gallery: "grid", footer: "dark",
    composition: ["asymmetric_grid", "image_typography", "full_width_sections"],
    imageFocus: ["oficina", "mecânico", "elevador", "ferramentas", "diagnóstico", "veículo em atendimento"],
    heroElements: ["informação técnica", "CTA de orçamento"],
  },
  arquitetura_design: {
    header: "floating", hero: "asymmetric", button: "text", imageBlock: "full_bleed",
    cardBySection: { services: "editorial", features: "editorial", process: "editorial" },
    cta: "split", testimonials: "featured", stats: "editorial", gallery: "masonry", footer: "minimal",
    composition: ["broken_grid", "large_typography", "whitespace", "asymmetric_grid"],
    imageFocus: ["arquitetura", "interiores", "ambientes", "composições espaciais"],
    heroElements: ["imagem ampla", "headline editorial"],
  },
  beleza: {
    header: "minimal", hero: "split", button: "soft", imageBlock: "rounded",
    cardBySection: { services: "image", features: "feature", process: "process" },
    cta: "band", testimonials: "featured", stats: "inline", gallery: "editorial", footer: "multi_column",
    composition: ["whitespace", "layered_composition", "image_typography"],
    imageFocus: ["ambiente do salão", "profissional", "procedimento", "detalhe", "lifestyle"],
    heroElements: ["eyebrow refinado", "imagem de detalhe"],
  },
};

export const FALLBACK_COMPONENT_PLAN: ComponentPlan = {
  header: "glass", hero: "split", button: "solid", imageBlock: "rounded",
  cardBySection: { services: "service", features: "feature", process: "process" },
  cta: "band", testimonials: "card", stats: "cards", gallery: "grid", footer: "multi_column",
  composition: ["split_layout", "image_typography", "whitespace"],
  imageFocus: ["ambiente do negócio", "atendimento", "contexto comercial"],
  heroElements: ["eyebrow", "imagem contextual"],
};

// Traduz cluster -> plano (fallback "geral").
export function componentPlanForCluster(cluster: string): ComponentPlan {
  return CLUSTER_COMPONENT_PLAN[cluster] ?? FALLBACK_COMPONENT_PLAN;
}

// Mescla variantes vindas do modelo com o plano do cluster (valida + cai no plano).
export function pickVariant<T extends readonly string[]>(raw: unknown, list: T, fallback: T[number]): T[number] {
  const v = typeof raw === "string" ? raw.trim() : "";
  return (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

export function resolveComponentPlan(cluster: string, ds: Record<string, unknown> | undefined): ComponentPlan {
  const plan = componentPlanForCluster(cluster);
  if (!ds || typeof ds !== "object") return plan;
  const header = pickVariant(ds.header_variant, HEADER_VARIANTS, plan.header);
  const hero = pickVariant(ds.hero_variant, HERO_VARIANTS_PREMIUM, plan.hero);
  const button = pickVariant(ds.button_style, BUTTON_VARIANTS, plan.button);
  const cta = pickVariant(ds.cta_treatment, CTA_VARIANTS, plan.cta);
  const footer = pickVariant(ds.footer_style, FOOTER_VARIANTS, plan.footer);
  const gallery = pickVariant(ds.gallery_variant, GALLERY_VARIANTS, plan.gallery);
  return { ...plan, header, hero, button, cta, footer, gallery };
}

// Anti-template (7.3): assinatura de combinação para detectar cola entre projetos.
export function componentSignature(plan: ComponentPlan): string {
  return [
    plan.header, plan.hero, plan.button, plan.cta, plan.footer,
    plan.gallery, plan.imageBlock, plan.composition.slice(0, 2).join("+"),
  ].join("|");
}
