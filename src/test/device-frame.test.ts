import { describe, it, expect } from "vitest";
import { fitDeviceScale } from "@/lib/studio/deviceFrame";

// BUG corrigido: Mobile/Tablet ficavam GIGANTES porque o preview AMPLIAVA o device.
describe("preview por dispositivo · nunca amplia (Mobile/Tablet no tamanho real)", () => {
  const desktop = { width: 1366, height: 768 };
  const tablet = { width: 768, height: 1024 };
  const mobile = { width: 390, height: 844 };

  it("Mobile e Tablet não são AMPLIADOS (em painel alto ficam em 1x)", () => {
    // Painel alto o bastante para o dispositivo inteiro → tamanho REAL (1x).
    expect(fitDeviceScale(1600, 1200, mobile)).toBe(1);
    expect(fitDeviceScale(1600, 1200, tablet)).toBe(1);
    expect(fitDeviceScale(900, 1100, tablet)).toBe(1);
    // Painel baixo → REDUZ para caber na altura (continua ≤ 1, nunca gigante).
    const mobileLow = fitDeviceScale(900, 700, mobile);
    expect(mobileLow).toBeCloseTo((700 - 16) / 844, 2);
    expect(mobileLow).toBeLessThan(1);
  });

  it("Desktop é REDUZIDO para caber (não corta nem distorce)", () => {
    const s = fitDeviceScale(900, 700, desktop);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo((900 - 16) / 1366, 2);
  });

  it("nunca retorna ampliação (>1) em nenhuma combinação", () => {
    for (const d of [desktop, tablet, mobile]) {
      for (const [w, h] of [[400, 300], [900, 700], [2000, 1400]] as const) {
        expect(fitDeviceScale(w, h, d)).toBeLessThanOrEqual(1);
      }
    }
  });
});
