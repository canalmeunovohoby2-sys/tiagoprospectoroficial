import { describe, it, expect, vi } from "vitest";
import { mapMapScraperRecords, callMapScraper, buildQueryVariants, callMapScraperVariants } from "../../supabase/functions/_shared/mapscraper";
import { normalizeGmapsResults, toPublicLeadShape, dedupeGmapsLeads } from "../../supabase/functions/_shared/gmaps";

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

describe("mapScraper — variantes de query (ampliar cobertura)", () => {
  it("gera a base + sinônimos/singular-plural, sem repetir", () => {
    const v = buildQueryVariants("pet shops", "São Paulo", "SP", 5);
    expect(v[0]).toBe("pet shops em São Paulo, SP");
    expect(v.length).toBeGreaterThan(1);
    expect(new Set(v).size).toBe(v.length);
    expect(v.join(" | ")).toMatch(/pet shop|petshop|banho e tosa/i);
  });

  it("respeita o teto de variantes", () => {
    expect(buildQueryVariants("dentistas", "Curitiba", "PR", 3)).toHaveLength(3);
  });

  it("sem cidade, devolve apenas a query base", () => {
    expect(buildQueryVariants("pet shops", "", "SP")).toHaveLength(1);
  });

  it("mescla variantes e deduplica por place_id", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const q = decodeURIComponent(url);
      const items = q.includes("pet shop em")
        ? [{ id: "p1", title: "Alfa" }, { id: "p2", title: "Beta" }]
        : [{ id: "p2", title: "Beta" }, { id: "p3", title: "Gama" }];
      return new Response(JSON.stringify(items), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await callMapScraperVariants({
      baseUrl: "https://mapscraper.test",
      variants: ["pet shop em X, SP", "petshop em X, SP"],
      maxPlacesPerVariant: 40,
      fetchImpl,
    });
    expect(out.places.map((p) => p.place_id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(out.rawCount).toBe(4);
  });
});

describe("mapScraper — variantes em concorrência controlada (performance sem perda)", () => {
  function makeFetch(delayMs = 10) {
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(String(url));
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((r) => setTimeout(r, delayMs));
        const q = decodeURIComponent(String(url));
        const n = q.includes("petshop") ? 2 : 1;
        const items = Array.from({ length: n }, (_, i) => ({ id: `p${n}-${i}`, title: `Empresa ${n}-${i}` }));
        return new Response(JSON.stringify(items), { status: 200 });
      } finally {
        inFlight--;
      }
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => calls, maxInFlight: () => maxInFlight };
  }

  const VARIANTS = [
    "pet shop em X, SP",
    "petshop em X, SP",
    "banho e tosa em X, SP",
    "loja de animais em X, SP",
    "pet shop X",
    "petshop X",
  ];

  it("consulta TODAS as variantes e respeita o teto de concorrência (sem reduzir cobertura)", async () => {
    const { fetchImpl, calls, maxInFlight } = makeFetch(15);
    const out = await callMapScraperVariants({
      baseUrl: "https://mapscraper.test",
      variants: VARIANTS,
      maxPlacesPerVariant: 40,
      fetchImpl,
      concurrency: 3,
    });
    // Todas as variantes foram consultadas exatamente 1x (nada foi cortado).
    expect(calls()).toHaveLength(VARIANTS.length);
    expect(new Set(calls()).size).toBe(VARIANTS.length);
    // Nunca mais que 3 requisições simultâneas.
    expect(maxInFlight()).toBeLessThanOrEqual(3);
    expect(maxInFlight()).toBeGreaterThan(1);
    // Resultados das variantes "petshop" (2 itens) presentes.
    expect(out.places.some((p) => p.name === "Empresa 2-0")).toBe(true);
    expect(out.places.some((p) => p.name === "Empresa 2-1")).toBe(true);
  });

  it("mesmo conjunto de place_ids e mesmo rawCount em concorrência 1 e 3", async () => {
    const serial = await callMapScraperVariants({
      baseUrl: "https://mapscraper.test",
      variants: VARIANTS,
      maxPlacesPerVariant: 40,
      fetchImpl: makeFetch(5).fetchImpl,
      concurrency: 1,
    });
    const parallel = await callMapScraperVariants({
      baseUrl: "https://mapscraper.test",
      variants: VARIANTS,
      maxPlacesPerVariant: 40,
      fetchImpl: makeFetch(5).fetchImpl,
      concurrency: 3,
    });
    expect(new Set(parallel.places.map((p) => p.place_id))).toEqual(new Set(serial.places.map((p) => p.place_id)));
    expect(parallel.rawCount).toBe(serial.rawCount);
    expect(parallel.places.length).toBe(serial.places.length);
  });

  it("falha de uma variante não descarta as que responderam (erros agregados)", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (decodeURIComponent(String(url)).includes("petshop")) return new Response("boom", { status: 502 });
      return new Response(JSON.stringify([{ id: "ok", title: "OK" }]), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await callMapScraperVariants({
      baseUrl: "https://mapscraper.test",
      variants: ["pet shop em X, SP", "petshop em X, SP"],
      maxPlacesPerVariant: 40,
      fetchImpl,
      concurrency: 2,
    });
    expect(out.places.map((p) => p.place_id)).toEqual(["ok"]);
    expect(out.errors.length).toBeGreaterThan(0);
  });
});

describe("mapScraper — FOTO real do MESMO scrape do Maps (sem API paga)", () => {
  const BIG = "https://lh3.googleusercontent.com/gps-cs-s/BIG=w408-h544-k-no";
  const SMALL = "https://lh3.googleusercontent.com/gps-cs-s/SMALL=w86-h114-k-no";

  it("mapeia thumbnail/images do record e produz photoUrl → photo_name", () => {
    const places = mapMapScraperRecords([
      {
        id: "ChIJfoto1",
        title: "Petz Guarulhos",
        address: "Av. Paulo Faccini, 900, Guarulhos - SP",
        thumbnail: BIG,
        images: [BIG, SMALL],
      },
    ]);
    expect(places[0].thumbnail).toBe(BIG);
    expect(places[0].images).toEqual([BIG, SMALL]);

    const leads = normalizeGmapsResults(places, "Guarulhos", "SP");
    expect(leads[0].photoUrl).toBe(BIG);
    const shape = toPublicLeadShape(leads[0]) as Record<string, unknown>;
    expect(shape.photo_name).toBe(BIG);
  });

  it("record sem foto continua sem photoUrl (não inventa)", () => {
    const places = mapMapScraperRecords([{ id: "ChIJsemfoto", title: "Sem Foto", address: "Rua X, 1, Bauru - SP" }]);
    expect(places[0].thumbnail).toBeNull();
    const leads = normalizeGmapsResults(places, "Bauru", "SP");
    expect(leads[0].photoUrl).toBeNull();
  });

  it("dedupe entre variantes do mesmo motor mantém 1 lead e preserva a foto", () => {
    const a = normalizeGmapsResults(mapMapScraperRecords([{ id: "ChIJdup", title: "Pet Duplicado", address: "Rua A, 10, Guarulhos - SP", thumbnail: BIG, images: [BIG] }]), "Guarulhos", "SP");
    const b = normalizeGmapsResults(mapMapScraperRecords([{ id: "ChIJdup", title: "Pet Duplicado", address: "Rua A, 10, Guarulhos - SP" }]), "Guarulhos", "SP");
    const { leads } = dedupeGmapsLeads([...a, ...b]);
    expect(leads).toHaveLength(1);
    expect(leads[0].photoUrl).toBe(BIG);
  });
});
