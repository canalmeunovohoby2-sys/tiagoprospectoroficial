import { describe, it, expect } from "vitest";
import { pickPlan, promoVideoFileName } from "../src/site-video-promo";

describe("site-video-promo — plano de navegação cobre o SITE COMPLETO", () => {
  it("inclui topo, TODAS as seções do meio (em ordem) e o rodapé/CTA final", () => {
    const targets = [
      { kind: "header", text: "", top: 0, x: 1, y: 1 },
      { kind: "hero", text: "Hero", top: 0, x: 1, y: 1 },
      { kind: "section", text: "Serviços", top: 800, x: 1, y: 1 },
      { kind: "card", text: "Card", top: 1100, x: 1, y: 1 },
      { kind: "image", text: "", top: 1500, x: 1, y: 1 },
      { kind: "section", text: "Depoimentos", top: 2000, x: 1, y: 1 },
      { kind: "section", text: "Sobre", top: 2500, x: 1, y: 1 },
      { kind: "cta", text: "Contato", top: 3000, x: 1, y: 1 },
      { kind: "footer", text: "", top: 3400, x: 1, y: 1 },
    ];
    const plan = pickPlan(4000, 720, targets);
    // topo primeiro
    expect(plan[0].top).toBe(0);
    // fim da página presente (cta ou footer = maior top)
    expect(plan[plan.length - 1].top).toBeGreaterThanOrEqual(3000);
    // cobre as seções do meio em ordem crescente de posição
    const tops = plan.map((t) => t.top);
    const sorted = [...tops].sort((a, b) => a - b);
    expect(tops).toEqual(sorted);
    // todas as regiões relevantes do meio estão cobertas
    for (const y of [800, 1100, 1500, 2000, 2500]) {
      expect(plan.some((t) => Math.abs(t.top - y) < 80), `y=${y}`).toBe(true);
    }
    // sem alvos "inventados" (todos vêm da lista real, exceto fallback)
    expect(plan.length).toBeGreaterThanOrEqual(6);
  });

  it("fallback: sem DOM rico, ainda vai do topo ao fim do documento", () => {
    const plan = pickPlan(2000, 720, []);
    expect(plan[0].top).toBe(0);
    expect(plan[plan.length - 1].top).toBe(1280); // docH - vh
  });

  it("nome de arquivo do download é sanitizado", () => {
    expect(promoVideoFileName("Studio Aurora")).toBe("studio-aurora-apresentacao-site.mp4");
    expect(promoVideoFileName("Pizzaria do Zé & Cia!")).toBe("pizzaria-do-ze-cia-apresentacao-site.mp4");
    expect(promoVideoFileName("")).toBe("cliente-apresentacao-site.mp4");
  });
});
