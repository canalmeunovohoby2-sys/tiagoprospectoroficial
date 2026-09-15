import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DESIGN_SKILLS, DESIGN_SKILLS_FULL, DESIGN_SKILL_TOPICS, designSkillsKnowledge,
} from "../src/studio/agent-core/design-skills";
import { buildCoderTools } from "../src/studio/agent-core/agent-tools";

describe("design-skills · conhecimento INSTALADO (consultado sob demanda, sem prompt)", () => {
  it("cobre as técnicas-chave do brief", () => {
    const s = DESIGN_SKILLS_FULL;
    expect(s).toMatch(/DESIGN CONTEXTUAL|CONTEXTUAL/i);
    expect(s).toMatch(/DESIGN SYSTEM/i);
    expect(s).toMatch(/LUXURY DARK MODE/i);
    expect(s).toMatch(/UI POLISHED/i);
    expect(s).toMatch(/MOTION/i);
    expect(s).toMatch(/CRO/i);
    expect(s).toMatch(/COPY PERSUASIVA/i);
    expect(s).toMatch(/COMPONENTES INTERATIVOS/i);
    expect(s).toMatch(/MOBILE-FIRST/i);
    expect(s).toMatch(/PERFORMANCE/i);
    expect(s).toMatch(/MÍDIA REAL/i);
    expect(s).toMatch(/GOOGLE MAPS/i);
    expect(s).toMatch(/AUTOCRÍTICA/i);
    expect(s).toMatch(/DIFERENCIAÇÃO/i);
    // regras concretas que evitam regressão
    expect(s).toMatch(/overflow-x-auto/);
    expect(s).toMatch(/loading="lazy"/);
    expect(s).toMatch(/loading="eager"/);
    expect(s).toMatch(/wa\.me/);
  });

  it("a lista de tópicos existe e é estável (alimenta o enum da ferramenta)", () => {
    expect(DESIGN_SKILL_TOPICS.length).toBe(DESIGN_SKILLS.length);
    expect(DESIGN_SKILL_TOPICS).toContain("motion");
    expect(DESIGN_SKILL_TOPICS).toContain("cro");
    expect(DESIGN_SKILL_TOPICS).toContain("mobile");
    expect(DESIGN_SKILL_TOPICS).toContain("performance");
    // Skill nova instalada SEM remover as 20 anteriores.
    expect(DESIGN_SKILL_TOPICS).toContain("inspecao-profunda");
    expect(DESIGN_SKILLS.length).toBeGreaterThanOrEqual(21);
  });

  it("SKILL inspeção profunda: varredura global, cores relacionadas, bugs e arquivo completo", () => {
    const s = designSkillsKnowledge("inspecao-profunda");
    expect(s).toMatch(/VARREDURA GLOBAL/);
    expect(s).toMatch(/PROIBIDO mudar s[oó] o hero/i);
    expect(s).toMatch(/hover/);
    expect(s).toMatch(/transpar/i);
    expect(s).toMatch(/gradiente/i);
    expect(s).toMatch(/overflow-x/);
    expect(s).toMatch(/breakpoints/i);
    expect(s).toMatch(/DIAGN[ÓO]STICO ATIVO/i);
    expect(s).toMatch(/ARQUIVO COMPLETO/i);
    expect(s).toMatch(/<!DOCTYPE html>/);
    expect(s).toMatch(/PROIBIDO mensagem de atalho/i);
    expect(s).toMatch(/restante permanece igual/);
    expect(s).toMatch(/COMPROMISSO DE RENDERIZA[ÇC][ÃA]O/i);
    // Não traz o guia inteiro (é tópico, economia de tokens).
    expect(s).not.toContain("LUXURY DARK MODE");
  });

  it("sem tópico devolve o guia completo", () => {
    expect(designSkillsKnowledge()).toBe(DESIGN_SKILLS_FULL);
    expect(designSkillsKnowledge("")).toBe(DESIGN_SKILLS_FULL);
    expect(designSkillsKnowledge(null)).toBe(DESIGN_SKILLS_FULL);
  });

  it("com tópico devolve SOMENTE a seção (economia de tokens)", () => {
    const motion = designSkillsKnowledge("motion");
    expect(motion).toMatch(/MOTION/);
    expect(motion).toMatch(/ease-in-out|300–700ms/i);
    expect(motion).not.toMatch(/LUXURY DARK MODE/); // não traz o guia inteiro
    expect(motion.length).toBeLessThan(DESIGN_SKILLS_FULL.length / 3);

    expect(designSkillsKnowledge("cro")).toMatch(/CRO/);
    expect(designSkillsKnowledge(" MOBILE ")).toMatch(/MOBILE-FIRST/i); // normaliza
  });

  it("tópico desconhecido devolve os tópicos disponíveis + guia (o agente escolhe)", () => {
    const out = designSkillsKnowledge("zzz-inexistente");
    expect(out).toMatch(/TÓPICOS DISPONÍVEIS/);
    expect(out).toContain(DESIGN_SKILLS_FULL);
  });
});

describe("design-skills · instalada como FERRAMENTA do agente gerador", () => {
  it("buildCoderTools expõe design_skills e ela devolve o guia sob demanda", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-"));
    try {
      const { list, byName } = buildCoderTools({ workspaceRoot: root, business: {}, projectId: "p" } as never);
      const tool = byName.get("design_skills");
      expect(tool, "ferramenta design_skills ausente").toBeTruthy();
      expect(list.some((t) => t.schema.name === "design_skills")).toBe(true);

      const full = await tool!.execute({});
      expect(full).toContain("LUXURY DARK MODE");

      const only = await tool!.execute({ topic: "performance" });
      expect(only).toMatch(/loading="lazy"/);
      expect(only).not.toContain("LUXURY DARK MODE"); // só a seção pedida
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
