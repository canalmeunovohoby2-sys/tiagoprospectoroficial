import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { resolveBrandIdentity, runBrandMockup, readMockupResult, readMockupHistory, resolveMasterPsdPath } from "../src/mockup-integration";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const master = join(process.cwd(), "assets/mockups/master/mockup-master.psd.psd");

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#4F46E5"/><circle cx="400" cy="260" r="120" fill="#F97316"/><text x="400" y="300" font-family="sans-serif" font-size="90" font-weight="bold" fill="#ffffff" text-anchor="middle">Bella</text></svg>`;

function writeIdentity(ws: string, overrides: { primary?: string; secondary?: string; accent?: string; versionId?: number } = {}) {
  const state = {
    name: "Bella",
    selectedConceptId: "1",
    currentVersionId: overrides.versionId ?? 1,
    palette: {
      primary: overrides.primary ?? "#111111",
      secondary: overrides.secondary ?? "#F97316",
      accent: overrides.accent ?? "#4F46E5",
      background: "#FFFFFF",
      foreground: "#111111",
    },
    typography: { heading: "Inter", body: "Inter", weights: "700" },
  };
  writeFileSync(join(ws, "brand-state.json"), JSON.stringify(state, null, 2));
  mkdirSync(join(ws, "assets/brand"), { recursive: true });
  writeFileSync(join(ws, "assets/brand/primary.svg"), logoSvg);
}

describe("mockup-integration — E2E real no PSD Master (10.10)", () => {
  let ws: string;

  beforeAll(() => { ws = mkdtempSync(join(tmpdir(), "mockup-e2e-")); writeIdentity(ws); });
  afterAll(() => { rmSync(ws, { recursive: true, force: true }); });

  it("resolve a identidade persistida do projeto (não inventa cores/logo)", () => {
    const files: Record<string, string> = {
      "brand-state.json": readFileSync(join(ws, "brand-state.json"), "utf8"),
      "assets/brand/primary.svg": logoSvg,
    };
    const id = resolveBrandIdentity(files);
    expect(id).toBeTruthy();
    expect(id!.name).toBe("Bella");
    expect(id!.primary).toBe("#111111");
    expect(id!.secondary).toBe("#F97316");
    expect(id!.logoSvg).toBe(logoSvg);
  });

  it("aplica a identidade no Master real, exporta PNGs reais e persiste resultado + histórico no workspace", async () => {
    const before = sha(readFileSync(master));
    const identity = resolveBrandIdentity({
      "brand-state.json": readFileSync(join(ws, "brand-state.json"), "utf8"),
      "assets/brand/primary.svg": logoSvg,
    })!;
    const r = await runBrandMockup({ workspaceRoot: ws, identity, applications: ["BC", "A4", "Mug"], context: "papelaria" });
    expect(r.status).toBe("applied");
    expect(r.applicationsApplied.sort()).toEqual(["A4", "BC", "Mug"]);
    expect(r.applicationsUnsupported).toEqual([]);
    expect(r.persisted).toBe(true);
    expect(r.outputPsdExists).toBe(true);
    expect(r.outputPsdBytes).toBeGreaterThan(0);
    expect(r.modifiedColors).toEqual(["Color/Color 1", "Color/Color 2"]);
    // previews = rasters reais das camadas modificadas
    expect(r.previews.map((p) => p.applicationId).sort()).toEqual(["A4", "BC", "Mug"]);
    for (const p of r.previews) {
      expect(p.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
      expect(p.bytes).toBeGreaterThan(0);
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
    expect(existsSync(r.outputPsd)).toBe(true);
    // resultado + histórico persistidos como arquivos do workspace
    expect(existsSync(join(ws, "assets/mockups/mockup-result.json"))).toBe(true);
    expect(existsSync(join(ws, "assets/mockups/mockup-history.json"))).toBe(true);
    expect(sha(readFileSync(master))).toBe(before); // Master intacto
  }, 240000);

  it("EDIÇÃO: nova geração (cor/variação alterada) não destrói a anterior e mantém o Master intacto", async () => {
    const before = sha(readFileSync(master));
    const identity = resolveBrandIdentity({
      "brand-state.json": readFileSync(join(ws, "brand-state.json"), "utf8"),
      "assets/brand/primary.svg": logoSvg,
    })!;
    const first = await runBrandMockup({ workspaceRoot: ws, identity, applications: ["BC", "A4", "Mug"], context: "papelaria" });
    const altSvg = logoSvg.replace("#4F46E5", "#16A34A"); // nova variação (verde)
    const second = await runBrandMockup({ workspaceRoot: ws, identity, logoSvgOverride: altSvg, colorsOverride: { primary: "#16A34A", secondary: "#F97316" }, applications: ["BC"] });
    expect(second.status).toBe("applied");
    expect(second.applicationsApplied).toEqual(["BC"]);
    expect(second.versionId).not.toBe(first.versionId); // nova versão distinta
    // histórico não apaga a anterior
    const history = readMockupHistory(ws);
    expect(history.length).toBeGreaterThanOrEqual(2);
    // a execução anterior foi preservada em versions/ (arquivo PSD anterior)
    const versions = readdirSync(join(ws, "assets/mockups/versions")).filter((f) => f.endsWith("-master-output.psd"));
    expect(versions.length).toBeGreaterThanOrEqual(1);
    // resultado atual reflete a nova identidade (cor primária verde)
    const current = readMockupResult(ws);
    expect(current!.identityUsed.primary).toBe("#16A34A");
    expect(sha(readFileSync(master))).toBe(before); // Master intacto após 2ª geração
  }, 240000);

  it("APLICAÇÃO NÃO SUPORTADA: reporta sem fingir sucesso (sem resultado falso)", async () => {
    const identity = resolveBrandIdentity({
      "brand-state.json": readFileSync(join(ws, "brand-state.json"), "utf8"),
      "assets/brand/primary.svg": logoSvg,
    })!;
    const r = await runBrandMockup({ workspaceRoot: ws, identity, applications: ["Unknown"], context: "papelaria" });
    expect(r.status).toBe("failed");
    expect(r.applicationsApplied).toEqual([]);
    expect(r.applicationsUnsupported[0].applicationId).toBe("Unknown");
    expect(r.persisted).toBe(false);
  }, 240000);

  it("resolveMasterPsdPath aponta para o Master real quando não há override", () => {
    const p = resolveMasterPsdPath();
    expect(existsSync(p)).toBe(true);
    expect(p.endsWith("mockup-master.psd.psd")).toBe(true);
  });
});
