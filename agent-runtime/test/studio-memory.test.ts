import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  emptyMemory, extractMemoryUpdates, loadMemory, memoryContextBlock, memoryFilePath,
  recordMemory, sanitizeMemoryEntry, saveMemory,
} from "../src/studio/memory";

let rootA = "";
let rootB = "";
beforeAll(() => {
  rootA = mkdtempSync(join(tmpdir(), "c6-mem-a-"));
  rootB = mkdtempSync(join(tmpdir(), "c6-mem-b-"));
});
afterAll(() => {
  for (const r of [rootA, rootB]) {
    rmSync(r, { recursive: true, force: true });
    try { rmSync(memoryFilePath(r), { force: true }); } catch { /* noop */ }
  }
});

describe("C6 · memória por projeto", () => {
  it("cria, grava e recupera; fica FORA do workspace", () => {
    let mem = emptyMemory("pA");
    mem = recordMemory(mem, "designPreferences", "prefiro botões azuis (#2563eb)");
    mem = recordMemory(mem, "projectDecisions", "usar hero com imagem de fundo");
    saveMemory(rootA, mem);
    expect(existsSync(memoryFilePath(rootA))).toBe(true);
    expect(memoryFilePath(rootA).startsWith(rootA + sep)).toBe(false);
    const loaded = loadMemory(rootA, "pA");
    expect(loaded.designPreferences).toContain("prefiro botões azuis (#2563eb)");
    expect(loaded.projectDecisions).toContain("usar hero com imagem de fundo");
  });

  it("isola por projeto (A não vê B)", () => {
    saveMemory(rootB, recordMemory(emptyMemory("pB"), "notes", "projeto B usa fonte serifada"));
    expect(loadMemory(rootA, "pA").notes).toEqual([]);
    expect(loadMemory(rootB, "pB").notes).toContain("projeto B usa fonte serifada");
    // projectId divergente → vazio (reconstruível)
    expect(loadMemory(rootB, "outro").notes).toEqual([]);
  });

  it("sanitiza: rejeita segredos/tokens e entradas vazias/grandes", () => {
    expect(sanitizeMemoryEntry("OPENAI_API_KEY=sk-abcdefghijklmnop")).toBeNull();
    expect(sanitizeMemoryEntry("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload")).toBeNull();
    expect(sanitizeMemoryEntry("Bearer abcdefghijklmnop")).toBeNull();
    expect(sanitizeMemoryEntry("   ")).toBeNull();
    expect(sanitizeMemoryEntry("ok")).toBeNull();
    const long = sanitizeMemoryEntry("a".repeat(500))!;
    expect(long.length).toBeLessThanOrEqual(300);
    expect(sanitizeMemoryEntry("prefiro fonte Inter")).toBe("prefiro fonte Inter");
  });

  it("faz dedupe e respeita limite por seção", () => {
    let mem = emptyMemory("pA");
    mem = recordMemory(mem, "notes", "nota 1");
    mem = recordMemory(mem, "notes", "nota 1");
    expect(mem.notes.filter((n) => n === "nota 1")).toHaveLength(1);
    for (let i = 0; i < 60; i += 1) mem = recordMemory(mem, "notes", `nota extra ${i}`);
    expect(mem.notes.length).toBeLessThanOrEqual(40);
  });

  it("estado corrompido → memória vazia", () => {
    writeFileSync(memoryFilePath(rootA), "{lixo", "utf8");
    expect(loadMemory(rootA, "pA").designPreferences).toEqual([]);
  });

  it("extrai preferências explícitas do usuário (determinístico)", () => {
    const updates = extractMemoryUpdates("Prefiro tons escuros e botões arredondados. Use sempre a fonte Inter.");
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every((u) => ["designPreferences", "userInstructions", "importantComponents"].includes(u.kind))).toBe(true);
    expect(extractMemoryUpdates("A cor principal do site é #111827")).toHaveLength(1);
    expect(extractMemoryUpdates("Crie uma landing page")).toHaveLength(0);
  });

  it("não extrai memória de instruções com segredos", () => {
    expect(extractMemoryUpdates("Prefiro usar OPENAI_API_KEY=sk-abcdefghijklmnop")).toHaveLength(0);
  });

  it("bloco de contexto deixa claro que o CÓDIGO prevalece", () => {
    const mem = recordMemory(emptyMemory("pA"), "designPreferences", "prefiro botões azuis");
    const block = memoryContextBlock(mem);
    expect(block).toContain("botões azuis");
    expect(block).toMatch(/C[ÓO]DIGO REAL prevalece/i);
  });
});
