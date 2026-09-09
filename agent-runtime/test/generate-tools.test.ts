import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSiteTools } from "../src/tools";

function names(env: any) {
  return (buildSiteTools(env) as unknown as Array<{ name: string }>).map((t) => t.name);
}

describe("buildSiteTools — geração de site sem identidade visual (13)", () => {
  it("mode=generate exclui branding/mockup/PDF/package/video (não cria identidade)", () => {
    const env = { workspaceRoot: mkdtempSync(join(tmpdir(), "gen-tools-")), business: { name: "X", segment: "saude" }, projectId: "p", mode: "generate" as const };
    const n = names(env);
    expect(n.some((x) => x === "branding")).toBe(false);
    expect(n.some((x) => x === "mockup")).toBe(false);
    expect(n.some((x) => x === "brand_pdf")).toBe(false);
    expect(n.some((x) => x === "brand_package")).toBe(false);
    expect(n.some((x) => x === "site_video")).toBe(false);
    // mantém as ferramentas essenciais de construção do site (nomes reais do agente)
    for (const keep of ["list_files", "read_file", "write_file", "edit_file", "delete_file", "get_site_context", "image_plan"]) expect(n.includes(keep), keep).toBe(true);
  });

  it("mode=edit (padrão) mantém a toolset completa", () => {
    const env = { workspaceRoot: mkdtempSync(join(tmpdir(), "edit-tools-")), business: { name: "X", segment: "saude" }, projectId: "p" };
    const n = names(env);
    expect(n.some((x) => x === "branding")).toBe(true);
    expect(n.some((x) => x === "mockup")).toBe(true);
    expect(n.some((x) => x === "brand_pdf")).toBe(true);
  });
});
