import { describe, it, expect } from "vitest";
import {
  distanceBelow, distanceRight, overlapsX, overlapsY, overlapArea, contains,
  horizontalAlignment, proportionWidth, proportionHeight, norm, type Box, type ViewportInfo,
} from "../src/geometry";

const a = (x: number, y: number, w: number, h: number): Box => ({ x, y, width: w, height: h });

describe("geometry — bounding box / norm", () => {
  it("norm calcula right/bottom e arredonda", () => {
    const b = norm({ x: 10.12, y: 20.4, width: 100, height: 50 });
    expect(b.right).toBe(110.1);
    expect(b.bottom).toBe(70.4);
  });
  it("mantém right/bottom explícitos", () => {
    expect(norm({ x: 0, y: 0, width: 10, height: 10, right: 20, bottom: 30 })).toMatchObject({ right: 20, bottom: 30 });
  });
});

describe("geometry — distâncias", () => {
  it("distanceBelow = topo de B - fundo de A (gaps verticais)", () => {
    expect(distanceBelow(a(0, 0, 100, 50), a(0, 60, 100, 20))).toBe(10);
    expect(distanceBelow(a(0, 0, 100, 50), a(0, 40, 100, 20))).toBe(-10);
  });
  it("distanceRight = esquerda de B - direita de A (gaps horizontais)", () => {
    expect(distanceRight(a(0, 0, 100, 50), a(120, 0, 30, 10))).toBe(20);
    expect(distanceRight(a(0, 0, 100, 50), a(90, 0, 30, 10))).toBe(-10);
  });
});

describe("geometry — overlap / containment", () => {
  it("overlapsX / overlapsY detectam alcance por eixo", () => {
    expect(overlapsX(a(0, 0, 100, 100), a(50, 0, 100, 100))).toBe(true);
    expect(overlapsX(a(0, 0, 100, 100), a(200, 0, 100, 100))).toBe(false);
    expect(overlapsY(a(0, 0, 100, 100), a(0, 50, 100, 100))).toBe(true);
    expect(overlapsY(a(0, 0, 100, 100), a(0, 200, 100, 100))).toBe(false);
  });
  it("overlapArea calcula interseção em px²", () => {
    expect(overlapArea(a(0, 0, 100, 100), a(50, 50, 100, 100))).toBe(2500);
    expect(overlapArea(a(0, 0, 100, 100), a(200, 200, 10, 10))).toBe(0);
  });
  it("contains detecta elemento dentro de outro", () => {
    expect(contains(a(0, 0, 100, 100), a(10, 10, 40, 40))).toBe(true);
    expect(contains(a(0, 0, 100, 100), a(150, 10, 40, 40))).toBe(false);
  });
});

describe("geometry — alinhamento", () => {
  it("detecta mesmo left / center / right", () => {
    expect(horizontalAlignment(a(10, 0, 100, 10), a(10, 40, 80, 10))).toBe("left");
    expect(horizontalAlignment(a(0, 0, 100, 10), a(25, 0, 50, 10))).toBe("center");
    expect(horizontalAlignment(a(0, 0, 100, 10), a(20, 0, 80, 10))).toBe("right");
  });
  it("retorna null quando nada bate", () => {
    expect(horizontalAlignment(a(0, 0, 50, 10), a(200, 0, 40, 10))).toBeNull();
  });
});

describe("geometry — proporção", () => {
  const vp: ViewportInfo = { width: 1000, height: 800, deviceScaleFactor: 2 };
  it("proporção de largura/altura sobre o viewport", () => {
    expect(proportionWidth(a(0, 0, 448, 100), vp)).toBe(0.448);
    expect(proportionHeight(a(0, 0, 10, 160), vp)).toBe(0.2);
  });
  it("evita divisão por zero", () => {
    expect(proportionWidth(a(0, 0, 100, 10), { width: 0, height: 0 })).toBe(0);
  });
});
