import { describe, it, expect, beforeEach } from "vitest";
import {
  buildFileTree, baseName, normalizeStudioPath, languageForPath,
  createFilePath, deleteFilePath, renameFilePath,
  mergeEffectiveFiles, computeDirtyPaths, hasUnsavedChanges,
} from "@/lib/studio/fileTree";
import { isStudioUiEnabled, setStudioUiEnabled, studioUiFlagKey } from "@/lib/studio/featureFlag";

describe("Studio · fileTree (mapa plano generated_code)", () => {
  it("monta árvore aninhada com diretórios antes de arquivos", () => {
    const tree = buildFileTree([
      "cliente/index.html",
      "cliente/src/main.js",
      "cliente/src/site.css",
      "cliente/assets/logo.svg",
    ]);
    // O workspace do Prospector é prefixado pelo slug do projeto — o diretório
    // raiz aparece como nó próprio (caminhos reais, sem "achatar").
    expect(tree.map((n) => n.name)).toEqual(["cliente"]);
    const root = tree.find((n) => n.name === "cliente")!;
    expect(root.isDir).toBe(true);
    expect(root.children.map((n) => n.name)).toEqual(["assets", "src", "index.html"]);
    const src = root.children.find((n) => n.name === "src")!;
    expect(src.isDir).toBe(true);
    expect(src.children.map((c) => c.name)).toEqual(["main.js", "site.css"]);
    expect(root.children.find((n) => n.name === "index.html")!.isDir).toBe(false);
  });

  it("normaliza caminhos e extrai basename", () => {
    expect(normalizeStudioPath("\\a\\b//c/")).toBe("a/b/c");
    expect(baseName("cliente/src/main.js")).toBe("main.js");
    expect(baseName("index.html")).toBe("index.html");
  });

  it("detecta linguagem por extensão", () => {
    expect(languageForPath("cliente/index.html")).toBe("html");
    expect(languageForPath("cliente/src/site.css")).toBe("css");
    expect(languageForPath("cliente/src/main.js")).toBe("javascript");
    expect(languageForPath("cliente/src/site.json")).toBe("json");
    expect(languageForPath("cliente/LEIAME.md")).toBe("markdown");
    expect(languageForPath("cliente/sem-extensao")).toBe("plaintext");
  });

  it("cria, renomeia e exclui arquivos sem mutar o mapa original", () => {
    const original = { "cliente/index.html": "<html></html>" };
    const created = createFilePath(original, "cliente/src/main.js");
    expect(created["cliente/src/main.js"]).toBe("");
    expect(original["cliente/src/main.js"]).toBeUndefined();

    const renamed = renameFilePath(created, "cliente/src/main.js", "cliente/src/app.js");
    expect(renamed["cliente/src/app.js"]).toBe("");
    expect(renamed["cliente/src/main.js"]).toBeUndefined();
    // renomear para o mesmo caminho é no-op
    expect(renameFilePath(renamed, "cliente/src/app.js", "cliente/src/app.js")).toBe(renamed);

    const deleted = deleteFilePath(renamed, "cliente/index.html");
    expect(deleted["cliente/index.html"]).toBeUndefined();
    expect(deleted["cliente/src/app.js"]).toBe("");
  });

  it("não cria arquivo duplicado nem renomeia inexistente", () => {
    const files = { "a.html": "x" };
    expect(createFilePath(files, "a.html")).toBe(files);
    expect(renameFilePath(files, "nao-existe.html", "b.html")).toBe(files);
  });
});

describe("Studio · fonte única do editor (merge/dirty)", () => {
  const files = { "cliente/index.html": "<h1>A</h1>", "cliente/src/site.css": ".a{}" };

  it("aplica rascunhos não salvos sobre o mapa persistido", () => {
    const merged = mergeEffectiveFiles(files, { "cliente/index.html": "<h1>B</h1>" });
    expect(merged["cliente/index.html"]).toBe("<h1>B</h1>");
    expect(merged["cliente/src/site.css"]).toBe(".a{}");
    // mapa original não é mutado
    expect(files["cliente/index.html"]).toBe("<h1>A</h1>");
  });

  it("ignora rascunho igual ao salvo e rascunho de arquivo removido", () => {
    const merged = mergeEffectiveFiles(files, { "cliente/src/site.css": ".a{}", "cliente/removido.html": "lixo" });
    expect(merged["cliente/removido.html"]).toBeUndefined();
    expect(computeDirtyPaths({ "cliente/src/site.css": ".a{}" }, files)).toEqual([]);
  });

  it("marca dirty apenas o que difere do persistido", () => {
    const overrides = { "cliente/index.html": "<h1>B</h1>", "cliente/src/site.css": ".a{}" };
    expect(computeDirtyPaths(overrides, files)).toEqual(["cliente/index.html"]);
    expect(hasUnsavedChanges(overrides, files)).toBe(true);
    expect(hasUnsavedChanges({}, files)).toBe(false);
  });
});

describe("Studio · feature flag", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("desligada por padrão e ligada via localStorage", () => {
    expect(isStudioUiEnabled()).toBe(false);
    setStudioUiEnabled(true);
    expect(window.localStorage.getItem(studioUiFlagKey())).toBe("1");
    expect(isStudioUiEnabled()).toBe(true);
    setStudioUiEnabled(false);
    expect(isStudioUiEnabled()).toBe(false);
  });
});
