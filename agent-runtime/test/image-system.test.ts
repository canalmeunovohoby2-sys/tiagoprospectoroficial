import { describe, it, expect } from "vitest";
import { buildImageIntent, intentToQuery, heroQueries } from "../src/image-intent";
import { collectImageInventory, countByUrl, repeatedUrls, suggestImageDiversity, usedUrls } from "../src/image-inventory";

const ctx = { businessName: "Iron Lab", segment: "Academia", city: "São Paulo", positioning: "alto desempenho", paletteMood: "dark athletic", typographyStyle: "sans geométrica forte", architecture: "hero de energia" };

describe("image-intent — intenção contextual (6.0)", () => {
  it("hero gera intenção contextual com sujeito/mood/composição/aspect", () => {
    const it = buildImageIntent(ctx, "hero");
    expect(it.role).toBe("hero");
    expect(it.subject).toContain("Iron Lab");
    expect(it.mood).toContain("dark athletic");
    expect(it.aspectRatio).toBe("wide");
    expect(it.avoid.length).toBeGreaterThan(0);
    expect(["editorial", "documental", "arquitetônico", "detalhe", "produto", "textura"]).toContain(it.treatment);
  });

  it("mesma categoria pode gerar intenções DIFERENTES (diversidade por negócio)", () => {
    const a = buildImageIntent(ctx, "hero");
    const b = buildImageIntent({ ...ctx, businessName: "VivaFit" }, "hero");
    expect(a.treatment !== b.treatment || a.mood !== b.mood).toBe(true);
  });

  it("intentToQuery é contextual (contém negócio + mood + tratamento), não só o segmento", () => {
    const q = intentToQuery(buildImageIntent(ctx, "hero"), ctx);
    expect(q).toContain("Iron Lab");
    expect(q).toContain("dark athletic");
    expect(q.length).toBeLessThanOrEqual(120);
    expect(q.toLowerCase()).not.toBe("academia");
  });

  it("heroQueries gera consultas alternativas (sujeito/ambiente/composição)", () => {
    const qs = heroQueries(buildImageIntent(ctx, "hero"), ctx);
    expect(qs.length).toBe(3);
  });
});

describe("image-inventory — detecção + anti-repetição (6.0)", () => {
  const files = {
    "index.html": `<html><body><img src="https://img.com/a.jpg" alt="Hero academia"/><img src="https://img.com/b.jpg" alt=""/><div style="background:url('https://img.com/a.jpg')"></div></body></html>`,
    "src/site.css": ".x{background:url(https://img.com/c.jpg)}",
  };

  it("detecta imagens reais (img + url()) no projeto", () => {
    const recs = collectImageInventory(files);
    expect(recs.some((r) => r.url === "https://img.com/a.jpg" && r.alt === "Hero academia")).toBe(true);
    expect(recs.some((r) => r.url === "https://img.com/c.jpg")).toBe(true);
  });

  it("detecta URL repetida sem justificativa", () => {
    const recs = collectImageInventory(files);
    expect(repeatedUrls(recs)).toContain("https://img.com/a.jpg");
    expect(countByUrl(recs)["https://img.com/a.jpg"]).toBe(2);
  });

  it("suggestImageDiversity aponta repetição/baixa variedade", () => {
    const recs = collectImageInventory(files);
    expect(suggestImageDiversity(recs)).toContain("repetidas");
  });

  it("usadas (usedUrls) evitam reutilização", () => {
    const u = usedUrls(collectImageInventory(files));
    expect(u.has("https://img.com/a.jpg")).toBe(true);
  });
});
