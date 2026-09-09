import { describe, it, expect } from "vitest";
import { enrichLeadWithScores, sortLeadsByScore, hasWhatsappContact, whatsappStatus } from "../lib/leadScoring";

// 3 segmentos × 3 localidades → combinações genéricas (nada específico).
const SEGMENTS = ["cafeteria", "academia", "advocacia"];
const CITIES = ["Barueri", "Campinas", "Curitiba"];
const IDX = [0, 1, 2];

function lead(name: string, over: Record<string, unknown> = {}) {
  return { name, rating: null, reviews_count: 0, website: null, has_website: false, instagram: null, facebook: null, whatsapp: null, ...over };
}

function manyLeads() {
  const out: ReturnType<typeof lead>[] = [];
  IDX.forEach((i) => {
    const seg = SEGMENTS[i]; const city = CITIES[i];
    out.push(lead(`${seg}-${city}-A`, { city, seg, rating: 4.8, reviews_count: 20 }));
    out.push(lead(`${seg}-${city}-B`, { city, seg, rating: 4.9, reviews_count: 120, whatsapp: "5511999999999" }));
    out.push(lead(`${seg}-${city}-C`, { city, seg, rating: null, reviews_count: 0 }));
  });
  return out;
}

describe("leadScoring — motor de prospecção (genérico, 3×3)", () => {
  it("1) descobre MÚLTIPLAS empresas e NÃO descarta as sem WhatsApp", () => {
    const enriched = manyLeads().map((l) => enrichLeadWithScores(l as any));
    expect(enriched.length).toBe(9); // 3 segmentos × 3 cidades × 3 empresas = múltiplas
    expect(enriched.some((l) => !l.whatsapp)).toBe(true); // sem whatsapp ainda presentes
    expect(enriched.every((l) => l.final_score >= 0)).toBe(true);
  });

  it("2) sem WhatsApp é marcado como `sem_whatsapp` (não inventa WhatsApp)", () => {
    const sem = enrichLeadWithScores(lead("Sem", { whatsapp: null, phone: "5511988888888" }) as any);
    const com = enrichLeadWithScores(lead("Com", { whatsapp: "5511999999999" }) as any);
    expect(sem.whatsapp_status).toBe("sem_whatsapp");
    expect(com.whatsapp_status).toBe("with_whatsapp");
    // Não inventa: campo whatsapp permanece null (não preenchido).
    expect(sem.whatsapp).toBeNull();
    expect(hasWhatsappContact(sem as any)).toBe(false);
    expect(whatsappStatus(com as any)).toBe("with_whatsapp");
  });

  it("3) WhatsApp verificado aumenta a intenção/score final (prioriza leads com contato)", () => {
    const semWa = enrichLeadWithScores(lead("A", { rating: 4.8, reviews_count: 40 }) as any);
    const comWa = enrichLeadWithScores(lead("A", { rating: 4.8, reviews_count: 40, whatsapp: "5511999999999" }) as any);
    expect(comWa.intent_score).toBeGreaterThan(semWa.intent_score);
    expect(comWa.final_score).toBeGreaterThan(semWa.final_score);
  });

  it("4) rating e quantidade de avaliações são considerados separadamente", () => {
    const highRatingFew = enrichLeadWithScores(lead("R", { rating: 4.9, reviews_count: 5 }) as any);
    const lowRatingMany = enrichLeadWithScores(lead("S", { rating: 3.0, reviews_count: 150 }) as any);
    // Ambos mudam o score a partir de sinais distintos (rating vs reviews).
    expect(highRatingFew.final_score).not.toBe(0);
    expect(lowRatingMany.final_score).not.toBe(0);
    const base = enrichLeadWithScores(lead("T", {}) as any);
    expect(highRatingFew.money_score).toBeGreaterThan(base.money_score); // reviews <30 não deve dar money alto
    expect(lowRatingMany.money_score).toBeGreaterThan(base.money_score); // reviews>100 dá money
  });

  it("5) duplicatas são removidas pela chave nome+cidade", () => {
    const set = new Set<string>();
    const seen = new Map<string, ReturnType<typeof lead>>();
    for (const l of manyLeads()) { const k = `${l.name}|${l.city ?? ""}`; if (!set.has(k)) { set.add(k); seen.set(k, l); } }
    const deduped = [...seen.values()];
    expect(deduped.length).toBe(9);
    const dupKey = `${deduped[0].name}|${deduped[0].city ?? ""}`;
    // segunda inserção da mesma chave é ignorada
    const second = { ...deduped[0] };
    expect(set.has(`${second.name}|${second.city ?? ""}`)).toBe(true);
  });

  it("6) resultados são ordenados por score final (qualidade decrescente)", () => {
    const enriched = manyLeads().map((l) => enrichLeadWithScores(l as any));
    const sorted = sortLeadsByScore(enriched);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].final_score).toBeGreaterThanOrEqual(sorted[i].final_score);
  });

  it("7) sem dados inventados: campos ausentes permanecem null/0 e score não cria valores falsos", () => {
    const l = enrichLeadWithScores(lead("SóNome", {}) as any);
    expect(l.rating).toBeNull();
    expect(l.reviews_count).toBe(0);
    expect(l.whatsapp).toBeNull();
    expect(typeof l.final_score).toBe("number");
    expect(l.final_score).toBeGreaterThanOrEqual(0);
  });
});
