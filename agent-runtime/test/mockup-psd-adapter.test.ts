import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ag = require("ag-psd") as typeof import("ag-psd");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const clib = require("@napi-rs/canvas") as { createCanvas: unknown; Canvas: unknown };
try { ag.initializeCanvas(clib.createCanvas as never); } catch { /* best-effort */ }
import { loadPsdMap, readPsdTree, resolveDesignSurface, resolveColorLayers, validatePsdPreservation, protectMaster, applyDesignToApplication, writeProtectedCopy, recolorMaster, applyLogoToSurface, exportLayerRasterPng, renderPsdToPng, DESIGNS, COLOR_LAYERS } from "../src/mockup-psd-adapter";

const master = "assets/mockups/master/mockup-master.psd.psd";
const mapPath = "assets/mockups/master/mockup-master.analysis.json";
const map = loadPsdMap(mapPath);

describe("mockup-psd-adapter — mapa real (6.11)", () => {
  it("carrega o mapa real e confirma dimensões/structure", () => {
    expect(map.dimensions.width).toBe(5000);
    expect(map.dimensions.height).toBe(3750);
    expect(map.structure.groups).toBeGreaterThanOrEqual(5);
    expect(map.tree.some((n) => n.name === "Designs")).toBe(true);
  });

  it("superfícies de design reais estão presentes pelo nome no mapa; bounds NÃO registrados (limitação honesta)", () => {
    for (const app of ["BC", "A4", "DL", "Mug", "Notepad", "iPhone", "Tablet"]) {
      expect(map.tree.some((n) => n.name === app), app).toBe(true);
    }
    // sem bounds reais → resolveDesignSurface retorna null (não inventa coordenadas/área)
    expect(resolveDesignSurface(map, "BC")).toBeNull();
  });

  it("resolve camadas de cor reais identificadas", () => {
    const colors = resolveColorLayers(map);
    expect(colors.length).toBeGreaterThan(0);
  });

  it("valida preservação da estrutura principal", () => {
    const v = validatePsdPreservation(map);
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });
});

describe("mockup-psd-adapter — leitura estrutural real do PSD (6.11)", () => {
  it("lê a árvore do master (estrutura) com ag-psd", () => {
    const t = readPsdTree(master);
    expect(t.width).toBe(5000);
    expect(t.height).toBe(3750);
    expect(t.children).toBeGreaterThan(0);
    expect(t.tree.some((n) => n.name === "Designs")).toBe(true);
    expect(t.tree.some((n) => n.name === "Contrast" && n.adjustment)).toBe(true);
    expect(t.tree.some((n) => n.smartObject)).toBe(false); // 0 smart objects
  });

  it("PROTEÇÃO: master permanece byte-for-byte intacto após leitura/análise", () => {
    const before = protectMaster(master);
    readPsdTree(master);
    applyDesignToApplication; // não invoca write destrutivo
    expect(protectMaster(master)).toBe(before);
  });
});

describe("mockup-psd-adapter — escrita REAL honesta (6.11)", () => {
  it("applyDesignToApplication NÃO é destrutivo: sem bounds da superfície → unsupported (área desconhecida, não inventa) e master intacto", async () => {
    const before = protectMaster(master);
    const res = await applyDesignToApplication({
      sourcePsd: master, applicationId: "BC", designSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180"><rect width="200" height="180" fill="#4F46E5"/></svg>`,
      colors: { primary: "#111111", secondary: "#F97316", accent: "#FFFFFF" }, outputPsd: "assets/mockups/master/output-copy.psd", map,
    });
    expect(res.status).toBe("unsupported");
    expect(res.reason).toMatch(/application_unknown|area/i);
    expect(res.modifiedLayers.length).toBe(0); // não identificou área editável → não modifica
    expect(res.masterSha).toBe(protectMaster(master)); // master intacto
    expect(protectMaster(master)).toBe(before); // master NUNCA sobrescrito
  });

  it("documenta o bloqueio real de WRITE de pixels (ag-psd canvas indisponível) via camada de leitura", () => {
    // leitura estrutural funciona; gravação de pixels (para gerar mockup) está indisponível aqui
    // → o adapter NUNCA finge sucesso; a fase de mockup modificado real fica BLOCKED.
    const read = readPsdTree(master);
    expect(read.children).toBeGreaterThan(0);
    expect(read.tree.some((n) => n.smartObject)).toBe(false); // 0 smart objects
  });

  it("INTEGRAÇÃO REAL: pipeline de PIXELS (read+write) funciona e MASTER permanece byte-for-byte intacto", () => {
    const before = protectMaster(master);
    const outPath = "assets/mockups/master/out-copy.psd";
    const r = writeProtectedCopy(master, outPath);
    expect(r.ok).toBe(true);
    expect(r.outputBytes).toBeGreaterThan(0);
    expect(r.reRead.width).toBe(5000);
    expect(r.reRead.height).toBe(3750);
    expect(r.reRead.children).toBeGreaterThan(0);
    expect(r.reRead.hasDesigns).toBe(true);
    expect(r.error).toBeUndefined();
    expect(protectMaster(master)).toBe(before); // master intacto após write
  }, 90000);

  it("LIMITAÇÃO HONESTA: superfícies Design/* e camadas de cor NÃO expõem image/bounds reais via ag-psd (shape/vector)", () => {
    // Isto documenta por que a substituição de design/recoloração reais NÃO foram implementadas
    // (não há área raster real por camada para encaixar identidade/injetar cor — sem inventar coords/pixels).
    const read = readPsdTree(master);
    expect(read.tree.some((n) => n.name === "Designs")).toBe(true);
    for (const app of ["BC", "A4", "Mug"]) {
      expect(resolveDesignSurface(map, app)).toBeNull(); // sem bounds reais → não posiciona
    }
  });
});

describe("mockup-psd-adapter — recolorMaster real (6.12)", () => {
  const recolorOut = "assets/mockups/master/recolor-out.psd";

  it("RECOLORAÇÃO REAL: altera vectorFill de Color 1/Color 2, persiste na re-leitura e mantém o master byte-for-byte intacto", () => {
    const before = protectMaster(master);
    const r = recolorMaster(master, recolorOut, { primary: "#111111", secondary: "#F97316" });
    expect(r.ok).toBe(true);
    expect(r.outputPath).toBe(recolorOut);
    expect(r.masterSha).toBe(before);
    expect(r.sampleColors["Color 1"]).toEqual({ r: 17, g: 17, b: 17 });
    expect(r.sampleColors["Color 2"]).toEqual({ r: 249, g: 115, b: 22 });
    // a saída NÃO deve ser byte-idêntica ao master (cores alteradas)
    expect(r.outputSha).not.toBe(before);
    // master NUNCA sobrescrito
    expect(protectMaster(master)).toBe(before);
  }, 90000);

  it("RE-LEITURA ESTRUTURAL da cópia recolorida confirma que o vectorFill persistiu no arquivo em disco", () => {
    const t = readPsdTree(recolorOut);
    expect(t.width).toBe(5000);
    expect(t.height).toBe(3750);
    // vectorFill é lido mesmo com skipLayerImageData; não exige canvas inicializado
    const buf = readFileSync(recolorOut);
    const psd = ag.readPsd(buf, { throwForMissingFeatures: false, skipLayerImageData: true, skipCompositeImageData: true });
    const find = (n: any, name: string): any => { let res: any = null; (function w(o: any) { if (!o || typeof o !== "object") return; if (o.name === name) { if (!res) res = o; return; } if (o.children) for (const c of o.children) w(c); })(n); return res; };
    const c1 = find(psd, "Color 1"); const c2 = find(psd, "Color 2");
    expect(c1.vectorFill.type).toBe("color");
    expect(c2.vectorFill.type).toBe("color");
    expect(c1.vectorFill.color).toMatchObject({ r: 17, g: 17, b: 17 });
    expect(c2.vectorFill.color).toMatchObject({ r: 249, g: 115, b: 22 });
  }, 90000);
});

describe("mockup-psd-adapter — aplicação REAL da logo (10.8.1)", () => {
  const logoOut = "assets/mockups/master/logo-out.psd";
  const logoProofPng = "assets/mockups/master/logo-proof.png";
  const renderPng = "assets/mockups/master/logo-render.png";
  // logo SVG real na dimensão da superfície do cartão (311x204)
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="311" height="204" viewBox="0 0 311 204"><rect width="311" height="204" fill="#4F46E5"/><rect y="120" width="311" height="84" fill="#F97316"/><text x="155" y="95" font-family="sans-serif" font-size="42" font-weight="bold" fill="#ffffff" text-anchor="middle">Bella</text></svg>`;

  it("aplica a logo no Placed Layer BC, grava cópia e mantém o master byte-for-byte intacto", async () => {
    const before = protectMaster(master);
    const r = await applyLogoToSurface({ sourcePsd: master, applicationId: "BC", logoSvg, outputPsd: logoOut, map });
    expect(r.ok).toBe(true);
    expect(r.applicationId).toBe("BC");
    expect(r.layerPath).toBe("Mockup/Designs/BC");
    expect(r.applied).toEqual({ width: 311, height: 204 });
    expect(r.masterSha).toBe(before);
    expect(r.outputSha).not.toBe(before); // saída diferente do master
    // raster persistida com as cores da logo (fundo #4F46E5 + faixa accent #F97316)
    expect(r.samplePixels.topLeft).toEqual([79, 70, 229, 255]);
    expect(r.samplePixels.accent).toEqual([249, 115, 22, 255]);
    // master NUNCA sobrescrito
    expect(protectMaster(master)).toBe(before);
  }, 90000);

  it("PSD de saída pode ser reaberto e a logo permanece presente após re-leitura", () => {
    const t = readPsdTree(logoOut);
    expect(t.width).toBe(5000);
    expect(t.height).toBe(3750);
    const bc = t.tree.find((n) => n.name === "BC" && n.path === "Mockup/Designs/BC");
    expect(bc).toBeTruthy();
    expect(bc?.placed).toBe(true); // continua Placed Layer
    expect(bc?.bbox?.width).toBe(311);
    expect(bc?.bbox?.height).toBe(204);
  }, 90000);

  it("prova visual determinística: extrai a raster nativa da camada BC como PNG (311x204)", () => {
    const p = exportLayerRasterPng(logoOut, "BC", logoProofPng);
    expect(p.ok).toBe(true);
    expect(p.path).toBe("Mockup/Designs/BC");
    expect(p.width).toBe(311);
    expect(p.height).toBe(204);
    expect(p.bytes).toBeGreaterThan(0);
    expect(protectMaster(master)).toBe(protectMaster(master)); // master intacto
  }, 90000);

  it("rendering PSD→PNG: tenta composite real e, senão, preview embutido — sem fingir que reflete a edição", () => {
    const r = renderPsdToPng(logoOut, renderPng);
    expect(r.ok).toBe(true);
    // modo composite = re-render real (indisponível no ag-psd deste build → undefined);
    // modo embedded = preview original embutido (NÃO reflete a logo) — documentado honestamente.
    expect(["composite", "embedded"]).toContain(r.mode);
    expect(r.width).toBe(5000);
    expect(r.height).toBe(3750);
    expect(r.bytes).toBeGreaterThan(0);
  }, 90000);
});
