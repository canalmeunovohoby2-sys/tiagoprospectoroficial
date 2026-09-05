import { describe, it, expect } from "vitest";
import { computeWorkEvidence, type WorkEventLike } from "../src/work-evidence";

function started(toolName: string, input?: { path?: string; file?: string }): WorkEventLike {
  return { type: "tool-started", toolName, toolCall: { toolName, input: input ?? {} } };
}

describe("Work Evidence (5.28) — evidência real do trabalho na run", () => {
  it("inspecionou antes de alterar e verificou depois (fluxo profissional)", () => {
    const ev = [
      started("list_files"),
      started("read_file", { path: "index.html" }),
      started("get_site_context"),
      started("write_file", { path: "index.html" }),
      started("write_file", { path: "src/site.css" }),
      started("browser_open"),
      started("browser_reload"),
    ];
    const w = computeWorkEvidence(ev);
    expect(w.inspectedBeforeEdit).toBe(true);
    expect(w.verifiedAfterLastEdit).toBe(true);
    expect(w.editActionCount).toBe(2);
    expect(w.editedPaths).toEqual(["index.html", "src/site.css"]);
  });

  it("alterou sem inspecionar antes (executor literal) → flag acusa", () => {
    const w = computeWorkEvidence([started("write_file", { path: "index.html" }), started("write_file", { path: "src/site.css" })]);
    expect(w.inspectedBeforeEdit).toBe(false);
    expect(w.verifiedAfterLastEdit).toBe(false);
    expect(w.editActionCount).toBe(2);
  });

  it("inspecionou mas não verificou depois da última alteração → flag acusa", () => {
    const w = computeWorkEvidence([started("read_file", { path: "index.html" }), started("write_file", { path: "index.html" })]);
    expect(w.inspectedBeforeEdit).toBe(true);
    expect(w.verifiedAfterLastEdit).toBe(false);
  });

  it("leitura após a última edição conta como verificação", () => {
    const w = computeWorkEvidence([
      started("read_file", { path: "src/site.css" }),
      started("write_file", { path: "src/site.css" }),
      started("read_file", { path: "src/site.css" }),
    ]);
    expect(w.inspectedBeforeEdit).toBe(true);
    expect(w.verifiedAfterLastEdit).toBe(true);
  });

  it("sem alterações → sem evidência de edição", () => {
    const w = computeWorkEvidence([started("list_files"), started("read_file", { path: "index.html" })]);
    expect(w.editActionCount).toBe(0);
    expect(w.editedPaths).toEqual([]);
    expect(w.inspectedBeforeEdit).toBe(false);
  });

  it("ignora eventos que não são tool-started e tools sem nome", () => {
    const w = computeWorkEvidence([
      { type: "turn-finished" } as WorkEventLike,
      { type: "tool-started", toolName: "" } as WorkEventLike,
      started("edit_file", { path: "src/site.css" }),
    ]);
    expect(w.editActionCount).toBe(1);
    expect(w.editedPaths).toEqual(["src/site.css"]);
  });

  it("delete_file conta como alteração", () => {
    const w = computeWorkEvidence([started("delete_file", { path: "assets/velha.jpg" })]);
    expect(w.editActionCount).toBe(1);
    expect(w.editedPaths).toEqual(["assets/velha.jpg"]);
  });
});
