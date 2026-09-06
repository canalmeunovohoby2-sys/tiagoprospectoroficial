import { describe, it, expect } from "vitest";
import { editorUnavailableResult } from "@/lib/siteProjectsApi";

describe("Editor routing (5.38) — sempre o editor completo, sem fallback silencioso", () => {
  it("runtime ausente → erro EXPLÍCITO (nunca desvia silenciosamente para o edge simplificado)", () => {
    const r = editorUnavailableResult("not_configured");
    expect(r.status).toBe("error");
    expect(r.runtime).toBe("cline");
    expect(r.logs).toContain("editor_full_routing");
    expect((r.errors ?? []).join(" ")).toContain("VITE_AGENT_RUNTIME_URL");
  });

  it("runtime indisponível → erro EXPLÍCITO de execução (nenhuma edição simplificada é feita)", () => {
    const r = editorUnavailableResult("unreachable");
    expect(r.status).toBe("error");
    expect((r.errors ?? []).join(" ")).toContain("Agent Runtime");
    expect(r.errors ?? []).not.toEqual([]);
  });
});
