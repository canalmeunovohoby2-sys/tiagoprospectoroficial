import { describe, it, expect } from "vitest";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { buildStaticMapBlock, buildMapRuntimeScript } from "../src/studio/agent-core/static-map";

// PROVA REAL (Chromium) do mapa INTERATIVO no MESMO contexto COEP do site
// (preview/publicado): os tiles carregam e o mapa responde a ARRASTAR e ZOOM.
const BUSINESS = { name: "Clinica X", address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP", latitude: -22.315, longitude: -49.06 };

/** Converte o JSX do bloco para HTML (atributos + tags auto-fechadas não-void). */
function jsxToHtml(block: string): string {
  return block
    .replace(/className=/g, "class=")
    .replace(/<div([^>]*?)\/>/g, "<div$1></div>")
    .replace(/<span([^>]*?)\/>/g, "<span$1></span>");
}

describe("mapa interativo · REAL (Chromium) sob COEP: tiles + pan + zoom", () => {
  it("carrega os tiles e responde a arrastar e ao zoom (+/-)", async () => {
    // Sob COEP o iframe oficial do Google é bloqueado/ausente (o runtime esconderia o
    // host do mosaico ao detectar load): medimos o cenário COEP EFETIVO — mosaico OSM.
    // Bloco em sintaxe HTML (o MESMO que a normalização injeta em .html) — sem o
    // conversor frágil de JSX, que perdia o container do mapa.
    const block = buildStaticMapBlock(BUSINESS, { syntax: "html" })!.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
    const page = `<!doctype html><style>html,body{margin:0}#wrap{width:900px;height:420px}</style><div id="wrap">${block}</div><script>${buildMapRuntimeScript()}</script>`;

    const server = createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        // MESMO contexto do app (necessário ao WebContainer) — era o que quebrava o iframe.
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Opener-Policy": "same-origin",
      });
      res.end(page);
    });
    await new Promise<void>((r) => server.listen(0, () => r()));
    const port = (server.address() as { port: number }).port;

    const browser = await chromium.launch();
    const tab = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    await tab.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });

    const map = tab.locator("[data-pf-map]");
    await expect.poll(async () => map.count(), { timeout: 10000 }).toBe(1);
    // CONDICOES REAIS (sem sleep): container com area + tiles com naturalWidth > 0.
    const rectOf = () => tab.evaluate(() => {
      const el = document.querySelector("[data-pf-map]") as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await expect.poll(async () => { const r = await rectOf(); return r ? Math.min(r.width, r.height) : 0; }, { timeout: 15000 }).toBeGreaterThan(50);
    await expect.poll(async () => tab.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("[data-pf-map] img")) as HTMLImageElement[];
      return imgs.filter((i) => i.naturalWidth > 0).length;
    }), { timeout: 20000 }).toBeGreaterThan(0);

    // 1) MAPA APARECE: os tiles (imagens) carregaram de verdade.
    const tiles = await tab.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("[data-pf-map] img")) as HTMLImageElement[];
      return { count: imgs.length, loaded: imgs.filter((i) => i.naturalWidth > 0).length };
    });
    expect(tiles.count).toBeGreaterThan(0);
    expect(tiles.loaded).toBeGreaterThan(0);

    // 2) INTERATIVO — ZOOM: botão "+" aumenta o zoom do mapa.
    const zoomBefore = await map.getAttribute("data-pf-zoom");
    await tab.click('[data-pf-zoom-step="1"]');
    await expect.poll(async () => await map.getAttribute("data-pf-zoom"), { timeout: 5000 }).not.toBe(zoomBefore);
    const zoomAfter = await map.getAttribute("data-pf-zoom");
    expect(Number(zoomAfter)).toBe(Number(zoomBefore) + 1);
    // botão "−" volta
    await tab.click('[data-pf-zoom-step="-1"]');
    await expect.poll(async () => await map.getAttribute("data-pf-zoom"), { timeout: 5000 }).toBe(zoomBefore);

    // 3) INTERATIVO — ARRASTAR (pan): o arrasto recentraliza o mapa (muda a latitude/longitude efetiva).
    const box = (await rectOf())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await tab.mouse.move(center.x, center.y);
    await tab.mouse.down();
    await tab.mouse.move(center.x + 120, center.y + 60, { steps: 8 });
    await tab.mouse.up();
    await tab.waitForTimeout(1200);
    // Após o pan o mapa re-renderiza (tiles continuam carregando) e o marcador segue presente.
    const after = await tab.evaluate(() => {
      const el = document.querySelector("[data-pf-map]")!;
      const imgs = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
      return { tiles: imgs.length, marker: !!el.querySelector("div[style*='9999px']") };
    });
    expect(after.tiles).toBeGreaterThan(0);
    expect(after.marker).toBe(true);

    await browser.close();
    server.close();
  }, 120000);
});
