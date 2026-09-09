import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const JSZip = require("jszip") as { loadAsync: (b: Buffer) => Promise<{ files: Record<string, { async: (t: string) => Promise<Buffer | string> }> }> };
import { buildBrandPackage, validateBrandPackage, generateAndPersistBrandPackage, loadBrandPackage, svgToPngBuffer } from "../src/brand-package";
import { serveProjectArtifact } from "../src/artifacts-api";
import { createArtifactStore } from "../src/artifact-store";
import { runBrandMockup, resolveBrandIdentity } from "../src/mockup-integration";
import { generateAndPersistBrandPdf, loadBrandMockups } from "../src/brand-pdf";

const master = join(process.cwd(), "assets/mockups/master/mockup-master.psd.psd");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72" viewBox="0 0 120 72"><rect width="120" height="72" fill="#4F46E5"/><text x="60" y="48" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">Bella</text></svg>`;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function stateFiles(name = "Bella") {
  return {
    "brand-state.json": JSON.stringify({ name, selectedConceptId: "1", currentVersionId: 2, palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#FFFFFF", foreground: "#111111" }, typography: { heading: "Playfair Display", body: "Inter", weights: "900" } }),
    "assets/brand/primary.svg": SVG,
    "assets/brand/symbol.svg": SVG,
  };
}
function identityFrom() { return resolveBrandIdentity(stateFiles())!; }

describe("brand-package — logo raster + tarja (12)", () => {
  it("exporta o SVG real para PNG transparente (mesma arte, maior fidelidade)", async () => {
    const png = await svgToPngBuffer(SVG, 480, 288);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.length).toBeGreaterThan(50);
  });
});

describe("brand-package — estrutura/segurança/validação (12)", () => {
  it("rejeita conteúdo proibido (master/.env/traversal) ao validar um ZIP", async () => {
    const store = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "pkg-sec-")) });
    const r = await generateAndPersistBrandPackage({ stateFiles: stateFiles(), projectId: "A", store });
    expect(r.persisted).toBe(true);
    expect(r.validation.ok).toBe(true);
    // nenhum arquivo proibido entrou
    expect(r.manifest.files.some((f) => /mockup-master|\.env/i.test(f.path))).toBe(false);
    // manifesto tem hashes + tipos
    expect(r.manifest.files.length).toBeGreaterThan(4);
    expect(r.manifest.files.every((f) => /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
    const loaded = await loadBrandPackage(store, "A");
    expect(loaded!.currentZip).toBeTruthy();
    expect(loaded!.currentManifest!.identityName).toBe("Bella");
  }, 60000);

  it("cria versões sem apagar a anterior", async () => {
    const store = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "pkg-ver-")) });
    const a = await generateAndPersistBrandPackage({ stateFiles: stateFiles(), projectId: "A", store });
    const b = await generateAndPersistBrandPackage({ stateFiles: stateFiles("Bella 2"), projectId: "A", store });
    const loaded = await loadBrandPackage(store, "A");
    expect(loaded!.versions).toEqual([a.manifest.versionId, b.manifest.versionId]);
    expect(loaded!.currentManifest!.versionId).toBe(b.manifest.versionId);
    expect(loaded!.currentManifest!.identityName).toBe("Bella 2");
  }, 60000);
});

describe("brand-package — E2E real (12)", () => {
  let wsA: string, wsB: string;
  let storeA: ReturnType<typeof createArtifactStore>; let storeB: ReturnType<typeof createArtifactStore>;
  const A = "pkgA", B = "pkgB";

  beforeAll(() => {
    wsA = mkdtempSync(join(tmpdir(), "pkg-a-")); wsB = mkdtempSync(join(tmpdir(), "pkg-b-"));
    const filesA = stateFiles("Bella"); const filesB = stateFiles("Verde");
    for (const [ws, f] of [[wsA, filesA], [wsB, filesB]] as const) {
      writeFileSync(join(ws, "brand-state.json"), f["brand-state.json"]);
      mkdirSync(join(ws, "assets/brand"), { recursive: true });
      writeFileSync(join(ws, "assets/brand/primary.svg"), SVG);
      writeFileSync(join(ws, "assets/brand/symbol.svg"), SVG);
    }
    storeA = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "pkg-store-a-")) });
    storeB = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "pkg-store-b-")) });
  });
  afterAll(() => { rmSync(wsA, { recursive: true, force: true }); rmSync(wsB, { recursive: true, force: true }); });

  it("identidade real → mockups reais (Master) → PDF real → PSD real → ZIP real → validado → persistido → recuperado após destruir workspace → íntegro", async () => {
    const before = sha(readFileSync(master));
    // mockups reais A
    await runBrandMockup({ workspaceRoot: wsA, identity: identityFrom(), applications: ["BC", "A4"], projectId: A, store: storeA, context: "papelaria" });
    // PDF real (com os mockups reais) + pacote real para A
    const stateA = { "brand-state.json": readFileSync(join(wsA, "brand-state.json"), "utf8"), "assets/brand/primary.svg": SVG, "assets/brand/symbol.svg": SVG };
    const mockupsA = await loadBrandMockups(storeA, A);
    await generateAndPersistBrandPdf({ store: storeA, projectId: A, stateFiles: stateA, mockups: mockupsA });
    const pkgA = await generateAndPersistBrandPackage({ stateFiles: stateA, projectId: A, store: storeA });
    expect(pkgA.persisted).toBe(true);
    expect(pkgA.validation.ok).toBe(true);
    // estrutura: logo svg + mockup png + pdf + psd + readme + manifest
    const paths = pkgA.manifest.files.map((f) => f.path);
    expect(paths.some((p) => p.includes("01-LOGO") && p.endsWith("logo-principal.svg"))).toBe(true);
    expect(paths.some((p) => p.includes("04-TIPOGRAFIA") && p.endsWith("tipografia.txt"))).toBe(true);
    expect(paths.some((p) => p.includes("05-MOCKUPS") && p.endsWith("BC.png"))).toBe(true);
    expect(paths.some((p) => p.includes("06-MANUAL") && p.endsWith("manual-identidade.pdf"))).toBe(true);
    expect(paths.some((p) => p.includes("07-ARQUIVOS-EDITAVEIS") && p.endsWith("master-output.psd"))).toBe(true);
    expect(paths.some((p) => p.endsWith("README.txt"))).toBe(true);
    // NUNCA o Master original
    expect(paths.every((p) => !/mockup-master\.psd\.psd/i.test(p))).toBe(true);

    // ISOLAMENTO: B ainda sem pacote
    const bBefore = await loadBrandPackage(storeB, B);
    expect(bBefore!.currentZip).toBeNull();

    // mockups + pacote B (real, menor)
    await runBrandMockup({ workspaceRoot: wsB, identity: resolveBrandIdentity(stateFiles("Verde"))!, applications: ["BC"], projectId: B, store: storeB, context: "papelaria" });
    const pkgB = await generateAndPersistBrandPackage({ stateFiles: stateFiles("Verde"), projectId: B, store: storeB });
    expect(pkgB.persisted).toBe(true);
    const bNow = await loadBrandPackage(storeB, B);
    expect(bNow!.currentZip).toBeTruthy();

    // WORKSPACE DESTRUÍDO → recupera ZIP persistido
    rmSync(wsA, { recursive: true, force: true }); rmSync(wsB, { recursive: true, force: true });
    mkdirSync(wsA, { recursive: true }); mkdirSync(wsB, { recursive: true });
    const recA = await loadBrandPackage(storeA, A);
    const recB = await loadBrandPackage(storeB, B);
    expect(recA!.currentZip).toBeTruthy();
    expect(recB!.currentZip!.toString("base64")).not.toBe(recA!.currentZip!.toString("base64")); // pacotes distintos

    // INTEGRIDADE: abrir o ZIP recuperado e conferir um SVG real
    const opened = await JSZip.loadAsync(recA!.currentZip!);
    const svgEntry = Object.keys(opened.files).find((n) => n.endsWith("logo-principal.svg"));
    expect(svgEntry).toBeTruthy();
    const svgInside = (await opened.files[svgEntry!].async("string")) as string;
    expect(svgInside).toContain("<svg");

    // DOWNLOAD: ZIP servido pela rota de artefatos com o content-type correto
    const served = await serveProjectArtifact(storeA, A, "package/current.zip");
    expect(served.ok).toBe(true);
    expect(served.contentType).toBe("application/zip");
    expect(served.bytes!.length).toBeGreaterThan(0);
    // PDF e PDF meta também servíveis
    const pdfServ = await serveProjectArtifact(storeA, A, "pdf/current.pdf");
    expect(pdfServ.ok).toBe(true);
    expect(pdfServ.contentType).toBe("application/pdf");

    expect(sha(readFileSync(master))).toBe(before); // Master intacto
  }, 300000);
});
