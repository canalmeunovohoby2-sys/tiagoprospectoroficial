import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSiteTools } from "../src/tools";

describe("site_video tool (13)", () => {
  it("está registrada no conjunto de ferramentas do agente", () => {
    const env = { workspaceRoot: join(tmpdir(), "vid-tool-" + Date.now()), business: { name: "X", segment: "restaurante" }, projectId: "proj" };
    const tools = buildSiteTools(env) as unknown as Array<{ name: string }>;
    expect(tools.some((t) => t.name === "site_video")).toBe(true);
  });

  it("generate sem site (index.html) rejeita honestamente", async () => {
    const ws = mkdtempSync(join(tmpdir(), "vid-tool-" + Date.now()));
    try {
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" }, projectId: "proj" };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const t = tools.find((x) => x.name === "site_video")!;
      const out = await t.execute({ action: "generate" });
      expect(out).toContain("index.html");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("status reflete manifesto persistido", async () => {
    const ws = mkdtempSync(join(tmpdir(), "vid-tool-" + Date.now()));
    try {
      mkdirSync(join(ws, "assets/videos"), { recursive: true });
      writeFileSync(join(ws, "assets/videos/video-result.json"), JSON.stringify({ status: "ready", versionId: "v1", duration: 45 }));
      writeFileSync(join(ws, "assets/videos/video-history.json"), JSON.stringify([{ versionId: "v1" }]));
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" }, projectId: "proj" };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const t = tools.find((x) => x.name === "site_video")!;
      const out = await t.execute({ action: "status" });
      expect(out).toContain("pronto");
      expect(out).toContain("execuções: 1");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
