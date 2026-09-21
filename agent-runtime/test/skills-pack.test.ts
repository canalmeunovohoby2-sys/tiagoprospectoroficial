import { describe, it, expect } from "vitest";
import { PACK_SKILLS, PACK_VERTICALS, PACK_INDEX_BLOCK, packSkillKnowledge } from "../src/studio/agent-core/skills-pack";
import { DESIGN_FOUNDATIONS_WITH_PACK } from "../src/studio/agent-core/design-skills";
import { buildEditSystemPrompt, buildGenerateSystemPrompt } from "../src/agent-identity";

// REGRESSÃO: o DESIGN_FOUNDATIONS condensou 01-core-design + 02-conversao, mas os VERTICAIS
// (04-verticais) ficaram FORA do agente — era isso que produzia site genérico e foto sem
// relação com o segmento. O pack (51 originais + 15 skills novas + 16 verticais BR) agora é
// carregado e conectado nos DOIS fluxos.
describe("skills-pack (pack senior) · carregado e conectado", () => {
  it("carrega o pack do disco (>=80 skills, 30 verticais)", () => {
    expect(PACK_SKILLS.length).toBeGreaterThanOrEqual(80);
    expect(PACK_VERTICALS.length).toBe(30);
    expect(PACK_SKILLS.some((s) => s.id === "site-energia-solar")).toBe(true);
    expect(PACK_SKILLS.some((s) => s.id === "cro-teste-ab")).toBe(true);
    expect(packSkillKnowledge("eletricista")).toMatch(/Residenciais/);
    expect(packSkillKnowledge("paisagismo")).toMatch(/Paisagismo/);
    expect(packSkillKnowledge("funeraria")).toMatch(/Funer/);
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
    expect(PACK_INDEX_BLOCK).toContain("Paisagismo".replace("Paisagismo", "paisagismo"));
    expect(DESIGN_FOUNDATIONS_WITH_PACK).toContain("site-energia-solar");
    const gerar = buildGenerateSystemPrompt({ hasBase: true, react: true });
    const editar = buildEditSystemPrompt({});
    expect(gerar).toContain("site-energia-solar");
    expect(editar).toContain("site-energia-solar");
    expect(gerar).toContain("paisagismo-jardinagem");
    expect(editar).toContain("paisagismo-jardinagem");
    // contexto sob controle (índice enxuto)
    expect(gerar.length).toBeLessThan(60_000);
    expect(editar.length).toBeLessThan(60_000);
  });

  it("preserva a autonomia criativa (o pack orienta, não engessa)", () => {
    expect(PACK_INDEX_BLOCK).toContain("DIREÇÃO CRIATIVA");
    expect(PACK_INDEX_BLOCK).not.toMatch(/hero\s*?\s*3 cards/i);
  });
});
