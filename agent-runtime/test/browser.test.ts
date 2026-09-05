import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session";

let root = "";
let session: BrowserSession;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "prospector-browser-test-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), `<!doctype html><html><head><title>Teste Browser</title></head><body>
    <h1>Hero</h1><h2>Seção</h2>
    <a href="#contato">Contato</a><a href="#nao-existe">Quebrado</a>
    <img src="https://img.invalid/nao-existe.jpg" alt="img" />
    <script>console.error("erro-controlado");</script>
  </body></html>`);
  session = new BrowserSession(root);
});

afterAll(async () => {
  await session.close();
  rmSync(root, { recursive: true, force: true });
});

describe("Browser QA (5.20)", () => {
  it("abre o site e inspeciona DOM (título, headings, links)", async () => {
    const insp = await session.open("/", { width: 1366, height: 768 });
    expect(insp.title).toBe("Teste Browser");
    expect(insp.headings.some((h) => h.toLowerCase().startsWith("h1"))).toBe(true);
    expect(insp.links).toBeGreaterThanOrEqual(2);
  });

  it("detecta anchor quebrado e imagem que não carrega", async () => {
    const insp = await session.inspectCurrent();
    expect(insp.brokenAnchors).toContain("#nao-existe");
    expect(insp.images.length).toBeGreaterThan(0);
  });

  it("detecta erro de console (JavaScript)", async () => {
    const insp = await session.inspectCurrent();
    expect(insp.consoleErrors.some((e) => e.includes("erro-controlado"))).toBe(true);
  });

  it("viewport desktop/mobile reflete no documento", async () => {
    await session.setViewport(1366, 768);
    const d = await session.inspectCurrent();
    expect(d.viewport.width).toBe(1366);
    await session.setViewport(390, 844);
    const m = await session.inspectCurrent();
    expect(m.viewport.width).toBe(390);
  });

  it("captura screenshot em arquivo", async () => {
    const file = await session.screenshot("qa");
    expect(file.endsWith(".png")).toBe(true);
  });

  it("bloqueia URL fora do workspace", async () => {
    await expect(session.open("https://example.com")).rejects.toThrow(/bloqueada/);
  });
});

describe("Browser server isolamento", () => {
  it("não serve .env nem arquivo fora do root", async () => {
    const http = await import("node:http");
    // direto: cria outro session com .env fake e tenta acessar
    const root2 = mkdtempSync(join(tmpdir(), "prospector-browser-sec-"));
    writeFileSync(join(root2, ".env"), "SECRET=abc");
    writeFileSync(join(root2, "index.html"), "<html><body>ok</body></html>");
    const s2 = new BrowserSession(root2);
    const base = await s2.startServer();
    const get = (p: string) => new Promise<number>((resolve) => {
      http.get(base + p, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    });
    expect(await get(".env")).toBe(403);
    expect(await get("")).toBe(200);
    await s2.close();
    rmSync(root2, { recursive: true, force: true });
  });
});
