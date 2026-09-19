import { describe, it, expect } from "vitest";
import {
  buildDesignDirection,
  extractBrandColors,
  personalityFor,
  hasArtDirection,
  ART_DIRECTION_MARKER,
} from "../src/studio/agent-core/design-direction";
import { buildReactMission, directionApplied } from "../src/server";

// FASE 3 — DIREÇÃO CRIATIVA REAL POR NEGÓCIO.
// Prova: contexto real → direção determinística → missão do agente → verificação
// no código final. Nada de teste que só confere "creativeBrief != null".

const usinagem = {
  name: "Usinagem Precisão Ferro Ltda",
  segment: "Usinagem CNC e metalurgia industrial",
  city: "Joinville",
  state: "SC",
  address: "Rua das Indústrias, 900",
  services: ["Usinagem CNC", "Torneamento", "Fresamento", "Prototipagem"],
  photos: ["https://cdn.exemplo.com/maquina-1.jpg", "https://cdn.exemplo.com/fabrica-2.jpg"],
};

const clinica = {
  name: "Clínica Vida Odontologia",
  segment: "Clínica odontológica",
  city: "Florianópolis",
  state: "SC",
  services: ["Implantes", "Ortodontia"],
  photos: [],
};

const imobiliaria = {
  name: "Imobiliária Litoral",
  segment: "Imobiliária e corretagem de imóveis",
  city: "Balneário Camboriú",
  state: "SC",
  services: ["Apartamentos", "Casas", "Locação"],
  photos: [],
};

describe("FASE 3 · A) negócios diferentes → direções estruturalmente diferentes", () => {
  it("usinagem industrial ≠ clínica ≠ imobiliária (personalidade, plano de seções e imagem)", () => {
    const dUsina = buildDesignDirection(usinagem);
    const dClinica = buildDesignDirection(clinica);
    const dImob = buildDesignDirection(imobiliaria);

    expect(dUsina.personality).not.toBe(dClinica.personality);
    expect(dClinica.personality).not.toBe(dImob.personality);

    // diferença ESTRUTURAL (plano de seções), não só texto
    expect(dUsina.sectionPlan.join(" | ")).toMatch(/Capacidades e especificações técnicas/i);
    expect(dClinica.sectionPlan.join(" | ")).toMatch(/Tratamentos|confiança/i);
    expect(dImob.sectionPlan.join(" | ")).toMatch(/Imóveis|Região de atuação/i);
    expect(dUsina.sectionPlan.join(" | ")).not.toBe(dClinica.sectionPlan.join(" | "));

    // conceito e hero também divergem
    expect(dUsina.visualConcept).not.toBe(dClinica.visualConcept);
    expect(dUsina.heroComposition).not.toBe(dClinica.heroComposition);
  });
});

describe("FASE 3 · B) mesmo segmento, contextos diferentes (sem randomização)", () => {
  const industrialA = { ...usinagem, name: "MetalTec Automação", city: "Caxias do Sul", photos: ["https://x.com/a.jpg"] };
  const industrialB = { ...usinagem, name: "Ferro & Forma", city: "Sorocaba", photos: [] };

  it("contextos diferentes → direções diferentes; mesmo contexto → idêntico (determinístico)", () => {
    const a1 = buildDesignDirection(industrialA, "proj-a|MetalTec|metalurgia|Caxias do Sul");
    const b1 = buildDesignDirection(industrialB, "proj-b|Ferro & Forma|metalurgia|Sorocaba");
    expect(a1.seed).not.toBe(b1.seed);
    expect([a1.archetype, a1.grid, a1.typeScale].join("|")).not.toBe([b1.archetype, b1.grid, b1.typeScale].join("|") || "");

    // SEM randomização: repetir o mesmo input devolve exatamente a mesma direção
    const a2 = buildDesignDirection(industrialA, "proj-a|MetalTec|metalurgia|Caxias do Sul");
    expect(a2).toEqual(a1);
  });

  it("a ordem das seções é determinística e pode diferir entre contextos", () => {
    const planA = buildDesignDirection({ ...industrialA }, "s1").sectionPlan.join(" → ");
    const planA2 = buildDesignDirection({ ...industrialA }, "s1").sectionPlan.join(" → ");
    expect(planA2).toBe(planA);
    expect(planA).toMatch(/Conversão|Localização/i);
  });
});

describe("FASE 3 · C) identidade existente é preservada", () => {
  it("cores da marca (CSS vars) entram na direção como identidade a preservar", () => {
    const files = { "src/site.css": ":root{ --primary: #0b5cff; --accent: #ff7a00; }" };
    const colors = extractBrandColors(files);
    expect(colors).toEqual(expect.arrayContaining(["#0b5cff", "#ff7a00"]));

    const d = buildDesignDirection({ ...clinica, brandColors: colors });
    expect(d.brandColors).toEqual(expect.arrayContaining(["#0b5cff", "#ff7a00"]));
    expect(d.block).toMatch(/IDENTIDADE EXISTENTE \(preservar de verdade\)/);
    expect(d.block).toContain("#0b5cff");
    expect(d.block).toMatch(/NÃO recrie a marca com outra paleta/i);
  });

  it("sem identidade declarada não inventa cores de marca", () => {
    expect(extractBrandColors({ "src/site.css": ".btn{color:#fff}" })).toEqual([]);
    expect(buildDesignDirection(clinica).brandColors).toEqual([]);
    expect(buildDesignDirection(clinica).block).not.toMatch(/IDENTIDADE EXISTENTE/);
  });
});

describe("FASE 3 · D) fotos reais mudam a estratégia visual", () => {
  it("com fotos reais: hero fotográfico + prioridade explícita sobre stock", () => {
    const d = buildDesignDirection(usinagem);
    expect(d.imageStrategy).toMatch(/foto\(s\) REAIS/i);
    expect(d.imageStrategy).toMatch(/NÃO substituir por stock/i);
    expect(d.block).toMatch(/Imagens: priorizar as 2 foto\(s\) REAIS/);
    expect(d.heroComposition).toMatch(/foto real/i);
    expect(d.sectionPlan.join(" ")).toMatch(/galeria\/ambiente com as fotos REAIS/i);
  });

  it("sem fotos reais: não finge foto do negócio", () => {
    const d = buildDesignDirection(clinica);
    expect(d.imageStrategy).toMatch(/SEM foto real utilizável/i);
    expect(d.imageStrategy).toMatch(/NUNCA fingir/i);
  });
});

describe("FASE 3 · E/F) a direção chega ao agente e é verificável no código", () => {
  it("E) a missão do agente contém a direção ANTES da instrução (obrigatória)", () => {
    // identidade existente + fotos reais: a missão precisa carregar as duas coisas
    const direction = buildDesignDirection({ ...usinagem, brandColors: ["#0b5cff"] }, "proj-x");
    const mission = buildReactMission({
      continuityBlock: "\nMEMÓRIA DE DECISÕES (preserve):\n- cliente quer tom industrial\n",
      directionBlock: direction.block,
      instruction: "Gere o site da Usinagem Precisão Ferro",
      creativeBrief: "CONCEITO: aço e precisão",
      mediaBlock: "\nFOTOS REAIS: 2",
    });
    expect(mission).toContain("DIREÇÃO CRIATIVA DESTE NEGÓCIO");
    expect(mission).toContain(ART_DIRECTION_MARKER);
    expect(mission).toContain("Capacidades e especificações técnicas");
    expect(mission).toContain("IDENTIDADE EXISTENTE");
    // a direção vem ANTES da instrução (rege a execução)
    expect(mission.indexOf("DIREÇÃO CRIATIVA DESTE NEGÓCIO")).toBeLessThan(mission.indexOf("Gere o site"));
  });

  it("F) a direção é checável no código final (marcador ART-DIRECTION ou identidade aplicada)", () => {
    const comMarcador = { "src/App.tsx": `// ${ART_DIRECTION_MARKER} arquétipo technical, #0b5cff, hero foto\nconst App = () => null;` };
    expect(hasArtDirection(comMarcador)).toBe(true);
    expect(directionApplied(comMarcador, [])).toBe(true);

    const comIdentidade = { "src/site.css": ":root{--primary:#0b5cff}" };
    expect(hasArtDirection(comIdentidade)).toBe(false);
    expect(directionApplied(comIdentidade, ["#0b5cff"])).toBe(true);

    const semNada = { "index.html": "<h1>Site</h1>" };
    expect(directionApplied(semNada, ["#0b5cff"])).toBe(false);
    expect(directionApplied(null, [])).toBe(false);
  });

  it("o bloco da direção é acionável (tokens concretos, não adjetivos soltos)", () => {
    const d = buildDesignDirection(usinagem, "proj-x");
    expect(d.block).toMatch(/Arquétipo visual: /);
    expect(d.block).toMatch(/Composição do hero: /);
    expect(d.block).toMatch(/Grid\/composição: /);
    expect(d.block).toMatch(/Tipografia: /);
    expect(d.block).toMatch(/Estilo de CTA: /);
    expect(d.block).toMatch(/ESTRUTURA DESTE SITE/);
    expect(d.block).toMatch(/EVITE: /);
    expect(d.avoid.length).toBeGreaterThan(3);
  });
});

describe("FASE 3 · personalidade por segmento (referência, não template)", () => {
  it("segmentos diferentes recebem personalidades coerentes e distintas", () => {
    expect(personalityFor("Usinagem CNC e metalurgia industrial").label.length).toBeGreaterThan(0);
    expect(personalityFor("Clínica odontológica").label).not.toBe(personalityFor("Usinagem CNC").label);
    expect(personalityFor("Restaurante italiano").label).not.toBe(personalityFor("Imobiliária").label);
  });

  it("o mesmo segmento com contextos diferentes NÃO é obrigado ao mesmo bloco", () => {
    const a = buildDesignDirection({ segment: "Usinagem CNC", name: "Alpha", photos: ["https://x.com/1.jpg"] });
    const b = buildDesignDirection({ segment: "Usinagem CNC", name: "Beta", photos: [] });
    expect(a.block).not.toBe(b.block);
  });
});
