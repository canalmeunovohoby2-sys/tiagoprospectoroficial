import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
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

  it("ECONOMIA: read_file em binário devolve METADADOS (não base64)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeFileSync, mkdirSync } = require("node:fs");
    mkdirSync(join(root, "binassets"), { recursive: true });
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]).toString("base64");
    writeFileSync(join(root, "binassets/logo.png"), png);
    const out = await run("read_file", { path: "binassets/logo.png" });
    const parsed = JSON.parse(out) as { kind?: string; mimeType?: string };
    expect(parsed.kind).toBe("binary");
    expect(parsed.mimeType).toBe("image/png");
    expect(out).not.toContain("iVBOR"); // não vaza o conteúdo base64
  });

  it("ECONOMIA: list_files limita o payload e informa total", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeFileSync, mkdirSync } = require("node:fs");
    mkdirSync(join(root, "bulk"), { recursive: true });
    for (let i = 0; i < 260; i++) writeFileSync(join(root, "bulk", `b${i}.txt`), "x");
    const parsed = JSON.parse(await run("list_files", {})) as { files?: string[]; total?: number; truncated?: boolean };
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.truncated).toBe(true);
    expect(parsed.files?.length).toBe(200);
    expect(parsed.total ?? 0).toBeGreaterThan(200);
  });
});

describe("Autonomia — rename_file / move_file / run_command (workspace isolado)", () => {
  let r = "";
  let tl: ReturnType<typeof buildSiteTools>;

  function callTool(name: string, input: Record<string, unknown>): Promise<string> {
    const tool = tl.find((t) => (t as unknown as { name: string }).name === name);
    if (!tool) return Promise.resolve(JSON.stringify({ error: "tool não encontrada" }));
    const exec = (tool as unknown as { execute: (i: never) => Promise<string> }).execute;
    return exec(input as never);
  }

  beforeAll(() => {
    r = mkdtempSync(join(tmpdir(), "prospector-agent-tools2-"));
    tl = buildSiteTools({ workspaceRoot: r, business: { name: "Empresa X" } });
    mkdirSync(join(r, "assets"), { recursive: true });
    writeFileSync(join(r, "assets/logo.svg"), '<svg id="logo"></svg>', "utf8");
    writeFileSync(join(r, "a.txt"), "CONTEUDO-A", "utf8");
    writeFileSync(join(r, "index.html"), "<!doctype html><html><body>x</body></html>", "utf8");
  });
  afterAll(() => {
    // O teste de timeout mata a árvore de processos; aguarda um instante caso o
    // SO ainda esteja liberando o diretório antes de remover.
    try { rmSync(r, { recursive: true, force: true }); }
    catch { try { rmSync(r, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* noop */ } }
  });

  it("rename_file válido: preserva conteúdo, cria pasta e move o caminho", async () => {
    const out = JSON.parse(await callTool("rename_file", { from: "assets/logo.svg", to: "assets/brand/logo-v1.svg" })) as { ok?: boolean; from?: string; to?: string };
    expect(out.ok).toBe(true);
    expect(out.to).toBe("assets/brand/logo-v1.svg");
    expect(existsSync(join(r, "assets/logo.svg"))).toBe(false);
    expect(readFileSync(join(r, "assets/brand/logo-v1.svg"), "utf8")).toBe('<svg id="logo"></svg>');
  });

  it("rename_file rejeita '..', caminho absoluto e origem inexistente", async () => {
    expect(await callTool("rename_file", { from: "../x.txt", to: "y.txt" })).toContain("fora do workspace");
    expect(await callTool("rename_file", { from: "a.txt", to: "../../y.txt" })).toContain("fora do workspace");
    expect(await callTool("rename_file", { from: "a.txt", to: "/tmp/y.txt" })).toContain("absoluto");
    expect(await callTool("rename_file", { from: "naoexiste.txt", to: "z.txt" })).toContain("não encontrado");
  });

  it("rename_file protege arquivos ESTRUTURAIS", async () => {
    const out = await callTool("rename_file", { from: "index.html", to: "home.html" });
    expect(out).toContain("ESTRUTURAL");
    expect(existsSync(join(r, "index.html"))).toBe(true);
  });

  it("move_file válido: cria destino seguro e preserva o conteúdo", async () => {
    const out = JSON.parse(await callTool("move_file", { from: "a.txt", to: "src/deep/b.txt" })) as { ok?: boolean; to?: string };
    expect(out.ok).toBe(true);
    expect(out.to).toBe("src/deep/b.txt");
    expect(existsSync(join(r, "a.txt"))).toBe(false);
    expect(readFileSync(join(r, "src/deep/b.txt"), "utf8")).toBe("CONTEUDO-A");
  });

  it("move_file rejeita traversal/absoluto/inexistente", async () => {
    expect(await callTool("move_file", { from: "src/deep/b.txt", to: "../fora.txt" })).toContain("fora do workspace");
    expect(await callTool("move_file", { from: "src/deep/b.txt", to: "C:\\Windows\\x.txt" })).toContain("absoluto");
    expect(await callTool("move_file", { from: "naoexiste.txt", to: "x.txt" })).toContain("não encontrado");
  });

  it("run_command sem package.json devolve erro real", async () => {
    const out = await callTool("run_command", { action: "run", script: "build" });
    expect(out).toContain("package.json");
  });

  it("run_command roda script do próprio package.json (ok, cwd=workspace)", async () => {
    writeFileSync(join(r, "package.json"), JSON.stringify({
      name: "t", private: true,
      scripts: {
        hello: "node -e \"console.log('HI-RUN')\"",
        touch: "node -e \"require('fs').writeFileSync('ran-in-workspace.txt','1')\"",
        fail: "node -e \"process.exit(3)\"",
        slow: "node -e \"setTimeout(()=>{}, 4000)\"",
        big: "node -e \"console.log('x'.repeat(250000))\"",
        printsecret: "node -e \"console.log('SEC='+(process.env.SUPER_SECRET_TOKEN ?? 'absent'))\"",
      },
    }), "utf8");
    const hello = JSON.parse(await callTool("run_command", { action: "run", script: "hello" })) as { ok?: boolean; code?: number; stdout?: string };
    expect(hello.ok).toBe(true);
    expect(hello.code).toBe(0);
    expect(hello.stdout).toContain("HI-RUN");
    const touch = JSON.parse(await callTool("run_command", { action: "run", script: "touch" })) as { ok?: boolean };
    expect(touch.ok).toBe(true);
    expect(existsSync(join(r, "ran-in-workspace.txt"))).toBe(true); // rodou com cwd = workspace
  });

  it("run_command rejeita script inexistente e nome inválido (sem shell livre)", async () => {
    expect(await callTool("run_command", { action: "run", script: "naoexiste" })).toContain("não existe");
    expect(await callTool("run_command", { action: "run", script: "hello; rm -rf /" })).toContain("inválido");
  });

  it("run_command: exit code != 0 vira falha real", async () => {
    const out = JSON.parse(await callTool("run_command", { action: "run", script: "fail" })) as { error?: string; code?: number };
    expect(out.code).toBe(3);
    expect(out.error ?? "").toContain("exit 3");
  });

  it("run_command: timeout é falha real", async () => {
    const out = JSON.parse(await callTool("run_command", { action: "run", script: "slow", timeoutMs: 1200 })) as { error?: string; timedOut?: boolean };
    expect(out.timedOut).toBe(true);
    expect(out.error ?? "").toContain("timeout");
  }, 20000);

  it("run_command: saída limitada (truncada)", async () => {
    const out = JSON.parse(await callTool("run_command", { action: "run", script: "big" })) as { ok?: boolean; stdout?: string };
    expect(out.ok).toBe(true);
    expect((out.stdout ?? "").length).toBeLessThanOrEqual(200_100);
    expect(out.stdout ?? "").toContain("truncada");
  }, 20000);

  it("run_command NÃO propaga secrets no ambiente", async () => {
    process.env.SUPER_SECRET_TOKEN = "LEAK-ME";
    try {
      const out = JSON.parse(await callTool("run_command", { action: "run", script: "printsecret" })) as { stdout?: string };
      expect(out.stdout ?? "").toContain("SEC=absent");
      expect(out.stdout ?? "").not.toContain("LEAK-ME");
    } finally {
      delete process.env.SUPER_SECRET_TOKEN;
    }
  });
});
