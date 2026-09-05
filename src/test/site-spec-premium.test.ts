import { describe, it, expect } from "vitest";
import { normalizeSpec } from "../../src/data/siteProjects";

describe("normalizeSpec frontend preserva tokens premium (7.1)", () => {
  const raw = {
    business: { name: "Clínica Aurora", segment: "Clínicas", city: "Suzano", state: "SP" },
    design_system: {
      colors: { primary: "#14532d", on_primary: "#ffffff", secondary: "#052e16", accent: "#b45309", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#64748b", border: "#e2e8f0" },
      typography: { heading_font: "Playfair Display", body_font: "Inter" },
      layout_archetype: "editorial",
      hero_variant: "asymmetric",
      header_variant: "editorial",
      button_style: "ghost",
      cta_treatment: "inline",
      footer_style: "editorial",
      gallery_variant: "masonry",
      motion: { reveal: true, staggerCards: false, hoverLift: true, imageZoom: true, smoothScroll: true },
    },
    sections: [{ id: "hero", type: "hero" }, { id: "services", type: "services" }, { id: "contact", type: "contact" }],
    navigation: [{ label: "Serviços", anchor: "services" }],
    calls_to_action: [{ label: "Contato", type: "whatsapp", value: "5511" }],
    seo: { title: "Clínica Aurora", description: "descrição" },
  };

  it("mantém header_variant/gallery_variant/footer_style ricos e motion", () => {
    const spec = normalizeSpec(raw as never);
    expect(spec.design_system?.header_variant).toBe("editorial");
    expect(spec.design_system?.gallery_variant).toBe("masonry");
    expect(spec.design_system?.footer_style).toBe("editorial");
    expect(spec.design_system?.hero_variant).toBe("asymmetric");
    expect(spec.design_system?.button_style).toBe("ghost");
    expect(spec.design_system?.motion).toEqual({ reveal: true, staggerCards: false, hoverLift: true, imageZoom: true, smoothScroll: true });
  });

  it("descarta valores inválidos de variantes novas", () => {
    const spec = normalizeSpec({ ...raw, design_system: { ...raw.design_system, header_variant: "nope", gallery_variant: 123 } } as never);
    expect(spec.design_system?.header_variant).toBeUndefined();
    expect(spec.design_system?.gallery_variant).toBeUndefined();
  });
});
