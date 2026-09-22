import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSurgicalEditTask } from "../src/prospector-site-agent";
import { isBugReport } from "../src/completion-guard";

// MATRIZ CORRIGIDA (auditoria): antes, "adicione seção" era cirúrgica (❌) e
// "troque a imagem/logo" era PESADA (❌ — causa da edição de imagem demorada).
describe("classificação de edição · cirúrgica x estrutural x ampla", () => {
  it("cirúrgicas: texto, título, CTA, cor, classe, imagem, logo, ícone, espaçamento", () => {
    for (const p of [
      "troque o título",
      "troque o texto do botão para Solicitar Orçamento",
      "mude a cor do botão para verde",
      "troque a classe do container",
      "troque a logo por esta imagem",
      "troque somente a imagem do hero",
      "coloque uma foto nova no hero",
      "troque o ícone do WhatsApp",
      "ajuste o espaçamento do hero",
      "substitua a imagem do banner",
      "troque somente o título principal para Energia Solar Inteligente",
    ]) {
      expect(isSurgicalEditTask(p), `deveria ser cirúrgica: ${p}`).toBe(true);
    }
  });

  it("estruturais: adicionar/criar/remover/reorganizar seção NÃO são cirúrgicas", () => {
    for (const p of [
      "adicione uma seção de depoimentos",
      "adicione uma seção de FAQ",
      "crie uma área de galeria",
      "inclua um bloco de planos",
      "remova a seção de preços",
      "reorganize as seções da página",
      "mude a arquitetura da página",
    ]) {
      expect(isSurgicalEditTask(p), `NÃO deveria ser cirúrgica: ${p}`).toBe(false);
    }
  });

  it("amplas: redesenho/identidade usam o fluxo completo", () => {
    for (const p of ["deixe o hero mais moderno", "refaça o hero", "melhore a identidade visual", "redesenhe a página"]) {
      expect(isSurgicalEditTask(p), `NÃO deveria ser cirúrgica: ${p}`).toBe(false);
    }
  });

  it("perguntas e bug report continuam fora do modo cirúrgico", () => {
    expect(isSurgicalEditTask("o que você acha do site?")).toBe(false);
    expect(isBugReport("o menu está quebrado")).toBe(true);
    expect(isSurgicalEditTask("coloque uma foto nova")).toBe(true);
  });
});

// ITEM 1 — freios de qualidade ativos por PADRÃO (autonomia continua existindo via env).
describe("autonomia · default guarded (guard + QA automática ativos)", () => {
  it("o default do runtime é guarded; 'full' passa a ser opt-in", () => {
    const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(src).toContain('const autonomy: "full" | "guarded" = process.env.AGENT_AUTONOMY === "full" ? "full" : "guarded";');
    expect(src).not.toContain('process.env.AGENT_AUTONOMY === "guarded" ? "guarded"');
  });

  it("em guarded o finish sem alteração é bloqueável (guard de evidência existe)", () => {
    const g = readFileSync(join(process.cwd(), "src/completion-guard.ts"), "utf8");
    expect(g).toContain('if (opts.autonomy === "full") return { block: false, terminal: false }');
    expect(g).toMatch(/touched/);
  });

  it("a QA automática roda na geração e NÃO em edição simples", () => {
    const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    const i = src.indexOf("runFirstGenQaCycle(");
    expect(i).toBeGreaterThan(0);
    const bloco = src.slice(Math.max(0, i - 260), i + 80);
    expect(bloco).toContain('runKind === "generate"');
    expect(bloco).toContain("firstGen");
  });
});
