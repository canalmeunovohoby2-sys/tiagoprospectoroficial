import { describe, it, expect } from "vitest";
import { getNicheDesign, suggestedSections, buildDesignBrief } from "../../supabase/functions/_shared/niche-design";
import { qualityIssues, ensureBaseContent, qualityScore } from "../../supabase/functions/_shared/site-quality";

describe("Niche Design Intelligence", () => {
  it("detecta cluster por segmento", () => {
    expect(getNicheDesign("Clínicas").cluster).toBe("saude_bem_estar");
    expect(getNicheDesign("Advogados").cluster).toBe("profissional_consultivo");
    expect(getNicheDesign("Restaurantes").cluster).toBe("alimentacao");
    expect(getNicheDesign("Arquitetura").cluster).toBe("arquitetura_design");
    expect(getNicheDesign("Oficinas").cluster).toBe("automotivo");
  });

  it("fallback genérico para nicho desconhecido", () => {
    expect(getNicheDesign("Brinquedos e Games").cluster).toBe("geral");
  });

  it("sugere seções por nicho (diferentes entre nichos)", () => {
    const saude = suggestedSections("Clínicas");
    const juridico = suggestedSections("Advogados");
    expect(saude.length).toBeGreaterThan(0);
    expect(saude).not.toEqual(juridico);
    expect(juridico).toContain("process");
  });

  it("design brief expõe conceito/cores/CTA coerentes", () => {
    const brief = buildDesignBrief("Oficinas");
    expect(brief.objectives.length).toBeGreaterThan(0);
    expect(brief.colors[0].toLowerCase()).toContain("grafite");
    expect(brief.cta[0]).toContain("orçamento");
    expect(brief.layout).toContain("service_focused");
  });
});

describe("Quality Gate (anti-generic)", () => {
  const richSpec = {
    sections: [
      { id: "hero", type: "hero" },
      { id: "trust", type: "trust" },
      { id: "services", type: "services" },
      { id: "features", type: "features" },
      { id: "cta", type: "cta" },
      { id: "contact", type: "contact" },
    ],
    content: {
      hero: { title: "Atendimento ortopédico humanizado no centro de Suzano", subtitle: "Especialistas em cuidado com o joelho e coluna." },
      services: { items: [{ title: "Consulta", description: "Avaliação completa." }] },
      features: { items: [{ title: "Horário estendido", description: "Atendemos até as 20h." }] },
      trust: { items: [{ text: "Atendimento humanizado" }] },
      cta: { title: "Agende sua avaliação", body: "Fale com nossa equipe." },
      contact: { title: "Contato" },
      footer: { tagline: "Cuidado que respeita o seu tempo." },
    },
    calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
    seo: { title: "Clínica | Suzano", description: "Clínica ortopédica em Suzano com atendimento humanizado." },
  };

  it("spec rica passa sem issues", () => {
    expect(qualityIssues(richSpec)).toEqual([]);
    expect(qualityScore(richSpec)).toBe(100);
  });

  it("spec pobre é reprovada", () => {
    const poor = {
      sections: [{ id: "hero", type: "hero" }],
      content: { hero: { title: "" } },
      calls_to_action: [],
    };
    const issues = qualityIssues(poor);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("copy genérica é detectada", () => {
    const bad = {
      ...richSpec,
      content: {
        ...richSpec.content,
        about: { body: "Transformando sonhos em realidade. Somos uma empresa especializada em qualidade." },
      },
    };
    expect(qualityIssues(bad)).toContain("copy_generica: transformando sonhos em realidade");
  });

  it("ensureBaseContent preserva blocos e completa vazios", () => {
    const out = ensureBaseContent({ hero: { title: "X" } });
    expect(out.hero).toEqual({ title: "X" });
    expect(out.faq).toEqual({});
    expect(out.services).toEqual({});
  });
});
