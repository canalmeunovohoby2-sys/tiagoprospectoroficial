import { describe, it, expect } from "vitest";
import { buildSafeProjectTree, findConflicts, GITIGNORE } from "../../supabase/functions/_shared/github-sync";

describe("GitHub por projeto (5.36) — árvore segura e conflitos", () => {
  it("monta árvore com arquivos reais do projeto, ignorando temporários/.env", () => {
    const files = {
      "index.html": "<h1>oi</h1>",
      "src/site.css": "body{}",
      "src/site.json": "{}",
      ".env": "DEEPSEEK_API_KEY=secret",
      ".git/config": "x",
      "node_modules/a/index.js": "x",
    };
    const tree = buildSafeProjectTree(files);
    expect(tree.ok).toBe(true);
    const paths = tree.files.map((f) => f.path);
    expect(paths).toContain("index.html");
    expect(paths).toContain("src/site.css");
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain(".git/config");
    expect(paths).not.toContain("node_modules/a/index.js");
  });

  it("segredo real → BLOQUEIA o envio e aponta o arquivo/problema", () => {
    const r = buildSafeProjectTree({
      "index.html": "ok",
      "src/config.js": "const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';",
    });
    expect(r.ok).toBe(false);
    expect(r.blocked?.path).toBe("src/config.js");
    expect(r.blocked?.secret).toBeTruthy();
  });

  it("arquivos binários de imagem são aceitos (UTF-8/base64)", () => {
    const r = buildSafeProjectTree({ "assets/logo.png": "data:...", "favicon.ico": "" });
    expect(r.ok).toBe(true);
    expect(r.files.some((f) => f.path === "assets/logo.png")).toBe(true);
  });

  it("conflito detectado quando o sha remoto atual difere do último sincronizado", () => {
    const local = [
      { path: "index.html", content: "novo" },
      { path: "src/site.css", content: "novo" },
      { path: "novo.txt", content: "novo" },
    ];
    const last = { "index.html": { sha: "aaa" }, "src/site.css": { sha: "bbb" } };
    const remote = { "index.html": { sha: "AAA" }, "src/site.css": { sha: "bbb" } };
    expect(findConflicts(local, last, remote)).toEqual(["index.html"]);
    expect(findConflicts(local, last, remote)).not.toContain("src/site.css");
  });

  it("GITIGNORE padrão exclui segredos", () => {
    expect(GITIGNORE).toContain(".env");
    expect(GITIGNORE).toContain("node_modules");
  });
});
