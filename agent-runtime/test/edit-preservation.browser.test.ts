import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session";
import { buildSiteTools } from "../src/tools";
import { readWorkspace } from "../src/workspace";
import { editRegressionIssues } from "../../supabase/functions/_shared/regression-guard";
import { decideFinishBlock } from "../src/completion-guard";
import { computeWorkEvidence } from "../src/work-evidence";

const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Clínica Sorriso</title>
<link rel="stylesheet" href="src/site.css"></head><body>
<header class="top"><span class="icon">X</span><nav class="menu"><a href="#a">Início</a><a href="#b">Serviços</a><a href="#c">Contato</a></nav></header>
<main><section class="hero"><h1>Clínica Sorriso</h1>
<img class="hero-img" src="assets/a.svg" alt="foto">
<p class="hero-txt">Odontologia de excelência para toda a família.</p>
<a class="cta" href="#c">Agendar</a></section></main>
<footer class="rodape">© Clínica Sorriso</footer>
<script>document.body.dataset.ready="1";</script>
</body></html>`;

const CSS = `:root{--brand:#0f766e;--brand-2:#f59e0b;--ink:#0f172a}
.icon{width:24px;height:24px;display:inline-block}
header.top{height:72px;display:flex;align-items:center;gap:16px}
.hero{padding:48px}
.cta{background:var(--brand-2);color:var(--ink);padding:12px 22px;border-radius:10px}
.rodape{background:var(--ink);color:#cbd5e1;padding:20px}
@media(max-width:900px){.hero{padding:24px}}`;

const SVG_A = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#0f766e"/></svg>`;
const SVG_B = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#f59e0b"/></svg>`;

let root = "";
let session: BrowserSession;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

function run(name: string, input: Record<string, unknown>): Promise<string> {
  const t = tools.find((x: { name: string }) => x.name === name);
  return t.execute(input);
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "edit-pres-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), HTML);
  writeFileSync(join(root, "src/site.css"), CSS);
  writeFileSync(join(root, "assets/a.svg"), SVG_A);
  writeFileSync(join(root, "assets/b.svg"), SVG_B);
  session = new BrowserSession(root);
  tools = buildSiteTools({ workspaceRoot: root, business: { name: "Clínica Sorriso", segment: "Odontologia" } });
});

afterAll(async () => {
  await session.close();
  rmSync(root, { recursive: true, force: true });
});

async function snap() {
  const q = (s: string) => `document.querySelector(${JSON.stringify(s)})`;
  const expr =
    `(()=>{const box=(el)=>(el?Math.round(el.getBoundingClientRect().width):-1);` +
    `const h=(el)=>(el?Math.round(el.getBoundingClientRect().height):-1);` +
    `const cs=(el)=>(el?getComputedStyle(el):null);` +
    `const icon=${q(".icon")};const header=${q("header")};const cta=${q(".cta")};` +
    `const h1=${q("h1")};const img=${q(".hero-img")};const link=${q("link[rel='stylesheet']")};` +
    `return {iconW:box(icon),headerH:h(header),ctaBg:(cs(cta)?.backgroundColor)??null,` +
    `h1:h1?h1.textContent:null,img:img?img.getAttribute('src'):null,` +
    `linkHref:link?link.getAttribute('href'):null,` +
    `brand:(getComputedStyle(document.documentElement).getPropertyValue('--brand')||'').trim()};})()`;
  const r = await session.evaluate(expr);
  return r.value as {
    iconW: number; headerH: number; ctaBg: string | null; h1: string | null;
    img: string | null; linkHref: string | null; brand: string;
  };
}

async function openFresh() {
  await session.open("/?t=" + Date.now(), { width: 1366, height: 768 });
}

describe("E2E REAL (Chromium) — edição localizada preserva o site", () => {
  it("edição de TEXTO altera só o h1 e preserva ícone/CSS/tema/link/foto/header", async () => {
    await openFresh();
    const before = await snap();
    expect(before.iconW).toBe(24);
    expect(before.headerH).toBe(72);
    expect(before.linkHref).toBe("src/site.css");
    expect(before.brand).toBe("#0f766e");

    const out = await run("edit_file", { path: "index.html", find: "<h1>Clínica Sorriso</h1>", replace: "<h1>Clínica Sorriso Odontologia</h1>" });
    expect(out).toContain("ok");

    await openFresh();
    const after = await snap();
    const insp = await session.inspectCurrent();
    expect(after.h1).toBe("Clínica Sorriso Odontologia");
    expect(after.iconW).toBe(24); // ícone NÃO virou gigante
    expect(after.headerH).toBe(72); // header intacto
    expect(after.ctaBg).toBe(before.ctaBg); // tema/CSS intacto
    expect(after.brand).toBe("#0f766e");
    expect(after.linkHref).toBe("src/site.css"); // <link> preservado
    expect(after.img).toBe("assets/a.svg");
    expect(insp.consoleErrors).toEqual([]);
  });

  it("edição de IMAGEM troca só o alvo (não reconstrói CSS/layout)", async () => {
    await openFresh();
    const before = await snap();
    const out = await run("edit_file", { path: "index.html", find: 'src="assets/a.svg"', replace: 'src="assets/b.svg"' });
    expect(out).toContain("ok");
    await openFresh();
    const after = await snap();
    const insp = await session.inspectCurrent();
    expect(after.img).toBe("assets/b.svg");
    expect(after.iconW).toBe(before.iconW);
    expect(after.headerH).toBe(before.headerH);
    expect(after.ctaBg).toBe(before.ctaBg);
    expect(after.linkHref).toBe("src/site.css");
    expect(insp.consoleErrors).toEqual([]);
  });

  it("find AMBÍGUO é recusado e o arquivo não é alterado (não mexe no elemento errado)", async () => {
    const cssPath = join(root, "src/site.css");
    const before = readFileSync(cssPath, "utf8");
    expect((before.match(/var\(--ink\)/g) ?? []).length).toBe(2); // realmente ambíguo
    const out = await run("edit_file", { path: "src/site.css", find: "var(--ink)", replace: "var(--brand)" });
    expect(out).toContain("AMBÍGUO");
    expect(readFileSync(cssPath, "utf8")).toBe(before);
  });

  it("edição pontual de cor não altera a geometria do ícone (24px continua 24px)", async () => {
    await openFresh();
    const before = await snap();
    const out = await run("edit_file", { path: "src/site.css", find: "background:var(--brand-2);color:var(--ink)", replace: "background:#7c3aed;color:#fff" });
    expect(out).toContain("ok");
    await openFresh();
    const after = await snap();
    expect(after.ctaBg).not.toBe(before.ctaBg); // mudou o CTA
    expect(after.iconW).toBe(24); // e nada mais
    expect(after.headerH).toBe(before.headerH);
    expect(after.linkHref).toBe("src/site.css");
  });
});

describe("E2E REAL (Chromium) — Regression Guard bloqueia regressões catastróficas", () => {
  const SHELL = { "index.html": HTML, "src/site.css": CSS };

  it("edição válida (texto) NÃO acusa regressão", () => {
    const after = { ...SHELL, "index.html": HTML.replace("Odontologia de excelência", "Odontologia premium e humanizada") };
    expect(editRegressionIssues(SHELL, after, "melhore o texto do hero")).toEqual([]);
  });

  it("remoção do <link rel='stylesheet'> é detectada", () => {
    const after = { ...SHELL, "index.html": HTML.replace(/<link[^>]*>/, "") };
    expect(editRegressionIssues(SHELL, after, "mude o texto do hero").join("\n")).toMatch(/link/i);
  });

  it("CSS com chave faltando é detectado", () => {
    const after = { ...SHELL, "src/site.css": CSS.replace(/\.hero\{padding:48px\}/, ".hero{padding:48px") };
    expect(editRegressionIssues(SHELL, after, "ajuste o hero").join("\n")).toMatch(/chaves/i);
  });

  it("variáveis CSS do tema removidas são detectadas", () => {
    const after = { ...SHELL, "src/site.css": CSS.replace(/:root\{[^}]*\}/, ":root{}") };
    expect(editRegressionIssues(SHELL, after, "ajuste o CTA").join("\n")).toMatch(/vari[áa]veis/i);
  });

  it("ícone gigante (24px → 360px) provocado por CSS quebrado é bloqueado", () => {
    // Simula o sintoma clássico: a regra .icon é quebrada e o SVG/nó cresce.
    const after = { ...SHELL, "src/site.css": CSS.replace(".icon{width:24px;height:24px;display:inline-block}", ".icon{width:360px;height:360px") };
    const issues = editRegressionIssues(SHELL, after, "troque a cor do botão");
    expect(issues.join("\n")).toMatch(/chaves/i);
  });
});

describe("FASE 7.1 — browser verification obrigatória (Chromium real + Completion Guard)", () => {
  let r2 = "";
  let s2: BrowserSession;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let t2: any;
  const START = { "index.html": HTML, "src/site.css": CSS, "assets/a.svg": SVG_A, "assets/b.svg": SVG_B };

  beforeAll(async () => {
    r2 = mkdtempSync(join(tmpdir(), "fase71-"));
    mkdirSync(join(r2, "src"), { recursive: true });
    mkdirSync(join(r2, "assets"), { recursive: true });
    writeFileSync(join(r2, "index.html"), HTML);
    writeFileSync(join(r2, "src/site.css"), CSS);
    writeFileSync(join(r2, "assets/a.svg"), SVG_A);
    writeFileSync(join(r2, "assets/b.svg"), SVG_B);
    s2 = new BrowserSession(r2);
    t2 = buildSiteTools({ workspaceRoot: r2, business: { name: "Clínica Sorriso", segment: "Odontologia" } });
  });

  afterAll(async () => { await s2.close(); rmSync(r2, { recursive: true, force: true }); });

  function run2(name: string, input: Record<string, unknown>): Promise<string> {
    const t = t2.find((x: { name: string }) => x.name === name);
    return t.execute(input);
  }
  const reopen = () => s2.open("/?t=" + Date.now(), { width: 1366, height: 768 });

  it("imagem alterada SEM evidência do browser → finish BLOQUEADO", async () => {
    await reopen();
    await run2("edit_file", { path: "index.html", find: 'src="assets/a.svg"', replace: 'src="assets/b.svg"' });
    const work = computeWorkEvidence([
      { type: "tool-started", toolName: "read_file", toolCall: { toolName: "read_file", input: { path: "index.html" } } },
      { type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", input: { path: "index.html" } } },
      // read-back após a edição (satisfaz o gate básico de verificação) — mas SEM browser.
      { type: "tool-started", toolName: "read_file", toolCall: { toolName: "read_file", input: { path: "index.html" } } },
    ]);
    const d = decideFinishBlock({ mode: "edit", files: readWorkspace(r2), startFiles: START, instruction: "troque a imagem do hero", finishSkips: 0, work });
    expect(d.block).toBe(true);
    expect(d.kind).toBe("visual");
  });

  it("imagem alterada + BrowserSession real (reload + inspect, 0 quebradas) → finish PERMITIDO", async () => {
    await reopen();
    const insp = await s2.inspectCurrent();
    const work = computeWorkEvidence([
      { type: "tool-started", toolName: "read_file", toolCall: { toolName: "read_file", input: { path: "index.html" } } },
      { type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", input: { path: "index.html" } } },
      { type: "tool-started", toolName: "browser_reload" },
    ]);
    const d = decideFinishBlock({ mode: "edit", files: readWorkspace(r2), startFiles: START, instruction: "troque a imagem do hero", finishSkips: 0, work, consoleErrors: insp.consoleErrors, brokenImages: insp.images.length });
    expect(insp.images.length).toBe(0);
    expect(d.block).toBe(false);
  });

  it("alteração de CSS com BrowserSession real → finish PERMITIDO", async () => {
    await run2("edit_file", { path: "src/site.css", find: "padding:48px", replace: "padding:52px" });
    await reopen();
    const insp = await s2.inspectCurrent();
    const work = computeWorkEvidence([
      { type: "tool-started", toolName: "read_file", toolCall: { toolName: "read_file", input: { path: "src/site.css" } } },
      { type: "tool-started", toolName: "edit_file", toolCall: { toolName: "edit_file", input: { path: "src/site.css" } } },
      { type: "tool-started", toolName: "browser_reload" },
    ]);
    const d = decideFinishBlock({
      mode: "edit", files: readWorkspace(r2), startFiles: { ...START, "src/site.css": CSS },
      instruction: "ajuste o espaçamento do hero", finishSkips: 0, work,
      consoleErrors: insp.consoleErrors, brokenImages: insp.images.length,
    });
    expect(d.block).toBe(false);
  });
});
