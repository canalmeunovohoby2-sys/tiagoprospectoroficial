import { describe, it, expect, beforeEach } from "vitest";
import {
  fallbackArtDirection,
  generateArtDirection,
  validateArtDirection,
  formatArtDirectionBlock,
  artDirectionKey,
  clearArtDirectionCache,
  ART_DIRECTION_SPEC_MARKER,
  type ArtDirectionSpec,
} from "../src/studio/agent-core/art-direction";

const business = {
  name: "Esquerdo Advogados",
  segment: "advocacia",
  category: "escritório de advocacia",
  city: "Bauru",
  state: "SP",
  address: "Rua das Acácias, 120",
  about: "Atuação em criminal, cível e família com atendimento próximo.",
  services: ["Criminal", "Cível", "Família"],
};

function validModelJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    concept: "Autoridade contemporânea com clareza e presença",
    personality: "sóbria, precisa, humana, confiável",
    audience: "pessoas e empresas em Bauru",
    positioning: "advocacia consultiva com atendimento direto",
    visualLanguage: "editorial assimétrica com tipografia de presença",
    typography: { heading: "Fraunces", body: "Inter", justification: "serif de caráter com corpo neutro", weights: "600-700 / 400-500", hierarchy: "H1 3rem, H2 2rem, corpo 1rem/1.6" },
    palette: {
      tokens: [
        { role: "fundo", hex: "#0F1115", use: "fundo" },
        { role: "superficie", hex: "#181C22", use: "blocos" },
        { role: "texto", hex: "#F2EFE8", use: "texto" },
        { role: "acento", hex: "#C8A25A", use: "destaques" },
      ],
      justification: "contraste controlado",
      avoid: ["azul-marinho de template"],
    },
    photography: { direction: "arquitetura e ambientes reais", treatment: "tons quentes", queries: ["escritório advocacia luz natural"], avoid: ["clichê de martelo"] },
    hero: { composition: "assimétrico em duas colunas", layout: "split 55/45", media: "foto do escritório", cta: "1 CTA" },
    grid: { system: "12 colunas", columns: "7-9 colunas", spacing: "escala 8px" },
    rhythm: "blocos densos e respiros amplos",
    density: "moderada",
    components: { buttons: "sólidos raio 6px", navigation: "top bar com borda", cards: "sem cartões", graphics: "réguas", borders: "cantos retos" },
    motion: "reveals discretos",
    sectionPlan: [
      { id: "abertura", purpose: "posicionamento e CTA", layout: "assimétrico" },
      { id: "atuacao", purpose: "áreas de atuação", layout: "lista editorial" },
      { id: "metodo", purpose: "como o atendimento funciona", layout: "dois eixos" },
      { id: "contato", purpose: "contato e endereço", layout: "faixa final" },
    ],
    antiTemplate: ["sem hero centralizado gigante"],
    ...overrides,
  });
}

beforeEach(() => clearArtDirectionCache());

describe("art-direction — fallback determinístico", () => {
  it("gera spec válida, com fontes, paleta hex e plano de seções", () => {
    const s = fallbackArtDirection(business as never);
    expect(s.version).toBe(1);
    expect(s.meta.source).toBe("fallback");
    expect(s.typography.heading.length).toBeGreaterThan(1);
    expect(s.typography.body.length).toBeGreaterThan(1);
    expect(s.typography.heading).not.toBe(s.typography.body);
    expect(s.palette.tokens.length).toBeGreaterThanOrEqual(3);
    for (const t of s.palette.tokens) expect(t.hex).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
    expect(s.sectionPlan.length).toBeGreaterThanOrEqual(3);
    expect(s.antiTemplate.length).toBeGreaterThan(0);
  });

  it("negócios diferentes têm sementes e direções diferentes", () => {
    const a = fallbackArtDirection(business as never);
    const b = fallbackArtDirection({ ...business, name: "OdontoVitta", segment: "odontologia" } as never);
    expect(a.seed).not.toBe(b.seed);
  });

  it("bloco é especificação executável (fontes, hex, seções, verificação)", () => {
    const s = fallbackArtDirection(business as never);
    const block = formatArtDirectionBlock(s);
    expect(block).toContain(ART_DIRECTION_SPEC_MARKER);
    expect(block).toContain(s.typography.heading);
    expect(block).toContain(s.typography.body);
    expect(block).toContain(s.palette.tokens[0].hex);
    for (const sec of s.sectionPlan) expect(block).toContain(sec.id);
    expect(block.toLowerCase()).toContain("verificação");
  });
});

describe("art-direction — validação de schema", () => {
  it("rejeita lixo e JSON inválido", () => {
    expect(validateArtDirection("não é json", "seed", [])).toBeNull();
    expect(validateArtDirection({}, "seed", [])).toBeNull();
    expect(validateArtDirection(validModelJson({ typography: { heading: "", body: "" } }), "seed", [])).toBeNull();
    expect(validateArtDirection(validModelJson({ palette: { tokens: [] } }), "seed", [])).toBeNull();
    expect(validateArtDirection(validModelJson({ sectionPlan: [] }), "seed", [])).toBeNull();
  });

  it("aceita JSON válido e NUNCA usa referências inventadas pelo modelo", () => {
    const provided = [{ url: "https://studio.example.com", source: "busca web", principle: "grid assimétrico" }];
    const raw = validModelJson({ references: [{ url: "https://inventada.invalid", principle: "x" }] });
    const s = validateArtDirection(raw, "seed", provided) as ArtDirectionSpec;
    expect(s).not.toBeNull();
    expect(s.references).toHaveLength(1);
    expect(s.references[0].url).toBe("https://studio.example.com");
    expect(s.meta.source).toBe("ai");
  });
});

describe("art-direction — geração com modelo", () => {
  it("usa a resposta válida do modelo", async () => {
    const s = await generateArtDirection({
      business: business as never,
      references: [{ url: "https://studio.example.com", source: "busca web", principle: "hierarquia editorial" }],
      researched: true,
      complete: async () => validModelJson(),
      fresh: true,
    });
    expect(s.meta.source).toBe("ai");
    expect(s.meta.researched).toBe(true);
    expect(s.typography.pair).toBe("Fraunces + Inter");
    expect(s.palette.tokens[0].hex).toBe("#0f1115");
  });

  it("cai no fallback quando o modelo falha/expira (nunca quebra)", async () => {
    const s = await generateArtDirection({ business: business as never, complete: async () => "", fresh: true });
    expect(s.meta.source).toBe("fallback");
    expect(s.palette.tokens.length).toBeGreaterThanOrEqual(3);
  });

  it("cai no fallback quando o JSON é inválido", async () => {
    const s = await generateArtDirection({ business: business as never, complete: async () => "{quebrado", fresh: true });
    expect(s.meta.source).toBe("fallback");
  });

  it("semente estável por identidade do negócio", () => {
    expect(artDirectionKey(business as never)).toBe(artDirectionKey({ ...business } as never));
    expect(artDirectionKey(business as never)).not.toBe(artDirectionKey({ ...business, name: "Outro" } as never));
  });
});
