import { describe, it, expect } from "vitest";
import { assertGenerationQuality, VISUAL_SEGMENTS } from "../src/generation-gate";

const base = (extra: string, cssExtra = "") => ({
  "index.html": `<!doctype html><html><head><title>Academia Corpo Forte</title></head><body>
    <nav><a href="#hero">Início</a></nav>
    <section class="hero" id="hero"><h1>Academia Corpo Forte</h1><p>Treine conosco.</p><a class="cta" href="https://wa.me/5511">Matricule-se</a></section>
    <footer>© Academia Corpo Forte · (11) 4444-3333</footer>
    ${extra}
  </body></html>`,
  "src/site.css": cssExtra,
});

describe("Generation Quality Gate (5.21)", () => {
  it("academia visual sem imagens é reprovada", () => {
    const r = assertGenerationQuality(base(""), { segment: "Academias", name: "Academia Corpo Forte", businessHas: () => true });
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toMatch(/imagens|imagem/);
  });

  it("com imagens + media + cta + footer passa", () => {
    const files = base(
      '<img src="https://images.unsplash.com/photo-x" alt="academia" />',
      "@media(max-width:900px){.hero{width:100%}}",
    );
    const r = assertGenerationQuality(files, { segment: "Academias", name: "Academia Corpo Forte", businessHas: () => true });
    expect(r.ok).toBe(true);
  });

  it("detecta sem @media, sem CTA e footer simples", () => {
    const files = base("<img src='a.jpg' alt='x'/>");
    files["src/site.css"] = ".a{}";
    const r = assertGenerationQuality(files, { segment: "Advocacia", name: "Escritório X", businessHas: () => true });
    expect(r.issues.some((i) => i.toLowerCase().includes("media"))).toBe(true);
  });

  it("detecta lorem ipsum", () => {
    const r = assertGenerationQuality(base("<p>lorem ipsum dolor</p><img src='a.jpg' alt=''/>", "@media{}"), {
      segment: "Pet Shop", name: "Pet X", businessHas: () => true,
    });
    expect(r.issues.some((i) => i.toLowerCase().includes("lorem"))).toBe(true);
  });

  it("detecta horário inventado quando negócio não forneceu", () => {
    const r = assertGenerationQuality(base("<p>Segunda a sábado das 08h às 19h</p><img src='a' alt=''/>", "@media{}"), {
      segment: "Academias", name: "Academia X", businessHas: (f) => f !== "hours",
    });
    expect(r.issues.some((i) => i.toLowerCase().includes("horário"))).toBe(true);
  });

  it("lista segmentos visuais", () => {
    expect(VISUAL_SEGMENTS).toContain("academia");
    expect(VISUAL_SEGMENTS).toContain("restaurante");
  });

  it("detecta grade genérica de muitos cards (anti 'cards empilhados')", () => {
    const manyCards = Array.from({ length: 8 }, (_, i) => `<div class="card"><h3>Item ${i}</h3><p>texto</p></div>`).join("");
    const files = base(`<img src="a.jpg" alt=""/>${manyCards}`, "@media{}");
    const r = assertGenerationQuality(files, { segment: "Academias", name: "Academia X", businessHas: () => true });
    expect(r.issues.some((i) => i.toLowerCase().includes("cards empilhados") || i.toLowerCase().includes("muitos cards"))).toBe(true);
  });

  it("cards em quantidade moderada e com composição variada não reprovam", () => {
    const cards = Array.from({ length: 3 }, (_, i) => `<div class="card-${i}"><img src="a${i}.jpg" alt=""/><h3>Item ${i}</h3></div>`).join("");
    const files = base(`<div class="grid-split"><div>texto editorial longo aqui</div>${cards}</div><div class="media">texto e imagem</div>`, "@media{}");
    const r = assertGenerationQuality(files, { segment: "Academias", name: "Academia Corpo Forte", businessHas: () => true });
    expect(r.ok).toBe(true);
  });
});
