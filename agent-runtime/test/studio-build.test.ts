import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import {
  buildReactProject, collapseDistToSingleHtml, collectDistFiles, isReactBuildHtml, validateBuildOutput,
} from "../src/studio/build";

const HTML = '<!doctype html><html><head><link rel="stylesheet" href="/assets/index.css"></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>';

function writeDist(root: string) {
  mkdirSync(join(root, "dist", "assets"), { recursive: true });
  writeFileSync(join(root, "dist", "index.html"), HTML, "utf8");
  writeFileSync(join(root, "dist", "assets", "index.js"), 'console.log("app")', "utf8");
  writeFileSync(join(root, "dist", "assets", "index.css"), ".a{color:red}", "utf8");
}

let distRoot = "";
let okRoot = "";
let failRoot = "";
let emptyRoot = "";

beforeAll(() => {
  distRoot = mkdtempSync(join(tmpdir(), "c5-dist-"));
  writeDist(distRoot);

  okRoot = mkdtempSync(join(tmpdir(), "c5-build-ok-"));
  mkdirSync(join(okRoot, "node_modules", ".stub"), { recursive: true });
  writeFileSync(join(okRoot, "package.json"), JSON.stringify({ name: "t", private: true, scripts: { build: "node build.mjs" } }), "utf8");
  writeFileSync(join(okRoot, "build.mjs"), [
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'mkdirSync("dist/assets", { recursive: true });',
    `writeFileSync("dist/index.html", ${JSON.stringify(HTML)});`,
    'writeFileSync("dist/assets/index.js", "console.log(1)");',
    'writeFileSync("dist/assets/index.css", ".a{}");',
  ].join("\n"), "utf8");

  failRoot = mkdtempSync(join(tmpdir(), "c5-build-fail-"));
  mkdirSync(join(failRoot, "node_modules", ".stub"), { recursive: true });
  writeFileSync(join(failRoot, "package.json"), JSON.stringify({ name: "t", private: true, scripts: { build: "node -e \"process.exit(1)\"" } }), "utf8");

  emptyRoot = mkdtempSync(join(tmpdir(), "c5-build-empty-"));
  mkdirSync(join(emptyRoot, "node_modules", ".stub"), { recursive: true });
  writeFileSync(join(emptyRoot, "package.json"), JSON.stringify({ name: "t", private: true, scripts: { build: "node -e \"console.log('nada')\"" } }), "utf8");
});

afterAll(() => {
  for (const r of [distRoot, okRoot, failRoot, emptyRoot]) rmSync(r, { recursive: true, force: true });
});

describe("C5 · build (colapso + validação)", () => {
  it("coleta dist e valida index.html", () => {
    const files = collectDistFiles(distRoot);
    expect(files["index.html"]).toBeTruthy();
    expect(files["assets/index.js"]).toBeTruthy();
    expect(files["assets/index.css"]).toBeTruthy();
    expect(validateBuildOutput(files).ok).toBe(true);
  });

  it("valida falha quando não há dist/index.html", () => {
    expect(validateBuildOutput({ "assets/x.js": "x" }).ok).toBe(false);
  });

  it("colapsa o build em HTML auto-contido (inline de JS/CSS)", () => {
    const html = collapseDistToSingleHtml(collectDistFiles(distRoot))!;
    expect(isReactBuildHtml(html)).toBe(true);
    expect(html).toContain("console.log(\"app\")");
    expect(html).toContain(".a{color:red}");
    expect(html).not.toContain('src="/assets/index.js"');
    expect(html).not.toContain('href="/assets/index.css"');
    expect(html).toContain('id="root"');
  });

  it("devolve null sem index.html", () => {
    expect(collapseDistToSingleHtml({ "assets/x.js": "x" })).toBeNull();
  });
});

describe("C5 · navegação do site publicado (menu sem F5)", () => {
  it("injeta o runtime de âncoras no HTML colapsado, dentro do <body>", () => {
    const html = collapseDistToSingleHtml(collectDistFiles(distRoot))!;
    expect(html).toContain('data-prospector-nav="1"');
    const navIdx = html.indexOf('data-prospector-nav="1"');
    const bodyEnd = html.toLowerCase().lastIndexOf("</body>");
    expect(navIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeLessThan(bodyEnd);
  });

  it("clique em href=#secao faz scroll (preventDefault + scrollIntoView), sem navegar", () => {
    const html = collapseDistToSingleHtml(collectDistFiles(distRoot))!;
    const script = html.match(/<script data-prospector-nav="1">([\s\S]*?)<\/script>/)![1];

    const listeners: Record<string, (ev: unknown) => void> = {};
    const scrollIntoView = vi.fn();
    const preventDefault = vi.fn();
    const replaceState = vi.fn();
    const sandbox: Record<string, unknown> = {
      document: {
        addEventListener: (t: string, fn: (ev: unknown) => void) => { listeners[t] = fn; },
        getElementById: (id: string) => (id === "servicos" ? { scrollIntoView } : null),
        getElementsByName: () => [],
      },
      window: { scrollTo: vi.fn(), addEventListener: () => { /* noop */ } },
      location: { href: "about:srcdoc", origin: "null", pathname: "srcdoc", hash: "" },
      history: { replaceState },
      URL,
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);

    const anchor = { getAttribute: (n: string) => (n === "href" ? "#servicos" : null), hasAttribute: () => false };
    listeners.click({ target: { closest: () => anchor }, preventDefault });

    // Sem navegação (preventDefault) E com scroll real na seção.
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(null, "", "#servicos");
  });

  it("não interfere em link externo (WhatsApp/rota)", () => {
    const html = collapseDistToSingleHtml(collectDistFiles(distRoot))!;
    const script = html.match(/<script data-prospector-nav="1">([\s\S]*?)<\/script>/)![1];
    const listeners: Record<string, (ev: unknown) => void> = {};
    const preventDefault = vi.fn();
    const sandbox: Record<string, unknown> = {
      document: { addEventListener: (t: string, fn: (ev: unknown) => void) => { listeners[t] = fn; }, getElementById: () => null, getElementsByName: () => [] },
      window: { scrollTo: vi.fn(), addEventListener: () => { /* noop */ } },
      location: { href: "https://site.com/", origin: "https://site.com", pathname: "/", hash: "" },
      history: { replaceState: vi.fn() },
      URL,
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    const anchor = { getAttribute: () => "https://wa.me/5511999999999", hasAttribute: () => false };
    listeners.click({ target: { closest: () => anchor }, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("C5 · build real do projeto (npm run build)", () => {
  it("build válido → HTML colapsado", async () => {
    const res = await buildReactProject(okRoot);
    expect(res.ok).toBe(true);
    expect(res.html && isReactBuildHtml(res.html)).toBe(true);
    expect(res.log).toContain("[build]");
  }, 120_000);

  it("build falhando (exit != 0) → ok:false com erro legível", async () => {
    const res = await buildReactProject(failRoot);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/exit 1/);
  }, 120_000);

  it("build sem dist/index.html → ok:false", async () => {
    const res = await buildReactProject(emptyRoot);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/dist\/index\.html/);
  }, 120_000);
});
