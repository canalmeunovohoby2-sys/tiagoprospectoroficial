import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeWorkspace, readWorkspace } from "../src/workspace";
import { buildSiteTools } from "../src/tools";

let root = "";
let sibling = "";
let tools: ReturnType<typeof buildSiteTools>;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "prospector-fs3-"));
  sibling = mkdtempSync(join(tmpdir(), "prospector-outside-"));
  materializeWorkspace(root, {
    "index.html": '<!doctype html><html><body><h1 class="hero">Empresa X</h1></body></html>',
    "src/site.css": ".hero{color:red}",
    "src/main.js": "console.log('ok');",
    "package.json": JSON.stringify({ name: "t", private: true, scripts: { build: "node -e \"process.exit(0)\"" } }),
  });
  tools = buildSiteTools({ workspaceRoot: root, business: { name: "Empresa X", segment: "Advocacia" }, mode: "edit" });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(sibling, { recursive: true, force: true });
});

function run(toolName: string, input: Record<string, unknown>): Promise<string> {
  const tool = tools.find((t) => (t as unknown as { name: string }).name === toolName);
  if (!tool) return Promise.resolve(JSON.stringify({ error: "tool não encontrada" }));
  const exec = (tool as unknown as { execute: (i: never) => Promise<string> }).execute;
  return Promise.resolve(exec(input as never));
}

function names(): string[] {
  return tools.map((t) => (t as unknown as { name: string }).name);
}

describe("Fase 3 · registry de ferramentas", () => {
  it("expõe os contratos de filesystem da arquitetura-alvo", () => {
    for (const name of ["read_file", "write_file", "edit_file", "create_file", "delete_file", "rename_file", "move_file", "list_files", "list_dir", "glob_search", "grep_search", "file_search", "run_command"]) {
      expect(names()).toContain(name);
    }
  });
});

describe("Fase 3 · listagem e leitura", () => {
  it("list_files devolve a árvore completa; list_dir só o nível imediato", async () => {
    const all = JSON.parse(await run("list_files", {})) as string[];
    expect(all).toContain("index.html");
    expect(all).toContain("src/site.css");

    const dir = JSON.parse(await run("list_dir", {})) as { entries: Array<{ name: string; type: string }> };
    const entryNames = dir.entries.map((e) => e.name);
    expect(entryNames).toContain("index.html");
    expect(entryNames).toContain("src");
    expect(entryNames).not.toContain("site.css"); // site.css está em src/, não na raiz
  });

  it("read_file devolve o conteúdo", async () => {
    expect(await run("read_file", { path: "index.html" })).toContain("hero");
  });
});

describe("Fase 3 · criação/edição/exclusão/rename", () => {
  it("create_file cria com diretórios-pai e recusa sobrescrever", async () => {
    const created = JSON.parse(await run("create_file", { path: "src/novo/extra.css", content: ".x{}" })) as { ok?: boolean; path?: string };
    expect(created.ok).toBe(true);
    expect(existsSync(join(root, "src/novo/extra.css"))).toBe(true);

    // create-only: já existe → erro explícito, sem alterar
    writeFileSync(join(root, "src/novo/extra.css"), ".y{}", "utf8");
    const again = JSON.parse(await run("create_file", { path: "src/novo/extra.css", content: ".z{}" })) as { error?: string };
    expect(again.error).toMatch(/já existe/i);
    expect(readFileSync(join(root, "src/novo/extra.css"), "utf8")).toBe(".y{}");
  });

  it("edit_file altera trecho exato", async () => {
    const out = JSON.parse(await run("edit_file", { path: "src/site.css", find: "color:red", replace: "color:blue" })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    expect(readFileSync(join(root, "src/site.css"), "utf8")).toContain("color:blue");
  });

  it("delete_file remove arquivo mas recusa estruturais", async () => {
    await run("create_file", { path: "tmp/velho.txt", content: "x" });
    const ok = JSON.parse(await run("delete_file", { path: "tmp/velho.txt" })) as { ok?: boolean };
    expect(ok.ok).toBe(true);
    expect(existsSync(join(root, "tmp/velho.txt"))).toBe(false);

    const critical = JSON.parse(await run("delete_file", { path: "index.html" })) as { error?: string };
    expect(critical.error).toMatch(/ESTRUTURAL/i);
    expect(existsSync(join(root, "index.html"))).toBe(true);
  });

  it("rename_file move entre pastas preservando conteúdo", async () => {
    await run("create_file", { path: "assets/logo.txt", content: "LOGO" });
    const out = JSON.parse(await run("rename_file", { from: "assets/logo.txt", to: "img/marca.txt" })) as { ok?: boolean; to?: string };
    expect(out.ok).toBe(true);
    expect(existsSync(join(root, "assets/logo.txt"))).toBe(false);
    expect(readFileSync(join(root, "img/marca.txt"), "utf8")).toBe("LOGO");
  });

  it("rename_file recusa arquivo ESTRUTURAL", async () => {
    const out = JSON.parse(await run("rename_file", { from: "src/site.css", to: "src/style.css" })) as { error?: string };
    expect(out.error).toMatch(/ESTRUTURAL/i);
    expect(existsSync(join(root, "src/site.css"))).toBe(true);
  });
});

describe("Fase 3 · segurança de caminhos", () => {
  it("recusa path traversal em escrita/criação/leitura", async () => {
    const w = JSON.parse(await run("write_file", { path: "../escape.txt", content: "x" })) as { error?: string };
    expect(w.error).toBeTruthy();
    const c = JSON.parse(await run("create_file", { path: "a/../../escape2.txt" })) as { error?: string };
    expect(c.error).toBeTruthy();
    const r = JSON.parse(await run("read_file", { path: "../secret.txt" })) as { error?: string };
    expect(r.error).toBeTruthy();
    expect(existsSync(join(root, "..", "escape.txt"))).toBe(false);
  });

  it("não escreve fora do workspace (isolamento)", async () => {
    const outside = join(sibling, "intruso.txt");
    const out = JSON.parse(await run("write_file", { path: `../../${sibling.split(/[\\/]/).pop()}/intruso.txt`, content: "x" })) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(existsSync(outside)).toBe(false);
  });

  it("bloqueia .env e credenciais em qualquer nível", async () => {
    for (const path of [".env", "config/.env.local", "secrets/.npmrc", "keys/id_rsa"]) {
      const out = JSON.parse(await run("write_file", { path, content: "SECRET=1" })) as { error?: string };
      expect(out.error, `esperava bloqueio para ${path}`).toBeTruthy();
    }
    expect(existsSync(join(root, ".env"))).toBe(false);
  });

  it("read_file devolve erro explícito para arquivo inexistente (não finge sucesso)", async () => {
    const out = JSON.parse(await run("read_file", { path: "nao-existe.html" })) as { error?: string };
    expect(out.error).toMatch(/não encontrado/i);
  });
});

describe("Fase 3 · busca", () => {
  it("glob_search filtra por padrão", async () => {
    const out = JSON.parse(await run("glob_search", { pattern: "**/*.css" })) as { files: string[] };
    expect(out.files).toContain("src/site.css");
    expect(out.files).not.toContain("index.html");
  });

  it("grep_search acha ocorrências com arquivo+linha", async () => {
    const out = JSON.parse(await run("grep_search", { pattern: "hero", glob: "**/*.html" })) as { results: Array<{ path: string; line: number }> };
    expect(out.results.some((r) => r.path === "index.html")).toBe(true);
  });

  it("file_search ranqueia pelo nome", async () => {
    const out = JSON.parse(await run("file_search", { query: "site.css" })) as { files: string[] };
    expect(out.files[0]).toBe("src/site.css");
  });
});

describe("Fase 3 · run_command controlado", () => {
  it("erro explícito quando não há package.json", async () => {
    const bare = mkdtempSync(join(tmpdir(), "prospector-bare-"));
    const bareTools = buildSiteTools({ workspaceRoot: bare, business: {} });
    const exec = (bareTools.find((t) => (t as unknown as { name: string }).name === "run_command") as unknown as { execute: (i: never) => Promise<string> }).execute;
    const out = JSON.parse(await exec({ action: "run", script: "build" } as never)) as { error?: string };
    expect(out.error).toMatch(/package\.json/i);
    rmSync(bare, { recursive: true, force: true });
  });

  it("recusa script que não existe no package.json", async () => {
    const out = JSON.parse(await run("run_command", { action: "run", script: "naoexiste" })) as { error?: string };
    expect(out.error).toMatch(/não existe no package\.json/i);
  });

  it("recusa nome de script inválido (sem shell livre)", async () => {
    const out = JSON.parse(await run("run_command", { action: "run", script: "build; rm -rf /" })) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});

describe("Fase 3 · edição multi-arquivo e coerência do workspace", () => {
  it("altera HTML+CSS e cria config; o workspace final reflete tudo", async () => {
    await run("edit_file", { path: "index.html", find: 'class="hero"', replace: 'class="hero hero--grande"' });
    await run("edit_file", { path: "src/site.css", find: ".hero{", replace: ".hero{min-height:60vh;" });
    await run("create_file", { path: "src/data.json", content: '{"ok":true}' });
    const files = readWorkspace(root);
    expect(files["index.html"]).toContain("hero--grande");
    expect(files["src/site.css"]).toContain("min-height:60vh");
    expect(files["src/data.json"]).toBe('{"ok":true}');
    expect(files[".env"]).toBeUndefined();
  });
});
