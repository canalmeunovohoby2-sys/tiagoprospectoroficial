import { describe, it, expect } from "vitest";
import { validateMockupTemplate, validateManifest, isProductionReady, scoreMockup, findMockupCandidates, getMockupTemplate, diverseCandidates } from "../src/mockup-library";
import { MOCKUP_SEED } from "../src/mockup-seed";

const good = (() => {
  const t = MOCKUP_SEED[0];
  return { ...t, source: { ...t.source, licenseStatus: "commercial" as const, commercialAllowed: true, checkedAt: "2026-09-08" }, asset: { ...t.asset, path: "mockups/assets/bcd.tiff" } };
})();

describe("mockup-library — manifesto/validação (6.10)", () => {
  it("valida template válido (commercial + asset presente) como production-ready", () => {
    expect(validateMockupTemplate(good, { ids: new Set(), assetsPresent: () => true }).ok).toBe(true);
    expect(isProductionReady(good, true)).toBe(true);
  });

  it("valida template inválido e id duplicado", () => {
    const bad = { ...good, id: "" };
    expect(validateMockupTemplate(bad).ok).toBe(false);
    expect(validateMockupTemplate(good, { ids: new Set([good.id]) }).errors.some((e) => /duplicado/i.test(e))).toBe(true);
  });

  it("asset inexistente → erro (não é production-ready)", () => {
    const v = validateMockupTemplate(good, { assetsPresent: () => false });
    expect(v.errors.some((e) => /asset ausente/i.test(e))).toBe(true);
    expect(isProductionReady(good, false)).toBe(false);
  });

  it("licença desconhecida/restrita não é production-ready e gera aviso", () => {
    const unknown = { ...good, source: { ...good.source, licenseStatus: "unknown" as const, commercialAllowed: false } };
    expect(isProductionReady(unknown, true)).toBe(false);
    expect(validateMockupTemplate(unknown).warnings.some((w) => /licença não verificada/i.test(w))).toBe(true);
  });

  it("validateManifest agrega erros por id", () => {
    const res = validateManifest([good, { ...good, id: "" }]);
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe("mockup-library — score/busca/ordenação/diversidade (6.10)", () => {
  it("score prioriza target/categoria/tags exatos", () => {
    const criteria = { category: "stationery" as const, target: "business_card" as const, tags: ["corporate"] };
    const scored = MOCKUP_SEED.map((t) => scoreMockup(t, criteria));
    const best = MOCKUP_SEED[findBest(scored)];
    expect(best.application.target).toBe("business_card");
  });

  it("findMockupCandidates filtra por target e ordena por score", () => {
    const res = findMockupCandidates(MOCKUP_SEED, { target: "business_card" });
    expect(res.length).toBe(2);
    expect(res[0].id).toBe("business-card-01"); // maior score (perspective+corporate+front)
  });

  it("getMockupTemplate retorna template por id ou null", () => {
    expect(getMockupTemplate(MOCKUP_SEED, "facade-01")?.category).toBe("signage");
    expect(getMockupTemplate(MOCKUP_SEED, "nope")).toBeNull();
  });

  it("diversidade evita repetir mockups já usados (fallback para todos)", () => {
    const used = new Set<string>(["business-card-01"]);
    const res = diverseCandidates(MOCKUP_SEED, { target: "business_card" }, used);
    expect(res.some((t) => t.id === "business-card-01")).toBe(false);
  });

  it("seed (sem licença verificada) NÃO tem production-ready", () => {
    expect(MOCKUP_SEED.every((t) => isProductionReady(t, false) === false)).toBe(true);
  });
});

function findBest(scores: number[]): number {
  return scores.indexOf(Math.max(...scores));
}
