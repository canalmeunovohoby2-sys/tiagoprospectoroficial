import { describe, it, expect } from "vitest";
import { decideFinishBlock, instructionRequestsChange, isBroadQualityRequest, classifyCompletion, MAX_FINISH_SKIPS_DEFAULT, MAX_VISUAL_ITERATIONS_DEFAULT } from "../src/completion-guard";

const GOOD = {
  "index.html": `<!doctype html><html><head><title>Academia Forte</title></head><body>
    <nav><a href="#hero">Início</a></nav>
    <section class="hero" id="hero"><h1>Academia Forte</h1><img src="https://images.unsplash.com/photo-a" alt="academia"/><a class="cta" href="https://wa.me/55">Matricule-se</a></section>
    <iframe src="https://maps.google.com/maps?q=Sao%20Paulo&output=embed" title="Localizacao"></iframe>
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

  it("no limite de tentativas AINDA bloqueia e marca terminal (nunca vira sucesso)", () => {
    const d = decideFinishBlock({ mode: "generate", files: POOR, segment: "Academias", finishSkips: MAX_FINISH_SKIPS_DEFAULT });
    expect(d.block).toBe(true);
    expect(d.terminal).toBe(true);
  });

  it("maxFinishSkips custom: bloqueia até o limite e marca terminal", () => {
    const d1 = decideFinishBlock({ mode: "generate", files: POOR, segment: "x", finishSkips: 1, maxFinishSkips: 1 });
    expect(d1.block).toBe(true);
    expect(d1.terminal).toBe(true);
    expect(decideFinishBlock({ mode: "generate", files: POOR, segment: "x", finishSkips: 0, maxFinishSkips: 1 }).block).toBe(true);
  });

  it("quando o site finalmente passa nos gates, libera (mesmo após tentativas)", () => {
    const d = decideFinishBlock({ mode: "generate", files: GOOD, segment: "Academias", name: "Academia Forte", finishSkips: 3 });
    expect(d.block).toBe(false);
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
      work: { inspectedBeforeEdit: true, verifiedAfterLastEdit: true, renderVerifiedAfterLastEdit: true, editActionCount: 3, editedPaths: ["index.html", "src/site.css"] },
    });
    expect(d.block).toBe(false);
  });

  it("pedido cirúrgico que alterou mas NÃO verificou → BLOQUEIA (veracidade absoluta)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "troca a cor do botão para azul",
      finishSkips: 0,
      work: { inspectedBeforeEdit: false, verifiedAfterLastEdit: false, editActionCount: 1, editedPaths: ["src/site.css"] },
    });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/verifica|read_file|browser/i);
  });

  it("pedido cirúrgico que alterou E verificou → conclui (não bloqueia)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "troca a cor do botão para azul",
      finishSkips: 0,
      work: { inspectedBeforeEdit: false, verifiedAfterLastEdit: true, renderVerifiedAfterLastEdit: true, editActionCount: 1, editedPaths: ["src/site.css"] },
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

  it("no limite, o Depth Guard continua bloqueando (terminal)", () => {
    const d = decideFinishBlock({
      mode: "edit", files: CHANGED, startFiles: POOR, instruction: "melhore esse site",
      finishSkips: MAX_FINISH_SKIPS_DEFAULT,
      work: { inspectedBeforeEdit: false, verifiedAfterLastEdit: false, editActionCount: 1, editedPaths: ["src/site.css"] },
    });
    expect(d.block).toBe(true);
    expect(d.terminal).toBe(true);
  });
});

describe("FASE 7 — console/imagens/visual bloqueiam em TODAS as tentativas", () => {
  const DONE = {
    "index.html": `<!doctype html><html><head><link rel="stylesheet" href="src/site.css"></head><body><nav><a>a</a><a>b</a><a>c</a></nav><section class="hero"><h1>Loja</h1><img src="https://img.com/a.jpg"/></section><footer>f</footer></body></html>`,
    "src/site.css": ".hero{background:#111}@media(max-width:900px){.hero{width:100%}}",
  };
  const work = { inspectedBeforeEdit: true, verifiedAfterLastEdit: true, renderVerifiedAfterLastEdit: true, editActionCount: 1, editedPaths: ["index.html"] };
  const changed = { ...DONE, "index.html": DONE["index.html"].replace("Loja", "Loja Nova") };

  it("console error BLOQUEIA e marca terminal no limite", () => {
    const d = decideFinishBlock({ mode: "edit", files: changed, startFiles: DONE, instruction: "troque o texto do hero", finishSkips: 0, work, consoleErrors: ["TypeError: x is not a function"] });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("console");
    const t = decideFinishBlock({ mode: "edit", files: changed, startFiles: DONE, instruction: "troque o texto do hero", finishSkips: MAX_FINISH_SKIPS_DEFAULT, work, consoleErrors: ["TypeError: x"] });
    expect(t.block).toBe(true);
    expect(t.terminal).toBe(true);
  });

  it("imagem quebrada BLOQUEIA", () => {
    const d = decideFinishBlock({ mode: "edit", files: changed, startFiles: DONE, instruction: "troque o texto do hero", finishSkips: 0, work, brokenImages: 2 });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("images");
  });

  it("console limpo + imagens OK → não bloqueia", () => {
    const d = decideFinishBlock({ mode: "edit", files: changed, startFiles: DONE, instruction: "troque o texto do hero", finishSkips: 0, work, consoleErrors: [], brokenImages: 0 });
    expect(d.block).toBe(false);
  });
});

describe("FASE 7.1 — browser verification OBRIGATÓRIA para alterações visuais/asset", () => {
  const B = {
    "index.html": `<!doctype html><html><head><link rel="stylesheet" href="src/site.css"></head><body><nav><a>a</a><a>b</a><a>c</a></nav><section class="hero"><h1>Loja</h1><img src="assets/a.jpg"/></section><footer>f</footer><script src="src/main.js"></script></body></html>`,
    "src/site.css": ".hero{background:#111}@media(max-width:900px){.hero{width:100%}}",
    "src/main.js": "document.addEventListener('click',()=>{});",
    "src/data.json": "{\"a\":1}",
  };
  const CSS_AFTER = { ...B, "src/site.css": B["src/site.css"] + ".cta{color:#0af}" };
  const IMG_AFTER = { ...B, "index.html": B["index.html"].replace("assets/a.jpg", "assets/b.jpg") };
  const JS_AFTER = { ...B, "src/main.js": B["src/main.js"] + "window.__x=1;" };
  const JSON_AFTER = { ...B, "src/data.json": "{\"a\":2}" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const work = (over: Record<string, unknown> = {}): any => ({
    inspectedBeforeEdit: true, verifiedAfterLastEdit: true, renderVerifiedAfterLastEdit: false,
    editActionCount: 1, editedPaths: ["src/site.css"], visualEdit: true, assetEdit: false, ...over,
  });

  it("caso 1: editar IMAGEM sem browser → BLOQUEIA", () => {
    const d = decideFinishBlock({ mode: "edit", files: IMG_AFTER, startFiles: B, instruction: "troque a imagem do hero", finishSkips: 0, work: work({ editedPaths: ["index.html"] }) });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("visual");
  });

  it("caso 2: imagem + render real OK → PERMITE", () => {
    const d = decideFinishBlock({ mode: "edit", files: IMG_AFTER, startFiles: B, instruction: "troque a imagem do hero", finishSkips: 0, work: work({ editedPaths: ["index.html"], renderVerifiedAfterLastEdit: true }), consoleErrors: [], brokenImages: 0 });
    expect(d.block).toBe(false);
  });

  it("caso 3: imagem quebrada (brokenImages>0) → BLOQUEIA", () => {
    const d = decideFinishBlock({ mode: "edit", files: IMG_AFTER, startFiles: B, instruction: "troque a imagem do hero", finishSkips: 0, work: work({ editedPaths: ["index.html"], renderVerifiedAfterLastEdit: true }), brokenImages: 1 });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("images");
  });

  it("caso 4: editar CSS sem browser → BLOQUEIA", () => {
    const d = decideFinishBlock({ mode: "edit", files: CSS_AFTER, startFiles: B, instruction: "ajuste o espaçamento do hero", finishSkips: 0, work: work() });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("visual");
  });

  it("caso 5: CSS + render + console OK → PERMITE", () => {
    const d = decideFinishBlock({ mode: "edit", files: CSS_AFTER, startFiles: B, instruction: "ajuste o espaçamento do hero", finishSkips: 0, work: work({ renderVerifiedAfterLastEdit: true }), consoleErrors: [], brokenImages: 0 });
    expect(d.block).toBe(false);
  });

  it("caso 6: evidência ANTERIOR à última edição (stale) → BLOQUEIA", () => {
    const d = decideFinishBlock({ mode: "edit", files: CSS_AFTER, startFiles: B, instruction: "ajuste o espaçamento do hero", finishSkips: 0, work: work({ renderVerifiedAfterLastEdit: false }) });
    expect(d.block).toBe(true);
  });

  it("caso 7: editar JS com erro de console → BLOQUEIA", () => {
    const d = decideFinishBlock({ mode: "edit", files: JS_AFTER, startFiles: B, instruction: "corrija o comportamento do menu", finishSkips: 0, work: work({ editedPaths: ["src/main.js"], renderVerifiedAfterLastEdit: true }), consoleErrors: ["TypeError: x is not a function"], brokenImages: 0 });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("console");
  });

  it("caso 8: alteração visual sem nunca obter browser → limite marca terminal", () => {
    const d = decideFinishBlock({ mode: "edit", files: CSS_AFTER, startFiles: B, instruction: "ajuste o espaçamento do hero", finishSkips: 0, work: work({ renderVerifiedAfterLastEdit: false }), visualIterations: MAX_VISUAL_ITERATIONS_DEFAULT });
    expect(d.block).toBe(true);
    expect(d.terminal).toBe(true);
  });

  it("edição NÃO visual (json auxiliar) NÃO exige browser", () => {
    const d = decideFinishBlock({ mode: "edit", files: JSON_AFTER, startFiles: B, instruction: "atualize o arquivo de dados auxiliar", finishSkips: 0, work: work({ editedPaths: ["src/data.json"], visualEdit: false, renderVerifiedAfterLastEdit: false }) });
    expect(d.block).toBe(false);
  });
});

describe("Regression Guard (5.30) — edição não pode desmontar o site", () => {
  const RICH = {
    "index.html": `<!doctype html><html><head><title>Barbearia Nobre</title></head><body>
      <nav><a href="#inicio">Início</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav>
      <section class="hero" id="inicio"><h1>Barbearia Nobre</h1><p>Texto de conteúdo generoso para o site da barbearia, com bastante informação para não ser considerada uma página pequena nesta análise de regressão.</p><a class="cta" href="https://wa.me/5511">Agendar horário</a></section>
      <img src="https://images.unsplash.com/photo-1" alt="a"/><img src="https://images.unsplash.com/photo-2" alt="b"/><img src="https://images.unsplash.com/photo-3" alt="c"/><img src="https://images.unsplash.com/photo-4" alt="d"/>
      <footer>© Barbearia Nobre · (11) 99999-0000</footer>
    </body></html>`,
    "src/site.css": ".hero{background:#111}@media(max-width:900px){.hero{width:100%}}@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes slide{from{transform:none}to{transform:translateY(10px)}}",
  };

  it("edição destrutiva (perde imagens/nav/footer/responsividade) BLOQUEIA finish", () => {
    const gutted = {
      ...RICH,
      "index.html": `<!doctype html><html><head><title>X</title></head><body><h2>Novo</h2><p>curto</p></body></html>`,
      "src/site.css": "body{}",
    };
    const d = decideFinishBlock({ mode: "edit", files: gutted, startFiles: RICH, instruction: "muda a cor do botão", finishSkips: 0 });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toContain("REGRESSÃO");
  });

  it("edição preservando estrutura NÃO bloqueia (mesmo com arquivo reescrito)", () => {
    const edited = {
      ...RICH,
      "index.html": RICH["index.html"].replace("#inicio", "#home").replace("Agendar horário", "Agende agora"),
      "src/site.css": RICH["src/site.css"] + ".cta{transition:all .3s}",
    };
    const d = decideFinishBlock({ mode: "edit", files: edited, startFiles: RICH, instruction: "deixa o CTA com hover e texto 'Agende agora'", finishSkips: 0 });
    expect(d.block).toBe(false);
  });

  it("reescrita do zero EXPLÍCITA não passa pelo Regression Guard", () => {
    const novo = { ...RICH, "index.html": "<h1>Site novo</h1>" };
    const d = decideFinishBlock({ mode: "edit", files: novo, startFiles: RICH, instruction: "reescreva o site do zero com nova identidade", finishSkips: 0 });
    expect(d.block).toBe(false);
  });
});

describe("Image Swap Guard (5.35) — troca de imagem exige evidência real", () => {
  const BEFORE = {
    "index.html": `<!doctype html><html><body><nav><a>x</a><a>y</a><a>z</a></nav><section class="hero"><img src="https://img.com/hero-velha.jpg" alt="hero"/></section><img src="https://img.com/b.jpg" alt="b"/><img src="https://img.com/c.jpg" alt="c"/><footer>f</footer></body></html>`,
  };

  it("pede troca de imagem mas NENHUMA URL mudou → BLOQUEIA", () => {
    const d = decideFinishBlock({
      mode: "edit", files: BEFORE, startFiles: BEFORE, instruction: "troque a imagem do hero por uma mais profissional", finishSkips: 0,
    });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/nenhuma URL de imagem foi substituída|NENHUM arquivo foi modificado/i);
  });

  it("mudou texto mas a imagem continua a mesma → BLOQUEIA (não aceita 'fingir')", () => {
    const after = { "index.html": BEFORE["index.html"].replace("hero-velha.jpg", "hero-velha.jpg").replace(">hero</", ">Héroi novo</") };
    const d = decideFinishBlock({ mode: "edit", files: after, startFiles: BEFORE, instruction: "troque a imagem do hero", finishSkips: 0 });
    expect(d.block).toBe(true);
  });

  it("URL da imagem realmente trocada → NÃO bloqueia", () => {
    const after = { "index.html": BEFORE["index.html"].replace("hero-velha.jpg", "hero-nova-profissional.jpg") };
    const d = decideFinishBlock({ mode: "edit", files: after, startFiles: BEFORE, instruction: "troque a imagem do hero por uma mais profissional", finishSkips: 0 });
    expect(d.block).toBe(false);
  });

  it("pedido sem intenção de imagem (ex.: cor) não passa pelo Image Swap Guard", () => {
    const d = decideFinishBlock({ mode: "edit", files: BEFORE, startFiles: BEFORE, instruction: "troque a cor do botão", finishSkips: 0 });
    // sem alteração → regra de EVIDÊNCIA continua bloqueando (nenhum arquivo mudou)
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toContain("NENHUM arquivo foi modificado");
  });
});

describe("Veracidade absoluta (6.0) — criação/exclusão/falha/parcial", () => {
  const BASE: Record<string, string> = {
    "index.html": `<!doctype html><html><body><nav><a>x</a></nav><section class="hero"><h1>Loja</h1><img src="https://img.com/a.jpg"/></section><footer>f</footer></body></html>`,
    "src/unused.txt": "x",
  };
  const withVerify = (editActionCount: number, paths: string[]): { inspectedBeforeEdit: boolean; verifiedAfterLastEdit: boolean; editActionCount: number; editedPaths: string[] } => ({
    inspectedBeforeEdit: true, verifiedAfterLastEdit: true, editActionCount, editedPaths: paths,
  });

  it("criação de arquivo CONFIRMADA (arquivo existe) → pode concluir", () => {
    const withNew = { ...BASE, "src/novo.ts": "export const x = 1;" };
    const d = decideFinishBlock({ mode: "edit", files: withNew, startFiles: BASE, instruction: "crie um arquivo novo.ts com uma constante", finishSkips: 0, work: withVerify(1, ["src/novo.ts"]) });
    expect(d.block).toBe(false);
  });

  it("criação de arquivo NÃO realizada → não pode afirmar sucesso", () => {
    const d = decideFinishBlock({ mode: "edit", files: BASE, startFiles: BASE, instruction: "crie um arquivo novo.ts com uma constante", finishSkips: 0, work: withVerify(0, []) });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/NENHUM arquivo foi modificado/i);
  });

  it("exclusão CONFIRMADA (arquivo não existe mais) → pode concluir", () => {
    const after: Record<string, string> = { ...BASE };
    delete after["src/unused.txt"];
    const d = decideFinishBlock({ mode: "edit", files: after, startFiles: BASE, instruction: "remova o arquivo src/unused.txt", finishSkips: 0, work: withVerify(1, ["src/unused.txt"]) });
    expect(d.block).toBe(false);
  });

  it("exclusão NÃO realizada (nada mudou) → não pode afirmar sucesso", () => {
    const d = decideFinishBlock({ mode: "edit", files: BASE, startFiles: BASE, instruction: "remova o arquivo index.html", finishSkips: 0, work: withVerify(0, []) });
    expect(d.block).toBe(true);
  });

  it("falha de ferramenta (nenhuma mudança apesar do pedido) → bloqueia (não mascara)", () => {
    const d = decideFinishBlock({ mode: "edit", files: BASE, startFiles: BASE, instruction: "deixa o CTA azul", finishSkips: 0 });
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/NENHUM arquivo foi modificado/i);
  });

  it("tarefa parcialmente executada (alguns arquivos mudaram) → guard não bloqueia por evidência, mas exige verificação", () => {
    const partial = { ...BASE, "src/site.css": ".cta{background:#2563eb}" };
    const d = decideFinishBlock({ mode: "edit", files: partial, startFiles: BASE, instruction: "deixa o CTA azul e adiciona um rodapé", finishSkips: 0, work: { inspectedBeforeEdit: true, verifiedAfterLastEdit: false, editActionCount: 1, editedPaths: ["src/site.css"] } });
    // alterou (evidência passa) mas não verificou → bloqueia por VERIFICAÇÃO (não mascara parcial como pronto)
    expect(d.block).toBe(true);
    expect(d.reason ?? "").toMatch(/verifica/i);
  });
});

describe("Interpretação da conclusão — 'não verificado' ≠ 'falhou' (classifyCompletion)", () => {
  const base = {
    mode: "edit" as const,
    terminalReason: null as string | null,
    verificationRequired: true,
    changeApplied: true,
    finishTaskCalled: false,
    toolFailure: false,
    toolFailureDetail: null as string | null,
    touched: ["src/site.css"],
  };

  it("Caso A — alteração válida + finish_task aprovado → sucesso (sem mensagem de falha)", () => {
    const v = classifyCompletion({ ...base, finishTaskCalled: true });
    expect(v.ok).toBe(true);
    expect(v.error).toBeNull();
    expect(v.reply).toBeNull(); // usa a resposta do modelo
    expect(v.states.verification_performed).toBe(true);
    expect(v.states.verification_passed).toBe(true);
    expect(v.states.finish_task_called).toBe(true);
  });

  it("Caso B — válida + sem finish_task + sem erro/regressão → NÃO é falha; honesto e sem 'refaça'", () => {
    const v = classifyCompletion({ ...base });
    expect(v.ok).toBe(true);
    expect(v.error).toBeNull();
    expect(v.reply ?? "").toMatch(/Fiz a alteração em src\/site\.css/);
    expect(v.reply ?? "").toMatch(/não foi concluída|não vou afirmar/i);
    expect(v.reply ?? "").not.toMatch(/refaça|revise|falhou|NÃO declaro a tarefa/i);
    expect(v.states.change_applied).toBe(true);
    expect(v.states.verification_performed).toBe(false);
    expect(v.states.verification_passed).toBe(false);
  });

  it("Caso C — erro real de ferramenta → bloqueia e relata (não finge sucesso)", () => {
    const v = classifyCompletion({ ...base, toolFailure: true, toolFailureDetail: "edit_file: ENOENT" });
    expect(v.ok).toBe(false);
    expect(v.error ?? "").toMatch(/ferramenta falhou/i);
    expect(v.reply ?? "").toMatch(/edit_file/);
    expect(v.states.tool_failure).toBe(true);
  });

  it("Caso D — regressão detectada (terminal) → bloqueia e preserva o motivo real", () => {
    const motivo = "REGRESSÃO detectada na edição — preserve o trabalho existente.";
    const v = classifyCompletion({ ...base, terminalReason: motivo });
    expect(v.ok).toBe(false);
    expect(v.error).toBe(motivo);
    expect(v.reply).toBe(motivo);
    expect(v.states.regression_detected).toBe(true);
  });

  it("Caso E — alteração visual SEM verificação → aplicada, mas NÃO declara validado", () => {
    const v = classifyCompletion({ ...base, touched: ["src/site.css"] });
    expect(v.ok).toBe(true);
    expect(v.reply ?? "").not.toMatch(/validado|validada com sucesso|Pronto/i);
    expect(v.reply ?? "").toMatch(/não vou afirmar que ela foi validada/i);
    expect(v.states.verification_passed).toBe(false);
  });

  it("Caso F — alteração visual + browser/gates aprovados → validação concluída", () => {
    const v = classifyCompletion({ ...base, finishTaskCalled: true });
    expect(v.ok).toBe(true);
    expect(v.error).toBeNull();
    expect(v.reply).toBeNull();
    expect(v.states.verification_passed).toBe(true);
  });

  it("geração sem finish_task mantém o comportamento atual (server decide pelo gate)", () => {
    const v = classifyCompletion({ ...base, mode: "generate" });
    expect(v.ok).toBe(false);
    expect(v.error ?? "").toMatch(/VERIFICAÇÃO FINAL/);
    expect(v.unverified).toBe(true);
  });

  it("sem alteração aplicada e sem verificação → honesto, nunca 'falhou'", () => {
    const v = classifyCompletion({ ...base, changeApplied: false, touched: [] });
    expect(v.ok).toBe(true);
    expect(v.error).toBeNull();
    expect(v.reply ?? "").toMatch(/Não houve alteração/i);
    expect(v.reply ?? "").not.toMatch(/refaça|falhou/i);
  });
});
