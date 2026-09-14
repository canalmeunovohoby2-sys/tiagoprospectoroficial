import { describe, it, expect } from "vitest";
import {
  buildMapEmbedUrl, buildMapDirectionsUrl, buildSiteMediaContext, mediaContextBlock, realPhotos, stockImages,
} from "../src/studio/agent-core/site-media";
import { CODER_SYSTEM } from "../src/studio/team";

const PHOTO_A = "https://cdn.exemplo.com/fachada.jpg";
const PHOTO_B = "https://cdn.exemplo.com/ambiente.jpg";
const STOCK = "https://images.pexels.com/photos/1/clinica.jpeg";

describe("site-media · localização/Google Maps", () => {
  it("prioriza lat/lng quando disponíveis (sem ambiguidade)", () => {
    const b = { latitude: -22.314999, longitude: -49.061111, address: "Rua X, 100", city: "Bauru", state: "SP" };
    expect(buildMapEmbedUrl(b)).toBe("https://maps.google.com/maps?q=-22.314999%2C-49.061111&z=16&output=embed");
  });

  it("usa endereço real + cidade/UF quando não há coordenadas", () => {
    const url = buildMapEmbedUrl({ address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP" });
    expect(url).toContain("https://maps.google.com/maps?q=");
    expect(decodeURIComponent(url ?? "")).toContain("Av. Anchieta, 11305, Bertioga/SP");
    expect(url).toContain("output=embed");
  });

  it("cai para cidade/UF quando não há endereço (nunca inventa endereço)", () => {
    const url = buildMapEmbedUrl({ city: "Bertioga", state: "SP" });
    expect(decodeURIComponent(url ?? "")).toContain("Bertioga/SP");
    expect(url).toContain("z=13");
  });

  it("sem nenhum dado confiável → sem mapa (não inventa)", () => {
    expect(buildMapEmbedUrl({})).toBeNull();
    expect(buildMapDirectionsUrl({})).toBeNull();
  });

  it("rota usa place_id quando presente", () => {
    const url = buildMapDirectionsUrl({ name: "Pet Amigo", city: "Bauru", state: "SP", placeId: "ChIJabc1234567890" });
    expect(url).toContain("https://www.google.com/maps/dir/?");
    expect(url).toContain("destination_place_id=ChIJabc1234567890");
  });
});

describe("site-media · fotos reais vs ilustrativas", () => {
  it("só aceita http/https e remove duplicatas e vazios", () => {
    expect(realPhotos({ photos: [PHOTO_A, PHOTO_A, "", "ftp://x", "nao-url", PHOTO_B] })).toEqual([PHOTO_A, PHOTO_B]);
  });

  it("stock nunca é confundido com foto real (mesmo se repetido)", () => {
    const media = buildSiteMediaContext({ photos: [PHOTO_A], stockImages: [STOCK, PHOTO_A] });
    expect(media.photos).toEqual([PHOTO_A]);
    expect(media.stock).toEqual([STOCK]);
    expect(stockImages({ stockImages: [STOCK, STOCK] })).toEqual([STOCK]);
  });

  it("bloco de contexto inclui as URLs reais, o iframe do mapa e as regras", () => {
    const block = mediaContextBlock({
      name: "Pet Amigo", photos: [PHOTO_A, PHOTO_B], placeId: "ChIJabc1234567890",
      address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP",
    });
    expect(block).toContain(PHOTO_A);
    expect(block).toContain(PHOTO_B);
    expect(block).toContain("https://maps.google.com/maps?q=");
    expect(block).toContain("output=embed");
    expect(block).toContain("NUNCA invente");
    expect(block).toContain("OBRIGATÓRIO");
  });

  it("bloco de contexto exige img/mapa resilientes (sem foto quebrada, mapa com fallback)", () => {
    const block = mediaContextBlock({ name: "Clínica X", photos: [PHOTO_A], address: "Rua A, 1", city: "Bauru", state: "SP" });
    expect(block).toContain('referrerPolicy="no-referrer"');
    expect(block).toContain("onError");
    expect(block).toContain("Abrir no Google Maps");
  });

  it("sem fotos reais avisa que não há — e proíbe inventar", () => {
    const block = mediaContextBlock({ name: "Sem Foto", city: "Bauru", state: "SP" });
    expect(block).toContain("nenhuma disponível");
    expect(block).toContain("NÃO invente fotos");
  });

  it("isola: cada projeto recebe SOMENTE os próprios dados", () => {
    const a = mediaContextBlock({ name: "Pet A", photos: [PHOTO_A], address: "Rua A, 1", city: "Bauru", state: "SP" });
    const b = mediaContextBlock({ name: "Pet B", photos: [PHOTO_B], address: "Rua B, 2", city: "Bertioga", state: "SP" });
    expect(a).toContain(PHOTO_A);
    expect(a).not.toContain(PHOTO_B);
    expect(a).toContain("Rua A, 1");
    expect(a).not.toContain("Rua B, 2");
    expect(b).toContain(PHOTO_B);
    expect(b).not.toContain(PHOTO_A);
  });
});

describe("site-media · padrão premium no prompt central do Coder", () => {
  it("CODER_SYSTEM exige site comercial completo e Google Maps obrigatório", () => {
    expect(CODER_SYSTEM).toMatch(/SITE COMERCIAL PREMIUM/i);
    expect(CODER_SYSTEM).toMatch(/Google Maps/i);
    expect(CODER_SYSTEM).toMatch(/OBRIGATÓRIO/i);
    expect(CODER_SYSTEM).toMatch(/NUNCA INVENTE URL/i);
    expect(CODER_SYSTEM).toMatch(/anti-"AI clichê"/i);
    expect(CODER_SYSTEM).toMatch(/NÃO invente depoimentos/i);
  });

  it("CODER_SYSTEM impede o preview em branco (sem deps novas, imports relativos, SVG inline)", () => {
    expect(CODER_SYSTEM).toMatch(/NÃO adicione dependências/i);
    expect(CODER_SYSTEM).toMatch(/lucide-react/i);
    expect(CODER_SYSTEM).toMatch(/SVG inline/i);
    expect(CODER_SYSTEM).toMatch(/RELATIVOS/i);
  });

  it("CODER_SYSTEM exige imagem/mapa que não quebram", () => {
    expect(CODER_SYSTEM).toContain('referrerPolicy="no-referrer"');
    expect(CODER_SYSTEM).toContain("onError");
    expect(CODER_SYSTEM).toMatch(/Abrir no Google Maps/);
  });
});
