import { describe, it, expect } from "vitest";
import { buildSurfaceMap, applyBrandToApplication, applyBrandToApplications, selectBrandApplications, readSurfaceSamples, exportLayerRasterPng, protectMaster, readPsdTree } from "../src/mockup-psd-adapter";

const master = "assets/mockups/master/mockup-master.psd.psd";
const geo = "assets/mockups/master/mockup-master.geometry.json";
const ALL_APPS = ["A4", "A4 2", "A5", "DL", "DL 2", "DL 3", "BC", "BC 2", "Keychain", "Brochure", "Badge", "Notepad", "Box", "Mug", "iPhone", "Tablet"];

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#4F46E5"/><circle cx="400" cy="260" r="120" fill="#F97316"/><text x="400" y="300" font-family="sans-serif" font-size="90" font-weight="bold" fill="#ffffff" text-anchor="middle">Bella</text></svg>`;
const identity = { logoSvg, primary: "#111111", secondary: "#F97316", accent: "#FFFFFF" };
const wideSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100"><rect width="400" height="100" fill="#4F46E5"/></svg>`;

const center = (map: any, app: string) => {
  const b = map.surfaces[app].bounds;
  return [Math.floor(b.width / 2), Math.floor(b.height / 2)];
};

function near(p: { r: number; g: number; b: number } | null, target: [number, number, number], tol = 24): boolean {
  if (!p) return false;
  return Math.abs(p.r - target[0]) <= tol && Math.abs(p.g - target[1]) <= tol && Math.abs(p.b - target[2]) <= tol;
}

describe("mockup-brand — buildSurfaceMap (10.9)", () => {
  it("mapeia TODAS as aplicações deterministicamente com bounds reais e suportado", () => {
    const map = buildSurfaceMap(master, geo);
    expect(Object.keys(map.surfaces).sort()).toEqual([...ALL_APPS].sort());
    for (const app of ALL_APPS) {
      const s = map.surfaces[app];
      expect(s.supported, app).toBe(true);
      expect(s.bounds && s.bounds.width > 0 && s.bounds.height > 0, app).toBe(true);
      expect(s.layerPath.startsWith("Mockup/"), app).toBe(true);
      expect(s.blendMode === "linear burn" || s.blendMode === "normal", app).toBeTruthy();
    }
    expect(map.surfaces.BC.surfaceType).toBe("placed");
    expect(map.surfaces.Mug.surfaceType).toBe("raster");
    expect(map.surfaces.BC.geometrySource).toBe("geometry.json");
    expect(map.surfaces["A4 2"].geometrySource).toBe("layer"); // fora do snapshot → bounds reais da camada
    expect(map.masterSha).toBe(protectMaster(master));
  }, 120000);
});

describe("mockup-brand — aplicação real no PSD Master (10.9)", () => {
  const allOut = "assets/mockups/master/brand-all.psd";
  const bcOnlyOut = "assets/mockups/master/brand-bc.psd";
  const containOut = "assets/mockups/master/brand-contain.psd";
  const coverOut = "assets/mockups/master/brand-cover.psd";

  it("INTEGRAÇÃO: aplica a identidade a TODAS as aplicações numa única saída; master intacto; conteúdo e estrutura comprovados", async () => {
    const before = protectMaster(master);
    const r = await applyBrandToApplications({ sourcePsd: master, outputPsd: allOut, applications: ALL_APPS, identity, options: { mapPath: geo, fit: "contain", applyColors: true } });
    expect(r.status).toBe("applied");
    expect(r.applicationsApplied.sort()).toEqual([...ALL_APPS].sort());
    expect(r.applicationsUnsupported).toEqual([]);
    expect(r.modifiedLayers.length).toBe(ALL_APPS.length);
    expect(r.modifiedColors).toEqual(["Color/Color 1", "Color/Color 2"]);
    expect(r.persisted).toBe(true);
    expect(r.outputSha).not.toBe(r.sourceSha);
    expect(protectMaster(master)).toBe(before); // Master byte-for-byte intacto

    // reabre e comprova conteúdo aplicado (amostra real): BC com accent exato; demais opacas (logo presente)
    const map = buildSurfaceMap(master, geo);
    const reqs = ["BC", "A4", "Mug", "Keychain", "Tablet"].map((app) => { const [x, y] = center(map, app); return { applicationId: app, x, y }; });
    const samples = readSurfaceSamples(allOut, reqs);
    expect(near(samples.BC, [249, 115, 22])).toBe(true); // accent exato no centro do BC
    for (const app of ["A4", "Mug", "Keychain", "Tablet"]) expect(samples[app]!.a, app).toBe(255); // raster opaca = conteúdo aplicado

    // estrutura principal preservada
    const t = readPsdTree(allOut);
    expect(t.width).toBe(5000);
    expect(t.height).toBe(3750);
    expect(t.tree.some((n) => n.name === "Designs")).toBe(true);

    // prova determinística via exportLayerRasterPng
    const proof = exportLayerRasterPng(allOut, "Badge", "assets/mockups/master/proof-badge.png");
    expect(proof.ok).toBe(true);
    expect(proof.width).toBe(289);
    expect(proof.height).toBe(452);
    expect(proof.bytes).toBeGreaterThan(0);
  }, 240000);

  it("ISOLAMENTO + RECOLORAÇÃO: aplicar apenas em BC não altera A4/Mug/iPhone e aplica cores em Color 1/Color 2", async () => {
    const before = protectMaster(master);
    const map = buildSurfaceMap(master, geo);
    const r = await applyBrandToApplications({ sourcePsd: master, outputPsd: bcOnlyOut, applications: ["BC"], identity, options: { mapPath: geo, fit: "contain", applyColors: true } });
    expect(r.status).toBe("applied");
    expect(r.applicationsApplied).toEqual(["BC"]);
    expect(r.modifiedLayers).toEqual(["Mockup/Designs/BC"]); // não toca nas outras nem na arte top-level
    expect(r.modifiedColors).toEqual(["Color/Color 1", "Color/Color 2"]);
    expect(r.persisted).toBe(true);
    expect(protectMaster(master)).toBe(before);

    // BC mudou; A4/Mug/iPhone (não selecionados) permanecem idênticos ao master
    const reqs = ["BC", "A4", "Mug", "iPhone"].map((app) => { const [x, y] = center(map, app); return { applicationId: app, x, y }; });
    const now = readSurfaceSamples(bcOnlyOut, reqs);
    const orig = readSurfaceSamples(master, reqs);
    expect(near(now.BC, [249, 115, 22])).toBe(true); // logo presente
    for (const app of ["A4", "Mug", "iPhone"]) expect(now[app], app).toEqual(orig[app]); // intactos

    // realismo preservado (grupos + blends)
    const t = readPsdTree(bcOnlyOut);
    const names = new Set(t.tree.map((n) => n.name));
    for (const g of ["Background", "Shadows", "Highlights", "Contrast"]) expect(names.has(g), g).toBe(true);
    expect(names.has("Metal")).toBe(true);
  }, 240000);

  it("PROPORÇÃO: contain preserva proporção (margens transparentes) e cover preenche a área dentro dos bounds", async () => {
    const map = buildSurfaceMap(master, geo);
    const [cx] = center(map, "BC");

    await applyBrandToApplication({ sourcePsd: master, outputPsd: containOut, applicationId: "BC", logoSvg: wideSvg, brandColors: { primary: "#111111", secondary: "#F97316" }, options: { mapPath: geo, fit: "contain", applyColors: false } });
    const containCenter = readSurfaceSamples(containOut, [{ applicationId: "BC", x: cx, y: 100 }]).BC;
    const containTop = readSurfaceSamples(containOut, [{ applicationId: "BC", x: cx, y: 2 }]).BC;
    expect(near(containCenter, [79, 70, 229])).toBe(true); // azul primário do SVG
    expect(containTop!.a).toBe(0); // contain → margem superior transparente

    await applyBrandToApplication({ sourcePsd: master, outputPsd: coverOut, applicationId: "BC", logoSvg: wideSvg, brandColors: { primary: "#111111", secondary: "#F97316" }, options: { mapPath: geo, fit: "cover", applyColors: false } });
    const coverTop = readSurfaceSamples(coverOut, [{ applicationId: "BC", x: cx, y: 2 }]).BC;
    expect(coverTop!.a).toBe(255); // cover → preenche o topo
  }, 240000);

  it("APLICAÇÃO NÃO SUPORTADA: reporta unsupported + status failed, sem fingir sucesso", async () => {
    const r = await applyBrandToApplication({ sourcePsd: master, outputPsd: bcOnlyOut, applicationId: "Unknown", logoSvg, brandColors: { primary: "#111111", secondary: "#F97316" }, options: { mapPath: geo } });
    expect(r.status).toBe("failed");
    expect(r.applicationsApplied).toEqual([]);
    expect(r.applicationsUnsupported[0].applicationId).toBe("Unknown");
    expect(r.applicationsUnsupported[0].reason).toBe("application_not_mapped");
    expect(r.persisted).toBe(false);
  }, 240000);
});

describe("mockup-brand — seleção contextual determinística (10.9)", () => {
  it("retorna aplicações adequadas ao contexto, determinístico e editável", () => {
    expect(selectBrandApplications({ context: "papelaria", availableApplications: ALL_APPS })).toEqual(["A4", "A5", "BC"]);
    expect(selectBrandApplications({ context: "restaurante", availableApplications: ALL_APPS })).toEqual(["Box", "Mug", "BC"]);
    expect(selectBrandApplications({ context: "tecnologia", availableApplications: ALL_APPS })).toEqual(["iPhone", "Tablet", "BC"]);
    expect(selectBrandApplications({ context: "escritorio", availableApplications: ALL_APPS })).toEqual(["A4", "Notepad", "BC"]);
    expect(selectBrandApplications({ context: "cinema", availableApplications: ALL_APPS })).toEqual([]);
    expect(selectBrandApplications({ context: "papelaria", availableApplications: ["A4", "BC"] })).toEqual(["A4", "BC"]);
  });
});
