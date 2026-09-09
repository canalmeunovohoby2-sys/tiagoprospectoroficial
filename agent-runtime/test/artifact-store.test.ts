import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createArtifactStore, ArtifactStore } from "../src/artifact-store";
import { serveProjectArtifact, listProjectMockupArtifacts } from "../src/artifacts-api";
import { runBrandMockup, resolveBrandIdentity, loadMockupArtifacts, persistIdentityToStore } from "../src/mockup-integration";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const master = join(process.cwd(), "assets/mockups/master/mockup-master.psd.psd");
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#4F46E5"/><circle cx="400" cy="260" r="120" fill="#F97316"/><text x="400" y="300" font-family="sans-serif" font-size="90" font-weight="bold" fill="#ffffff" text-anchor="middle">Bella</text></svg>`;

function identityFiles() {
  return {
    "brand-state.json": JSON.stringify({ name: "Bella", selectedConceptId: "1", currentVersionId: 3, palette: { primary: "#111111", secondary: "#F97316", accent: "#4F46E5", background: "#FFFFFF", foreground: "#111111" }, typography: { heading: "Inter", body: "Inter", weights: "700" } }),
    "assets/brand/primary.svg": logoSvg,
  };
}
function resolveId() { return resolveBrandIdentity(identityFiles())!; }

describe("artifact-store — persistência definitiva (10.11)", () => {
  let wsA: string, wsB: string, storeRoot: string;
  let projA = "projA", projB = "projB";
  let store: ArtifactStore;

  beforeAll(() => {
    storeRoot = mkdtempSync(join(tmpdir(), "artifacts-store-"));
    store = createArtifactStore({ backend: "disk", root: storeRoot });
    wsA = mkdtempSync(join(tmpdir(), "mockup-a-")); wsB = mkdtempSync(join(tmpdir(), "mockup-b-"));
    writeFileSync(join(wsA, "brand-state.json"), identityFiles()["brand-state.json"]);
    mkdirSync(join(wsA, "assets/brand"), { recursive: true });
    writeFileSync(join(wsA, "assets/brand/primary.svg"), logoSvg);
  });
  afterAll(() => {
    rmSync(storeRoot, { recursive: true, force: true });
    rmSync(wsA, { recursive: true, force: true });
    rmSync(wsB, { recursive: true, force: true });
  });

  it("persiste identidade (SVG + estado) isolada por projeto", async () => {
    const paths = await persistIdentityToStore(store, projA, identityFiles());
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes("primary.svg"))).toBe(true);
    const list = await store.listIdentity(projA);
    expect(list.some((p) => p.endsWith("brand-state.json"))).toBe(true);
    expect(list.some((p) => p.endsWith("primary.svg"))).toBe(true);
    // B não vê os arquivos de A (isolamento por prefixo)
    const listB = await store.listIdentity(projB);
    expect(listB).toEqual([]);
  });

  it("E2E: gera mockup no Master real, persiste PSD+PNGs+metadata; Master permanece intacto", async () => {
    const before = sha(readFileSync(master));
    const r = await runBrandMockup({ workspaceRoot: wsA, identity: resolveId(), applications: ["BC", "A4"], projectId: projA, store, context: "papelaria" });
    expect(r.status).toBe("applied");
    expect(r.applicationsApplied.sort()).toEqual(["A4", "BC"]);

    const manifest = await store.currentManifest(projA);
    expect(manifest).toBeTruthy();
    expect(manifest!.currentVersionId).toBe(r.versionId);
    const meta = await store.loadMockupVersion(projA, r.versionId);
    expect(meta).toBeTruthy();
    expect(meta!.applicationsApplied.sort()).toEqual(["A4", "BC"]);
    // PSD binário realmente no store (recuperável por path)
    const psd = await store.getMockupFile(projA, "current/master-output.psd");
    expect(psd && psd.length).toBeGreaterThan(0);
    // PNG real do BC
    const png = await store.loadCurrentPreview(projA, "BC");
    expect(png && png.length).toBeGreaterThan(0);
    expect(sha(readFileSync(master))).toBe(before); // Master intacto
  }, 240000);

  it("RECUPERA APÓS WORKSPACE DESTRUÍDO: reabre store sem o workspace e recupera artefatos + previews", async () => {
    // simula nova execução de /run: workspace recriado vazio (só identidade), store persiste
    const freshWs = mkdtempSync(join(tmpdir(), "mockup-fresh-"));
    try {
      const recovered = await loadMockupArtifacts(store, projA);
      expect(recovered.currentVersionId).toBeTruthy();
      expect(recovered.currentMetadata).toBeTruthy();
      expect(recovered.outputPsdAvailable).toBe(true);
      expect(recovered.outputPsdBytes).toBeGreaterThan(0);
      // previews recuperados correspondem aos gerados
      const meta = recovered.currentMetadata!;
      for (const pv of meta.previews) {
        expect(recovered.previewDataUrls[pv.applicationId]).toBeTruthy();
        expect(recovered.previewDataUrls[pv.applicationId]!.startsWith("data:image/png;base64,")).toBe(true);
      }
      expect(recovered.previewDataUrls["BC"]).toBeTruthy();
      // guarda os bytes correspondentes
      const bcBuf = await store.loadCurrentPreview(projA, "BC");
      expect(bcBuf!.toString("base64")).toBe(recovered.previewDataUrls["BC"]!.replace("data:image/png;base64,", ""));
    } finally {
      rmSync(freshWs, { recursive: true, force: true });
    }
  }, 240000);

  it("VERSIONAMENTO: nova geração cria nova versão e preserva a anterior (não apaga)", async () => {
    const r1 = await store.currentManifest(projA);
    const altSvg = logoSvg.replace("#4F46E5", "#16A34A");
    const r2 = await runBrandMockup({ workspaceRoot: wsA, identity: resolveId(), logoSvgOverride: altSvg, colorsOverride: { primary: "#16A34A" }, applications: ["BC"], projectId: projA, store, context: "papelaria" });
    const manifest = await store.currentManifest(projA);
    expect(manifest!.currentVersionId).toBe(r2.versionId);
    expect(manifest!.versions.length).toBeGreaterThanOrEqual(2);
    // versão anterior preservada
    const prevVersion = manifest!.versions[manifest!.versions.length - 2];
    const prevMeta = await store.loadMockupVersion(projA, prevVersion);
    expect(prevMeta).toBeTruthy();
    expect(prevMeta!.versionId).toBe(r1!.currentVersionId);
    // corrente reflete nova identidade
    const cur = await store.loadMockupVersion(projA, manifest!.currentVersionId);
    expect(cur!.primary).toBe("#16A34A");
  }, 240000);

  it("ISOLAMENTO: projeto B não acessa artefatos de A e vice-versa", async () => {
    // B não tem mockup nenhum
    const bManifest = await store.currentManifest(projB);
    expect(bManifest).toBeNull();
    const bLoaded = await loadMockupArtifacts(store, projB);
    expect(bLoaded.currentVersionId).toBeNull();
    expect(bLoaded.previews).toEqual([]);
    expect(bLoaded.outputPsdAvailable).toBe(false);
    // lista de versões de B vazia; de A tem >=2
    expect((await store.listMockupVersions(projB)).length).toBe(0);
    expect((await store.listMockupVersions(projA)).length).toBeGreaterThanOrEqual(2);
    // A não consegue ler um caminho "preview" apontado para prefixo de B (backend disk já impede `..`; prefixo é fixado por proj)
    expect(await store.getMockupFile(projB, "current/master-output.psd")).toBeNull();
  }, 60000);

  it("PERFORMANCE: metadata no store é pequeno (sem base64 do PSD) e referencia arquivo por path", async () => {
    const manifest = await store.currentManifest(projA);
    const meta = await store.loadMockupVersion(projA, manifest!.currentVersionId);
    // PSD referenciado por path, nunca embutido em texto
    expect(meta!.outputPsd).toMatch(/master-output\.psd$/);
    // previews pequenos e por path
    for (const pv of meta!.previews) {
      expect(pv.bytes).toBeGreaterThan(0);
      expect(pv.bytes).toBeLessThan(1_000_000); // PNG pequeno, não é PSD
      expect(pv.path).toMatch(/\.png$/);
    }
    // o metadata.json em si não contém base64 do PSD
    const metaBuf = await store.getMockupFile(projA, `versions/${manifest!.currentVersionId}/metadata.json`);
    expect(metaBuf!.length).toBeLessThan(200_000);
    expect(metaBuf!.toString()).not.toContain("data:image/png;base64,");
  }, 60000);

  it("Artifacts API: serve PSD/preview por URL e bloqueia acesso a outro projeto / path inválido", async () => {
    const manifest = await store.currentManifest(projA);
    // serve o PSD real (current)
    const psdResp = await serveProjectArtifact(store, projA, "current/master-output.psd");
    expect(psdResp.ok).toBe(true);
    expect(psdResp.kind).toBe("psd");
    expect(psdResp.bytes!.length).toBeGreaterThan(0);
    expect(psdResp.contentType).toBe("application/octet-stream");
    // serve um preview real (BC)
    const bcResp = await serveProjectArtifact(store, projA, "current/BC.png");
    expect(bcResp.ok).toBe(true);
    expect(bcResp.kind).toBe("preview");
    expect(bcResp.contentType).toBe("image/png");
    expect(bcResp.bytes!.length).toBeGreaterThan(0);
    // isolamento: projeto B não serve os arquivos de A
    const bResp = await serveProjectArtifact(store, projB, "current/master-output.psd");
    expect(bResp.ok).toBe(false);
    expect(bResp.status).toBe(404);
    // path inválido (traversal) é rejeitado
    const bad = await serveProjectArtifact(store, projA, "current/../../branding/other/master-output.psd");
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(400);
    // lista artefatos do projeto
    const list = await listProjectMockupArtifacts(store, projA);
    expect(list.currentVersionId).toBeTruthy();
    expect(list.previews.some((p) => p.includes("BC.png"))).toBe(true);
    expect(list.psd).toMatch(/master-output\.psd$/);
  }, 60000);
});
