import { describe, it, expect } from "vitest";
import { dataCompleteness, businessQuality } from "@/lib/leadCompleteness";

describe("Lead diagnóstico (5.33) — separar qualidade, completude e oportunidade", () => {
  it("ausência de WhatsApp/Instagram/site reduz completude, mas não elimina o lead", () => {
    const c = dataCompleteness({ name: "Padaria Real", phone: "(11) 9", address: "Rua X", city: "SP", state: "SP", reviews_count: 20, rating: 4.5 });
    expect(c.missing).toContain("WhatsApp");
    expect(c.missing).toContain("Instagram");
    expect(c.missing).toContain("website");
    expect(c.pct).toBeGreaterThan(0);
    expect(c.pct).toBeLessThan(100);
  });

  it("lead com muitos dados tem completude maior (mas não diz nada sobre oportunidade)", () => {
    const rico = dataCompleteness({ name: "X", phone: "1", whatsapp: "2", instagram: "ig", website: "url", address: "a", reviews_count: 5, opening_hours: ["x"] });
    const pobre = dataCompleteness({ name: "Y" });
    expect(rico.pct).toBeGreaterThan(pobre.pct);
  });

  it("qualidade reflete sinais de negócio real (avaliações/contato/localização)", () => {
    expect(businessQuality({ reviews_count: 120, rating: 4.6, phone: "1", address: "a", city: "SP", state: "SP", opening_hours: ["x"] }).label).toBe("Alta");
    expect(businessQuality({ name: "Só nome" }).label).toBe("Não avaliado");
  });
});
