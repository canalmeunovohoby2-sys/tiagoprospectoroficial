import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeViewport, formatVisualReport, parseColorSwap, runVisualVerification, VISUAL_VIEWPORTS } from "../src/studio/agent-core/visual-verify";

const OBJECTIVE = "troque toda a cor verde do site para vermelho";

function site(green = true): string {
  const c = green ? "#16a34a" : "#dc2626";
  const cls = green ? "bg-green-600" : "bg-red-600";
  return `<!doctype html><html><head><style>:root{--brand:${c}} body{margin:0}</style></head><body>
  <header class="${cls}" style="padding:20px;background:${c}">Header</header>
  <main><section class="${cls}" style="background:${c}"><h1>Hero</h1></section>
  <section class="cards" style="background:${c}">Cards</section></main>
  <footer style="background:${c}">Footer</footer>
</body></html>`;
}

let root = "";
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "visual-verify-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("visual_verify · unidade (interpretação do pedido e análise)", () => {
  it("interpreta 'verde PARA vermelho': antigo = verde, novo = vermelho", () => {
    const s = parseColorSwap(OBJECTIVE);
    expect(s.hasSwap).toBe(true);
    expect(s.oldTokens).toContain("green");
    expect(s.oldTokens).toContain("#16a34a");
    expect(s.newTokens).toContain("red");
    // sem conector → tudo é "antigo"
    expect(parseColorSwap("deixe tudo verde").hasSwap).toBe(false);
  });

  it("sobra da cor antiga = FAIL; só vermelho = PASS", () => {
    const base = { device: "desktop", consoleErrors: [], failedRequests: [], brokenImages: [], overflowX: false };
    const fail = analyzeViewport({ ...base, objective: OBJECTIVE, colors: ["#dc2626", "green", "#16a34a"] });
    expect(fail.ok).toBe(false);
    expect(fail.leftovers).toContain("#16a34a");
    expect(fail.targetFound).toBe(true); // a cor nova apareceu, mas AINDA sobrou a antiga
    const pass = analyzeViewport({ ...base, objective: OBJECTIVE, colors: ["#dc2626", "red"] });
    expect(pass.ok).toBe(true);
    expect(pass.leftovers).toEqual([]);
  });

  it("o relatório traz PASS/FAIL, os 3 devices e a ação exigida", () => {
    const vps = VISUAL_VIEWPORTS.map((v) => ({ ...v, ok: false, consoleErrors: [], failedRequests: [], brokenImages: [], colors: [], leftovers: ["green"], targetFound: true, overflowX: false }));
    const fail = formatVisualReport({ verdict: "FAIL", objective: OBJECTIVE, viewports: vps, problems: ["Header ainda verde"], cssLeftovers: ["--brand: #16a34a"], brokenElements: 0, criticalErrors: [], screenshots: [] });
    expect(fail).toContain("VISUAL VERIFICATION: FAIL");
    expect(fail).toContain("Desktop: FAIL");
    expect(fail).toContain("Tablet: FAIL");
    expect(fail).toContain("Mobile: FAIL");
    expect(fail).toContain("Header ainda verde");
    expect(fail).toContain("Do not conclude the task");
    const pass = formatVisualReport({ verdict: "PASS", objective: OBJECTIVE, viewports: [], problems: [], cssLeftovers: [], brokenElements: 0, criticalErrors: [], screenshots: [] });
    expect(pass).toContain("The task may be concluded");
  });
});

describe("visual_verify · REAL (Chromium) — site parcial → FAIL, corrigido → PASS", () => {
  it("detecta a identidade antiga nos 3 viewports e aprova depois da correção completa", async () => {
    // 1) Site VERDE (estado inicial)
    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(join(root, "index.html"), site(true), "utf8");

    // 2) Alteração PARCIAL proposital: só o hero vira vermelho (header/cards/footer verdes)
    const partial = site(true).replace('<h1>Hero</h1>', '<h1 style="color:#dc2626">Hero</h1>').replace('<section class="bg-green-600" style="background:#16a34a">', '<section class="bg-red-600" style="background:#dc2626">');
    writeFileSync(join(root, "index.html"), partial, "utf8");

    const fail = await runVisualVerification({ serveDir: root, objective: OBJECTIVE });
    expect(fail.verdict).toBe("FAIL");
    expect(fail.viewports).toHaveLength(3);                        // desktop/tablet/mobile
    expect(fail.viewports.every((v) => v.device === "desktop" || v.device === "tablet" || v.device === "mobile")).toBe(true);
    expect(fail.cssLeftovers.length).toBeGreaterThan(0);           // #16a34a continua na tela
    expect(fail.report).toContain("VISUAL VERIFICATION: FAIL");
    expect(fail.report).toContain("Do not conclude the task");

    // 3) Corrige TUDO para vermelho → PASS
    writeFileSync(join(root, "index.html"), site(false), "utf8");
    const pass = await runVisualVerification({ serveDir: root, objective: OBJECTIVE });
    expect(pass.verdict).toBe("PASS");
    expect(pass.cssLeftovers).toEqual([]);
    expect(pass.report).toContain("The task may be concluded");
  }, 180000);
});
