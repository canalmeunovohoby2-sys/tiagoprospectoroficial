import { describe, it, expect } from "vitest";
import { decideFinishBlock, instructionRequestsChange, isBroadQualityRequest, MAX_FINISH_SKIPS_DEFAULT } from "../src/completion-guard";

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

describe("Guard de evidência (5.24) — não afirmar que alterou sem ter alterado", () => {
  it("pede mudança mas NENHUM arquivo mudou → bloqueia (mesmo em edit)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: POOR, startFiles: POOR, instruction: "Deixa o botão de matrícula mais visível", finishSkips: 0,
    });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/NENHUM arquivo foi modificado/i);
  });

  it("pede mudança E arquivo mudou → NÃO bloqueia (edit)", () => {
    const changed = { ...POOR, "src/site.css": ".hero{} .cta{background:#111}" };
    const d = decideFinishBlock({ mode: "edit", files: changed, startFiles: POOR, instruction: "Deixa o CTA mais visível", finishSkips: 0 });
    expect(d.block).toBe(false);
  });

  it("pergunta sem pedir mudança → NÃO bloqueia mesmo sem alteração", () => {
    const d = decideFinishBlock({ mode: "edit", files: POOR, startFiles: POOR, instruction: "O que dá pra melhorar nesse site?", finishSkips: 0 });
    expect(d.block).toBe(false);
  });

  it("instructionRequestsChange distingue pedido de mudança de pergunta", () => {
    expect(instructionRequestsChange("troca a cor do botão para azul")).toBe(true);
    expect(instructionRequestsChange("adiciona uma seção de FAQ")).toBe(true);
    expect(instructionRequestsChange("melhore o mobile")).toBe(true);
    expect(instructionRequestsChange("melhore esse site")).toBe(true);
    expect(instructionRequestsChange("qual classe controla o título?")).toBe(false);
    expect(instructionRequestsChange("obrigado")).toBe(false);
  });
});

describe("Depth Guard (5.28) — pedidos amplos não finalizam com mínimo esforço", () => {
  const CHANGED = { ...POOR, "src/site.css": ".hero{color:#0f766e} .hero h1{font-size:52px} @media(max-width:640px){.hero{width:100%}}" };

  it("isBroadQualityRequest reconhece pedidos amplos de transformação", () => {
    for (const q of ["deixe o site premium", "melhore o mobile", "melhore esse site", "faça profissional", "quero um site mais premium e moderno"]) {
      expect(isBroadQualityRequest(q), q).toBe(true);
    }
  });

  it("isBroadQualityRequest NÃO acusa pedidos cirúrgicos", () => {
    for (const q of ["troca a cor do botão para azul", "conserta o overflow do hero no mobile", "adiciona uma seção de FAQ", "remove o card de preço"]) {
      expect(isBroadQualityRequest(q), q).toBe(false);
    }
  });

  it("pedido amplo + alterou sem inspecionar antes → BLOQUEIA e cobra inspeção", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "deixe o site premium",
      finishSkips: 0,
      work: { inspectedBeforeEdit: false, verifiedAfterLastEdit: true, editActionCount: 1, editedPaths: ["src/site.css"] },
    });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/inspecionou o estado atual|ENTENDA/i);
  });

  it("pedido amplo + inspecionou mas não verificou depois → BLOQUEIA e cobra verificação", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "melhore o mobile",
      finishSkips: 0,
      work: { inspectedBeforeEdit: true, verifiedAfterLastEdit: false, editActionCount: 2, editedPaths: ["index.html", "src/site.css"] },
    });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/verificou o resultado|browser_inspect/i);
  });

  it("pedido amplo + inspecionou E verificou → NÃO bloqueia (trabalho real)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "melhore esse site",
      finishSkips: 0,
      work: { inspectedBeforeEdit: true, verifiedAfterLastEdit: true, editActionCount: 3, editedPaths: ["index.html", "src/site.css"] },
    });
    expect(d.block).toBe(false);
  });

  it("pedido cirúrgico NÃO passa pelo Depth Guard (sem evidência de trabalho)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "troca a cor do botão para azul",
      finishSkips: 0,
      work: { inspectedBeforeEdit: false, verifiedAfterLastEdit: false, editActionCount: 1, editedPaths: ["src/site.css"] },
    });
    expect(d.block).toBe(false);
  });

  it("pedido amplo que NÃO alterou nada continua bloqueado pela regra de evidência", () => {
    const d = decideFinishBlock({
      mode: "edit", files: POOR, startFiles: POOR, instruction: "deixe o site premium",
      finishSkips: 0,
      work: { inspectedBeforeEdit: false, verifiedAfterLastEdit: false, editActionCount: 0, editedPaths: [] },
    });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/NENHUM arquivo foi modificado/i);
  });

  it("respeita o limite de retentativas também no Depth Guard", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "melhore esse site",
      finishSkips: MAX_FINISH_SKIPS_DEFAULT,
      work: { inspectedBeforeEdit: false, verifiedAfterLastEdit: false, editActionCount: 1, editedPaths: ["src/site.css"] },
    });
    expect(d.block).toBe(false);
  });
});
