import { describe, it, expect } from "vitest";
import { getNicheDesign, buildDesignBrief } from "../../supabase/functions/_shared/niche-design";
import { getDesignDirective, defaultMotionMeta } from "../../supabase/functions/_shared/design-directive";
import { getImageNeeds, sectionImageQuery } from "../../supabase/functions/_shared/image-assets";
import { premiumScore, qualityIssues, ensureBaseContent, hasUsableImages } from "../../supabase/functions/_shared/site-quality";

// FASE 5.11-G: smoke-test do pipeline de geração para 5 segmentos reais.
// Valida que cada cluster produz spec coerente, com motion metadata, imagens e
// pontuação premium acima do mínimo (55).

const SEGMENTS = [
  { name: "Pet Shop", segment: "Pet Shop", cluster: "pet_care", imageDriven: true },
  { name: "Clínica", segment: "Clínicas", cluster: "saude_bem_estar", imageDriven: true },
  { name: "Advocacia", segment: "Advogados", cluster: "profissional_consultivo", imageDriven: false },
  { name: "Restaurante", segment: "Restaurantes", cluster: "alimentacao", imageDriven: true },
  { name: "Oficina", segment: "Oficinas", cluster: "automotivo", imageDriven: true },
];

function buildSpecFor(seg: { name: string; segment: string; cluster: string; imageDriven: boolean }) {
  const niche = getNicheDesign(seg.segment);
  const directive = getDesignDirective(seg.segment);
  const needs = getImageNeeds(seg.segment);
  const brief = buildDesignBrief(seg.segment);

  const heroImage = { url: `https://images.unsplash.com/photo-${seg.cluster}`, alt: needs.heroQuery, isIllustrative: true };
  const galleryItems = Array.from({ length: 4 }, (_, i) => ({
    image: { url: `https://images.unsplash.com/photo-${seg.cluster}-${i}`, alt: `gallery ${i}`, isIllustrative: true },
    alt: `gallery ${i}`,
  }));

  const spec = {
    sections: [
      { id: "hero", type: "hero", order: 1 },
      { id: "trust", type: "trust", order: 2 },
      { id: "services", type: "services", order: 3 },
      { id: "features", type: "features", order: 4 },
      { id: "process", type: "process", order: 5 },
      { id: "faq", type: "faq", order: 6 },
      { id: "gallery", type: "gallery", order: 7 },
      { id: "cta", type: "cta", order: 8 },
      { id: "contact", type: "contact", order: 9 },
    ],
    content: ensureBaseContent({
      hero: {
        title: `${seg.name} — ${brief.cta[0]}`,
        subtitle: niche.visualConcept.slice(0, 120),
        primary_cta: brief.cta[0],
        primary_cta_type: "whatsapp",
        primary_cta_value: "5511999999999",
        image: heroImage,
        image_note: "Imagem ilustrativa de referência.",
      },
      trust: { items: [{ text: "Atendimento humanizado" }, { text: "Qualidade garantida" }] },
      services: { title: "Serviços", subtitle: niche.tone, items: niche.recommendedSections.slice(0, 4).map((s) => ({ title: s, description: `Descrição do serviço ${s}.` })) },
      features: { items: [{ title: "Diferencial 1", description: "Destaque do cluster." }, { title: "Diferencial 2", description: "Outro destaque." }] },
      process: { title: "Como funciona", steps: [{ title: "Etapa 1", description: "Primeira etapa." }, { title: "Etapa 2", description: "Segunda etapa." }] },
      faq: { title: "Perguntas", items: [{ question: "Como agendar?", answer: "Pelo WhatsApp." }] },
      gallery: { title: "Ambiente", items: galleryItems },
      cta: { title: `Fale com o ${seg.name}`, body: "Entre em contato.", button_label: brief.cta[0] },
      contact: { title: "Contato", phone: "11900000000", whatsapp: "11900000000" },
      footer: { tagline: directive.brandPersonality },
    }),
    calls_to_action: [{ label: brief.cta[0], type: "whatsapp", value: "5511999999999" }],
    seo: { title: `${seg.name} | ${seg.segment}`, description: `${seg.segment} em São Paulo com atendimento de qualidade e confiança.` },
    design_system: {
      colors: { primary: "#0f766e", on_primary: "#ffffff", secondary: "#134e4a", accent: "#b45309", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#64748b", border: "#e2e8f0" },
      typography: { heading_font: "Plus Jakarta Sans", body_font: "Inter", heading_weight: "bold", heading_scale: "large", body_size: "normal" },
      visual_style: niche.visualConcept,
      layout_mood: "premium",
      layout_archetype: niche.layoutArchetype,
      hero_variant: niche.heroComposition,
      card_style: "bordered",
      button_style: "solid",
      navigation_style: niche.navStyle,
      cta_treatment: "band",
      footer_style: "simple",
      section_spacing: "comfortable",
      visual_density: niche.density,
      decorative_intensity: niche.decorative,
      container_width: "standard",
      radius_scale: niche.radius,
      motion: defaultMotionMeta(),
    },
  };
  return { spec, niche, directive, needs, brief };
}

describe("FASE 5.11-G: pipeline por segmento real", () => {
  for (const seg of SEGMENTS) {
    it(`cluster ${seg.cluster} gera spec premium >= 55`, () => {
      const { spec, niche, directive, needs } = buildSpecFor(seg);

      // Cluster detection
      expect(niche.cluster).toBe(seg.cluster);

      // Directive wiring
      expect(directive.displayArchetype).toBeTruthy();
      expect(directive.heroElements.length).toBeGreaterThanOrEqual(3);

      // Motion metadata
      expect(spec.design_system.motion).toEqual(defaultMotionMeta());

      // Image needs
      expect(needs.cluster).toBe(seg.cluster);
      expect(needs.imageDriven).toBe(seg.imageDriven);
      if (seg.imageDriven) {
        expect(hasUsableImages(spec)).toBe(true);
      }

      // Section queries
      expect(sectionImageQuery(seg.segment, "hero")).not.toBeNull();
      expect(sectionImageQuery(seg.segment, "gallery")).not.toBeNull();

      // Quality + premium
      const issues = qualityIssues(spec);
      expect(issues).toEqual([]);
      const score = premiumScore(spec);
      expect(score).toBeGreaterThanOrEqual(55);
    });
  }

  it("todos os clusters têm queries de seção cobrindo hero/gallery/trust/about", () => {
    for (const seg of SEGMENTS) {
      for (const s of ["hero", "gallery", "trust", "about"]) {
        expect(sectionImageQuery(seg.segment, s), `${seg.cluster}/${s}`).not.toBeNull();
      }
    }
  });

  it("clusters image-driven têm galleryCount >= 3", () => {
    for (const seg of SEGMENTS) {
      if (seg.imageDriven) {
        expect(getImageNeeds(seg.segment).galleryCount).toBeGreaterThanOrEqual(3);
      }
    }
  });
});