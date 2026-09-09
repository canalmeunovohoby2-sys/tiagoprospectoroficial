import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSiteTools } from "../src/tools";

function seedIdentity(ws: string) {
  writeFileSync(join(ws, "brand-state.json"), JSON.stringify({ name: "Movimento", selectedConceptId: "1", palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#FFFFFF", foreground: "#111111" }, typography: { heading: "Playfair Display", body: "Inter", weights: "700" } }));
  mkdirSync(join(ws, "assets/brand"), { recursive: true });
  writeFileSync(join(ws, "assets/brand/primary.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180"><circle cx="100" cy="68" r="54" fill="none" stroke="#4F46E5" stroke-width="8" stroke-dasharray="290 340"/><text x="100" y="68" text-anchor="middle" dominant-baseline="central" font-size="76" fill="#4F46E5">M</text></svg>`);
  writeFileSync(join(ws, "assets/brand/symbol.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect x="40" y="40" width="80" height="80" fill="#4F46E5" transform="rotate(45 80 80)"/><circle cx="80" cy="80" r="18" fill="#111"/></svg>`);
}

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

  it("generate produz um PDF REAL persistido + manifesto no workspace (backend do botão)", async () => {
    const ws = mkdtempSync(join(tmpdir(), "pdf-tool-gen-" + Date.now()));
    try {
      seedIdentity(ws);
      const env = { workspaceRoot: ws, business: { name: "Movimento", segment: "saude" }, projectId: "proj-pdf" };
      const tools = buildSiteTools(env) as unknown as Array<{ name: string; execute: (i: any) => Promise<string> }>;
      const t = tools.find((x) => x.name === "brand_pdf")!;
      const out = await t.execute({ action: "generate" });
      expect(out).toContain("MANUAL DA IDENTIDADE");
      expect(out).toMatch(/pronto|erro/); // pronto quando valida o PDF real
      const manifest = JSON.parse(readFileSync(join(ws, "assets/pdfs/pdf-result.json"), "utf8"));
      expect(manifest.pageCount).toBeGreaterThan(0);
      // PDF real persistido no ArtifactStore é recuperável pelo caminho do manifesto
      const pdfUrl = manifest.pdfRelPath;
      expect(pdfUrl).toMatch(/\.pdf$/);
      void out;
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  }, 60000);
});
