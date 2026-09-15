import { describe, it, expect } from "vitest";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { buildStaticMapBlock } from "../src/studio/agent-core/static-map";

// PROVA REAL: o bloco de mapa do produto (tiles + marcador + link) carrega num
// contexto idêntico ao do site publicado/preview (COEP: credentialless + iframe
// sandbox srcdoc), enquanto um <iframe> do Google Maps é BLOQUEADO ali.
const BUSINESS = { name: "Clinica X", address: "Av. Anchieta, 11305", city: "Bertioga", state: "SP", latitude: -22.315, longitude: -49.06 };

function jsxToHtml(block: string): string {
  return block
    .replace(/className=/g, "class=")
    .replace(/style=\{\{\s*left:\s*"([^"]+)",\s*top:\s*"([^"]+)"\s*\}\}/g, 'style="left:$1;top:$2"');
}

describe("static-map · REAL (Chromium) sob COEP", () => {
  it("os tiles do mapa carregam e o iframe do Google é bloqueado (por isso o estático)", async () => {
    const block = buildStaticMapBlock(BUSINESS)!;
    expect(block).toBeTruthy();
    const inner = `<style>html,body{margin:0}</style>${jsxToHtml(block)}<iframe id="gm" src="https://maps.google.com/maps?q=Bauru/SP&output=embed" style="width:300px;height:150px;border:0"></iframe>`;
    const escaped = inner.replace(/'/g, "&#39;");
    const page = `<!doctype html><style>html,body{margin:0}</style><iframe id="site" sandbox="allow-scripts allow-same-origin" srcdoc='${escaped}' style="width:900px;height:700px;border:0"></iframe>`;

    const server = createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        // MESMO contexto do app (necessário ao WebContainer) — era o que quebrava o mapa.
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Opener-Policy": "same-origin",
      });
      res.end(page);
    });
    await new Promise<void>((r) => server.listen(0, () => r()));
    const port = (server.address() as { port: number }).port;

    const browser = await chromium.launch();
    const failed: string[] = [];
    const tab = await browser.newPage();
    tab.on("requestfailed", (r) => failed.push(`${r.failure()?.errorText}:${new URL(r.url()).host}`));
    await tab.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await tab.waitForTimeout(7000);

    const frame = tab.frames().find((f) => f.url() === "about:srcdoc");
    expect(frame, "iframe do site (srcdoc) não montou").toBeTruthy();
    const info = await frame!.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
      const link = document.querySelector('a[href*="google.com/maps/dir"]') as HTMLAnchorElement | null;
      const marker = document.querySelector(".bg-red-600");
      return {
        tiles: imgs.map((i) => i.naturalWidth),
        link: link?.href ?? null,
        hasMarker: !!marker,
        mapBox: !!document.querySelector('[class*="h-[320px]"]'),
      };
    });

    const googleIframeBlocked = !tab.frames().some((f) => f.url().includes("google.com/maps"));
    const googleFail = failed.some((f) => f.includes("google") && f.includes("BLOCKED_BY_RESPONSE"));

    await browser.close();
    server.close();

    // 1) o MAPA aparece: os 4 tiles carregaram de verdade
    expect(info.tiles).toHaveLength(4);
    for (const w of info.tiles) expect(w).toBeGreaterThan(0);
    // 2) marcador + botão real do Google Maps + altura definida (responsivo)
    expect(info.hasMarker).toBe(true);
    expect(info.link).toContain("google.com/maps/dir");
    expect(info.mapBox).toBe(true);
    // 3) o iframe do Google É bloqueado nesse contexto (prova de que a causa era o iframe)
    expect(googleIframeBlocked && googleFail).toBe(true);
  }, 120000);
});
