import { describe, it, expect } from "vitest";
import { PACK_SKILLS, PACK_VERTICALS, PACK_INDEX_BLOCK, packSkillKnowledge } from "../src/studio/agent-core/skills-pack";
import { DESIGN_FOUNDATIONS_WITH_PACK } from "../src/studio/agent-core/design-skills";
import { buildEditSystemPrompt, buildGenerateSystemPrompt } from "../src/agent-identity";

// REGRESSÃO: o DESIGN_FOUNDATIONS condensou 01-core-design + 02-conversao, mas os 14
// VERTICAIS (04-verticais) ficaram FORA do agente — era isso que produzia site genérico
// e foto sem relação com o segmento. O pack agora é carregado e conectado nos DOIS fluxos.
describe("skills-pack (pack senior) · carregado e conectado", () => {
  it("carrega o pack do disco (≥45 skills, 14 verticais)", () => {
    expect(PACK_SKILLS.length).toBeGreaterThanOrEqual(65);
    expect(PACK_SKILLS.some((s) => s.id === "cro-teste-ab")).toBe(true);
    expect(PACK_SKILLS.some((s) => s.id === "social-share-og-meta")).toBe(true);
    expect(PACK_SKILLS.some((s) => s.id === "paginas-erro-404-manutencao")).toBe(true);
    expect(PACK_VERTICALS.length).toBe(14);
    expect(PACK_SKILLS.some((s) => s.id === "site-energia-solar")).toBe(true);
  });

  it("o vertical do SEGMENTO é encontrado pela ferramenta design_skills", () => {
    expect(packSkillKnowledge("energia solar")?.split("\n")[0]).toMatch(/Energia Solar/i);
    expect(packSkillKnowledge("site-energia-solar")?.split("\n")[0]).toMatch(/Energia Solar/i);
    expect(packSkillKnowledge("academia")?.split("\n")[0]).toMatch(/Academia/i);
    expect(packSkillKnowledge("odontologia")?.split("\n")[0]).toMatch(/Odontol/i);
    expect(packSkillKnowledge("")).toBeNull();
  });

  it("o índice dos verticais entra no prompt de GERAÇÃO e no de EDIÇÃO", () => {
    expect(PACK_INDEX_BLOCK).toContain("site-energia-solar");
    expect(DESIGN_FOUNDATIONS_WITH_PACK).toContain("site-energia-solar");
    const gerar = buildGenerateSystemPrompt({ hasBase: true, react: true });
    const editar = buildEditSystemPrompt({});
    expect(gerar).toContain("site-energia-solar");
    expect(editar).toContain("site-energia-solar");
    // e não estoura o contexto
    expect(gerar.length).toBeLessThan(60_000);
    expect(editar.length).toBeLessThan(60_000);
  });

  it("preserva a autonomia criativa (o pack orienta, não engessa)", () => {
    expect(PACK_INDEX_BLOCK).toContain("DIREÇÃO CRIATIVA");
    expect(PACK_INDEX_BLOCK).not.toMatch(/hero\s*→\s*3 cards/i);
  });
});
