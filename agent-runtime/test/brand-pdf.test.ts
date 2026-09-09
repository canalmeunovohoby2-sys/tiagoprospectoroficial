import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { buildBrandPdfData, derivePdfDesignSystem, selectPdfPages, generateBrandPdf, validateBrandPdf, rgbToCmyk, hexToRgb, persistBrandPdf, loadBrandPdf, generateAndPersistBrandPdf, loadBrandMockups, type PdfBrandData, type PdfMockup, type PdfPageDef } from "../src/brand-pdf";
import { createArtifactStore } from "../src/artifact-store";
import { runBrandMockup, resolveBrandIdentity } from "../src/mockup-integration";

const master = join(process.cwd(), "assets/mockups/master/mockup-master.psd.psd");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72" viewBox="0 0 120 72"><rect width="120" height="72" fill="#4F46E5"/><text x="60" y="48" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">Bella</text></svg>`;
const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function brand(over: Partial<PdfBrandData> = {}): PdfBrandData {
  return {
    name: "Bella",
    palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#FFFFFF", foreground: "#111111" },
    typography: { heading: "Playfair Display", body: "Inter", weights: "900" },
    variants: { primary: SVG, symbol: SVG, monoLight: SVG },
    concept: { type: "monogram", name: "Monograma B", rationale: "Construção tipográfica sobre a inicial B, com contraforma e ritmo.", symbolIdea: "monograma com ligadura", silhouette: "marca compacta", typography: "display", palette: "principal" },
    construction: { constructionLogic: "O monograma nasce da inicial B; a contraforma cria respiro.", grid: "grid 8x8", primitives: [{ primitive: "circle", args: { r: 24 } }] },
    identity: { hierarchy: "título Playfair 900; corpo Inter", photoDirection: "editorial", composition: "horizontal/vertical/marca-ícone", graphicElements: "formas de apoio derivadas do símbolo", applicationRules: "usar SVG real" },
    mockups: [],
    ...over,
  };
}

function flushLogo(brand: PdfBrandData): Promise<PdfBrandData> { return Promise.resolve(brand); }

describe("brand-pdf — dados e sistema visual (11)", () => {
  it("buildBrandPdfData lê a identidade real dos arquivos (não inventa)", () => {
    const files = {
      "brand-state.json": JSON.stringify({ name: "Bella", selectedConceptId: "1", currentVersionId: 2, palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#FFFFFF", foreground: "#111111" }, typography: { heading: "Inter", body: "Inter", weights: "700" } }),
      "assets/brand/primary.svg": SVG,
    };
    const d = buildBrandPdfData(files, []);
    expect(d?.name).toBe("Bella");
    expect(d?.palette.primary).toBe("#4F46E5");
    expect(d?.variants.primary).toBe(SVG);
  });

  it("derivePdfDesignSystem difere entre identidades (composição/cor/fonte decorre da identidade)", () => {
    const a = derivePdfDesignSystem(brand());
    const b = derivePdfDesignSystem(brand({ name: "Outra", palette: { primary: "#16A34A", secondary: "#111111", accent: "#F97316", background: "#0B0B0B", foreground: "#FFFFFF" }, typography: { heading: "Inter", body: "Inter", weights: "500" }, concept: { type: "abstract", name: "Símbolo Abstrato", rationale: "geo", symbolIdea: "forma geométrica", silhouette: "ícone", typography: "semibold", palette: "mood" } }));
    expect(a.compositionMode).not.toBe(b.compositionMode);
    expect(a.primary).not.toBe(b.primary);
    expect(a.headingFont).not.toBe(b.headingFont); // Playfair→times vs Inter→helvetica
    expect(a.fallbackFonts.heading).toMatch(/fallback interno/i);
  });

  it("selectPdfPages sem mockups não cria páginas de aplicações/mockups; com mockups inclui", () => {
    expect(selectPdfPages(brand(), false)).not.toContain("applications");
    expect(selectPdfPages(brand(), false)).not.toContain("mockups");
    expect(selectPdfPages(brand({ mockups: [{ applicationId: "BC", dataUrl: PNG_1X1, width: 10, height: 10 }] }), true)).toContain("applications");
    expect(selectPdfPages(brand(), true)).toContain("mockups");
  });

  it("conversão de cor é técnica e documentada (não é ICC)", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    const cmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
    expect(cmyk.c).toBe(0); expect(cmyk.m).toBe(100); expect(cmyk.y).toBe(100); expect(cmyk.k).toBe(0);
  });
});

describe("brand-pdf — geração + validação (11)", () => {
  it("gera PDF válido (`%PDF-`, páginas, dimensões, logo embedded) sem mockups", async () => {
    const b = brand(); await flushLogo(b);
    const g = await generateBrandPdf(b);
    expect(g.pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(g.pageCount).toBeGreaterThanOrEqual(6);
    expect(g.contentBytes).toBeGreaterThan(1000);
    expect(g.pageNames).toContain("cover");
    expect(g.pageNames).toContain("palette");
    const v = validateBrandPdf(g.pdfBuffer, { pages: g.pageNames, mockups: b.mockups, ds: g.design });
    expect(v.checks[1]).toContain("páginas esperadas");
    expect(v.ok).toBe(true);
  }, 60000);

  it("inclui mockups reais quando presentes (página de aplicações com imagens)", async () => {
    const b = brand({ mockups: [{ applicationId: "BC", dataUrl: PNG_1X1, width: 10, height: 10 }, { applicationId: "A4", dataUrl: PNG_1X1, width: 10, height: 10 }] });
    const g = await generateBrandPdf(b);
    expect(g.pageNames).toContain("applications");
    expect(g.pageNames).toContain("mockups");
    expect(g.pdfBuffer.length).toBeGreaterThan(1500); // contém imagens
    const v = validateBrandPdf(g.pdfBuffer, { pages: g.pageNames, mockups: b.mockups, ds: g.design });
    expect(v.checks.some((c) => c.startsWith("mockups no modelo"))).toBe(true);
  }, 60000);

  it("persistência + versionamento no ArtifactStore (current + versions, sem apagar anterior)", async () => {
    const store = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "pdf-store-")) });
    const pid = "projPdf";
    const meta = (versionId: string) => ({ versionId, projectId: pid, identityName: "Bella", pageCount: 8, pageNames: ["cover", "logo"] as PdfPageDef[], primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", createdAt: new Date().toISOString(), validationOk: true, outputPdf: `${versionId}.pdf` });
    await persistBrandPdf(store, pid, meta("v001"), Buffer.from("%PDF-1.7 v001"));
    await persistBrandPdf(store, pid, meta("v002"), Buffer.from("%PDF-1.7 v002"));
    const loaded = await loadBrandPdf(store, pid);
    expect(loaded!.versions).toEqual(["v001", "v002"]); // anterior preservada
    expect(loaded!.currentPdf!.toString()).toBe("%PDF-1.7 v002");
    expect(loaded!.currentMeta!.versionId).toBe("v002");
  }, 60000);
});

describe("brand-pdf — E2E real (11)", () => {
  let ws: string; let store: ReturnType<typeof createArtifactStore>; const pid = "pdfE2E";

  beforeAll(() => {
    ws = mkdtempSync(join(tmpdir(), "pdf-e2e-")); store = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "pdf-store-")) });
    writeFileSync(join(ws, "brand-state.json"), JSON.stringify({ name: "Bella", selectedConceptId: "1", currentVersionId: 1, palette: { primary: "#111111", secondary: "#F97316", accent: "#4F46E5", background: "#FFFFFF", foreground: "#111111" }, typography: { heading: "Inter", body: "Inter", weights: "700" } }));
    mkdirSync(join(ws, "assets/brand"), { recursive: true });
    writeFileSync(join(ws, "assets/brand/primary.svg"), SVG);
  });
  afterAll(() => { rmSync(ws, { recursive: true, force: true }); });

  it("identidade real → mockups reais (PSD Master) → PDF real → persistência → workspace recriado → recuperação → validação", async () => {
    const before = sha(readFileSync(master));
    const identity = resolveBrandIdentity({
      "brand-state.json": readFileSync(join(ws, "brand-state.json"), "utf8"),
      "assets/brand/primary.svg": SVG,
    })!;
    // mockups reais no Master
    await runBrandMockup({ workspaceRoot: ws, identity, applications: ["BC", "A4"], projectId: pid, store, context: "papelaria" });
    const mockups = await loadBrandMockups(store, pid);
    expect(mockups.length).toBeGreaterThan(0); // PNGs reais persistidos

    const stateFiles = {
      "brand-state.json": readFileSync(join(ws, "brand-state.json"), "utf8"),
      "assets/brand/primary.svg": SVG,
    };
    const out = await generateAndPersistBrandPdf({ store, projectId: pid, stateFiles, mockups });
    expect(out.persisted).toBe(true);
    expect(out.pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(out.metadata.pageCount).toBeGreaterThanOrEqual(6);
    expect(out.pageNames).toContain("applications");
    expect(out.pdfBuffer.length).toBeGreaterThan(2000);

    // WORKSPACE DESTRUÍDO/RECRIADO: recupera PDF do armazenamento persistente
    rmSync(ws, { recursive: true, force: true });
    mkdirSync(ws, { recursive: true });
    const recovered = await loadBrandPdf(store, pid);
    expect(recovered!.currentPdf).toBeTruthy();
    expect(recovered!.currentPdf!.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(recovered!.versions).toContain(out.metadata.versionId);
    expect(recovered!.currentMeta!.pageCount).toBeGreaterThanOrEqual(6);
    expect(sha(readFileSync(master))).toBe(before); // Master intacto
  }, 240000);
});

function sha(b: Buffer) { return createHash("sha256").update(b).digest("hex"); }
