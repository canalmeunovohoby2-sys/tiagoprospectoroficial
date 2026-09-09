import { describe, it, expect } from "vitest";
import { extractImageCandidates, looksLikeImage, scoreCandidate, selectImageCandidate, planImage, defaultImageSearch, type ImageSearchResult } from "../src/image-pipeline";
import { buildImageIntent } from "../src/image-intent";

const ctx = { businessName: "Iron Lab", segment: "Academia", city: "São Paulo", positioning: "alto desempenho", paletteMood: "dark athletic" };
const intent = buildImageIntent(ctx, "hero");

const results: ImageSearchResult[] = [
  { url: "https://images.unsplash.com/photo-1111?w=800", title: "Iron Lab academia treino", description: "ambiente industrial, dark athletic" },
  { url: "https://example.com/pagina", title: "site da academia", description: "texto" }, // não é imagem
  { url: "https://img.com/favicon.png", title: "logo", description: "logo" }, // favicon rejeitado
];

describe("image-pipeline — extração/candidatos (6.0)", () => {
  it("looksLikeImage e extração filtram URLs de imagem, descartam favicon/página", () => {
    expect(looksLikeImage("https://images.unsplash.com/photo-1")).toBe(true);
    expect(looksLikeImage("https://example.com/pagina")).toBe(false);
    const cands = extractImageCandidates(results, "query");
    expect(cands.length).toBe(1);
    expect(cands[0].url).toContain("unsplash");
  });

  it("scoreCandidate pontua aderência ao intent", () => {
    const good = extractImageCandidates([{ url: "https://images.unsplash.com/photo-2", title: "Iron Lab treino academia dark athletic" }], "q")[0];
    const bad = extractImageCandidates([{ url: "https://images.unsplash.com/photo-3", title: "praia" }], "q")[0];
    expect(scoreCandidate(good, intent)).toBeGreaterThan(scoreCandidate(bad, intent));
  });

  it("seleção rejeita URL já utilizada quando há alternativa", () => {
    const used = new Set(["https://images.unsplash.com/photo-1"]);
    const cands = extractImageCandidates([
      { url: "https://images.unsplash.com/photo-1", title: "Iron Lab treino dark" },
      { url: "https://images.unsplash.com/photo-2", title: "Iron Lab academia editorial" },
    ], "q");
    const sel = selectImageCandidate({ candidates: cands, intent, usedUrls: used });
    expect(sel.candidate).not.toBeNull();
    expect(used.has(sel.candidate!.url)).toBe(false);
    expect(sel.candidate!.url).toBe("https://images.unsplash.com/photo-2");
  });

  it("seleção indica fallback quando não há candidato adequado", () => {
    const sel = selectImageCandidate({ candidates: [], intent, usedUrls: new Set() });
    expect(sel.candidate).toBeNull();
    expect(sel.needsFallback).toBe(true);
  });
});

describe("image-pipeline — falso sucesso / sem fabricação (6.0)", () => {
  it("não fabrica URL: resultados sem imagem → nenhum candidato e fallback honesto", async () => {
    const plan = await planImage(ctx, "hero", async () => ([{ url: "https://example.com/artigo", title: "artigo" }]), new Set());
    expect(plan.candidates.length).toBe(0);
    expect(plan.selection.candidate).toBeNull();
    expect(plan.selection.needsFallback).toBe(true);
  });

  it("pipeline determinístico: intent → query → search → select (mock verificável)", async () => {
    const used = new Set<string>();
    const plan = await planImage(ctx, "hero", async (q) => {
      expect(q.length).toBeGreaterThan(0);
      expect(q).toContain("Iron Lab");
      return [{ url: "https://images.unsplash.com/photo-nova", title: "Iron Lab academia treino dark athletic", description: "editorial ambiente industrial" }];
    }, used);
    expect(plan.selection.candidate).not.toBeNull();
    expect(plan.selection.candidate!.url).toContain("unsplash");
    expect(plan.selection.candidate!.rejected).toBe(false);
  });
});
