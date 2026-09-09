import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSiteTools } from "../src/tools";

describe("brand_package tool (12)", () => {
  it("está registrada no conjunto de ferramentas do agente", () => {
    const env = { workspaceRoot: join(tmpdir(), "pkg-tool-" + Date.now()), business: { name: "X", segment: "restaurante" }, projectId: "proj" };
    const tools = buildSiteTools(env) as unknown as Array<{ name: string }>;
    expect(tools.some((t) => t.name === "brand_package")).toBe(true);
  });

  it("generate sem identidade rejeita honestamente", async () => {
    const ws = mkdtempSync(join(tmpdir(), "pkg-tool-" + Date.now()));
    try {
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" }, projectId: "proj" };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const t = tools.find((x) => x.name === "brand_package")!;
      const out = await t.execute({ action: "generate" });
      expect(out).toContain("nenhuma identidade persistida");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("status reflete manifesto persistido", async () => {
    const ws = mkdtempSync(join(tmpdir(), "pkg-tool-" + Date.now()));
    try {
      mkdirSync(join(ws, "assets/packages"), { recursive: true });
      writeFileSync(join(ws, "assets/packages/package-result.json"), JSON.stringify({ status: "ready", versionId: "v1", fileCount: 10 }));
      writeFileSync(join(ws, "assets/packages/package-history.json"), JSON.stringify([{ versionId: "v1" }]));
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" }, projectId: "proj" };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const t = tools.find((x) => x.name === "brand_package")!;
      const out = await t.execute({ action: "status" });
      expect(out).toContain("pronto");
      expect(out).toContain("versões: 1");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
