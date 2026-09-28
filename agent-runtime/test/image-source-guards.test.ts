import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assetToResult, isStockHost } from "../src/image-pipeline";
import { assertGenerationQuality } from "../src/generation-gate";

// BUG REAL (site aprovado pelo usuario): 5 das 7 imagens vinham de www.atonstar.com.br
// (site do PROPRIO cliente) e so 2 do Pexels — imagem de apresentacao de origem nao curada.
describe("origem da imagem de apresentacao", () => {
  it("so banco de imagens entra no pipeline (nunca site do cliente/terceiros)", () => {
    expect(isStockHost("https://images.pexels.com/photos/1/a.jpeg")).toBe(true);
    expect(isStockHost("https://images.unsplash.com/photo-1")).toBe(true);
    expect(isStockHost("https://www.atonstar.com.br/wp-content/uploads/x.jpg")).toBe(false);
    expect(assetToResult({ url: "https://www.atonstar.com.br/wp-content/uploads/x.jpg", alt: "clinica" })).toBeNull();
    expect(assetToResult({ url: "https://images.pexels.com/photos/9/b.jpeg", alt: "dentista" })?.url).toContain("pexels");
  });

  it("o gate reprova hero com imagem nao curada e aprova Pexels e /assets/", () => {
    const base = `<section class="hero"><h1>Clinica</h1></section><section id="contato"><p>Rua X, 1 - Campinas/SP</p></section>`;
    const ruim = assertGenerationQuality({ "index.html": base.replace('class="hero"', 'class="hero" style="background-image:url(https://www.atonstar.com.br/img/x.jpg)"') }, {});
    expect(ruim.issues.join(" | ")).toMatch(/origem n.o curada/i);
    const okPexels = assertGenerationQuality({ "index.html": base.replace('class="hero"', 'class="hero" style="background-image:url(https://images.pexels.com/photos/1/a.jpeg)"') }, {});
    expect(okPexels.issues.join(" | ")).not.toMatch(/origem n.o curada/i);
    const okAsset = assertGenerationQuality({ "index.html": base.replace('class="hero"', 'class="hero"><img src="/assets/logo.png">') }, {});
    expect(okAsset.issues.join(" | ")).not.toMatch(/origem n.o curada/i);
  });

  it("a identidade de 1a geracao controla tempo/foco (sem navegador durante a criacao)", () => {
    const src = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8");
    expect(src).toContain("NAO abra o navegador");
    expect(src).toContain("no maximo 1 vez por secao");
  });
});
