import { describe, it, expect } from "vitest";
import {
  componentPlanForCluster, resolveComponentPlan, componentSignature,
  CLUSTER_COMPONENT_PLAN, HEADER_VARIANTS, HERO_VARIANTS_PREMIUM,
} from "../../supabase/functions/_shared/component-library";

describe("Component Library (7.1)", () => {
  it("cada cluster tem plano distinto (anti-template na origem)", () => {
    const sigs = new Set(["pet_care", "saude_bem_estar", "profissional_consultivo", "alimentacao", "automotivo", "arquitetura_design", "beleza"]
      .map((c) => componentSignature(CLUSTER_COMPONENT_PLAN[c])));
    // Advogados (editorial) e Arquitetura compartilham espírito; os demais devem
    // divergir em pelo menos uma escolha estrutural.
    expect(sigs.size).toBeGreaterThanOrEqual(6);
  });

  it("planos por cluster respeitam o personagem do segmento", () => {
    const pet = componentPlanForCluster("pet_care");
    expect(pet.hero).toBe("split");
    expect(pet.footer).toBe("multi_column");
    expect(pet.imageFocus).toEqual(expect.arrayContaining(["grooming", "banho e tosa"]));

    const adv = componentPlanForCluster("profissional_consultivo");
    expect(adv.header).toBe("editorial");
    expect(adv.gallery).toBe("editorial");
    expect(adv.composition).toContain("editorial_layout");

    const auto = componentPlanForCluster("automotivo");
    expect(auto.hero).toBe("service_first");
    expect(auto.composition).toContain("full_width_sections");
  });

  it("fallback para cluster desconhecido", () => {
    const fb = componentPlanForCluster("xyz");
    expect(fb.hero).toBe("split");
    expect(fb.composition).toContain("whitespace");
  });

  it("resolveComponentPlan aceita variantes do modelo e valida", () => {
    const plan = resolveComponentPlan("alimentacao", {
      hero_variant: "cinematic",
      header_variant: "transparent",
      button_style: "accent",
      gallery_variant: "masonry",
      footer_style: "dark",
    });
    expect(plan.hero).toBe("cinematic");
    expect(plan.header).toBe("transparent");
    expect(plan.button).toBe("accent");
    expect(plan.footer).toBe("dark");
    expect(plan.gallery).toBe("masonry");
    // Mantém o resto do plano do cluster.
    expect(plan.imageFocus).toContain("pratos");
  });

  it("resolveComponentPlan cai no plano quando variante inválida", () => {
    const plan = resolveComponentPlan("automotivo", { hero_variant: "not-a-thing", header_variant: "wrong" });
    expect(plan.hero).toBe("service_first");
    expect(plan.header).toBe("solid");
  });

  it("vocabulário inclui variantes premium esperadas", () => {
    expect(HEADER_VARIANTS).toEqual(["solid", "glass", "floating", "editorial", "minimal", "transparent"]);
    expect(HERO_VARIANTS_PREMIUM).toContain("asymmetric");
    expect(HERO_VARIANTS_PREMIUM).toContain("cinematic");
    expect(HERO_VARIANTS_PREMIUM).toContain("typography_led");
  });

  it("planos cobrem os componentes core", () => {
    for (const c of ["pet_care", "saude_bem_estar", "profissional_consultivo", "alimentacao", "automotivo", "beleza"]) {
      const plan = CLUSTER_COMPONENT_PLAN[c];
      expect(plan.header).toBeTruthy();
      expect(plan.hero).toBeTruthy();
      expect(plan.cta).toBeTruthy();
      expect(plan.footer).toBeTruthy();
      expect(plan.composition.length).toBeGreaterThanOrEqual(3);
      expect(plan.imageFocus.length).toBeGreaterThanOrEqual(3);
    }
  });
});
