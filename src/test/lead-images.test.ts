import { describe, it, expect } from "vitest";
import {
  resolveAbsoluteUrl,
  isAllowedImageHost,
  extractOgImage,
  extractMainImage,
  extractLogoUrl,
  extractWikimediaFileName,
  wikimediaFilePath,
  pickLeadImage,
} from "../../supabase/functions/_shared/lead-images";
import { TtlCache, cacheKey } from "../../supabase/functions/_shared/ttl-cache";

describe("lead-images — pipeline gratuito de imagem", () => {
  it("extrai og:image do site oficial", () => {
    const html = `<html><head><meta property="og:image" content="https://loja.com/img/hero.jpg"></head></html>`;
    expect(extractOgImage(html, "https://loja.com")).toBe("https://loja.com/img/hero.jpg");
  });

  it("resolve og:image relativa", () => {
    const html = `<meta property="og:image" content="/media/foto.png">`;
    expect(extractOgImage(html, "https://loja.com/pagina")).toBe("https://loja.com/media/foto.png");
  });

  it("fallback para imagem principal quando não há og:image", () => {
    const html = `<body><img src="https://loja.com/logo.png"><img src="https://loja.com/produto.jpg" alt="x"></body>`;
    expect(extractOgImage(html, "https://loja.com")).toBeNull();
    expect(extractMainImage(html, "https://loja.com")).toBe("https://loja.com/produto.jpg");
  });

  it("fallback para logo/favicon como último recurso", () => {
    const html = `<head><link rel="apple-touch-icon" href="/apple.png"></head><body></body>`;
    expect(extractLogoUrl(html, "https://loja.com")).toBe("https://loja.com/apple.png");
  });

  it("rejeita imagem de domínio externo (ads/stock/outro estabelecimento)", () => {
    expect(isAllowedImageHost("https://ads.adnetwork.com/banner.jpg", "https://loja.com")).toBe(false);
    expect(isAllowedImageHost("https://cdn.unsplash.com/foto.jpg", "https://loja.com")).toBe(false);
    const picked = pickLeadImage({ siteUrl: "https://loja.com", og: "https://ads.adnetwork.com/banner.jpg" });
    expect(picked).toBeNull();
  });

  it("aceita imagem do próprio domínio (subdomínio incluído)", () => {
    expect(isAllowedImageHost("https://cdn.loja.com/a.jpg", "https://www.loja.com")).toBe(true);
    expect(isAllowedImageHost("https://loja.com/a.jpg", "https://loja.com")).toBe(true);
  });

  it("resolve imagem do Wikimedia Commons a partir da tag OSM", () => {
    expect(extractWikimediaFileName({ wikimedia_commons: "File:Praca_Bauru.jpg" })).toBe("Praca_Bauru.jpg");
    expect(extractWikimediaFileName({ wikimedia_commons: "Category:Pracas" })).toBeNull();
    const url = wikimediaFilePath("File:Praca Bauru.jpg", 800);
    expect(url).toContain("Special:FilePath/Praca_Bauru.jpg");
    expect(url).toContain("width=800");
  });

  it("Wikimedia tem prioridade sobre o site", () => {
    const picked = pickLeadImage({
      siteUrl: "https://loja.com",
      wikimediaFileName: "Foto.jpg",
      og: "https://loja.com/og.jpg",
    });
    expect(picked?.source).toBe("wikimedia");
  });

  it('sem candidato seguro → null ("Sem imagem")', () => {
    expect(pickLeadImage({ siteUrl: "https://loja.com" })).toBeNull();
    expect(pickLeadImage({ siteUrl: null, og: "https://x.com/a.jpg" })).toBeNull();
  });

  it("resolveAbsoluteUrl bloqueia protocolos não-http", () => {
    expect(resolveAbsoluteUrl("data:image/png;base64,AAAA", "https://x.com")).toBeNull();
    expect(resolveAbsoluteUrl("javascript:alert(1)", "https://x.com")).toBeNull();
    expect(resolveAbsoluteUrl("https://x.com/a.jpg", "https://x.com")).toBe("https://x.com/a.jpg");
  });
});

describe("ttl-cache", () => {
  it("guarda e expira valores", async () => {
    const cache = new TtlCache<number>(40, 10);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get("a")).toBeUndefined();
  });

  it("respeita o teto de entradas (não cresce infinito)", () => {
    const cache = new TtlCache<number>(10_000, 3);
    cache.set("a", 1); cache.set("b", 2); cache.set("c", 3); cache.set("d", 4);
    expect(cache.size).toBeLessThanOrEqual(3);
  });

  it("cacheKey é estável para entradas equivalentes", () => {
    expect(cacheKey("Dentistas", "Bauru", "SP")).toBe(cacheKey("  dentistas ", "bauru", "sp"));
  });

  it("evita repetição (segunda leitura não recalcula)", () => {
    const cache = new TtlCache<number>(10_000);
    let calls = 0;
    const expensive = (k: string) => {
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      calls++;
      const v = calls;
      cache.set(k, v);
      return v;
    };
    expect(expensive("k")).toBe(1);
    expect(expensive("k")).toBe(1);
    expect(calls).toBe(1);
  });
});
