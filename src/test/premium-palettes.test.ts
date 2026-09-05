import { describe, it, expect } from "vitest";
import { premiumPaletteForCluster, fillPremiumColors, PREMIUM_PALETTES } from "../../supabase/functions/_shared/premium-palettes";
import { getNicheDesign } from "../../supabase/functions/_shared/niche-design";
import { componentPlanForCluster } from "../../supabase/functions/_shared/component-library";

describe("Premium Palettes (7.1 default por cluster)", () => {
  it("cada cluster tem paleta curada distinta (anti-template na origem)", () => {
    const keys = ["pet_care", "saude_bem_estar", "profissional_consultivo", "alimentacao", "automotivo", "arquitetura_design", "beleza"];
    const primaries = keys.map((k) => PREMIUM_PALETTES[k].colors.primary.toLowerCase());
    expect(new Set(primaries).size).toBeGreaterThanOrEqual(6);
  });

  it("paletas têm 8 cores válidas (contraste aplicável)", () => {
    const needed = ["primary", "on_primary", "secondary", "accent", "background", "surface", "on_surface", "muted", "border"];
    for (const key of Object.keys(PREMIUM_PALETTES)) {
      const colors = PREMIUM_PALETTES[key].colors;
      for (const n of needed) {
        expect(colors[n], `${key}.${n}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("fillPremiumColors preserva escolhas válidas e cobre lacunas com curadoria", () => {
    const incoming = { primary: "#123456", accent: "nope" };
    const out = fillPremiumColors("automotivo", incoming);
    expect(out.primary).toBe("#123456");
    expect(out.accent).toBe(PREMIUM_PALETTES.automotivo.colors.accent);
    expect(out.secondary).toBe(PREMIUM_PALETTES.automotivo.colors.secondary);
  });

  it("fallback para cluster desconhecido", () => {
    const fb = premiumPaletteForCluster("unknown");
    expect(fb.colors.primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("paleta é coerente com o plano de componentes e o cluster do niche", () => {
    // Pet shop, por exemplo, deve ter mood energético e identidade acolhedora.
    const petCluster = getNicheDesign("Pet Shop").cluster;
    expect(petCluster).toBe("pet_care");
    expect(premiumPaletteForCluster(petCluster).mood).toBe("bold");
    const advCluster = getNicheDesign("Advogados").cluster;
    expect(premiumPaletteForCluster(advCluster).mood).toBe("editorial");
    expect(componentPlanForCluster(advCluster).header).toBe("editorial");
  });
});
