import { describe, it, expect } from "vitest";
import { buildGenerationPlan, formatGenerationPlan } from "../src/studio/agent-core/generation-plan";
import { buildEditSystemPrompt } from "../src/agent-identity";

// PLANEJAMENTO DETERMINÍSTICO (inspiração no fluxo publico do Lovable): entender -> estrutura
// -> direcao -> imagens -> implementar. Sem chamada extra de LLM.
describe("plano deterministico de geracao", () => {
  it("energia solar gera estrutura propria (nao template generico)", () => {
    const p = buildGenerationPlan({ businessName: "Aureon Energia Solar", segment: "energia solar", city: "Bariri", state: "SP" });
    expect(p.secoes.join(" ")).toMatch(/telhado|terreno/i);
    expect(p.secoes.join(" ")).toMatch(/homologa/i);
    expect(p.cta).toMatch(/visita t/i);
    expect(p.imagensNecessarias[0].intencao).toMatch(/fotovoltaic|solar|painel/i);
    expect(p.necessidadesTecnicas.join(" ")).toMatch(/React/);
  });

  it("segmentos diferentes geram planos diferentes", () => {
    const solar = buildGenerationPlan({ segment: "energia solar" });
    const acad = buildGenerationPlan({ segment: "academia" });
    const usi = buildGenerationPlan({ segment: "usinagem" });
    expect(solar.cta).not.toBe(acad.cta);
    expect(acad.imagensNecessarias[0].intencao).toMatch(/treino|academia|fitness/i);
    expect(usi.cta).toMatch(/or.amento/i);
  });

  it("o bloco do plano e curto e objetivo", () => {
    const bloco = formatGenerationPlan(buildGenerationPlan({ segment: "energia solar" }));
    expect(bloco).toContain("PLANO DA GERA");
    expect(bloco).toContain("Objetivo:");
    expect(bloco).toContain("Imagens necess");
    expect(bloco.length).toBeLessThan(2200);
  });

  it("edicao NAO carrega o plano (edicao localizada vai direto ao arquivo)", () => {
    expect(buildEditSystemPrompt({})).not.toContain("PLANO DA GERA");
  });
});
