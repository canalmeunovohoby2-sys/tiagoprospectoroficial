import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSiteTools } from "../src/tools";

describe("mockup-tool (10.10) — ferramenta do agente", () => {
  it("registra a ferramenta `mockup` no conjunto de ferramentas do agente", () => {
    const env = { workspaceRoot: join(tmpdir(), "mockup-tool-" + Date.now()), business: { name: "X", segment: "restaurante" } };
    const tools = buildSiteTools(env) as unknown as Array<{ name: string }>;
    expect(tools.some((t) => t.name === "mockup")).toBe(true);
  });

  it("action=status sem identidade rejeita honestamente (sem falso estado)", async () => {
    const ws = mkdtempSync(join(tmpdir(), "mockup-tool-" + Date.now()));
    try {
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" } };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const mockup = tools.find((t) => t.name === "mockup")!;
      const out = await mockup.execute({ action: "status" });
      expect(out).toContain("MOCKUP");
      expect(out).toContain("nenhuma execução");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("action=history lista execuções persistidas sem tentar gerar (barato, sem PSD)", async () => {
    const ws = mkdtempSync(join(tmpdir(), "mockup-tool-" + Date.now()));
    try {
      writeFileSync(join(ws, "brand-state.json"), JSON.stringify({ name: "Bella", palette: { primary: "#111", secondary: "#666", accent: "#f90", background: "#fff", foreground: "#111" } }));
      mkdirSync(join(ws, "assets", "mockups"), { recursive: true });
      const history = [{ versionId: "v1", createdAt: "2026-01-01T00:00:00Z", identityName: "Bella", primary: "#111", secondary: "#666", applicationsApplied: ["BC"], applicationsUnsupported: [], outputPsdRelative: "assets/mockups/master-output.psd", previews: [], modifiedLayers: [], modifiedColors: [], status: "applied" }];
      writeFileSync(join(ws, "assets", "mockups", "mockup-history.json"), JSON.stringify(history, null, 2));
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" } };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const mockup = tools.find((t) => t.name === "mockup")!;
      const out = await mockup.execute({ action: "history" });
      expect(out).toContain("histórico: 1");
      expect(out).toContain("BC");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
