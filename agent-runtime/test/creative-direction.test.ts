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

  it("formatCreativeBrief gera bloco enxuto para a missão", () => {
    const b = buildCreativeBrief("Clínica Aurora", "Clínicas");
    const out = formatCreativeBrief(b);
    expect(out.toLowerCase()).toContain("direção criativa sugerida");
    expect(out).toContain("Posicionamento:");
    expect(out).toContain("Arquiteturas possíveis");
    expect(out).toContain("Imagens contextuais");
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
