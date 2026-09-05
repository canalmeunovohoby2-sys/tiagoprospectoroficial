import { describe, it, expect } from "vitest";
import { classifyAmplitude, hasContextualReference } from "../../supabase/functions/_shared/design-intent";
import { contrastRatio, readableTextFor, ensureContrast, hexToRgb } from "../../src/lib/sitePdf";

describe("Design Intent — amplitude do pedido (ciclo autônomo)", () => {
  it("pedidos amplos disparam o ciclo autônomo (broad)", () => {
    for (const q of [
      "Deixa esse site mais premium.",
      "quero um site de primeiro mundo",
      "melhora o site por favor",
      "deixa mais profissional e elegante",
      "está feio, melhora tudo",
      "refina o design da página",
      "dá um upgrade no site",
      "o site está básico demais",
    ]) {
      expect(classifyAmplitude(q), q).toBe("broad");
    }
  });

  it("pedidos cirúrgicos NÃO disparam o ciclo completo", () => {
    for (const q of [
      "troca a cor do botão para azul",
      "muda o título do hero para Bom dia",
      "adiciona uma seção de FAQ",
      "remove o card de preço",
      "coloca a palavra veterinário no subtítulo",
      "altera o telefone de contato",
    ]) {
      expect(classifyAmplitude(q), q).toBe("surgical");
    }
  });

  it("frases vagas sem sinal específico também são amplas", () => {
    expect(classifyAmplitude("")).toBe("broad");
    expect(classifyAmplitude("quero que fique bonito")).toBe("broad");
  });

  it("detecta referências contextuais que exigem memória", () => {
    for (const q of [
      "gostei da versão anterior, mantém",
      "faz igual àquela seção de antes",
      "deixa a hero como estava",
      "a cor que você colocou antes",
      "na mesma linha da primeira versão",
    ]) {
      expect(hasContextualReference(q), q).toBe(true);
    }
    expect(hasContextualReference("troca a cor do botão para azul")).toBe(false);
  });
});

describe("PDF QA — contraste (7.3)", () => {
  it("contraste branco/escuro é alto e texto escuro/claro é baixo", () => {
    const white = { r: 255, g: 255, b: 255 };
    const dark = { r: 15, g: 23, b: 42 };
    expect(contrastRatio(white, dark)).toBeGreaterThan(10);
    expect(contrastRatio(dark, dark)).toBe(1);
  });

  it("readableTextFor escolhe texto escuro em fundo claro e claro em fundo escuro", () => {
    const white = { r: 255, g: 255, b: 255 };
    const dark = { r: 15, g: 23, b: 42 };
    expect(readableTextFor(white, dark, white)).toEqual(dark);
    expect(readableTextFor(dark, dark, white)).toEqual(white);
  });

  it("ensureContrast corrige automaticamente texto ilegível sobre fundo", () => {
    const bgDark = hexToRgb("#052e16"); // quase preto
    const darkOnDark = ensureContrast(hexToRgb("#0a0a0a"), bgDark);
    expect(contrastRatio(darkOnDark, bgDark)).toBeGreaterThanOrEqual(3);

    const bgLight = hexToRgb("#ffffff");
    const whiteOnWhite = ensureContrast({ r: 255, g: 255, b: 255 }, bgLight);
    expect(contrastRatio(whiteOnWhite, bgLight)).toBeGreaterThanOrEqual(3);
  });

  it("hexToRgb converte cor corretamente", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#0f766e").b).toBe(0x6e);
  });
});
