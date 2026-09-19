import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRenderedSite } from "../src/studio/visual-validation";

// FASE 4 — RENDER REAL (Chromium/Playwright) sobre páginas servidas de verdade.
// Prova que a validação enxerga a TELA (não só o código): tela branca, overflow,
// imagem quebrada, CTA, mobile e direção. Somente leitura, sem correção.

const serve = async (root: string) => ({ dir: root });
let base = "";

function project(name: string, html: string): string {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html, "utf8");
  return dir;
}

const VALID_SITE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>:root{--primary:#0b5cff} body{margin:0;font-family:sans-serif}
.hero{padding:48px} .cta{background:var(--primary);color:#fff;padding:12px 20px;display:inline-block}
img{max-width:100%;height:auto;display:block}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:24px}</style></head>
<body>
<header>Usinagem Precisão Ferro</header>
<section class="hero"><h1>Usinagem de precisão</h1>
<a class="cta" href="https://wa.me/5547999999999">Orçamento no WhatsApp</a></section>
<section class="gallery"><img alt="máquina" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23333'/%3E%3C/svg%3E"><img alt="fábrica" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23555'/%3E%3C/svg%3E"></section>
<section><h2>Capacidades e especificações técnicas</h2><p>torneamento, fresamento e tolerância controlada</p></section>
<section><h2>Onde estamos</h2><p>Rua das Indústrias, 900 — Joinville/SC</p></section>
<section><h2>Nossos serviços</h2><p>Usinagem CNC e prototipagem</p></section>
</body></html>`;

const WHITE_SCREEN = `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff}</style></head><body></body></html>`;

const OVERFLOW_DESKTOP = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<header>H</header><section><h1>Overflow</h1><div style="width:2400px;height:40px;background:#ccc"></div>
<a href="https://wa.me/55">WhatsApp</a></section></body></html>`;

const BROKEN_IMAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<header>H</header><section><h1>Imagem quebrada</h1><img src="/nao-existe-999.png" alt="quebrada">
<a href="https://wa.me/55">Falar</a></section></body></html>`;

const MOBILE_ONLY_OVERFLOW = `<!doctype html><html><head><meta charset="utf-8"><style>
.wide{width:100%} @media (max-width:600px){ .wide{width:1200px} }</style></head><body>
<header>H</header><section><h1>Mobile</h1><div class="wide" style="height:30px;background:#ddd"></div>
<a href="https://wa.me/55">CTA</a></section><section><p>serviços</p></section><section><p>contato</p></section></body></html>`;

describe("FASE 4 · render real (Chromium)", () => {
  beforeAll(() => { base = mkdtempSync(join(tmpdir(), "prospector-fase4-")); });
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it("A/E/H/I) site válido: render, hero, CTA, identidade e estrutura aprovados", async () => {
    const root = project("valido", VALID_SITE);
    const result = await validateRenderedSite({
      root,
      prepare: serve,
      screenshots: false,
      businessName: "Usinagem Precisão Ferro",
      direction: {
        photoLed: true,
        brandColors: ["#0b5cff"],
        sectionPlan: ["galeria com as fotos REAIS", "Onde estamos/localização", "serviços informados"],
      },
      data: { hasPhotos: true, hasServices: true, hasAddress: true },
    });

    expect(result.viewports).toHaveLength(3);
    const desktop = result.viewports[0];
    expect(desktop.render).toBe("passed");
    expect(desktop.hero_visible).toBe(true);
    expect(desktop.primary_cta_visible).toBe(true);
    expect(desktop.horizontal_overflow).toBe(false);
    expect(desktop.broken_images).toBe(0);
    expect(desktop.images_total).toBeGreaterThanOrEqual(2);
    expect(desktop.sections_total).toBeGreaterThanOrEqual(3);

    expect(result.direction.photo_evidence).toBe("passed");
    expect(result.direction.brand_identity).toBe("passed");
    expect(result.direction.sections_missing).toEqual([]);
    expect(result.status).toBe("passed");
  }, 120_000);

  it("B) tela branca é detectada no render real", async () => {
    const root = project("branco", WHITE_SCREEN);
    const result = await validateRenderedSite({ root, prepare: serve, viewports: undefined });
    const desktop = result.viewports[0];
    expect(desktop.render).toBe("failed");
    expect(result.status).toBe("failed");
  }, 120_000);

  it("C) overflow horizontal real é detectado", async () => {
    const root = project("overflow", OVERFLOW_DESKTOP);
    const result = await validateRenderedSite({ root, prepare: serve });
    const desktop = result.viewports[0];
    expect(desktop.horizontal_overflow).toBe(true);
    expect(result.status).toBe("failed");
  }, 120_000);

  it("D) imagem quebrada real é detectada", async () => {
    const root = project("quebrada", BROKEN_IMAGE);
    const result = await validateRenderedSite({ root, prepare: serve });
    const desktop = result.viewports[0];
    expect(desktop.broken_images).toBeGreaterThanOrEqual(1);
    expect(desktop.broken_image_urls.join(" ")).toMatch(/nao-existe-999/);
    expect(result.status).toBe("failed");
  }, 120_000);

  it("F) falha específica de MOBILE aparece só no viewport mobile", async () => {
    const root = project("mobile", MOBILE_ONLY_OVERFLOW);
    const result = await validateRenderedSite({
      root,
      prepare: serve,
      viewports: [
        { name: "desktop-1366", width: 1366, height: 768 },
        { name: "mobile-390", width: 390, height: 844 },
      ],
    });
    const desktop = result.viewports.find((v) => v.viewport === "desktop-1366")!;
    const mobile = result.viewports.find((v) => v.viewport === "mobile-390")!;
    expect(desktop.horizontal_overflow).toBe(false);
    expect(mobile.horizontal_overflow).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/mobile-390/);
    expect(result.reasons.join(" ")).not.toMatch(/desktop-1366/);
  }, 120_000);

  it("G/J) direção photo_led sem imagem no render = failed (e screenshot vira evidência)", async () => {
    const root = project("sem-foto", OVERFLOW_DESKTOP); // página sem <img>
    const result = await validateRenderedSite({
      root,
      prepare: serve,
      screenshots: true,
      direction: { photoLed: true },
      data: { hasPhotos: true },
    });
    expect(result.direction.photo_evidence).toBe("failed");
    expect(result.status).toBe("failed");
    const shot = result.viewports[0].screenshots?.[0]?.path;
    expect(shot && existsSync(shot)).toBe(true);
  }, 120_000);
});
