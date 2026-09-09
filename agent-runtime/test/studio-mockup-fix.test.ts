import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSiteTools } from "../src/tools";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72" viewBox="0 0 120 72"><rect width="120" height="72" fill="#4F46E5"/><text x="60" y="48" font-size="28" fill="#fff" text-anchor="middle">Movimento</text></svg>`;

describe("studio/mockup tool — identidade com SVG real (correção no_logo_identity)", () => {
  let ws: string;
  beforeAll(() => {
    ws = mkdtempSync(join(tmpdir(), "studio-mock-"));
    writeFileSync(join(ws, "brand-state.json"), JSON.stringify({ name: "Movimento", selectedConceptId: "1", palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#FFFFFF", foreground: "#111111" }, typography: { heading: "Inter", body: "Inter", weights: "700" } }));
    mkdirSync(join(ws, "assets/brand"), { recursive: true });
    writeFileSync(join(ws, "assets/brand/primary.svg"), SVG);
  });
  afterAll(() => { rmSync(ws, { recursive: true, force: true }); });

  it("ler assets/brand/*.svg (fix no readFilesRec) e NÃO reportar no_logo_identity", async () => {
    const env = { workspaceRoot: ws, business: { name: "Movimento", segment: "saude" }, projectId: "studio-mock" };
    const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
    const mockup = tools.find((t) => t.name === "mockup")!;
    const out = await mockup.execute({ action: "generate", applications: ["BC"] });
    // Antes do fix: "não suportadas: ... (no_logo_identity)" e "failed".
    expect(out).not.toContain("no_logo_identity");
    expect(out).not.toContain("failed");
    expect(out).toContain("aplicações aplicadas");
  }, 180000);
});
