import { describe, it, expect } from "vitest";
import { businessPoint, tileCoords, buildStaticMap, buildStaticMapBlock, mapsDirectionsUrl } from "../src/studio/agent-core/static-map";

const BAURU = { name: "Clinica X", address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP", latitude: -22.315, longitude: -49.06 };

describe("static-map · mapa SEM iframe (tiles + marcador) — funciona sob COEP", () => {
  it("converte lat/lng em tile e monta 2x2 com o marcador na posição exata", () => {
    const { x, y } = tileCoords(-22.315, -49.06, 15);
    expect(x).toBeGreaterThan(0);
    const map = buildStaticMap({ lat: -22.315, lng: -49.06 }, 15);
    expect(map.tiles).toHaveLength(4);
    for (const t of map.tiles) expect(t).toMatch(/^https:\/\/tile\.openstreetmap\.org\/15\/\d+\/\d+\.png$/);
    expect(map.marker.x).toBeGreaterThanOrEqual(0);
    expect(map.marker.x).toBeLessThanOrEqual(512);
    expect(map.marker.y).toBeGreaterThanOrEqual(0);
    expect(map.marker.y).toBeLessThanOrEqual(512);
  });

  it("NÃO usa iframe e inclui marcador + atribuição + botão do Google Maps", () => {
    const block = buildStaticMapBlock(BAURU)!;
    expect(block).toBeTruthy();
    expect(block).not.toMatch(/<iframe/i); // iframe é bloqueado sob COEP
    expect(block.match(/<img /g)?.length).toBe(4);
    expect(block).toContain("tile.openstreetmap.org");
    expect(block).toContain("bg-red-600"); // marcador
    expect(block).toContain("© OpenStreetMap");
    expect(block).toContain("Abrir no Google Maps");
    expect(block).toContain("google.com/maps/dir");
    expect(block).toContain("h-[320px]"); // altura definida (não colapsa)
  });

  it("sem coordenadas: bloco de endereço + rota (nunca mapa inventado)", () => {
    const block = buildStaticMapBlock({ address: "Rua A, 10", city: "Bauru", state: "SP" })!;
    expect(block).not.toMatch(/<iframe|tile\.openstreetmap/i);
    expect(block).toContain("Rua A, 10");
    expect(block).toContain("Abrir no Google Maps");
  });

  it("sem endereço nem coordenadas → null (nada é inventado)", () => {
    expect(buildStaticMapBlock({})).toBeNull();
    expect(businessPoint({ latitude: 999, longitude: 0 })).toBeNull();
    expect(businessPoint({ latitude: -22.3, longitude: -49.0 })).toEqual({ lat: -22.3, lng: -49 });
  });

  it("rota do Google usa coordenadas quando existem e endereço como fallback", () => {
    expect(decodeURIComponent(mapsDirectionsUrl(BAURU)!)).toContain("destination=-22.315,-49.06");
    const addr = mapsDirectionsUrl({ address: "Rua A, 10", city: "Bauru", state: "SP" })!;
    expect(addr).toContain("google.com/maps/dir");
    expect(decodeURIComponent(addr)).toContain("Rua A, 10, Bauru/SP");
  });
});
