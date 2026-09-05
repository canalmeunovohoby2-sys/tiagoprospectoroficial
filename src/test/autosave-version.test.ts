import { describe, it, expect } from "vitest";
import { versionChanged } from "../../src/lib/siteProjectsApi";

const specA = { business: { name: "A" }, sections: [], content: {} };
const specB = { business: { name: "B" }, sections: [], content: {} };
const filesA = { "index.html": "<h1>A</h1>" };
const filesB = { "index.html": "<h1>B</h1>" };

describe("Autosave versionChanged (5.24) — não duplica sem mudança real", () => {
  it("primeira versão (sem anterior) → cria", () => {
    expect(versionChanged(null, specA as never, filesA)).toBe(true);
  });

  it("files idênticos → NÃO duplica", () => {
    expect(versionChanged({ spec: specA as never, files: filesA }, specA as never, filesA)).toBe(false);
  });

  it("files diferentes → cria", () => {
    expect(versionChanged({ spec: specA as never, files: filesA }, specA as never, filesB)).toBe(true);
  });

  it("sem files: spec idêntica → NÃO duplica", () => {
    expect(versionChanged({ spec: specA as never, files: null }, specA as never, null)).toBe(false);
  });

  it("sem files: spec diferente → cria", () => {
    expect(versionChanged({ spec: specA as never, files: null }, specB as never, null)).toBe(true);
  });

  it("nova versão com files quando anterior só tinha spec → cria (evolução code-first)", () => {
    expect(versionChanged({ spec: specA as never, files: null }, specA as never, filesA)).toBe(true);
  });

  it("sem mudança real nas files mas spec igual → não duplica (prevalece files)", () => {
    expect(versionChanged({ spec: specA as never, files: filesA }, specB as never, filesA)).toBe(false);
  });
});
