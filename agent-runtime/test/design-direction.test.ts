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
    expect(buildDesignDirection(DENTISTA, "x").block).toMatch(/clínico-premium/i);
    expect(buildDesignDirection(PET, "x").block).toMatch(/acolhedor e energético/i);
    expect(buildDesignDirection(RESTAURANTE, "x").block).toMatch(/gastronômico/i);
    expect(buildDesignDirection(ELETRICISTA, "x").block).toMatch(/técnico e confiável/i);
    // sem segmento conhecido → perfil padrão (nunca vazio)
    expect(personalityFor("").label).toBeTruthy();
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
