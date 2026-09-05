import { describe, it, expect } from "vitest";
import { AGENT_IDENTITY, buildEditSystemPrompt, buildGenerateSystemPrompt } from "../src/agent-identity";

describe("Agent Identity central (5.27) — profissional permanente", () => {
  it("identidade define papéis profissionais e proíbe template", () => {
    expect(AGENT_IDENTITY.toLowerCase()).toContain("senior web designer");
    expect(AGENT_IDENTITY).toContain("Art Director");
    expect(AGENT_IDENTITY).toContain("Frontend Engineer");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("não é um gerador de templates");
  });

  it("regras anti-preguiça e anti-invenção estão presentes", () => {
    expect(AGENT_IDENTITY.toLowerCase()).toContain("não fazer o mínimo");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("autocrítica");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("nunca invente");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("mesma url de imagem");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("evidência");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("ciclos");
  });

  it("prompt de edição usa a identidade central (sem prompt local duplicado)", () => {
    const p = buildEditSystemPrompt();
    expect(p).toContain("ENTENDER ANTES DE EDITAR");
    expect(p).toContain("BROWSER QA");
    expect(p.toLowerCase()).toContain("pt-br");
  });

  it("prompt de geração usa identidade + missão + self-check", () => {
    const p = buildGenerateSystemPrompt();
    expect(p).toContain("MISSÃO AGORA");
    expect(p).toContain("SELF-CHECK DE GERAÇÃO");
    expect(p).toContain("hero forte");
    expect(p).toContain("não só cards empilhados");
  });

  it("identidade inclui skills de Senior UI/UX + landing de alta conversão", () => {
    expect(AGENT_IDENTITY).toContain("Senior UI/UX Director");
    expect(AGENT_IDENTITY).toContain("Landing Page Specialist");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("glassmorphism");
    expect(AGENT_IDENTITY.toLowerCase()).toContain("arquitetura de conversão");
    expect(AGENT_IDENTITY).toContain("CÓDIGO INTEGRAL");
    expect(AGENT_IDENTITY).toContain("psicologia das cores");
  });
});
