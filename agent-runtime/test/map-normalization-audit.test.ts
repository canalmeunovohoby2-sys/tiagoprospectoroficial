import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { normalizeWorkspaceMapEmbeds } from "../src/studio/agent-core/site-media";
import { buildStaticMapBlock } from "../src/studio/agent-core/static-map";

// AUDITORIA DO MAPA: "DeepSeek output → pós-processamento → resultado final".
// Prova que a normalização NÃO degrada para algo menos interativo: ela troca o
// iframe (bloqueado sob COEP) pelo mapa INTERATIVO e injeta o runtime.
const BUSINESS = { name: "Clinica X", address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP", latitude: -22.315, longitude: -49.06 };

// Exemplo do que o modelo costuma escrever (iframe do Google — bloqueado sob COEP).
const DEEPSEEK_OUTPUT = `<section id="localizacao" className="py-20">
  <h2>Onde estamos</h2>
  <iframe src="https://www.google.com/maps/embed?pb=!1m18!2m3" className="h-[320px] w-full" loading="lazy" />
</section>`;

let root = "";
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "map-audit-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html><html><body><div id='root'></div></body></html>", "utf8");
  writeFileSync(join(root, "src/App.tsx"), DEEPSEEK_OUTPUT, "utf8");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("auditoria · normalização do mapa (DeepSeek → runtime → final)", () => {
  it("troca o iframe bloqueado por mapa INTERATIVO e injeta o runtime (sem perder zoom/pan)", () => {
    const changed = normalizeWorkspaceMapEmbeds(root, BUSINESS);
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    const html = readFileSync(join(root, "index.html"), "utf8");

    // final = bloco interativo (não imagem estática, não iframe)
    expect(app).not.toMatch(/<iframe/i);
    expect(app).toContain("data-pf-map");
    expect(app).toContain('data-pf-zoom-step="1"');
    expect(app).toContain('data-pf-zoom-step="-1"');
    expect(app).toContain("Abrir no Google Maps");
    // o runtime que dá ZOOM + PAN + marcador foi injetado no index.html
    expect(html).toContain("prospector-map-runtime");
    expect(html).toContain("pointerdown"); // pan
    expect(html).toContain("wheel");       // zoom
    expect(changed).toContain("src/App.tsx");
    expect(changed).toContain("index.html");
  });

  it("NÃO toca em mapa que o modelo escreveu sem iframe do Google (liberdade preservada)", () => {
    const root2 = mkdtempSync(join(tmpdir(), "map-audit2-"));
    try {
      mkdirSync(join(root2, "src"), { recursive: true });
      const ownMap = `export default function App(){return <div data-my-map="leaflet" />}`;
      writeFileSync(join(root2, "src/App.tsx"), ownMap, "utf8");
      writeFileSync(join(root2, "index.html"), "<div id='root'></div>", "utf8");
      const changed = normalizeWorkspaceMapEmbeds(root2, BUSINESS);
      expect(readFileSync(join(root2, "src/App.tsx"), "utf8")).toBe(ownMap); // intacto
      expect(changed).toEqual([]);
    } finally { rmSync(root2, { recursive: true, force: true }); }
  });

  it("SEM coordenadas/endereço: não inventa mapa (nem injeta runtime)", () => {
    const root3 = mkdtempSync(join(tmpdir(), "map-audit3-"));
    try {
      mkdirSync(join(root3, "src"), { recursive: true });
      writeFileSync(join(root3, "src/App.tsx"), DEEPSEEK_OUTPUT, "utf8");
      writeFileSync(join(root3, "index.html"), "<div id='root'></div>", "utf8");
      const changed = normalizeWorkspaceMapEmbeds(root3, {});
      expect(changed).toEqual([]);
      expect(readFileSync(join(root3, "index.html"), "utf8")).not.toContain("prospector-map-runtime");
    } finally { rmSync(root3, { recursive: true, force: true }); }
  });
});

describe("auditoria · o resultado FINAL é interativo no navegador (COEP real)", () => {
  it("tiles carregam + zoom (+/-) + arrastar num contexto COEP credentialless", async () => {
    const block = buildStaticMapBlock(BUSINESS)!
      .replace(/className=/g, "class=")
      .replace(/<div([^>]*?)\/>/g, "<div$1></div>")
      .replace(/<span([^>]*?)\/>/g, "<span$1></span>");
    // runtime EXATAMENTE o que a normalização injeta no index.html
    const runtime = readFileSync(join(root, "index.html"), "utf8").match(/<script>([\s\S]*?)<\/script>/)![1];
    const page = `<!doctype html><style>html,body{margin:0}#w{width:900px;height:420px}</style><div id="w">${block}</div><script>${runtime}</script>`;

    const server = createServer((_q, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cross-Origin-Embedder-Policy": "credentialless", "Cross-Origin-Opener-Policy": "same-origin" });
      res.end(page);
    });
    await new Promise<void>((r) => server.listen(0, () => r()));
    const port = (server.address() as { port: number }).port;

    const browser = await chromium.launch();
    const tab = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    await tab.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await tab.waitForTimeout(6000);
    const map = tab.locator("[data-pf-map]");
    await expect.poll(() => map.count(), { timeout: 10000 }).toBe(1);

    const tiles = await tab.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("[data-pf-map] img")) as HTMLImageElement[];
      return { n: imgs.length, ok: imgs.filter((i) => i.naturalWidth > 0).length };
    });
    expect(tiles.n).toBeGreaterThan(0);
    expect(tiles.ok).toBeGreaterThan(0);                        // mapa VISÍVEL

    const z0 = await map.getAttribute("data-pf-zoom");
    await tab.click('[data-pf-zoom-step="1"]');                  // zoom + (controle)
    await expect.poll(() => map.getAttribute("data-pf-zoom"), { timeout: 5000 }).toBe(String(Number(z0) + 1));

    const box = (await map.boundingBox())!;
    await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 50, { steps: 8 });
    await tab.mouse.up();                                        // arrastar (pan)
    await tab.waitForTimeout(1000);
    const marker = await tab.evaluate(() => !!document.querySelector("[data-pf-map] div[style*='9999px']"));
    expect(marker).toBe(true);                                   // marcador permanece

    await browser.close();
    server.close();
  }, 120000);
});
