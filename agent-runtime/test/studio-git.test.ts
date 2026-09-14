import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeWorkspace, readWorkspace } from "../src/workspace";
import { ensureGitRepo, gitStatus, gitLog, gitDiff, gitShow, gitCommit, gitRestore, normalizeGitPath } from "../src/studio/git";

let HAS_GIT = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  HAS_GIT = false;
}

const d = HAS_GIT ? describe : describe.skip;

let root = "";
let rootB = "";

beforeAll(() => {
  if (!HAS_GIT) return;
  root = mkdtempSync(join(tmpdir(), "prospector-git-"));
  rootB = mkdtempSync(join(tmpdir(), "prospector-git-b-"));
  materializeWorkspace(root, { "index.html": "<h1>A</h1>", "src/site.css": ".a{}" });
  materializeWorkspace(rootB, { "index.html": "<h1>B</h1>" });
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  if (rootB) rmSync(rootB, { recursive: true, force: true });
});

d("Fase 6 · Git real do workspace", () => {
  it("inicializa o repositório e cria o commit inicial", async () => {
    const ensured = await ensureGitRepo(root);
    expect(ensured.ok).toBe(true);
    expect(ensured.created).toBe(true);
    const status = await gitStatus(root);
    expect(status.ok).toBe(true);
    expect(status.repo).toBe(true);
    expect(status.clean).toBe(true);

    const log = await gitLog(root);
    expect(log.ok).toBe(true);
    expect(log.commits.length).toBe(1);
    expect(log.commits[0].message).toBe("Estado inicial");
    expect(log.commits[0].files).toContain("index.html");
  });

  it("status detecta alterações reais", async () => {
    writeFileSync(join(root, "index.html"), "<h1>Alterado</h1>", "utf8");
    const status = await gitStatus(root);
    expect(status.clean).toBe(false);
    expect(status.entries.map((e) => e.path)).toContain("index.html");
  });

  it("commit real registra arquivos e mensagem", async () => {
    const res = await gitCommit(root, "Altera título para Alterado");
    expect(res.ok).toBe(true);
    expect(res.committed).toBe(true);
    expect(res.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(res.files).toContain("index.html");
    expect(res.message).toBe("Altera título para Alterado");
    expect((await gitStatus(root)).clean).toBe(true);
  });

  it("commit sem alteração não cria commit vazio", async () => {
    const res = await gitCommit(root, "nada mudou");
    expect(res.ok).toBe(true);
    expect(res.committed).toBe(false);
    expect(res.reason).toMatch(/sem altera/i);
  });

  it("log real lista commits e diff entre dois estados", async () => {
    writeFileSync(join(root, "src/site.css"), ".a{color:blue}", "utf8");
    const second = await gitCommit(root, "Muda cor");
    expect(second.committed).toBe(true);

    const log = await gitLog(root);
    expect(log.commits.length).toBeGreaterThanOrEqual(3);
    const first = log.commits[log.commits.length - 1].hash;
    const diff = await gitDiff(root, { from: first, to: "HEAD" });
    expect(diff.ok).toBe(true);
    expect(diff.diff).toContain("index.html");
    expect(diff.diff).toMatch(/^[+-]/m);
    expect(diff.files.some((f) => f.path === "src/site.css")).toBe(true);
  });

  it("show devolve o conteúdo de um arquivo em um commit", async () => {
    const log = await gitLog(root);
    const first = log.commits[log.commits.length - 1].hash;
    const shown = await gitShow(root, { hash: first, path: "index.html" });
    expect(shown.ok).toBe(true);
    expect(shown.content).toContain("<h1>A</h1>");
  });

  it("diff do estado atual (working tree) contra um commit", async () => {
    writeFileSync(join(root, "index.html"), "<h1>Não commitado</h1>", "utf8");
    const diff = await gitDiff(root, { from: "HEAD" });
    expect(diff.ok).toBe(true);
    expect(diff.diff).toContain("Não commitado");
    // restaura o arquivo para não interferir nos próximos testes
    await gitRestore(root, { hash: (await gitLog(root)).commits[0].hash });
  });

  it("restauração (time travel) volta o conteúdo e remove arquivos que não existiam", async () => {
    const log = await gitLog(root);
    const first = log.commits[log.commits.length - 1].hash;

    writeFileSync(join(root, "index.html"), "<h1>TEMPORÁRIO</h1>", "utf8");
    writeFileSync(join(root, "extra.html"), "<p>novo</p>", "utf8");
    await gitCommit(root, "Adiciona extra");

    const restored = await gitRestore(root, { hash: first });
    expect(restored.ok).toBe(true);
    expect(restored.committed).toBe(true);
    const files = readWorkspace(root);
    expect(files["index.html"]).toContain("<h1>A</h1>");
    expect(files["extra.html"]).toBeUndefined();

    // estado restaurado também é registrado no histórico
    const after = await gitLog(root);
    expect(after.commits[0].message).toMatch(/Restore para/i);
    expect((await gitStatus(root)).clean).toBe(true);
  });

  it("restaura apenas um caminho quando informado", async () => {
    const log = await gitLog(root);
    const first = log.commits[log.commits.length - 1].hash;
    writeFileSync(join(root, "index.html"), "<h1>X</h1>", "utf8");
    writeFileSync(join(root, "src/site.css"), ".a{color:red}", "utf8");
    await gitCommit(root, "Muda dois arquivos");
    const res = await gitRestore(root, { hash: first, path: "index.html" });
    expect(res.ok).toBe(true);
    const files = readWorkspace(root);
    expect(files["index.html"]).toContain("<h1>A</h1>");
    // o outro arquivo permanece como estava
    expect(files["src/site.css"]).toContain("color:red");
  });

  it("hash inválido e caminho inseguro são recusados", async () => {
    expect((await gitRestore(root, { hash: "não-é-hash" })).ok).toBe(false);
    expect((await gitDiff(root, { from: "HEAD", path: "../fora.html" })).ok).toBe(false);
    expect((await gitShow(root, { hash: "HEAD", path: "../../etc/passwd" })).ok).toBe(false);
    expect(normalizeGitPath("../x")).toBeNull();
    expect(normalizeGitPath(".git/config")).toBeNull();
    expect(normalizeGitPath(".env")).toBeNull();
    expect(normalizeGitPath("src/main.js")).toBe("src/main.js");
  });

  it("nunca versiona .env/credenciais (gitignore de segurança)", async () => {
    writeFileSync(join(root, ".env"), "SECRET=1", "utf8");
    writeFileSync(join(root, "chave.key"), "PRIVATE", "utf8");
    writeFileSync(join(root, "index.html"), "<h1>Depois de segredos</h1>", "utf8");
    const res = await gitCommit(root, "Tenta versionar segredos");
    expect(res.ok).toBe(true);
    expect(res.files).not.toContain(".env");
    expect(res.files).not.toContain("chave.key");
    const log = await gitLog(root);
    expect(log.commits[0].files).not.toContain(".env");
    // readWorkspace também não expõe segredos
    expect(readWorkspace(root)[".env"]).toBeUndefined();
  });

  it("workspaces são isolados entre projetos", async () => {
    await ensureGitRepo(rootB);
    const logA = await gitLog(root);
    const logB = await gitLog(rootB);
    expect(logB.commits.length).toBe(1);
    expect(logB.commits[0].files).toContain("index.html");
    expect(logA.commits.length).toBeGreaterThan(logB.commits.length);
  });

  it("histórico vazio (sem commits) devolve lista vazia sem erro", async () => {
    const empty = mkdtempSync(join(tmpdir(), "prospector-git-empty-"));
    try {
      const ensured = await ensureGitRepo(empty);
      expect(ensured.ok).toBe(true);
      const log = await gitLog(empty);
      expect(log.ok).toBe(true);
      expect(log.commits).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
