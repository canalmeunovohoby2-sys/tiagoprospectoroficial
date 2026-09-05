import { describe, it, expect } from "vitest";
import { decideFinishBlock, MAX_FINISH_SKIPS_DEFAULT } from "../src/completion-guard";

const GOOD = {
  "index.html": `<!doctype html><html><head><title>Academia Forte</title></head><body>
    <nav><a href="#hero">Início</a></nav>
    <section class="hero" id="hero"><h1>Academia Forte</h1><img src="https://images.unsplash.com/photo-a" alt="academia"/><a class="cta" href="https://wa.me/55">Matricule-se</a></section>
    <footer>© Academia Forte · (11) 9999-0000</footer>
  </body></html>`,
  "src/site.css": ".hero{background:#111}@media(max-width:900px){.hero{width:100%}}",
};

const POOR = {
  "index.html": `<!doctype html><html><head><title>Academia</title></head><body><h1>Academia</h1></body></html>`,
  "src/site.css": ".hero{}",
};

describe("Completion Guard (5.24) — conclusão com evidência", () => {
  it("mode generate com gate ok NÃO bloqueia finish", () => {
    const d = decideFinishBlock({ mode: "generate", files: GOOD, segment: "Academias", name: "Academia Forte", finishSkips: 0 });
    expect(d.block).toBe(false);
  });

  it("mode generate com site pobre BLOQUEIA finish e explica o motivo", () => {
    const d = decideFinishBlock({ mode: "generate", files: POOR, segment: "Academias", name: "Academia", finishSkips: 0 });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/imagens|CTA|@media|footer|nav/i);
  });

  it("mode edit NÃO bloqueia finish (edição cirúrgica)", () => {
    const d = decideFinishBlock({ mode: "edit", files: POOR, segment: "Academias", name: "Academia", finishSkips: 0 });
    expect(d.block).toBe(false);
  });

  it("respeita o limite de retentativas (não vira loop infinito)", () => {
    const d = decideFinishBlock({ mode: "generate", files: POOR, segment: "Academias", finishSkips: MAX_FINISH_SKIPS_DEFAULT });
    expect(d.block).toBe(false);
  });

  it("maxFinishSkips custom é respeitado", () => {
    expect(decideFinishBlock({ mode: "generate", files: POOR, segment: "x", finishSkips: 1, maxFinishSkips: 1 }).block).toBe(false);
    expect(decideFinishBlock({ mode: "generate", files: POOR, segment: "x", finishSkips: 0, maxFinishSkips: 1 }).block).toBe(true);
  });
});
