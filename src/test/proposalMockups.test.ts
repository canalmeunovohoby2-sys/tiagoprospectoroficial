import { describe, it, expect } from "vitest";
import { planScreenshotDraw, MACBOOK, IPHONE } from "../lib/proposalMockups";

describe("proposalMockups — geometria determinística (sem IA/rede)", () => {
  it("encaixa pela largura e preserva a proporção da captura", () => {
    const p = planScreenshotDraw(MACBOOK.screen, 1366, 768, 0);
    expect(p.dx).toBe(MACBOOK.screen.x);
    expect(p.dw).toBe(MACBOOK.screen.w);
    expect(p.dh / p.dw).toBeCloseTo(768 / 1366, 5);
    // 1366x768 é mais "largo" que a tela do notebook → sem overflow.
    expect(p.dy).toBe(MACBOOK.screen.y);
  });

  it("desloca verticalmente quando a captura é mais alta que a tela", () => {
    const top = planScreenshotDraw(IPHONE.screen, 390, 4000, 0);
    const bottom = planScreenshotDraw(IPHONE.screen, 390, 4000, 1);
    expect(top.dy).toBe(IPHONE.screen.y);
    expect(bottom.dy).toBeLessThan(IPHONE.screen.y);
  });

  it("clampa offsetRatio em 0..1 (determinístico)", () => {
    const a = planScreenshotDraw(IPHONE.screen, 390, 4000, -5);
    const b = planScreenshotDraw(IPHONE.screen, 390, 4000, 99);
    expect(a.dy).toBe(IPHONE.screen.y);
    expect(b.dy).toBeLessThanOrEqual(IPHONE.screen.y);
  });

  it("frames locais têm dimensões coerentes com a área de tela", () => {
    for (const d of [MACBOOK, IPHONE]) {
      expect(d.src).toMatch(/^\/mockups\//); // asset LOCAL, nunca URL externa
      expect(d.screen.x + d.screen.w).toBeLessThanOrEqual(d.width);
      expect(d.screen.y + d.screen.h).toBeLessThanOrEqual(d.height);
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
    }
  });
});
