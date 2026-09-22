import { describe, it, expect } from "vitest";
import { foraDoContexto, formatCuratedImages, nicheSignals, rankCurated, selectImageCandidate } from "../src/image-pipeline";
import { assertGenerationQuality } from "../src/generation-gate";

const cand = (title: string, url = "https://images.pexels.com/photos/1/p.jpeg") => ({
  url, source: "pexels", title, description: title, query: "q", relevance: 0.5, reason: "", rejected: false,
});
const CTX = { segment: "energia solar", positioning: "instalação residencial e rural" };

describe("curadoria determinística de imagens (sem visão, por metadados)", () => {
  it("deriva sinais do nicho a partir do segmento/vertical", () => {
    const s = nicheSignals(CTX);
    expect(s).toContain("solar");
    expect(s).toContain("install");
  });

  it("relevante tem prioridade e irrelevante (soldado) é rejeitado", () => {
    const bons = [cand("solar panel installation on a modern house"), cand("photovoltaic roof install")];
    const ruim = cand("soldier in military uniform holding a weapon");
    expect(foraDoContexto(ruim)).toBe(true);
    const rank = rankCurated([ruim, ...bons], CTX);
    expect(rank).toHaveLength(2);                    // o soldado sai antes do ranking
    expect(rank[0].title).toContain("solar");
    expect(rank.every((c) => !/soldier|military/i.test(c.title))).toBe(true);
  });

  it("a seleção final nunca escolhe candidato fora do contexto", () => {
    const soldier = { ...cand("soldier in the desert"), relevance: 1 };
    const solar = { ...cand("solar panel installation"), relevance: 0.4 };
    const sel = selectImageCandidate({ candidates: [soldier, solar], intent: { role: "hero", subject: "energia solar", mood: "", composition: "", treatment: "", avoid: [] } as never });
    expect(sel.candidate?.title).toContain("solar");
  });

  it("entrega bloco curto com URL + alt (não lista indiscriminada)", () => {
    const bloco = formatCuratedImages("hero", [cand("solar panel install"), cand("soldier"), cand("photovoltaic panels"), cand("inverter install"), cand("rooftop solar"), cand("extra")]);
    expect(bloco).toContain("RESULTADOS DE PESQUISA");
    expect(bloco).toContain("alt:");
    expect(bloco).not.toMatch(/soldier/i);
    expect((bloco.match(/https:\/\/images\.pexels\.com/g) ?? []).length).toBeLessThanOrEqual(4);
  });
});

describe("guard · placeholder literal e foto do lead na apresentação", () => {
  const SITE = `<section class="hero"><h1>Energia solar</h1></section><section id="contato"><p>Rua X, 1 - Bariri/SP</p></section>`;

  it("reprova placeholder não resolvido ({business.cidade}) e aceita a cidade real", () => {
    const ruim = assertGenerationQuality({ "index.html": SITE.replace("Bariri", "{business.cidade}") }, {});
    expect(ruim.issues.join(" | ")).toMatch(/Placeholder literal/i);
    const ok = assertGenerationQuality({ "index.html": SITE }, {});
    expect(ok.issues.join(" | ")).not.toMatch(/Placeholder literal/i);
  });

  it("não bloqueia template literal legítimo de JavaScript", () => {
    const js = `export const A = () => render({ count: 3 }, \`\${businessName} — contato\`);`;
    const r = assertGenerationQuality({ "index.html": SITE, "src/App.tsx": js }, {});
    expect(r.issues.join(" | ")).not.toMatch(/Placeholder literal/i);
  });

  it("reprova foto do lead (lh3.googleusercontent) no hero/background", () => {
    const hero = SITE.replace('class="hero"', 'class="hero" style="background-image:url(https://lh3.googleusercontent.com/gps-cs-s/x.jpg)"');
    const r = assertGenerationQuality({ "index.html": hero }, {});
    expect(r.issues.join(" | ")).toMatch(/Foto do lead/i);
  });

  it("aceita imagem curada do pipeline no hero (Pexels)", () => {
    const hero = SITE.replace('class="hero"', 'class="hero" style="background-image:url(https://images.pexels.com/photos/9/solar.jpeg)"');
    const r = assertGenerationQuality({ "index.html": hero }, {});
    expect(r.issues.join(" | ")).not.toMatch(/Foto do lead/i);
  });
});
