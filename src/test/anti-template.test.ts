import { describe, it, expect } from "vitest";
import { buildSiteHtml } from "../../src/lib/siteExportCore";
import { componentSignature, CLUSTER_COMPONENT_PLAN, componentPlanForCluster } from "../../supabase/functions/_shared/component-library";

// Anti-template: dois segmentos diferentes NÃO podem produzir o mesmo layout.
function heroClassOf(html: string): string {
  const m = html.match(/<section id="top" class="hero[^"]*"/);
  return m ? m[0] : "sem hero";
}

const baseSpec = (heroVariant: string, layoutArchetype: string, heading: string) => ({
  business: { name: "Negócio Teste", segment: "x", city: "Cidade", state: "SP" },
  design_system: {
    colors: { primary: "#123456", on_primary: "#ffffff", secondary: "#112233", accent: "#d97706", background: "#ffffff", surface: "#ffffff", on_surface: "#111111", muted: "#666666", border: "#eeeeee" },
    typography: { heading_font: heading, body_font: "Inter" },
    visual_style: "Teste", layout_mood: "minimal", layout_archetype: layoutArchetype, hero_variant: heroVariant,
    card_style: "bordered", button_style: "solid", navigation_style: "minimal", cta_treatment: "band", footer_style: "editorial",
    motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
  },
  sections: [{ id: "hero", type: "hero" }, { id: "services", type: "services" }, { id: "cta", type: "cta" }, { id: "contact", type: "contact" }],
  content: {
    hero: { title: "Hero teste", subtitle: "sub", primary_cta: "Ação", primary_cta_type: "whatsapp", primary_cta_value: "55", image: { url: "https://img.example.com/a.jpg", alt: "foto", isIllustrative: true } },
    services: { title: "Serviços", items: [{ title: "A", description: "a" }] },
    cta: { title: "Fale", body: "agora" },
    contact: { title: "Contato", phone: "(11) 99999-0000", whatsapp: "(11) 99999-0000" },
    footer: { tagline: "tag" },
  },
  calls_to_action: [{ label: "Ação", type: "whatsapp", value: "55" }],
  seo: { title: "t", description: "d", keywords: [] },
  navigation: [],
  pages: { home: true },
});

describe("Anti-template entre segmentos (7.1+)", () => {
  it("hero variants diferentes geram composições de HTML distintas", () => {
    const cinematic = buildSiteHtml(baseSpec("cinematic", "bold", "A") as never, {});
    const asymmetric = buildSiteHtml(baseSpec("asymmetric", "editorial", "B") as never, {});
    const editorial = buildSiteHtml(baseSpec("editorial", "editorial", "C") as never, {});
    const centered = buildSiteHtml(baseSpec("centered", "minimal", "D") as never, {});
    expect(heroClassOf(cinematic)).toContain("cinematic");
    expect(heroClassOf(asymmetric)).toContain("asymmetric");
    expect(heroClassOf(editorial)).toContain("editorial");
    expect(heroClassOf(centered)).toContain("hero ");
    const classes = new Set([heroClassOf(cinematic), heroClassOf(asymmetric), heroClassOf(editorial)]);
    expect(classes.size).toBeGreaterThanOrEqual(3);
  });

  it("planos de componentes por cluster diferem (assinatura)", () => {
    const sigs = new Set([
      componentSignature(componentPlanForCluster("pet_care")),
      componentSignature(componentPlanForCluster("alimentacao")),
      componentSignature(componentPlanForCluster("profissional_consultivo")),
      componentSignature(componentPlanForCluster("saude_bem_estar")),
      componentSignature(componentPlanForCluster("automotivo")),
    ]);
    expect(sigs.size).toBeGreaterThanOrEqual(5);
    expect(CLUSTER_COMPONENT_PLAN.pet_care.hero).not.toBe(CLUSTER_COMPONENT_PLAN.alimentacao.hero);
  });
});
