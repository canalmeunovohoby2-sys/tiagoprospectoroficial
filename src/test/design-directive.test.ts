import { describe, it, expect } from "vitest";
import { getDesignDirective, defaultMotionMeta, normalizeMotionMeta } from "../../supabase/functions/_shared/design-directive";
import { premiumScore, qualityScore, qualityIssues, hasUsableImages } from "../../supabase/functions/_shared/site-quality";

describe("Design Directive", () => {
  it("retorna override por cluster conhecido", () => {
    const pet = getDesignDirective("Pet Shop");
    expect(pet.displayArchetype).toContain("Pet Care");
    expect(pet.heroElements).toContain("selo local");
    expect(pet.imageLanguage).toContain("cães e gatos em contexto comercial");
  });

  it("retorna override de saúde como Clinical Premium", () => {
    const saude = getDesignDirective("Clínicas");
    expect(saude.displayArchetype).toBe("Clinical Premium");
    expect(saude.navStrategy).toContain("minimal");
  });

  it("retorna override de alimentacao com motion stagger", () => {
    const food = getDesignDirective("Restaurantes");
    expect(food.displayArchetype).toContain("Food");
    expect(food.motionLanguage).toContain("stagger");
  });

  it("retorna override de arquitetura como Architectural", () => {
    const arc = getDesignDirective("Arquitetura");
    expect(arc.displayArchetype).toContain("Architectural");
  });

  it("retorna override de automotivo", () => {
    const auto = getDesignDirective("Oficinas");
    expect(auto.displayArchetype).toBe("Automotive Performance");
    expect(auto.heroElements).toContain("CTA de orçamento");
  });

  it("retorna override de beleza", () => {
    const beauty = getDesignDirective("Salão");
    expect(beauty.displayArchetype).toBe("Beauty / Wellness Luxury");
  });

  it("retorna default para cluster desconhecido", () => {
    const fallback = getDesignDirective("Brinquedos e Games");
    expect(fallback.displayArchetype).toBe("Modern Premium");
    expect(fallback.heroElements).toContain("eyebrow");
  });

  it("todos os overrides têm heroElements com pelo menos 3 itens", () => {
    for (const seg of ["Pet Shop", "Clínicas", "Advogados", "Restaurantes", "Arquitetura", "Oficinas", "Salão"]) {
      const d = getDesignDirective(seg);
      expect(d.heroElements.length, seg).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("Motion metadata defaults", () => {
  it("defaults todos true", () => {
    const m = defaultMotionMeta();
    expect(m).toEqual({ reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true });
  });

  it("normaliza parciais com fallback", () => {
    expect(normalizeMotionMeta(undefined)).toEqual(defaultMotionMeta());
    expect(normalizeMotionMeta(null)).toEqual(defaultMotionMeta());
    expect(normalizeMotionMeta("x")).toEqual(defaultMotionMeta());
    expect(normalizeMotionMeta({ reveal: false })).toEqual({ reveal: false, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true });
    expect(normalizeMotionMeta({ reveal: false, staggerCards: false, hoverLift: true, imageZoom: false, smoothScroll: true })).toEqual({ reveal: false, staggerCards: false, hoverLift: true, imageZoom: false, smoothScroll: true });
  });

  it("ignora valores não booleanos", () => {
    const m = normalizeMotionMeta({ reveal: "yes", hoverLift: 1 });
    expect(m.reveal).toBe(true);
    expect(m.hoverLift).toBe(true);
  });
});

describe("Premium score", () => {
  // Base para testes de penalização: estruturada, com motion e imagens, mas SEM
  // bônus de SEO longo / copy longa — portanto não atinge o teto de 100.
  // Variações negativas reduzem a pontuação em relação a esta base.
  const baseSpec = {
    sections: [
      { id: "hero", type: "hero" },
      { id: "trust", type: "trust" },
      { id: "services", type: "services" },
      { id: "features", type: "features" },
      { id: "process", type: "process" },
      { id: "faq", type: "faq" },
      { id: "gallery", type: "gallery" },
      { id: "cta", type: "cta" },
      { id: "contact", type: "contact" },
    ],
    content: {
      hero: { title: "Atendimento ortopédico em Suzano", subtitle: "Especialistas em cuidado.", image: { url: "https://images.unsplash.com/photo-x", alt: "Ambiente", isIllustrative: true } },
      services: { items: [{ title: "Consulta", description: "Avaliação completa." }, { title: "Fisioterapia", description: "Sessões." }] },
      features: { items: [{ title: "Horário estendido", description: "Até as 20h." }] },
      trust: { items: [{ text: "Atendimento humanizado" }] },
      process: { title: "Como funciona", steps: [{ title: "Avaliação", description: "Primeira consulta." }] },
      faq: { title: "Perguntas", items: [{ question: "Aceitam plano?", answer: "Sim." }] },
      gallery: { title: "Ambiente", items: [{ image: { url: "https://images.unsplash.com/photo-a", alt: "A" } }, { image: { url: "https://images.unsplash.com/photo-b", alt: "B" } }, { image: { url: "https://images.unsplash.com/photo-c", alt: "C" } }] },
      cta: { title: "Agende", body: "Fale conosco." },
      contact: { title: "Contato", phone: "11900000000" },
      footer: { tagline: "Cuidado." },
    },
    calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
    seo: { title: "Clínica em Suzano", description: "Clínica ortopédica." },
    design_system: {
      colors: { primary: "#0f766e", on_primary: "#ffffff", secondary: "#134e4a", accent: "#b45309", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#64748b", border: "#e2e8f0" },
      typography: { heading_font: "Plus Jakarta Sans", body_font: "Inter" },
      layout_archetype: "service_focused", hero_variant: "split", card_style: "bordered", button_style: "solid", navigation_style: "minimal", cta_treatment: "band", footer_style: "simple",
      motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
    },
  };

  // Spec rica com copy longa e SEO completo — atinge pontuação máxima (100).
  const richSpec = {
    ...baseSpec,
    content: {
      ...baseSpec.content,
      hero: { ...baseSpec.content.hero, title: "Atendimento ortopédico humanizado no centro de Suzano", subtitle: "Especialistas em cuidado com o joelho e coluna." },
      services: { items: [{ title: "Consulta", description: "Avaliação completa do joelho e coluna." }, { title: "Fisioterapia", description: "Sessões personalizadas." }] },
      cta: { title: "Agende sua avaliação", body: "Fale com nossa equipe." },
      footer: { tagline: "Cuidado que respeita o seu tempo." },
    },
    seo: { title: "Clínica ortopédica em Suzano", description: "Clínica ortopédica em Suzano com atendimento humanizado e agendamento fácil." },
  };

  it("spec rica atinge pontuação premium alta (acima do mínimo de 55)", () => {
    const score = premiumScore(richSpec as never);
    expect(score).toBe(100);
  });

  it("spec pobre tem pontuação baixa", () => {
    const poor = {
      sections: [{ id: "hero", type: "hero" }],
      content: { hero: { title: "Oi" } },
      calls_to_action: [],
      design_system: { colors: {}, typography: {}, motion: {} },
    };
    expect(premiumScore(poor as never)).toBeLessThanOrEqual(40);
  });

  it("ausência de motion metadata penaliza", () => {
    const noMotion = { ...baseSpec, design_system: { ...baseSpec.design_system, motion: {} } };
    const withMotion = { ...baseSpec, design_system: { ...baseSpec.design_system, motion: defaultMotionMeta() } };
    expect(premiumScore(noMotion as never)).toBeLessThan(premiumScore(withMotion as never));
  });

  it("imagens na galeria somam pontos", () => {
    const noGallery = { ...baseSpec, content: { ...baseSpec.content, gallery: { ...baseSpec.content.gallery, items: [] } } };
    const withOne = { ...baseSpec, content: { ...baseSpec.content, gallery: { ...baseSpec.content.gallery, items: [{ image: { url: "https://images.unsplash.com/photo-a", alt: "A" } }] } } };
    expect(premiumScore(withOne as never)).toBeGreaterThan(premiumScore(noGallery as never));
  });

  it("hero sem imagem reduz pontuação de imagem", () => {
    const noHeroImg = { ...baseSpec, content: { ...baseSpec.content, hero: { ...baseSpec.content.hero, image: null } } };
    expect(premiumScore(noHeroImg as never)).toBeLessThan(premiumScore(baseSpec as never));
  });

  it("copy genérica reduz a pontuação (espec com about longo)", () => {
    const withAbout = {
      ...baseSpec,
      content: { ...baseSpec.content, about: { body: "Somos uma clínica ortopédica referência em Suzano com atendimento humanizado, equipe qualificada e instalações modernas para o cuidado do seu corpo." } },
    };
    const generic = {
      ...baseSpec,
      content: { ...baseSpec.content, about: { body: "Transformando sonhos em realidade. Somos uma empresa especializada em qualidade." } },
    };
    expect(premiumScore(generic as never)).toBeLessThan(premiumScore(withAbout as never));
    expect(qualityIssues(generic as never)).toContain("copy_generica: transformando sonhos em realidade");
  });

  it("qualityScore é 100 quando sem issues", () => {
    expect(qualityScore(richSpec as never)).toBe(100);
  });
});