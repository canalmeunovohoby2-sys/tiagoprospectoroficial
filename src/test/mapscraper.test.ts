import { describe, it, expect, vi } from "vitest";
import { mapMapScraperRecords, callMapScraper } from "../../supabase/functions/_shared/mapscraper";

describe("mapScraper — mapeamento para o shape compartilhado", () => {
  it("mapeia os campos do CSV do mapScraper", () => {
    const places = mapMapScraperRecords([
      {
        id: "ChIJabc",
        title: "Clínica LiveDent",
        category: "Dentista",
        address: "Rua Padre Anchieta, 2357, Curitiba - PR",
        phoneNumber: "(41) 3024-8584",
        completePhoneNumber: "+55 41 3024-8584",
        domain: "livedent.com.br",
        url: "http://www.livedent.com.br/",
        coor: "-25.4343044,-49.3017918",
        stars: 4.8,
        reviews: 34,
      },
    ]);
    expect(places).toHaveLength(1);
    const p = places[0];
    expect(p.place_id).toBe("ChIJabc");
    expect(p.name).toBe("Clínica LiveDent");
    expect(p.phone).toBe("+55 41 3024-8584");
    expect(p.website).toBe("http://www.livedent.com.br/");
    expect(p.address).toContain("Curitiba");
    expect(p.review_rating).toBe(4.8);
    expect(p.reviews_count).toBe(34);
    expect(p.category).toBe("Dentista");
    expect(p.coordinates).toEqual({ latitude: -25.4343044, longitude: -49.3017918 });
  });

  it("usa o domínio como site quando não há url e prefixa https", () => {
    const places = mapMapScraperRecords([{ id: "1", title: "Empresa X", domain: "empresax.com.br" }]);
    expect(places[0].website).toBe("https://empresax.com.br/");
  });

  it("deduplica por id e ignora nome curto", () => {
    const places = mapMapScraperRecords([
      { id: "p1", title: "Alfa" },
      { id: "p1", title: "Alfa" },
      { id: "p2", title: "B" },
    ]);
    expect(places).toHaveLength(1);
  });

  it("aceita stars/reviews como string", () => {
    const places = mapMapScraperRecords([{ id: "p", title: "Alfa", stars: "4,5", reviews: "10" }]);
    expect(places[0].review_rating).toBe(4.5);
    expect(places[0].reviews_count).toBe(10);
  });
});

describe("mapScraper — cliente HTTP", () => {
  it("chama /scrape-get e retorna places mapeados", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("/scrape-get?query=");
      expect(url).toContain("max_places=20");
      expect(url).toContain("lang=pt");
      expect(url).toContain("country=br");
      return new Response(JSON.stringify([{ id: "p1", title: "Clínica Alfa", stars: 4.9, reviews: 12 }]), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await callMapScraper({ baseUrl: "https://mapscraper.test", query: "dentistas em Curitiba, PR", maxPlaces: 20, fetchImpl });
    expect(out.error).toBeUndefined();
    expect(out.places).toHaveLength(1);
    expect(out.places[0].name).toBe("Clínica Alfa");
  });

  it("aceita resposta embrulhada em { results }", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ id: "p1", title: "Alfa" }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const out = await callMapScraper({ baseUrl: "https://mapscraper.test", query: "q", maxPlaces: 5, fetchImpl });
    expect(out.places).toHaveLength(1);
  });

  it("retorna erro em HTTP não-ok", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 502 })) as unknown as typeof fetch;
    const out = await callMapScraper({ baseUrl: "https://mapscraper.test", query: "q", maxPlaces: 5, fetchImpl });
    expect(out.places).toHaveLength(0);
    expect(out.error).toContain("HTTP 502");
  });

  it("erro explícito quando a URL não está configurada", async () => {
    const out = await callMapScraper({ baseUrl: "", query: "q", maxPlaces: 5 });
    expect(out.error).toContain("MAP_SCRAPER_URL");
  });
});
