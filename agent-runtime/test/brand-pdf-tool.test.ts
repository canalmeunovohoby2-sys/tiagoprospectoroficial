import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSiteTools } from "../src/tools";

describe("brand_pdf tool (11)", () => {
  it("está registrada no conjunto de ferramentas do agente", () => {
    const env = { workspaceRoot: join(tmpdir(), "pdf-tool-" + Date.now()), business: { name: "X", segment: "restaurante" }, projectId: "proj" };
    const tools = buildSiteTools(env) as unknown as Array<{ name: string }>;
    expect(tools.some((t) => t.name === "brand_pdf")).toBe(true);
  });

  it("generate sem identidade rejeita honestamente (sem PDF falso)", async () => {
    const ws = mkdtempSync(join(tmpdir(), "pdf-tool-" + Date.now()));
    try {
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" }, projectId: "proj" };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const t = tools.find((x) => x.name === "brand_pdf")!;
      const out = await t.execute({ action: "generate" });
      expect(out).toContain("nenhuma identidade persistida");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("status reflete manifesto persistido", async () => {
    const ws = mkdtempSync(join(tmpdir(), "pdf-tool-" + Date.now()));
    try {
      mkdirSync(join(ws, "assets/pdfs"), { recursive: true });
      writeFileSync(join(ws, "assets/pdfs/pdf-result.json"), JSON.stringify({ status: "ready", versionId: "v1", pageCount: 8 }));
      writeFileSync(join(ws, "assets/pdfs/pdf-history.json"), JSON.stringify([{ versionId: "v1" }]));
      const env = { workspaceRoot: ws, business: { name: "X", segment: "restaurante" }, projectId: "proj" };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const t = tools.find((x) => x.name === "brand_pdf")!;
      const out = await t.execute({ action: "status" });
      expect(out).toContain("gerado");
      expect(out).toContain("execuções: 1");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
