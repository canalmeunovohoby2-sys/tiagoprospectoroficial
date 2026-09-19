import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { businessPoint, buildStaticMapBlock, tileCoords, injectMapRuntimeIntoHtml, buildMapRuntimeScript } from "../src/studio/agent-core/static-map";
import { normalizeWorkspaceMapEmbeds, buildMapEmbedUrl } from "../src/studio/agent-core/site-media";
import { reactRunKind } from "../src/server";
import type { BusinessContext } from "../src/tools";

// FASE 6 — Google Maps (sem Places, sem iframe, sem chave): dados reais de
// localização → bloco de mapa visível → runtime de tiles. Nada é inventado.

const business = {
  name: "Usinagem Precisão Ferro", segment: "Usinagem CNC", category: "metalurgia",
  address: "Rua das Indústrias, 900", city: "Joinville", state: "SC",
  latitude: -26.3045, longitude: -48.8487, whatsapp: "5547999999999",
} as unknown as BusinessContext;

let root = "";
function workspace(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), "fase6-test-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c, "utf8");
  }
  return root;
}

describe("FASE 6 · coordenadas (nunca inventadas)", () => {
  it("usa lat/lng reais e recusa valores ausentes/inválidos", () => {
    expect(businessPoint(business)).toEqual({ lat: -26.3045, lng: -48.8487 });
    expect(businessPoint({ name: "X" } as BusinessContext)).toBeNull();
    expect(businessPoint({ latitude: 999, longitude: 0 } as BusinessContext)).toBeNull();
    expect(businessPoint({ latitude: -26.3, longitude: undefined } as BusinessContext)).toBeNull();
  });

  it("tile do negócio corresponde à região real da coordenada (z15)", () => {
    const { lat, lng } = businessPoint(business)!;
    const c = tileCoords(lat, lng, 15);
    const t = { x: Math.floor(c.x), y: Math.floor(c.y) };
    // Joinville/SC em z15 cai nesta faixa de tiles (Web Mercator padrão).
    expect(t.x).toBeGreaterThanOrEqual(11930);
    expect(t.x).toBeLessThanOrEqual(11945);
    expect(t.y).toBeGreaterThanOrEqual(18855);
    expect(t.y).toBeLessThanOrEqual(18875);
    // determinístico e coerente: mesma entrada → mesmo tile; mover para leste
    // aumenta x, mover para o sul aumenta y.
    expect(tileCoords(lat, lng, 15)).toEqual(c);
    expect(tileCoords(lat, lng + 0.5, 15).x).toBeGreaterThan(c.x);
    expect(tileCoords(lat - 0.5, lng, 15).y).toBeGreaterThan(c.y);
  });
});

describe("FASE 6 · bloco do mapa (visível de verdade)", () => {
  it("com coordenadas: Google Maps interativo + fallback OSM + controles + link", () => {
    const block = buildStaticMapBlock(business)!;
    // FASE 7.10 — o mapa primário é o iframe OFICIAL do Google (interativo, sem
    // chave) e o mosaico OSM interativo fica como fallback (COEP do editor).
    expect(block).toContain("data-pf-gmap");
    expect(block).toMatch(/https:\/\/maps\.google\.com\/maps\?q=[^"']+output=embed/);
    expect(block).toContain('data-pf-map');
    expect(block).toContain('data-lat="-26.3045"');
    expect(block).toContain('data-lng="-48.8487"');
    expect(block).toContain('data-pf-zoom-step="1"');
    expect(block).toContain("Abrir no Google Maps");
    // FIX Fase 6: dimensões inline (à prova de Tailwind/COEP) — antes o container
    // colapsava (altura 0) e os tiles ficavam recortados/invisíveis.
    expect(block).toContain('height: "320px"');
    // o iframe do MODELO é substituído; o do Google é o NOSSO (com fallback)
    expect(block).toContain('data-pf-zoom');
  });

  it("sem coordenadas mas com endereço: fallback honesto (endereço + link), SEM mapa falso", () => {
    const block = buildStaticMapBlock({ ...business, latitude: null, longitude: null } as BusinessContext)!;
    expect(block).toContain("Rua das Indústrias, 900");
    expect(block).toContain("Abrir no Google Maps");
    expect(block).toContain('height: "320px"');
    expect(block).not.toContain("data-pf-map"); // nunca um mapa falso/inventado
  });

  it("sem coordenadas e sem endereço: não gera nada", () => {
    expect(buildStaticMapBlock({ name: "X" } as BusinessContext)).toBeNull();
  });

  it("runtime garante altura 100% (tiles não ficam recortados ao colapsar)", () => {
    const script = buildMapRuntimeScript();
    expect(script).toContain('el.style.height="100%"');
    expect(script).toContain('el.style.minHeight="240px"');
    expect(script).toContain("https://tile.openstreetmap.org/");
    expect(script).toContain("data-pf-map");
  });
});

describe("FASE 6 · normalização no workspace (iframe do modelo → mapa real)", () => {
  it("troca iframe do Google Maps por bloco interativo e injeta o runtime (idempotente)", () => {
    const ws = workspace({
      "index.html": "<html><body><div id=\"root\"></div></body></html>",
      "src/App.tsx": `export default () => (<section><h2>Onde estamos</h2><iframe src="https://www.google.com/maps/place/Joinville" /></section>);`,
    });
    const changed = normalizeWorkspaceMapEmbeds(ws, business);
    expect(changed).toContain("src/App.tsx");
    expect(changed).toContain("index.html");
    const app = readFileSync(join(ws, "src/App.tsx"), "utf8");
    // O iframe do GOOGLE MAPS do modelo foi trocado pelo bloco nosso (que tem o
    // iframe oficial do Google + fallback OSM) — sem iframe "solto" do modelo.
    expect(app).not.toMatch(/maps\/place\//i);
    expect(app).toContain("data-pf-gmap");
    expect(app).toContain("data-pf-map");
    const html = readFileSync(join(ws, "index.html"), "utf8");
    expect(html).toContain("prospector-map-runtime");
    // idempotente: rodar de novo não altera mais nada
    expect(normalizeWorkspaceMapEmbeds(ws, business)).toEqual([]);
  });

  it("sem coordenadas não troca iframe por mapa falso (fallback com endereço)", () => {
    const ws = workspace({
      "index.html": "<html><body></body></html>",
      "src/App.tsx": `export default () => (<iframe src="https://maps.google.com/maps?q=x" />);`,
    });
    normalizeWorkspaceMapEmbeds(ws, { ...business, latitude: null, longitude: null } as BusinessContext);
    const app = readFileSync(join(ws, "src/App.tsx"), "utf8");
    expect(app).not.toContain("data-pf-map");
    expect(app).toContain("Abrir no Google Maps");
  });

  it("URL canônica de embed continua sendo gerada (usada onde iframe é permitido)", () => {
    expect(buildMapEmbedUrl(business)).toMatch(/maps\.google\.com\/maps\?q=.+&z=\d+&output=embed/);
  });

  it("runtime é injetado uma única vez no index.html", () => {
    const once = injectMapRuntimeIntoHtml("<html><body></body></html>");
    const twice = injectMapRuntimeIntoHtml(once);
    expect(twice).toBe(once);
    expect(once.match(/prospector-map-runtime/g)?.length).toBe(1);
  });
});

describe("FASE 6 · agente: pedido de mapa × pergunta sobre o mapa", () => {
  it("pedido de edição vai para o trabalho real", () => {
    expect(reactRunKind({ firstGen: false, instruction: "Adicione um mapa mostrando onde fica a empresa." })).toBe("edit");
    expect(reactRunKind({ firstGen: false, instruction: "Coloque o mapa na seção de contato." })).toBe("edit");
  });

  it("pergunta sobre o mapa é conversa (não edita de novo)", () => {
    expect(reactRunKind({ firstGen: false, instruction: "Por que você colocou o mapa nessa seção?" })).toBe("conversation");
  });
});
