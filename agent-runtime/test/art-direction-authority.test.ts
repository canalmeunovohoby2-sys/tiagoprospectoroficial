import { describe, it, expect } from "vitest";
import { buildEditSystemPrompt, buildGenerateSystemPrompt } from "../src/agent-identity";

// 4 "autoridades" visuais competiam (direção de arte, creative brief, princípios Senior,
// vertical) sem precedência — o modelo fazia MÉDIA e o site saía genérico. Agora existe
// uma AUTORIDADE ÚNICA declarada nos dois prompts.
const semAcento = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const GEN = semAcento(buildGenerateSystemPrompt({ hasBase: true, react: true }));
const EDIT = semAcento(buildEditSystemPrompt({}));

describe("autoridade visual unica", () => {
  it("declara a precedencia nos dois prompts", () => {
    for (const [nome, p] of [["geracao", GEN], ["edicao", EDIT]] as const) {
      expect(p, `${nome} sem autoridade`).toContain("autoridade unica");
      expect(p).toContain("precedencia explicita");
    }
  });

  it("a ordem coloca negocio > vertical > direcao > brief > principios > ferramenta", () => {
    const ordem = ["contexto real do negocio", "vertical do segmento", "direcao de arte deste projeto", "creative brief", "principios senior", "detalhes de ferramenta"];
    let pos = -1;
    for (const etapa of ordem) {
      const idx = GEN.indexOf(etapa);
      expect(idx, `faltou etapa: ${etapa}`).toBeGreaterThan(-1);
      expect(idx, `ordem errada em: ${etapa}`).toBeGreaterThan(pos);
      pos = idx;
    }
  });

  it("proibe media de estilos e da vitoria a direcao", () => {
    expect(GEN).toContain("nao faca media de estilos");
    expect(GEN).toContain("a direcao vence");
    expect(GEN).toContain("uma direcao visual por projeto");
  });

  it("preserva a autonomia criativa (decide dentro da mesma direcao)", () => {
    expect(GEN).toContain("segue decidindo layout");
    expect(GEN).toContain("dentro da mesma direcao");
  });
});
