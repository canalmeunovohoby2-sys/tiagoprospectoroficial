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
});
