import { describe, it, expect } from "vitest";
import { buildCreativeBrief, formatCreativeBrief } from "../src/creative-direction";

describe("Creative Direction (5.25)", () => {
  it("academia recebe direção de performance/energia com queries de treino", () => {
    const b = buildCreativeBrief("Academia Corpo Forte", "Academias");
    expect(b.position).toMatch(/energia|performance/i);
    expect(b.heroStrategy).toMatch(/imagem de treino|impacto/i);
    expect(b.imageQueries.hero).toMatch(/academia|treino/i);
    expect(b.architecture.length).toBeGreaterThanOrEqual(3);
  });

  it("restaurante recebe direção gastronômica com queries de comida", () => {
    const b = buildCreativeBrief("Cantina do Nonno", "Restaurantes");
    expect(b.position).toMatch(/desejo|sabor/i);
    expect(b.imageQueries.hero).toMatch(/prato|restautante|comida/i);
  });

  it("advocacia recebe direção de autoridade (não 'call center')", () => {
    const b = buildCreativeBrief("Xavier & Advogados", "Advocacia");
    expect(b.position).toMatch(/autoridade|segurança/i);
    expect(b.antiTemplate).toMatch(/call center/i);
  });

  it("pet recebe direção de cuidado e NÃO infantiliza", () => {
    const b = buildCreativeBrief("Pet Care", "Pet Shop");
    expect(b.position).toMatch(/cuidado/i);
    expect(b.copyDirection).toMatch(/NÃO infantilizar|não infantiliz/i);
    expect(b.imageQueries.hero).toMatch(/cachorro|pet|banho/i);
  });

  it("segmento desconhecido recebe fallback com queries genéricas do negócio", () => {
    const b = buildCreativeBrief("Mercado do Zé", "Varejo");
    expect(b.archetype).toBe("Modern Premium");
    expect(b.imageQueries.hero).toContain("negócio");
  });

  it("briefs de nichos diferentes diferem (não é template único)", () => {
    const acad = buildCreativeBrief("Academia X", "Academias");
    const adv = buildCreativeBrief("Advocacia Y", "Advocacia");
    const rest = buildCreativeBrief("Restaurante Z", "Restaurantes");
    expect(acad.archetype).not.toBe(adv.archetype);
    expect(adv.archetype).not.toBe(rest.archetype);
    expect(acad.copyDirection).not.toBe(rest.copyDirection);
  });

  it("formatCreativeBrief gera bloco EXECUTÁVEL com tokens para a missão", () => {
    const b = buildCreativeBrief("Clínica Aurora", "Clínicas");
    const out = formatCreativeBrief(b);
    expect(out).toContain("DESIGN TOKENS EXECUTÁVEIS");
    expect(out).toContain("PALETA");
    expect(out).toContain("TIPOGRAFIA");
    expect(out).toContain("COMPOSIÇÃO");
    expect(out).toContain("ARQUITETURA ESCOLHIDA");
    expect(out).toContain("DIREÇÃO DE IMAGENS");
    expect(out).toContain("cta:");
    expect(out).toContain("heading:");
  });
});

describe("Design tokens executáveis (6.0)", () => {
  const HEX = /^#[0-9A-Fa-f]{6}$/;

  function expectValidTokens(b: ReturnType<typeof buildCreativeBrief>) {
    const pal = b.tokens.palette;
    for (const k of ["primary", "secondary", "accent", "background", "foreground", "muted", "cta", "ctaContrast"] as const) {
      expect(pal[k], k).toMatch(HEX);
    }
    expect(b.tokens.typography.heading).toBeTruthy();
    expect(b.tokens.typography.body).toBeTruthy();
    expect(b.tokens.typography.headingWeights).toBeTruthy();
    expect(b.tokens.composition.hero).toBeTruthy();
    expect(b.architectureChoice).toBeTruthy();
    expect(b.architecture).toContain(b.architectureChoice);
    expect(b.tokens.palette.cta !== b.tokens.palette.ctaContrast).toBe(true);
  }

  it("tokens têm formato válido e CTA com contraste (diferente do fundo do CTA)", () => {
    for (const [name, seg] of [["Iron Lab", "Academias"], ["Cantina", "Restaurantes"], ["Xavier & Advogados", "Advocacia"], ["Clínica Aurora", "Clínicas"], ["Pet Care", "Pet Shop"]]) {
      expectValidTokens(buildCreativeBrief(name, seg));
    }
  });

  it("dois negócios diferentes recebem tokens (paleta/tipografia/arquitetura) DIFERENTES quando apropriado", () => {
    const a = buildCreativeBrief("Iron Lab Academia", "Academia");
    const b = buildCreativeBrief("VivaFit Studio", "Academia");
    expect(JSON.stringify(a.tokens.palette)).not.toBe(JSON.stringify(b.tokens.palette));
  });

  it("mesmo negócio mantém tokens determinísticos", () => {
    const a1 = buildCreativeBrief("Iron Lab Academia", "Academia");
    const a2 = buildCreativeBrief("Iron Lab Academia", "Academia");
    expect(JSON.stringify(a1.tokens)).toBe(JSON.stringify(a2.tokens));
    expect(a1.architectureChoice).toBe(a2.architectureChoice);
  });

  it("tipografia é explicitamente representada (família + pesos + import)", () => {
    const b = buildCreativeBrief("Academia Corpo Forte", "Academias");
    expect(b.tokens.typography.heading).toMatch(/./);
    expect(b.tokens.typography.headingWeights).toMatch(/\d/);
    expect(b.tokens.typography.importUrl).toMatch(/fonts\.googleapis\.com/);
  });

  it("arquitetura é explicitamente escolhida (uma, não três)", () => {
    const b = buildCreativeBrief("Iron Lab Academia", "Academia");
    expect(b.architectureChoice.length).toBeGreaterThan(0);
    expect(b.architecture).toContain(b.architectureChoice);
  });
});

describe("Diversidade criativa orientada a contexto (mesmo nicho)", () => {
  it("três academias diferentes recebem direções visuais DIFERENTES", () => {
    const a = buildCreativeBrief("Iron Lab Academia", "Academias e Musculação");
    const b = buildCreativeBrief("VivaFit Studio", "Academias e Musculação");
    const c = buildCreativeBrief("Arena Cross Box", "Academias e Musculação");
    // Pelo menos duas das três devem divergir em arquétipo/paleta/hero/arquitetura.
    const keys = (x: ReturnType<typeof buildCreativeBrief>) => [x.archetype, x.paletteHint, x.typeHint, x.heroStrategy, JSON.stringify(x.architecture), JSON.stringify(x.imageQueries)].join("|");
    const setAb = new Set([keys(a), keys(b), keys(c)]);
    expect(setAb.size).toBeGreaterThanOrEqual(2);
  });

  it("duas academias com nomes bem diferentes tendem a direções diferentes (identidade guia)", () => {
    const a = buildCreativeBrief("Iron Lab", "Academia");
    const b = buildCreativeBrief("VivaFit", "Academia");
    expect(a.archetype).not.toBe(b.archetype);
  });

  it("nichos diferentes mantêm direções distintas e coerentes", () => {
    const acad = buildCreativeBrief("Academia Corpo Forte", "Academias");
    const adv = buildCreativeBrief("Xavier & Advogados", "Advocacia");
    const rest = buildCreativeBrief("Cantina do Nonno", "Restaurantes");
    expect(acad.archetype).not.toBe(adv.archetype);
    expect(adv.archetype).not.toBe(rest.archetype);
    expect(acad.copyDirection).not.toBe(rest.copyDirection);
  });

  it("mesmo negócio é estável (não muda a cada chamada)", () => {
    const a1 = buildCreativeBrief("Iron Lab Academia", "Academias");
    const a2 = buildCreativeBrief("Iron Lab Academia", "Academias");
    expect(a1.archetype).toBe(a2.archetype);
    expect(JSON.stringify(a1.imageQueries)).toBe(JSON.stringify(a2.imageQueries));
  });
});
