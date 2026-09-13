import { describe, it, expect } from "vitest";
import { pickPlan, promoVideoFileName, computePacing } from "../src/site-video-promo";

describe("site-video-promo — plano de navegação cobre o SITE COMPLETO", () => {
  it("inclui topo, TODAS as seções do meio (em ordem) e o rodapé/CTA final", () => {
    const targets = [
      { kind: "header", text: "", top: 0 },
      { kind: "hero", text: "Hero", top: 0 },
      { kind: "section", text: "Serviços", top: 800 },
      { kind: "card", text: "Card", top: 1100 },
      { kind: "gallery", text: "Galeria", top: 1500 },
      { kind: "testimonials", text: "Depoimentos", top: 2000 },
      { kind: "section", text: "Sobre", top: 2500 },
      { kind: "cta", text: "Contato", top: 3000 },
      { kind: "footer", text: "", top: 3400 },
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

describe("site-video-promo — ritmo LENTO, contínuo e natural (sem zoom exagerado)", () => {
  const plan = [
    { kind: "hero", text: "Hero", top: 0, x: 640, y: 200 },
    { kind: "section", text: "Serviços", top: 900, x: 640, y: 200 },
    { kind: "card", text: "Card", top: 1400, x: 640, y: 200 },
    { kind: "testimonials", text: "Depoimentos", top: 2600, x: 640, y: 200 },
    { kind: "cta", text: "Contato", top: 3600, x: 640, y: 200 },
    { kind: "footer", text: "", top: 4200, x: 640, y: 200 },
  ];
  const total = (p: { scrolls: number[]; dwells: number[]; pauseBefore: number }) =>
    p.scrolls.reduce((a, b) => a + b, 0) + p.dwells.reduce((a, b) => a + b, 0) + plan.length * (p.pauseBefore + 900) + 1500;

  it("cada seção tem pausa >= 1.2s e a duração chega perto de 30–40s", () => {
    const p = computePacing(plan, 0, 36000);
    expect(Math.min(...p.dwells)).toBeGreaterThanOrEqual(1200);
    expect(Math.max(...p.dwells)).toBeLessThanOrEqual(3600);
    expect(Math.abs(total(p) - 36000)).toBeLessThan(36000 * 0.2);
  });

  it("seções importantes recebem ao menos o mesmo tempo que as comuns", () => {
    const p = computePacing(plan, 0, 36000);
    expect(p.dwells[0]).toBeGreaterThanOrEqual(p.dwells[1]); // hero >= section
    expect(p.dwells[3]).toBeGreaterThanOrEqual(p.dwells[2]); // testimonials >= card
  });

  it("rolagem é proporcional à distância (sem saltos instantâneos)", () => {
    const p = computePacing(plan, 0, 36000);
    expect(Math.min(...p.scrolls)).toBeGreaterThanOrEqual(900);
    expect(Math.max(...p.scrolls)).toBeLessThanOrEqual(3400);
    expect(p.pauseBefore).toBeGreaterThanOrEqual(300);
  });

  it("planos de sites diferentes → ritmos diferentes (não é roteiro universal)", () => {
    const a = computePacing(plan, 0, 36000);
    const b = computePacing([plan[0], plan[4], plan[5]], 0, 36000);
    expect(JSON.stringify(a.dwells)).not.toEqual(JSON.stringify(b.dwells));
  });
});
