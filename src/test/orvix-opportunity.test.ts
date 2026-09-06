import { describe, it, expect } from "vitest";
import { computeOpportunityScore } from "@/lib/orvixOpportunityScore";
import type { Lead } from "@/data/types";

function mk(partial: Partial<Lead>): Lead {
  return {
    id: "l1", name: "Padaria Real", segment: "Padaria", city: "Guarulhos", state: "SP",
    ...partial,
  } as unknown as Lead;
}

describe("Oportunidade (5.31) — prioriza sem eliminar", () => {
  it("negócio SEM site com telefone/whatsapp ganha prioridade sobre o mesmo com site", () => {
    const semSite = computeOpportunityScore(mk({ website: null, phone: "(11) 9", whatsapp: "5511", instagram: "padariareal", reviews_count: 40, rating: 4.5 }));
    const comSite = computeOpportunityScore(mk({ website: "https://padariareal.com.br", phone: "(11) 9", whatsapp: "5511", instagram: "padariareal", reviews_count: 40, rating: 4.5 }));
    expect(semSite.score).toBeGreaterThan(comSite.score);
    expect(semSite.reasons.some((r) => /sem site/i.test(r))).toBe(true);
    expect(comSite.warnings.some((w) => /menor urgência/i.test(w))).toBe(true);
  });

  it("sem website NÃO é assumido como ótimo quando faltam sinais de negócio ativo", () => {
    const estranho = computeOpportunityScore(mk({ website: null, phone: null, whatsapp: null, instagram: null, reviews_count: 0 }));
    expect(estranho.warnings.some((w) => /confirmar se o negócio está ativo/i.test(w))).toBe(true);
  });

  it("lead com poucos campos continua pontuado (nunca descartado)", () => {
    const soNome = computeOpportunityScore(mk({ name: "Mercadinho Bom Preço", website: null }));
    expect(soNome.score).toBeGreaterThanOrEqual(0);
    expect(soNome.tier).toBeDefined();
  });

  it("contatos e instagram preservados entram como sinais positivos", () => {
    const s = computeOpportunityScore(mk({ whatsapp: "5511912345678", instagram: "mercadobompreco", reviews_count: 12, rating: 4.3 }));
    expect(s.reasons.some((r) => /whatsapp/i.test(r))).toBe(true);
    expect(s.reasons.some((r) => /instagram/i.test(r))).toBe(true);
    expect(s.reasons.some((r) => /sem site/i.test(r))).toBe(true);
  });
});
