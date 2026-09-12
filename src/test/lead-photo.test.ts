import { describe, it, expect, vi } from "vitest";
import { extractWebsiteImage, resolveWebsiteImage, enrichLeadsWithWebsiteImages } from "../../supabase/functions/_shared/lead-photo";

describe("lead-photo — imagem real do site do estabelecimento", () => {
  it("extrai og:image absoluto e relativo", () => {
    expect(extractWebsiteImage('<meta property="og:image" content="https://x/foto.jpg">', "https://site.com")).toBe("https://x/foto.jpg");
    expect(extractWebsiteImage('<meta property="og:image" content="/img/hero.png">', "https://site.com/pagina")).toBe("https://site.com/img/hero.png");
  });

  it("cai para twitter:image e para a 1ª <img> raster", () => {
    expect(extractWebsiteImage('<meta name="twitter:image" content="https://x/t.jpg">', "https://s.com")).toBe("https://x/t.jpg");
    expect(extractWebsiteImage('<img src="foto.webp">', "https://s.com/a/b")).toBe("https://s.com/a/foto.webp");
  });

  it("ignora protocolos inválidos e páginas sem imagem", () => {
    expect(extractWebsiteImage('<meta property="og:image" content="data:image/png;base64,AA">', "https://s.com")).toBeNull();
    expect(extractWebsiteImage("<html>sem imagem</html>", "https://s.com")).toBeNull();
  });

  it("resolveWebsiteImage busca e extrai (fetch mock)", async () => {
    const fetchImpl = vi.fn(async () => new Response('<meta property="og:image" content="https://x/f.jpg">', { status: 200 })) as unknown as typeof fetch;
    expect(await resolveWebsiteImage("site.com", { fetchImpl })).toBe("https://x/f.jpg");
  });

  it("resolveWebsiteImage retorna null em HTTP ruim", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await resolveWebsiteImage("site.com", { fetchImpl })).toBeNull();
  });

  it("enriquece só leads SEM foto e COM site, respeitando o orçamento", async () => {
    const leads = [
      { photoUrl: null as string | null, website: "a.com" as string | null },
      { photoUrl: "https://ja/tem.jpg" as string | null, website: "b.com" as string | null },
      { photoUrl: null as string | null, website: "c.com" as string | null },
      { photoUrl: null as string | null, website: null as string | null },
    ];
    const fetchImpl = vi.fn(async () => new Response('<meta property="og:image" content="https://x/n.jpg">', { status: 200 })) as unknown as typeof fetch;
    const r = await enrichLeadsWithWebsiteImages(leads, { fetchImpl, budget: 5, concurrency: 2 });
    expect(r.attempted).toBe(2);
    expect(r.enriched).toBe(2);
    expect(leads[0].photoUrl).toBe("https://x/n.jpg");
    expect(leads[1].photoUrl).toBe("https://ja/tem.jpg"); // não sobrescreve
    expect(leads[3].photoUrl).toBeNull();
  });
});
