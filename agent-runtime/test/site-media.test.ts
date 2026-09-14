import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMapEmbedUrl, buildMapDirectionsUrl, buildSiteMediaContext, mediaContextBlock, realPhotos, stockImages,
  normalizeMapEmbedUrls, normalizeWorkspaceMapEmbeds,
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

  it("o bloco entrega o SNIPPET exato do mapa (com altura) para evitar mapa colapsado", () => {
    const block = mediaContextBlock({ name: "Clínica X", address: "Rua A, 1", city: "Bauru", state: "SP" });
    expect(block).toMatch(/COPIE ESTE SNIPPET/);
    expect(block).toContain("<iframe");
    expect(block).toContain("output=embed");
    expect(block).toContain("h-[320px]");
  });

  const CANON = "https://maps.google.com/maps?q=Av.%20Anchieta%2C%2011305%2C%20Bertioga%2FSP&z=16&output=embed";

  it("troca a URL NÃO embutível pela canônica (era o 'recusou a conexão')", () => {
    const code = `<iframe src="https://www.google.com/maps/place/Clinica+X" />`;
    expect(normalizeMapEmbedUrls(code, CANON)).toBe(`<iframe src="${CANON}" />`);
    const noEmbed = `<iframe src="https://maps.google.com/maps?q=Bauru&z=15" />`;
    expect(normalizeMapEmbedUrls(noEmbed, CANON)).toBe(`<iframe src="${CANON}" />`);
    // forma JSX com expressão (o Coder costuma usar)
    const jsx = `<iframe src={"https://www.google.com/maps/place/Bauru"} className="h-80" />`;
    expect(normalizeMapEmbedUrls(jsx, CANON)).toBe(`<iframe src={"${CANON}"} className="h-80" />`);
    const jsxSingle = `<iframe src={'https://maps.google.com/maps?q=Bauru'} className="h-80" />`;
    expect(normalizeMapEmbedUrls(jsxSingle, CANON)).toBe(`<iframe src={"${CANON}"} className="h-80" />`);
    // aspas simples: preserva o estilo de aspas original
    const singleQ = `<iframe src='https://www.google.com/maps/place/X' />`;
    expect(normalizeMapEmbedUrls(singleQ, CANON)).toBe(`<iframe src='${CANON}' />`);
  });

  it("preserva embeds já válidos (output=embed e /maps/embed?pb=)", () => {
    const ok = `<iframe src="https://maps.google.com/maps?q=Bauru&z=15&output=embed" />`;
    expect(normalizeMapEmbedUrls(ok, CANON)).toBe(ok);
    const official = `<iframe src="https://www.google.com/maps/embed?pb=!1m18!2m3" />`;
    expect(normalizeMapEmbedUrls(official, CANON)).toBe(official);
  });

  it("não mexe em outros links (WhatsApp, rota, texto comum)", () => {
    const code = `<a href="https://wa.me/5511999999999">Whats</a> <a href="https://www.google.com/maps/dir/?api=1&destination=X">Rota</a>`;
    expect(normalizeMapEmbedUrls(code, CANON)).toBe(code);
  });

  it("normaliza os arquivos do workspace e devolve os caminhos alterados", () => {
    const root = mkdtempSync(join(tmpdir(), "map-fix-"));
    try {
      writeFileSync(join(root, "App.tsx"), `<iframe src="https://maps.google.com/maps?q=Bauru" />`, "utf8");
      writeFileSync(join(root, "ok.tsx"), `<iframe src="https://maps.google.com/maps?q=Bauru&output=embed" />`, "utf8");
      const changed = normalizeWorkspaceMapEmbeds(root, { address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP" });
      expect(changed).toEqual(["App.tsx"]);
      expect(readFileSync(join(root, "App.tsx"), "utf8")).toContain("output=embed");
      expect(readFileSync(join(root, "ok.tsx"), "utf8")).toContain("output=embed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sem endereço/geo confiável não há mapa nem normalização (não inventa)", () => {
    const root = mkdtempSync(join(tmpdir(), "map-fix2-"));
    try {
      writeFileSync(join(root, "App.tsx"), `<iframe src="https://maps.google.com/maps?q=Bauru" />`, "utf8");
      expect(normalizeWorkspaceMapEmbeds(root, {})).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
