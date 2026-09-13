import { describe, it, expect } from "vitest";
import { buildSafeProjectTree, findConflicts, findRemovals, GITIGNORE } from "../../supabase/functions/_shared/github-sync";

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

describe("GitHub por projeto — fidelidade ao projeto REAL e ATUAL", () => {
  it("inclui formatos legítimos modernos (avif, tsx, mp4, pdf, woff2) — nada de descartar arquivo real", () => {
    const tree = buildSafeProjectTree({
      "index.html": "<h1>ok</h1>",
      "assets/foto.avif": "avif-bytes",
      "src/app.tsx": "export default 1",
      "media/promo.mp4": "video",
      "docs/proposta.pdf": "%PDF-1.4",
      "assets/font.woff2": "font",
    });
    expect(tree.ok).toBe(true);
    const paths = tree.files.map((f) => f.path);
    for (const p of ["assets/foto.avif", "src/app.tsx", "media/promo.mp4", "docs/proposta.pdf", "assets/font.woff2"]) {
      expect(paths, p).toContain(p);
    }
  });

  it("findRemovals: arquivos que saíram do projeto devem sair do repositório (sem arquivo velho)", () => {
    const local = [{ path: "index.html", content: "a" }, { path: "src/site.css", content: "b" }];
    const synced = { "index.html": { sha: "1" }, "src/site.css": { sha: "2" }, "assets/antiga.png": { sha: "3" } };
    expect(findRemovals(local, synced)).toEqual(["assets/antiga.png"]);
    expect(findRemovals(local, {})).toEqual([]);
  });

  it("dois projetos ESTRUTURALMENTE diferentes → árvores ISOLADAS (A não vaza para B)", () => {
    const A = buildSafeProjectTree({ "index.html": "<h1>Pata Amiga</h1>", "src/site.css": ".a{}", "assets/pet.webp": "x" });
    const B = buildSafeProjectTree({ "index.html": "<h1>Studio Norte</h1>", "src/main.js": "console.log(1)", "assets/planta.svg": "<svg/>" });
    const pa = A.files.map((f) => f.path);
    const pb = B.files.map((f) => f.path);
    expect(pa).not.toEqual(pb);
    expect(pa).not.toContain("assets/planta.svg");
    expect(pb).not.toContain("assets/pet.webp");
    expect(A.files.find((f) => f.path === "index.html")?.content).toContain("Pata Amiga");
    expect(B.files.find((f) => f.path === "index.html")?.content).toContain("Studio Norte");
  });

  it("a árvore reflete o CONTEÚDO ATUAL (edição no editor aparece no que vai ao GitHub)", () => {
    const before = buildSafeProjectTree({ "index.html": "<h1>Antes</h1>" });
    const after = buildSafeProjectTree({ "index.html": "<h1>Depois da edição</h1>" });
    expect(before.files[0].content).toContain("Antes");
    expect(after.files[0].content).toContain("Depois da edição");
    expect(after.files[0].content).not.toBe(before.files[0].content);
  });

  it("nunca inclui arquivos fictícios/ausentes: só o que existe no mapa real", () => {
    const tree = buildSafeProjectTree({ "index.html": "<h1>ok</h1>" });
    const paths = tree.files.map((f) => f.path);
    expect(paths).toEqual(["index.html"]); // nada é inventado/added
  });
});
