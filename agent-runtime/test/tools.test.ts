import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeWorkspace, readWorkspace } from "../src/workspace";
import { buildSiteTools } from "../src/tools";

let root = "";
let tools: ReturnType<typeof buildSiteTools>;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "prospector-agent-test-"));
  materializeWorkspace(root, {
    "index.html": "<!doctype html><html><head><title>Empresa X</title></head><body><h1>Empresa X</h1></body></html>",
    "src/site.css": ".hero{color:red}",
  });
  tools = buildSiteTools({ workspaceRoot: root, business: { name: "Empresa X", segment: "Advocacia" } });
});

afterAll(() => {
  const { rmSync } = require("node:fs");
  rmSync(root, { recursive: true, force: true });
});

function run(toolName: string, input: Record<string, unknown>): Promise<string> {
  const tool = tools.find((t) => (t as unknown as { name: string }).name === toolName);
  if (!tool) return Promise.resolve(JSON.stringify({ error: "tool não encontrada" }));
  const exec = (tool as unknown as { execute: (i: never) => Promise<string> }).execute;
  return exec(input as never);
}

describe("ProspectorSiteAgent — workspace (Cline SDK runtime)", () => {
  it("materializa e lê workspace", () => {
    expect(existsSync(join(root, "index.html"))).toBe(true);
    const files = readWorkspace(root);
    expect(files["index.html"]).toContain("Empresa X");
  });

  it("list_files scoped", async () => {
    const res = JSON.parse(await run("list_files", {})) as string[];
    expect(res).toContain("index.html");
    expect(res).toContain("src/site.css");
  });

  it("read_file", async () => {
    const content = await run("read_file", { path: "index.html" });
    expect(content).toContain("Empresa X");
  });

  it("write_file cria e persiste", async () => {
    await run("write_file", { path: "src/novo.css", content: ".x{}" });
    expect(readFileSync(join(root, "src/novo.css"), "utf8")).toBe(".x{}");
  });

  it("edit_file substitui trecho exato", async () => {
    await run("edit_file", { path: "src/site.css", find: "color:red", replace: "color:blue" });
    expect(readFileSync(join(root, "src/site.css"), "utf8")).toContain("color:blue");
  });

  it("edit_file RECUSA find ambíguo (múltiplas ocorrências) e não altera nada", async () => {
    await run("write_file", { path: "src/amb.css", content: ".x{color:red}\n.y{color:red}" });
    const out = await run("edit_file", { path: "src/amb.css", find: "color:red", replace: "color:blue" });
    expect(out).toContain("AMBÍGUO");
    expect(readFileSync(join(root, "src/amb.css"), "utf8")).toBe(".x{color:red}\n.y{color:red}");
  });

  it("edit_file com occurrence troca APENAS a ocorrência indicada", async () => {
    await run("write_file", { path: "src/amb2.css", content: ".x{color:red}\n.y{color:red}" });
    const out = await run("edit_file", { path: "src/amb2.css", find: "color:red", replace: "color:blue", occurrence: 2 });
    expect(out).toContain("ok");
    const after = readFileSync(join(root, "src/amb2.css"), "utf8");
    expect(after).toBe(".x{color:red}\n.y{color:blue}");
  });

  it("bloqueia path traversal e .env", async () => {
    const out = await run("write_file", { path: "../../fora.txt", content: "x" });
    expect(out).toContain("fora do workspace");
    const env = await run("write_file", { path: ".env", content: "KEY=x" });
    expect(env).toContain("caminho inválido");
  });

  it("get_site_context devolve dados do negócio", async () => {
    const res = JSON.parse(await run("get_site_context", {})) as { name: string; segment: string };
    expect(res.name).toBe("Empresa X");
    expect(res.segment).toBe("Advocacia");
  });

  it("FASE 7 — .env em SUBDIRETÓRIO é bloqueado (não só na raiz)", async () => {
    const out = await run("write_file", { path: "config/.env.local", content: "SECRET=x" });
    expect(out).toContain("caminho inválido");
    const rd = await run("read_file", { path: "config/.env.local" });
    expect(rd).toContain("não encontrado");
  });

  it("FASE 7 — delete_file protege arquivos ESTRUTURAIS do site", async () => {
    const out = await run("delete_file", { path: "index.html" });
    expect(out).toContain("ESTRUTURAL");
    expect(existsSync(join(root, "index.html"))).toBe(true);
    const css = await run("delete_file", { path: "src/site.css" });
    expect(css).toContain("ESTRUTURAL");
    expect(existsSync(join(root, "src/site.css"))).toBe(true);
  });

  it("FASE 7 — delete_file remove arquivo NÃO-crítico normalmente", async () => {
    await run("write_file", { path: "src/tmp.txt", content: "x" });
    const out = await run("delete_file", { path: "src/tmp.txt" });
    expect(out).toContain("ok");
    expect(existsSync(join(root, "src/tmp.txt"))).toBe(false);
  });

  it("FASE 7 — limite de 400 arquivos do workspace é aplicado", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeFileSync, mkdirSync } = require("node:fs");
    mkdirSync(join(root, "many"), { recursive: true });
    for (let i = 0; i < 420; i++) writeFileSync(join(root, "many", `f${i}.txt`), "x");
    const out = await run("write_file", { path: "src/excedente.txt", content: "x" });
    expect(out).toContain("limite de 400 arquivos");
  });
});
