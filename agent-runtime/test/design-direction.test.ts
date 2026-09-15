import { describe, it, expect } from "vitest";
import {
  buildDesignDirection, hasArtDirection, personalityFor, ART_DIRECTION_MARKER,
} from "../src/studio/agent-core/design-direction";
import { CODER_SYSTEM } from "../src/studio/team";

const DENTISTA = { name: "Clínica Dra Mariana Ribeiro", segment: "Dentistas", city: "Bauru", state: "SP" };
const PET = { name: "Pet Amigo", segment: "Pet Shop", city: "Bauru", state: "SP" };
const RESTAURANTE = { name: "Cantina Bella", segment: "Restaurantes", city: "Bauru", state: "SP" };
const ELETRICISTA = { name: "Eletrica Voltz", segment: "Eletricistas", city: "Bauru", state: "SP" };

describe("design-direction · direção de arte determinística por negócio", () => {
  it("é determinística para o mesmo projeto (mesmo seed → mesma direção)", () => {
    const a = buildDesignDirection(DENTISTA, "proj-1");
    const b = buildDesignDirection(DENTISTA, "proj-1");
    expect(a).toEqual(b);
  });

  it("varia entre projetos diferentes (não repete o mesmo 'site de blocos')", () => {
    const seeds = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const archetypes = new Set(seeds.map((s) => buildDesignDirection(DENTISTA, s).archetype));
    const heroes = new Set(seeds.map((s) => buildDesignDirection(DENTISTA, s).heroComposition));
    expect(archetypes.size).toBeGreaterThan(1);
    expect(heroes.size).toBeGreaterThan(1);
  });

  it("a personalidade nasce do SEGMENTO (segmentos diferentes → direções diferentes)", () => {
    expect(personalityFor("Dentistas").label).not.toBe(personalityFor("Pet Shop").label);
    expect(personalityFor("Restaurantes").label).not.toBe(personalityFor("Eletricistas").label);
    expect(buildDesignDirection(DENTISTA, "x").block).toMatch(/odontológico editorial/i);
    expect(buildDesignDirection(PET, "x").block).toMatch(/acolhedor e energético/i);
    expect(buildDesignDirection(RESTAURANTE, "x").block).toMatch(/gastronômico/i);
    expect(buildDesignDirection(ELETRICISTA, "x").block).toMatch(/técnico e confiável/i);
    // sem segmento conhecido → perfil padrão (nunca vazio)
    expect(personalityFor("").label).toBeTruthy();
  });

  it("ODONTO/PSICO/MASSO ganham direção própria e proíbem o clichê genérico", () => {
    // Odontologia: editorial; proíbe azul hospitalar, cards idênticos e cara de SaaS.
    const odonto = buildDesignDirection({ name: "Clínica Sorriso", segment: "Odontologia" }, "p1").block;
    expect(odonto).toMatch(/odontológico editorial/i);
    expect(odonto).toMatch(/azul[-\s]?hospital/i);
    expect(odonto).toMatch(/cards idênticos/i);
    expect(odonto).toMatch(/SaaS\/dashboard/i);
    // Psicologia: humano/acolhedor, confiança antes de venda.
    const psico = buildDesignDirection({ name: "Consulta", segment: "Psicologia" }, "p2").block;
    expect(psico).toMatch(/humano e acolhedor/i);
    expect(psico).toMatch(/confiança antes de venda/i);
    expect(psico).toMatch(/venda agressiva/i);
    // Massoterapia: sensorial/boutique, atmosfera e textura.
    const masso = buildDesignDirection({ name: "Espaço Zen", segment: "Massoterapia" }, "p3").block;
    expect(masso).toMatch(/sensorial e boutique/i);
    expect(masso).toMatch(/atmosfera/i);
    expect(masso).toMatch(/clínica fria/i);
    // Segmentos que já funcionam NÃO regridem.
    expect(buildDesignDirection({ name: "Academia X", segment: "Academia" }, "p4").block).toMatch(/atlético e enérgico/i);
    // Energia Solar NÃO é capturada pelas regras novas (mantém o perfil anterior).
    expect(buildDesignDirection({ name: "Solar Y", segment: "Energia Solar" }, "p5").block).not.toMatch(/odontológico editorial|sensorial e boutique|humano e acolhedor/i);
  });

  it("o briefing proíbe o padrão de blocos e exige autocrítica + marcador", () => {
    const d = buildDesignDirection(DENTISTA, "proj-1");
    expect(d.block).toContain("BRIEFING DE DIREÇÃO DE ARTE");
    expect(d.block).toContain("navbar");
    expect(d.block).toContain("AUTOCRÍTICA");
    expect(d.block).toContain(ART_DIRECTION_MARKER);
    expect(d.block).toMatch(/hero/i);
    expect(d.avoid.join(" ")).toMatch(/cards idênticos|site de blocos|navbar/);
  });
});

describe("design-direction · marcador de direção de arte", () => {
  it("detecta o marcador nos arquivos do projeto (e ignora o resto)", () => {
    expect(hasArtDirection({ "src/App.tsx": `// ${ART_DIRECTION_MARKER} archetype=editorial` })).toBe(true);
    expect(hasArtDirection({ "src/components/Hero.tsx": `/* ${ART_DIRECTION_MARKER} */` })).toBe(true);
    expect(hasArtDirection({ "src/App.tsx": "export default function App(){return null}" })).toBe(false);
    expect(hasArtDirection({ "node_modules/x/index.js": ART_DIRECTION_MARKER })).toBe(false);
    expect(hasArtDirection(null)).toBe(false);
  });
});

describe("design-direction · CODER_SYSTEM recebe a metodologia", () => {
  it("exige análise, hero com personalidade, ritmo, autocrítica e o marcador", () => {
    expect(CODER_SYSTEM).toMatch(/METODOLOGIA/);
    expect(CODER_SYSTEM).toMatch(/diretor de arte/i);
    expect(CODER_SYSTEM).toMatch(/PROIBIDO como padrão/);
    expect(CODER_SYSTEM).toMatch(/AUTOCRÍTICA/);
    expect(CODER_SYSTEM).toMatch(/NÃO centralize tudo/);
    expect(CODER_SYSTEM).toContain(ART_DIRECTION_MARKER);
  });
});

describe("auditoria · direção de arte é CONTEXTO (não template disfarçado)", () => {
  const ODONTO = { name: "Clinica Sorriso", segment: "Odontologia", city: "Bauru", state: "SP" };
  const ACADEMIA = { name: "Iron Gym", segment: "Academia", city: "Bauru", state: "SP" };

  it("o briefing se declara GUIA e pede decisão própria (não impõe layout)", () => {
    const b = buildDesignDirection(ODONTO, "proj-a").block;
    expect(b).toMatch(/N[ÃO]O é layout pronto/i);
    expect(b).toMatch(/decida a partir do negócio/i);
    expect(b).toMatch(/ANTES de codar/i);
    expect(b).toMatch(/AUTOCR[ÍI]TICA/i);       // o modelo julga e reestrutura
    // NÃO contém estrutura pronta (nenhum código/JSX nem ordem fixa obrigatória)
    expect(b).not.toMatch(/<section|<div|className|import /);
    expect(b).not.toMatch(/use exatamente esta estrutura|ordem obrigat[óo]ria/i);
    // E o system prompt confirma a liberdade do modelo sobre o briefing.
    expect(CODER_SYSTEM).toMatch(/Siga-o e refine com decisões próprias/i);
    expect(CODER_SYSTEM).toMatch(/ele existe para você N[ÃA]O repetir/i);
  });

  it("odonto × academia → direções DIFERENTES (não é o mesmo template recolorido)", () => {
    const od = buildDesignDirection(ODONTO, "proj-a");
    const ac = buildDesignDirection(ACADEMIA, "proj-b");
    expect(od.personality).not.toBe(ac.personality);
    expect(od.block).toMatch(/odontológico editorial/i);
    expect(ac.block).toMatch(/atlético e enérgico/i);
    // paletas/apoios distintos no texto do briefing
    expect(od.block).toMatch(/marfim|neutros frios/i);
    expect(ac.block).toMatch(/alto contraste|escuro \+ acento/i);
  });

  it("MESMO segmento em 2 execuções: mesma direção é estável, mas projetos DIFERENTES variam", () => {
    // estabilidade por projeto (mesmo projectId ⇒ idêntico)
    expect(buildDesignDirection(ODONTO, "proj-a")).toEqual(buildDesignDirection(ODONTO, "proj-a"));
    // projetos diferentes ⇒ combinação diferente (arquétipo/hero/grid variam)
    const seeds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const archetypes = new Set(seeds.map((s) => buildDesignDirection(ODONTO, s).archetype));
    const heroes = new Set(seeds.map((s) => buildDesignDirection(ODONTO, s).heroComposition));
    expect(archetypes.size).toBeGreaterThan(1);
    expect(heroes.size).toBeGreaterThan(1);
    // mas a PERSONALIDADE (segmento) não muda com o seed — é o negócio que manda
    const personas = new Set(seeds.map((s) => buildDesignDirection(ODONTO, s).personality));
    expect(personas.size).toBe(1);
  });
});
