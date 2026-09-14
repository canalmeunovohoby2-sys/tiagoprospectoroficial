import { describe, it, expect, vi } from "vitest";
import { createProjectFileStore, applyFilesReady } from "@/lib/studio/fileStore";

describe("C0 · file store (projeção frontend)", () => {
  it("replaceAll substitui o snapshot inteiro (files_ready)", () => {
    const store = createProjectFileStore({ "old.tsx": "x" });
    applyFilesReady(store, { "package.json": "{}", "src/App.tsx": "y" });
    expect(store.has("old.tsx")).toBe(false);
    expect(store.getFiles()).toEqual({ "package.json": "{}", "src/App.tsx": "y" });
    expect(store.size()).toBe(2);
  });

  it("setFile/removeFile atualizam sem mutar o snapshot anterior", () => {
    const store = createProjectFileStore({ "a.tsx": "1" });
    const before = store.getSnapshot();
    store.setFile("a.tsx", "2");
    store.setFile("b.tsx", "novo");
    expect(before.files).toEqual({ "a.tsx": "1" });
    expect(store.get("a.tsx")).toBe("2");
    expect(store.has("b.tsx")).toBe(true);
    store.removeFile("a.tsx");
    expect(store.has("a.tsx")).toBe(false);
    expect(store.size()).toBe(1);
  });

  it("getSnapshot é estável entre leituras e muda só após mutação", () => {
    const store = createProjectFileStore({ "a.tsx": "1" });
    const s1 = store.getSnapshot();
    const s2 = store.getSnapshot();
    expect(s1).toBe(s2);
    store.setFile("a.tsx", "2");
    const s3 = store.getSnapshot();
    expect(s3).not.toBe(s1);
    expect(s3.revision).toBeGreaterThan(s1.revision);
  });

  it("notifica inscritos e permite desinscrever", () => {
    const store = createProjectFileStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setFile("a.tsx", "1");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setFile("a.tsx", "2");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignora entradas inválidas", () => {
    const store = createProjectFileStore();
    store.replaceAll({ "ok.tsx": "1", bad: 2 as unknown as string });
    expect(store.getFiles()).toEqual({ "ok.tsx": "1" });
    store.setFile("", "x");
    expect(store.size()).toBe(1);
  });
});
