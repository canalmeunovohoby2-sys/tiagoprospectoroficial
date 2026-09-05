import { describe, it, expect } from "vitest";
import {
  premiumQA, qaIssuesForRefinement, antiPdfIssues, antiTemplateIssues,
  qualityIssues, hasUsableImages, premiumScore,
} from "../../supabase/functions/_shared/site-quality";
import { ensureBaseContent } from "../../supabase/functions/_shared/site-quality";

const baseRich = {
  sections: [
    { id: "hero", type: "hero", order: 1 },
    { id: "trust", type: "trust", order: 2 },
    { id: "about", type: "about", order: 3 },
    { id: "services", type: "services", order: 4 },
    { id: "features", type: "features", order: 5 },
    { id: "process", type: "process", order: 6 },
    { id: "gallery", type: "gallery", order: 7 },
    { id: "cta", type: "cta", order: 8 },
    { id: "contact", type: "contact", order: 9 },
  ],
  content: ensureBaseContent({
    hero: {
      title: "Clínica ortopédica referência em Suzano com atendimento humanizado",
      subtitle: "Especialistas em joelho e coluna com estrutura moderna e agendamento fácil.",
      image: { url: "https://images.pexels.com/photos/1/a.jpeg", alt: "Clínica moderna com recepção acolhedora", isIllustrative: true },
      primary_cta: "Agendar avaliação",
    },
    services: { items: [{ title: "Consulta", description: "Avaliação completa." }, { title: "Fisioterapia", description: "Sessões personalizadas." }, { title: "Ortopedia", description: "Cuidado do joelho." }] },
    features: { title: "Diferenciais", items: [{ title: "Horário estendido", description: "Até as 20h." }, { title: "Equipe qualificada", description: "Especialistas." }] },
    process: { title: "Como funciona", steps: [{ title: "Avaliação", description: "Primeira consulta." }, { title: "Tratamento", description: "Acompanhamento." }] },
    gallery: { title: "Estrutura", items: [
      { image: { url: "https://images.pexels.com/photos/2/b.jpeg", alt: "Equipamento moderno", isIllustrative: true } },
      { image: { url: "https://images.pexels.com/photos/3/c.jpeg", alt: "Profissional atendendo", isIllustrative: true } },
      { image: { url: "https://images.pexels.com/photos/4/d.jpeg", alt: "Sala de espera", isIllustrative: true } },
    ] },
    cta: { title: "Agende sua consulta hoje", body: "Fale com a nossa equipe." },
    contact: { title: "Contato", phone: "11999999999", whatsapp: "11999999999" },
    footer: { tagline: "Cuidado que respeita o seu tempo." },
    about: { title: "Sobre", body: "Instituição focada em ortopedia com atendimento humano em Suzano." },
  }),
  calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
  seo: { title: "Clínica ortopédica em Suzano", description: "Clínica ortopédica em Suzano com atendimento humanizado e agendamento fácil.", keywords: [] },
  design_system: {
    colors: { primary: "#14532d", on_primary: "#ffffff", secondary: "#052e16", accent: "#b45309", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#64748b", border: "#e2e8f0" },
    typography: { heading_font: "Plus Jakarta Sans", body_font: "Inter" },
    visual_style: "Limpo, sofisticado e acolhedor — hospitalidade clínica de alto padrão com muito espaço negativo.",
    layout_mood: "premium",
    layout_archetype: "service_focused",
    hero_variant: "split",
    header_variant: "minimal",
    card_style: "bordered",
    button_style: "solid",
    cta_treatment: "primary_section",
    footer_style: "editorial",
    gallery_variant: "grid",
    section_spacing: "comfortable",
    visual_density: "airy",
    decorative_intensity: "low",
    container_width: "standard",
    radius_scale: "medium",
    motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
  },
};

describe("Premium QA (7.3)", () => {
  it("spec rica passa com score alto e sem anti-pdf/anti-template", () => {
    const qa = premiumQA(baseRich as never);
    expect(qa.score).toBeGreaterThanOrEqual(70);
    expect(qa.antiPdf).toEqual([]);
    expect(qa.antiTemplate).toEqual([]);
    expect(qa.dimensions.length).toBeGreaterThanOrEqual(12);
  });

  it("identifica estrutura pobre estilo PDF (poucas seções, sem motion/imagem)", () => {
    const poor = {
      sections: [
        { id: "hero", type: "hero" },
        { id: "services", type: "services" },
        { id: "features", type: "features" },
        { id: "contact", type: "contact" },
      ],
      content: ensureBaseContent({
        hero: { title: "Empresa" },
        services: { items: [{ title: "A", description: "x" }, { title: "B", description: "y" }] },
        features: { items: [{ title: "C", description: "z" }, { title: "D", description: "w" }] },
        contact: { title: "Contato" },
      }),
      calls_to_action: [],
      design_system: { colors: { primary: "#0f766e" } },
    };
    const qa = premiumQA(poor as never);
    expect(qa.score).toBeLessThan(60);
    expect(qa.antiPdf.length).toBeGreaterThan(0);
    expect(qa.antiTemplate.length).toBeGreaterThan(0);
  });

  it("anti-pdf detecta paleta/estrutura padrão (template)", () => {
    const tpl = {
      sections: [
        { id: "hero", type: "hero" }, { id: "services", type: "services" }, { id: "contact", type: "contact" },
      ],
      content: ensureBaseContent({
        hero: { title: "Negócio", primary_cta: "Falar" },
        services: { items: [{ title: "A", description: "a" }, { title: "B", description: "b" }] },
        contact: { title: "Contato" },
      }),
      calls_to_action: [{ label: "Falar", type: "whatsapp", value: "5511" }],
      design_system: { colors: { primary: "#0f766e" }, layout_archetype: "", hero_variant: "" },
    };
    expect(antiTemplateIssues(tpl as never)).toContain("template: cor primária padrão do sistema — sem identidade de marca");
  });

  it("refinement expõe problemas acionáveis e limitados", () => {
    const qa = premiumQA(baseRich as never);
    const refined = qaIssuesForRefinement(baseRich as never);
    expect(Array.isArray(refined)).toBe(true);
    expect(refined.length).toBeLessThanOrEqual(14);
    // Spec rica: sem problemas => lista vazia (não força refinamento).
    expect(qa.issues.length).toBe(0);
  });

  it("quality gate existente continua estável", () => {
    expect(qualityIssues(baseRich as never)).toEqual([]);
    expect(hasUsableImages(baseRich as never)).toBe(true);
    expect(premiumScore(baseRich as never)).toBeGreaterThanOrEqual(70);
  });
});
