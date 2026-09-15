import { describe, it, expect } from "vitest";
import { businessPoint, buildStaticMap, buildStaticMapBlock, buildMapRuntimeScript, injectMapRuntimeIntoHtml, mapsDirectionsUrl } from "../src/studio/agent-core/static-map";

const BAURU = { name: "Clinica X", address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP", latitude: -22.315, longitude: -49.06 };

describe("static-map · mapa INTERATIVO sem iframe (tiles + pan/zoom) — funciona sob COEP", () => {
  it("o bloco é um contêiner interativo (sem <iframe> e sem imagem estática)", () => {
    const block = buildStaticMapBlock(BAURU)!;
    expect(block).toBeTruthy();
    expect(block).not.toMatch(/<iframe/i);
    expect(block).toContain('data-pf-map');
    expect(block).toContain('data-lat="-22.315"');
    expect(block).toContain('data-lng="-49.06"');
    expect(block).toContain('data-zoom="15"');
    expect(block).toContain('data-pf-zoom-step="1"');   // botão +
    expect(block).toContain('data-pf-zoom-step="-1"');  // botão −
    expect(block).toContain("Abrir no Google Maps");
    expect(block).toContain("© OpenStreetMap");
    expect(block).toContain("h-[320px]");
  });

  it("o runtime do mapa implementa ARRASTAR (pan), ZOOM (roda e botões) e marcador", () => {
    const js = buildMapRuntimeScript();
    expect(js).toContain("prospector-map-runtime");
    expect(js).toContain("pointerdown");       // arrastar
    expect(js).toContain("pointermove");
    expect(js).toContain("wheel");             // zoom com a roda
    expect(js).toContain("data-pf-zoom-step"); // botões +/-
    expect(js).toContain("data-pf-zoom");      // estado do zoom
    expect(js).toContain("tile.openstreetmap.org");
    expect(js).toContain("border-radius:9999px"); // marcador
    expect(js).toContain("MutationObserver");  // monta depois do React
  });

  it("injeta o runtime no index.html de forma idempotente", () => {
    const html = "<!doctype html><html><body><div id='root'></div></body></html>";
    const once = injectMapRuntimeIntoHtml(html);
    expect(once).toContain("prospector-map-runtime");
    expect(once.indexOf("prospector-map-runtime")).toBeLessThan(once.indexOf("</body>"));
    expect(injectMapRuntimeIntoHtml(once)).toBe(once); // não duplica
  });

  it("sem coordenadas: bloco de endereço + rota (nunca mapa inventado)", () => {
    const block = buildStaticMapBlock({ address: "Rua A, 10", city: "Bauru", state: "SP" })!;
    expect(block).not.toMatch(/<iframe|data-pf-map/i);
    expect(block).toContain("Rua A, 10");
    expect(block).toContain("Abrir no Google Maps");
  });

  it("sem endereço nem coordenadas → null; rota usa coordenadas e cai para endereço", () => {
    expect(buildStaticMapBlock({})).toBeNull();
    expect(businessPoint({ latitude: 999, longitude: 0 })).toBeNull();
    expect(decodeURIComponent(mapsDirectionsUrl(BAURU)!)).toContain("destination=-22.315,-49.06");
    expect(decodeURIComponent(mapsDirectionsUrl({ address: "Rua A, 10", city: "Bauru", state: "SP" })!)).toContain("Rua A, 10, Bauru/SP");
    // utilitário de tiles continua válido (usado pelo runtime)
    expect(buildStaticMap({ lat: -22.315, lng: -49.06 }, 15).tiles).toHaveLength(4);
  });
});
