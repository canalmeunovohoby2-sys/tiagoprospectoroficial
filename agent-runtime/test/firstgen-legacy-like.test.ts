import { describe, it, expect } from "vitest";
import { buildEditSystemPrompt, buildGenerateSystemPrompt } from "../src/agent-identity";

// RESTAURACAO LEGACY-LIKE: a PRIMEIRA GERACAO (react, sem base) volta a ser missao direta —
// o agente decide a estetica. As camadas visuais previas (direcao de arte, foundations,
// pack) NAO entram nesse caminho; continuam disponiveis na EDICAO e como TOOL sob demanda.
const sem = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const FIRSTGEN = buildGenerateSystemPrompt({ hasBase: false, react: true });
const COM_BASE = buildGenerateSystemPrompt({ hasBase: true, react: true });
const EDIT = buildEditSystemPrompt({});

describe("primeira geracao · missao direta (legacy-like)", () => {
  it("NAO injeta as camadas visuais previas", () => {
    expect(sem(FIRSTGEN)).not.toContain("direcao de arte deste projeto");
    expect(sem(FIRSTGEN)).not.toContain("padrao senior");
    expect(sem(FIRSTGEN)).not.toContain("design system antes de codar");
    expect(sem(FIRSTGEN)).not.toContain("skills senior do segmento");
    expect(sem(FIRSTGEN)).not.toContain("site-energia-solar");
  });

  it("PRESERVA o que e tecnico/essencial na primeira geracao", () => {
    const p = sem(FIRSTGEN);
    expect(p).toContain("idioma");
    expect(p).toContain("crIE o site".toLowerCase());          // missao de criar do zero
    expect(p).toContain("verdade");                            // regra de evidencia
    expect(p).toContain("browser qa");                         // verificacao objetiva
    expect(p).toContain("endereco");                           // regra semantica de endereco
    expect(p).toContain("fotos");                              // regra de imagem/lead
    expect(p).toContain("cada projeto e uma decisao nova");    // variacao criativa real
  });

  it("a primeira geracao ficou MENOR que o caminho com base", () => {
    expect(FIRSTGEN.length).toBeLessThan(COM_BASE.length);
    expect(FIRSTGEN.length).toBeLessThan(13_000);
  });

  it("com base (nao-firstgen) e a EDICAO continuam com as referencias", () => {
    expect(sem(COM_BASE)).toContain("direcao de arte deste projeto");
    expect(sem(COM_BASE)).toContain("skills senior do segmento");
    expect(sem(EDIT)).toContain("autoridade unica");
    expect(sem(EDIT)).toContain("skills senior do segmento");
  });
});
