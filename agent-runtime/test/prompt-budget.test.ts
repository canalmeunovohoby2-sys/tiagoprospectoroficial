import { describe, it, expect } from "vitest";
import { buildEditSystemPrompt, buildGenerateSystemPrompt } from "../src/agent-identity";
import { packSkillKnowledge } from "../src/studio/agent-core/skills-pack";

// RODADA "enxugar sem perder o padrão": os prompts passam a usar digests compactos
// (DESIGN_FOUNDATIONS_COMPACT + BROWSER_QA_COMPACT + CONTACT_AND_PHOTOS enxuto) no lugar
// dos blocos longos. Os originais continuam exportados/tool-acessíveis.
const semAcento = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const GEN = buildGenerateSystemPrompt({ hasBase: true, react: true });
const EDIT = buildEditSystemPrompt({});

describe("orçamento do prompt", () => {
  it("geração e edição dentro do teto de regressão", () => {
    // Teto de regressão: impede o prompt de voltar a inchar silenciosamente.
    // Alvo ideal (~20 KB) exige uma passada dedicada no AGENT_IDENTITY (ver relatório).
    expect(GEN.length).toBeLessThanOrEqual(30_000);
    expect(EDIT.length).toBeLessThanOrEqual(30_000);
    // e a compactação precisa ter acontecido de fato
    expect(GEN.length).toBeLessThan(36_000);
    expect(EDIT.length).toBeLessThan(30_000);
  });

  it("geração manteve TODOS os conceitos críticos do padrão Senior", () => {
    for (const marca of [
      "PADRÃO SENIOR", "DESIGN SYSTEM", "HIERARQUIA", "HERO", "COPY DE CONVERS",
      "PROVA SOCIAL", "FAQ", "MOBILE", "ACESSIBILIDADE", "PERFORMANCE", "MOTION",
      "IMAGENS", "SEO", "PREMIUM", "ANTI-TEMPLATE", "TIPOGRAFIA", "RITMO VISUAL",
      "VIDA VISUAL", "Marquee", "BROWSER QA", "ENDEREÇO", "FOTOS", "SKILLS SENIOR DO SEGMENTO",
    ]) {
      expect(semAcento(GEN), `geração perdeu: ${marca}`).toContain(semAcento(marca));
    }
  });

  it("edição manteve as regras essenciais (endereço, fotos, QA, pack, edição)", () => {
    for (const marca of ["BROWSER QA", "ENDEREÇO", "FOTOS", "SKILLS SENIOR DO SEGMENTO", "EDIÇÃO DE ASSET"]) {
      expect(semAcento(EDIT), `edição perdeu: ${marca}`).toContain(semAcento(marca));
    }
  });

  it("NAO repete o bloco de contato/fotos em dois lugares do mesmo prompt", () => {
    const ocorrencias = (GEN.match(/ENDEREÇO é dado de contato/g) ?? []).length;
    expect(ocorrencias).toBe(1);
  });

  it("o pack continua acessível e resolvendo o vertical do segmento", () => {
    expect(GEN).toContain("site-energia-solar");
    expect(EDIT).toContain("site-energia-solar");
    expect(packSkillKnowledge("energia solar")).toMatch(/Energia Solar/i);
    expect(packSkillKnowledge("odontologia")).toMatch(/Odontol/i);
  });

  it("produto (saas/mobile) continua roteável a partir do prompt", () => {
    expect(GEN).toContain("PRODUTO (SaaS");
    expect(packSkillKnowledge("saas multi-tenant")).toContain("SKILLS DE PRODUTO");
  });
});
