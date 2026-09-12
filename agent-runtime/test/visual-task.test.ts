import { describe, it, expect } from "vitest";
import { classifyTask, requiresVisualCycle } from "../src/visual-task";
import { decideFinishBlock, MAX_VISUAL_ITERATIONS_DEFAULT } from "../src/completion-guard";

const START = {
  "index.html": `<!doctype html><html><body><nav><a>x</a></nav><section class="hero"><h1>Loja</h1><img src="https://img.com/a.jpg"/></section><footer>f</footer></body></html>`,
};
const CHANGED = { ...START, "src/site.css": ".hero h1{font-size:40px}" };

describe("classifyTask — classificação de tarefa (6.0)", () => {
  it("tarefas de layout/visual → visual", () => {
    for (const q of ["deixe o título mais próximo do botão", "aumente o espaçamento do hero", "corrija o alinhamento dos cards", "deixe o site responsivo no mobile", "mude a posição do CTA", "os cards estão sobrepostos"]) {
      expect(classifyTask(q), q).toBe("visual");
    }
  });
  it("tarefas puramente textuais → content", () => {
    for (const q of ["altere o texto do título para 'Bem-vindo'", "reescreva o parágrafo de apresentação", "mude o telefone para (11) 9999-0000"]) {
      expect(classifyTask(q), q).toBe("content");
    }
  });
  it("tarefas técnicas sem impacto visual → code", () => {
    for (const q of ["corrija o erro de TypeScript no main.js", "adicione uma dependência de build", "o lint está falhando no arquivo .ts"]) {
      expect(classifyTask(q), q).toBe("code");
    }
  });
  it("ambíguo/sem sinal → tratado como visual", () => {
    expect(classifyTask("")).toBe("visual");
    expect(classifyTask("deixe isso diferente")).toBe("visual");
  });
  it("requiresVisualCycle só para visual", () => {
    expect(requiresVisualCycle("visual")).toBe(true);
    expect(requiresVisualCycle("content")).toBe(false);
    expect(requiresVisualCycle("code")).toBe(false);
  });
});

describe("Ciclo visual autônomo no completion guard (6.0)", () => {
  const visualVerify = (editActionCount: number, paths: string[], render: boolean, inspect: boolean = true) => ({
    inspectedBeforeEdit: inspect, verifiedAfterLastEdit: true, renderVerifiedAfterLastEdit: render, editActionCount, editedPaths: paths,
  });

  it("tarefa visual que alterou e NÃO mediu renderizado → BLOQUEIA (ciclo visual)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: START, instruction: "deixe o título mais próximo do botão",
      finishSkips: 0, work: visualVerify(1, ["src/site.css"], false),
    });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("visual");
    expect(d.reason ?? "").toMatch(/browser_measure|RENDERIZAÇÃO|medi/i);
  });

  it("tarefa visual que alterou e MEDIU renderizado (browser_measure) → NÃO bloqueia", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: START, instruction: "deixe o título mais próximo do botão",
      finishSkips: 0, work: visualVerify(1, ["src/site.css"], true),
    });
    expect(d.block).toBe(false);
  });

  it("tarefa visual atingiu o limite de iterações → BLOQUEIA com terminal (nunca declara sucesso sem render)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: START, instruction: "deixe o título mais próximo do botão",
      finishSkips: 0, work: visualVerify(1, ["src/site.css"], false),
      visualIterations: MAX_VISUAL_ITERATIONS_DEFAULT,
    });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("visual");
    expect(d.terminal).toBe(true);
  });

  it("tarefa CONTENT alterou arquivo → não exige ciclo visual (não renderiza)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: START, instruction: "altere o texto do título para 'Bem-vindo'",
      finishSkips: 0, work: visualVerify(1, ["src/site.css"], false),
    });
    // Classificada como content → NÃO é bloqueada pela regra visual.
    expect(d.block).toBe(false);
  });

  it("tarefa visual sem alteração real continua bloqueada pela regra de evidência", () => {
    const d = decideFinishBlock({ mode: "edit", files: START, startFiles: START, instruction: "deixe o título mais próximo do botão", finishSkips: 0 });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("evidence");
  });

  it("falha de browser não vira sucesso: sem evidência de render, bloqueia", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: START, instruction: "deixe o título mais próximo do botão",
      finishSkips: 1, work: { inspectedBeforeEdit: true, verifiedAfterLastEdit: false, editActionCount: 1, editedPaths: ["src/site.css"] },
    });
    // mesmas garantias: nada de render/verify → bloqueia
    expect(d.block).toBe(true);
  });
});
