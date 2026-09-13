import { describe, it, expect } from "vitest";
import {
  makeChangeEntry, appendChange, memoryLineFromChange, appendMemory,
  renderProjectContextBlock, normalizeContext, EMPTY_CONTEXT,
} from "../src/project-context";

describe("Contexto persistente do projeto — memória + histórico de alterações", () => {
  it("makeChangeEntry normaliza e limita tamanho", () => {
    const e = makeChangeEntry("  Troque   o botão   para azul  ", ["src/site.css", "src/site.css"], "botão azul", "2026-01-01T00:00:00.000Z");
    expect(e.instruction).toBe("Troque o botão para azul");
    expect(e.files).toEqual(["src/site.css"]);
    expect(e.summary).toBe("botão azul");
    expect(e.at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("appendChange mantém teto (mais novas por último)", () => {
    let list = [] as ReturnType<typeof appendChange>;
    for (let i = 0; i < 25; i++) list = appendChange(list, makeChangeEntry(`pedido ${i}`, [`f${i}.css`], `s${i}`, `t${i}`));
    expect(list.length).toBe(20);
    expect(list[list.length - 1].instruction).toBe("pedido 24");
    expect(list[0].instruction).toBe("pedido 5");
  });

  it("memória: deriva linha compacta, não duplica e respeita teto", () => {
    const line = memoryLineFromChange(makeChangeEntry("troque o botão", ["src/site.css"], "botão vermelho", "t"));
    expect(line).toContain("botão vermelho");
    let mem: string[] = [];
    mem = appendMemory(mem, line);
    mem = appendMemory(mem, line); // duplicada → não cresce
    expect(mem.length).toBe(1);
    for (let i = 0; i < 40; i++) mem = appendMemory(mem, `decisão ${i}`);
    expect(mem.length).toBe(30);
    expect(mem[mem.length - 1]).toBe("decisão 39");
  });

  it("renderProjectContextBlock é vazio sem contexto e rico quando há dados", () => {
    expect(renderProjectContextBlock(EMPTY_CONTEXT)).toBe("");
    const block = renderProjectContextBlock({
      memory: ["botão principal é azul", "fonte títulos: Fraunces"],
      changes: [makeChangeEntry("troque o botão para azul", ["src/site.css"], "botão azul", "2026-01-01T00:00:00.000Z")],
    });
    expect(block).toMatch(/CONTEXTO PERSISTENTE DESTE PROJETO/);
    expect(block).toContain("botão principal é azul");
    expect(block).toContain("fonte títulos: Fraunces");
    expect(block).toContain("troque o botão para azul");
    expect(block).toContain("src/site.css");
    expect(block).toMatch(/ESTADO REAL DOS ARQUIVOS é a fonte de verdade/i);
  });

  it("conversas longas NÃO geram bloco gigante (caps de memória/histórico)", () => {
    const memory = Array.from({ length: 200 }, (_, i) => `decisão ${i} ` + "x".repeat(60));
    const changes = Array.from({ length: 200 }, (_, i) => makeChangeEntry(`pedido ${i} ` + "y".repeat(80), [`src/f${i}.css`], "alterado", `2026-01-01T00:00:${i % 60}`));
    const block = renderProjectContextBlock({ memory, changes });
    expect(block.length).toBeLessThan(12000); // limitado, não envia 200+200 registros
    expect(block).toContain("decisão 199");
    expect(block).toContain("pedido 199");
    expect(block).not.toContain("decisão 0 ");
  });

  it("normalizeContext é defensivo e dois projetos não misturam contexto", () => {
    expect(normalizeContext(null)).toEqual({ memory: [], changes: [] });
    expect(normalizeContext({ memory: ["a", 1, null], changes: "x" })).toEqual({ memory: ["a"], changes: [] });
    const A = { memory: ["projeto A: cor azul"], changes: [makeChangeEntry("A", ["a.css"], "a", "t")] };
    const B = { memory: ["projeto B: cor verde"], changes: [makeChangeEntry("B", ["b.css"], "b", "t")] };
    const blockA = renderProjectContextBlock(A);
    const blockB = renderProjectContextBlock(B);
    expect(blockA).toContain("projeto A: cor azul");
    expect(blockA).not.toContain("projeto B");
    expect(blockB).toContain("projeto B: cor verde");
    expect(blockB).not.toContain("projeto A");
  });
});
