import { describe, it, expect, vi } from "vitest";
import {
  normalizeGmapsResults,
  dedupeGmapsLeads,
  validateGmapsLeads,
  sortGmapsByPriority,
  priorityScore,
  toPublicLeadShape,
  selectLeadImage,
  callGmapsScraper,
} from "../../supabase/functions/_shared/gmaps";

describe("gmaps — normalização", () => {
  it("mapeia campos e valida telefone BR", () => {
    const leads = normalizeGmapsResults(
      [
        {
          title: "Escritório Exemplo",
          category: "Advogado",
          phone: "+55 14 3243-8321",
          website: "https://exemplo.com.br",
          address: "Rua A, 100, Bauru",
          review_rating: 4.6,
          review_count: 87,
          latitude: -22.31,
          longitude: -49.06,
          place_id: "ChIJabc",
          emails: ["contato@exemplo.com.br"],
        },
      ],
      "Bauru",
      "SP",
    );
    expect(leads).toHaveLength(1);
    const l = leads[0];
    expect(l.sourceId).toBe("ChIJabc");
    expect(l.name).toBe("Escritório Exemplo");
    expect(l.phone).toBe("+55 14 3243-8321");
    expect(l.email).toBe("contato@exemplo.com.br");
    expect(l.rating).toBe(4.6);
    expect(l.reviews).toBe(87);
    expect(l.city).toBe("Bauru");
    expect(l.state).toBe("SP");
    expect(l.priority).toBeGreaterThan(0);
  });

  it("descarta telefone inválido e usa cid como fallback de sourceId", () => {
    const leads = normalizeGmapsResults(
      [{ title: "Loja X", phone: "123", cid: "998877" }],
      "Bauru",
      "SP",
    );
    expect(leads[0].phone).toBeNull();
    expect(leads[0].sourceId).toBe("998877");
  });

  it("ignora registros sem nome", () => {
    expect(normalizeGmapsResults([{ title: "" }, { name: "" }], "Bauru", "SP")).toHaveLength(0);
  });

  it("extrai email de string", () => {
    const leads = normalizeGmapsResults([{ title: "Padaria Dois", emails: "fale conosco: x@y.com.br" }], "Bauru", "SP");
    expect(leads[0].email).toBe("x@y.com.br");
  });

  it("aceita o formato real do fork (name/rating/reviews_count/coordinates/categories)", () => {
    const leads = normalizeGmapsResults(
      [
        {
          name: "MoselloLima Advocacia",
          place_id: "ChIJxyz",
          coordinates: { latitude: 47.6062, longitude: -122.3321 },
          rating: 4.7,
          reviews_count: 210,
          categories: ["Advogado", "Escritório"],
          phone: "1432438321",
          website: "https://www.mosellolima.com.br/",
        },
      ],
      "Bauru",
      "SP",
    );
    const l = leads[0];
    expect(l.name).toBe("MoselloLima Advocacia");
    expect(l.rating).toBe(4.7);
    expect(l.reviews).toBe(210);
    expect(l.lat).toBe(47.6062);
    expect(l.lng).toBe(-122.3321);
    expect(l.category).toBe("Advogado");
  });
});

describe("gmaps — deduplicação (ordem ID → telefone → nome+rua → nome+cidade → coords)", () => {
  const base = { source: "google_maps_scraper" as const, city: "Bauru", state: "SP", priority: 0, reasons: [], raw: {} };

  it("deduplica por sourceId", () => {
    const leads = [
      { ...base, sourceId: "p1", name: "Alfa", phone: null, website: null, email: null, address: null, city: "Bauru", state: "SP", lat: null, lng: null, category: null, rating: null, reviews: 0, priority: 10 },
      { ...base, sourceId: "p1", name: "Alfa Dois", phone: null, website: null, email: null, address: null, city: "Bauru", state: "SP", lat: null, lng: null, category: null, rating: null, reviews: 0, priority: 5 },
    ];
    const { leads: out, removed } = dedupeGmapsLeads(leads);
    expect(out).toHaveLength(1);
    expect(removed[0].reason).toBe("source_id");
  });

  it("deduplica por telefone mantendo o registro mais completo", () => {
    const leads = normalizeGmapsResults(
      [
        { title: "Alfa", place_id: "p1", phone: "1432438321" },
        { title: "Alfa", place_id: "p2", phone: "+55 14 3243-8321", website: "https://a.com" },
      ],
      "Bauru",
      "SP",
    );
    const { leads: out } = dedupeGmapsLeads(leads);
    expect(out).toHaveLength(1);
    expect(out[0].website).toBe("https://a.com");
  });

  it("deduplica por nome+rua", () => {
    const leads = [
      { ...base, sourceId: "p1", name: "Empresa Teste", phone: null, website: null, email: null, address: "Rua das Flores, 10", city: "Bauru", state: "SP", lat: null, lng: null, category: null, rating: null, reviews: 0 },
      { ...base, sourceId: "p2", name: "empresa teste", phone: null, website: null, email: null, address: "Rua das Flores, 99", city: "Bauru", state: "SP", lat: null, lng: null, category: null, rating: null, reviews: 0 },
    ];
    const { leads: out, removed } = dedupeGmapsLeads(leads);
    expect(out).toHaveLength(1);
    expect(removed[0].reason).toBe("name+street");
  });

  it("deduplica por coordenadas", () => {
    const leads = [
      { ...base, sourceId: "p1", name: "A", phone: null, website: null, email: null, address: null, city: null, state: "SP", lat: -22.314999, lng: -49.061111, category: null, rating: null, reviews: 0 },
      { ...base, sourceId: "p2", name: "B", phone: null, website: null, email: null, address: null, city: null, state: "SP", lat: -22.314998, lng: -49.061112, category: null, rating: null, reviews: 0 },
    ];
    const { leads: out, removed } = dedupeGmapsLeads(leads);
    expect(out).toHaveLength(1);
    expect(removed[0].reason).toBe("coordinates");
  });
});

describe("gmaps — validação", () => {
  it("remove empresa não operacional e cidade divergente", () => {
    const leads = normalizeGmapsResults(
      [
        { title: "Empresa Encerrada Ltda", place_id: "p1" },
        { title: "Empresa Boa", place_id: "p2" },
      ],
      "Bauru",
      "SP",
    );
    // Força cidade divergente num dos registros.
    leads[1].city = "Campinas";
    const { leads: out, rejected } = validateGmapsLeads(leads, "Bauru", "SP");
    expect(out).toHaveLength(0);
    expect(rejected.some((r) => r.reason.includes("não operacional"))).toBe(true);
    expect(rejected.some((r) => r.reason.includes("cidade"))).toBe(true);
  });
});

describe("gmaps — priorização", () => {
  it("calcula score 0-100 conforme os pesos", () => {
    const { score } = priorityScore({
      phone: "1432438321",
      website: "https://x.com",
      rating: 4.5,
      reviews: 60,
      address: "Rua A, 1, Bauru",
      lat: -22.31,
      lng: -49.06,
    });
    expect(score).toBe(90);
  });

  it("ordena por score desc e nome", () => {
    const a = normalizeGmapsResults([{ title: "Beta", place_id: "1", phone: "1432438321" }], "Bauru", "SP")[0];
    const b = normalizeGmapsResults([{ title: "Alfa", place_id: "2", phone: "1432438321", website: "https://a.com", review_rating: 4.9, review_count: 100 }], "Bauru", "SP")[0];
    const sorted = sortGmapsByPriority([a, b]);
    expect(sorted[0].name).toBe("Alfa");
  });

  it("toPublicLeadShape produz o shape esperado pelo front", () => {
    const lead = normalizeGmapsResults(
      [{ title: "Alfa", place_id: "p", phone: "+55 14 3243-8321", latitude: -22.31, longitude: -49.06 }],
      "Bauru",
      "SP",
    )[0];
    const shape = toPublicLeadShape(lead) as Record<string, unknown>;
    expect(shape.external_id).toBe("p");
    expect(shape.whatsapp).toBe("551432438321");
    expect(shape.has_website).toBe(false);
    expect(typeof shape.score).toBe("number");
  });
});

describe("gmaps — imagem real do estabelecimento", () => {  it("prioriza thumbnail", () => {
    expect(selectLeadImage({ thumbnail: "https://x/t.jpg", images: ["https://x/i.jpg"] })).toBe("https://x/t.jpg");
  });

  it("usa a primeira imagem válida de images quando não há thumbnail", () => {
    expect(selectLeadImage({ thumbnail: null, images: ["", "https://x/i1.jpg", "https://x/i2.jpg"] })).toBe("https://x/i1.jpg");
  });

  it("retorna null quando não há imagem", () => {
    expect(selectLeadImage({})).toBeNull();
    expect(selectLeadImage({ thumbnail: "" })).toBeNull();
  });

  it("ignora URLs inválidas/protocolos não http(s)", () => {
    expect(selectLeadImage({ thumbnail: "javascript:alert(1)" })).toBeNull();
    expect(selectLeadImage({ thumbnail: "not-a-url" })).toBeNull();
  });

  it("normaliza e expõe photoUrl/photo_name a partir do thumbnail", () => {
    const leads = normalizeGmapsResults([{ title: "Alfa", place_id: "p", thumbnail: "https://x/a.jpg" }], "Bauru", "SP");
    expect(leads[0].photoUrl).toBe("https://x/a.jpg");
    const shape = toPublicLeadShape(leads[0]) as Record<string, unknown>;
    expect(shape.photo_name).toBe("https://x/a.jpg");
  });
});

describe("gmaps — merge entre fontes", () => {
  const base = { city: "Curitiba", state: "PR", priority: 0, reasons: [], raw: {} } as const;

  it("marca a fonte no lead normalizado", () => {
    const leads = normalizeGmapsResults([{ title: "Alfa", place_id: "p" }], "Curitiba", "PR", "mapscraper");
    expect(leads[0].source).toBe("mapscraper");
  });

  it("deduplica por place_id entre fontes mantendo o registro com mais campos (foto)", () => {
    const a = { ...base, source: "mapscraper", sourceId: "p1", name: "X", phone: "4130000000", website: null, email: null, address: null, category: null, rating: null, reviews: 0, lat: null, lng: null, photoUrl: null };
    const b = { ...base, source: "google_maps_scraper", sourceId: "p1", name: "X", phone: "4130000000", website: null, email: null, address: null, category: null, rating: null, reviews: 0, lat: null, lng: null, photoUrl: "https://x/p.jpg" };
    const { leads } = dedupeGmapsLeads([a, b] as unknown as Parameters<typeof dedupeGmapsLeads>[0]);
    expect(leads).toHaveLength(1);
    expect(leads[0].photoUrl).toBe("https://x/p.jpg");
  });
});

describe("gmaps — cliente HTTP", () => {
  it("chama /scrape-get e retorna results", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("/scrape-get?query=");
      expect(url).toContain("max_places=20");
      return new Response(JSON.stringify({ results: [{ title: "A", place_id: "1" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await callGmapsScraper({ baseUrl: "https://scraper.test", query: "advogados em Bauru, SP", maxPlaces: 20, fetchImpl });
    expect(out.error).toBeUndefined();
    expect(out.results).toHaveLength(1);
  });

  it("aceita resposta em array puro (fork conor-is-my-name)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([{ name: "Alfa", place_id: "p1" }, { name: "Beta", place_id: "p2" }]), { status: 200 }),
    ) as unknown as typeof fetch;
    const out = await callGmapsScraper({ baseUrl: "https://scraper.test", query: "advogados em Bauru, SP", maxPlaces: 20, fetchImpl });
    expect(out.error).toBeUndefined();
    expect(out.results).toHaveLength(2);
  });

  it("retorna erro em HTTP não-ok", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const out = await callGmapsScraper({ baseUrl: "https://scraper.test", query: "x", maxPlaces: 10, fetchImpl });
    expect(out.results).toHaveLength(0);
    expect(out.error).toContain("HTTP 500");
  });

  it("retorna timeout quando abortado", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const out = await callGmapsScraper({ baseUrl: "https://scraper.test", query: "x", maxPlaces: 10, timeoutMs: 5, fetchImpl });
    expect(out.error).toBe("Scraper timeout");
  });

  it("erro explícito quando a URL não está configurada", async () => {
    const out = await callGmapsScraper({ baseUrl: "", query: "x", maxPlaces: 10 });
    expect(out.error).toContain("GMAPS_SCRAPER_URL");
  });
});
