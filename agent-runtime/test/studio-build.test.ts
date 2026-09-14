import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
