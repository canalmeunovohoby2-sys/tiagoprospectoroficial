import { describe, it, expect } from "vitest";
import { isBrandFile, mergeBrandFiles, extractBrandSnapshot, hasBrandState, BRAND_STATE_FILE } from "../lib/brandingPersist";

const state = JSON.stringify({ name: "VivaFit", selectedConceptId: "2", concepts: [{ id: "2", name: "S", type: "abstract", rationale: "r" }], palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#fff", foreground: "#111" }, typography: { heading: "Fraunces", body: "Inter", weights: "700" } });

describe("brandingPersist — merge seguro (6.3)", () => {
  it("isBrandFile reconhece brand-state.json e assets/brand/*", () => {
    expect(isBrandFile(BRAND_STATE_FILE)).toBe(true);
    expect(isBrandFile("assets/brand/primary.svg")).toBe(true);
    expect(isBrandFile("index.html")).toBe(false);
    expect(isBrandFile("src/site.css")).toBe(false);
  });

  it("mergeBrandFiles sobrescreve só o branding e PRESERVA arquivos não relacionados", () => {
    const current = { "index.html": "<html>", "src/site.css": "a{}", "assets/brand/primary.svg": "<svg>0</svg>" };
    const incoming = { "brand-state.json": state, "assets/brand/primary.svg": "<svg>1</svg>", "src/site.css": "NÃO DEVIA MUDAR" };
    const merged = mergeBrandFiles(current, incoming);
    expect(merged["brand-state.json"]).toBe(state);
    expect(merged["assets/brand/primary.svg"]).toBe("<svg>1</svg>");
    expect(merged["index.html"]).toBe("<html>"); // preservado
    expect(merged["src/site.css"]).toBe("a{}"); // NÃO relacionado preservado (incoming ignorado)
  });

  it("mergeBrandFiles não vaza arquivos não-branding de incoming", () => {
    const merged = mergeBrandFiles({}, { "index.html": "<html>", "brand-state.json": state });
    expect(merged["index.html"]).toBeUndefined();
    expect(merged["brand-state.json"]).toBe(state);
  });

  it("extractBrandSnapshot reconstrói estado + SVGs reais; retorna null sem brand-state", () => {
    const files = { "brand-state.json": state, "assets/brand/primary.svg": "<svg>p</svg>", "assets/brand/symbol.svg": "<svg>s</svg>" };
    const snap = extractBrandSnapshot(files);
    expect(snap?.selectedConceptId).toBe("2");
    expect(snap?.variants?.primary).toBe("<svg>p</svg>");
    expect(snap?.variants?.symbol).toBe("<svg>s</svg>");
    expect(extractBrandSnapshot({ "index.html": "<html>" })).toBeNull();
  });

  it("hasBrandState detecta presença real de estado", () => {
    expect(hasBrandState({ "brand-state.json": state })).toBe(true);
    expect(hasBrandState({ "index.html": "<html>" })).toBe(false);
  });
});
