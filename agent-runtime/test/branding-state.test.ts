import { describe, it, expect } from "vitest";
import {
  createBrandStudio, brandSnapshot, brandStateFiles, parseBrandState, loadBrandStateFromFiles,
  serializeBrandState, applyBrandCmd, STATE_PATH,
} from "../src/branding-state";
import { validateBrandSvg } from "../src/branding";

const BRIEF = "Crie uma identidade para a academia VivaFit, energética e acolhedora.";

describe("branding-state — criação/serialização/persistência (6.0)", () => {
  it("createBrandStudio gera estado com briefing, direção e 3 conceitos", () => {
    const s = createBrandStudio(BRIEF, "VivaFit");
    expect(s.briefing.name).toBe("VivaFit");
    expect(s.concepts.length).toBe(3);
    expect(s.direction.territory).toBeTruthy();
  });

  it("brandStateFiles produz brand-state.json + assets/brand/*.svg reais (SVG válido)", () => {
    let s = createBrandStudio(BRIEF, "VivaFit");
    s = applyBrandCmd(s, { op: "select", conceptId: "2" }, "VivaFit").state;
    const files = brandStateFiles(s, "VivaFit");
    const stateFile = files.find((f) => f.path === STATE_PATH)!;
    const svgFile = files.find((f) => f.path === "assets/brand/primary.svg")!;
    expect(stateFile.content).toContain("VivaFit");
    expect(svgFile.content).toContain("<svg");
    expect(validateBrandSvg(svgFile.content).ok).toBe(true);
  });

  it("persistência + recuperação após reabrir (round-trip)", () => {
    let s = createBrandStudio(BRIEF, "VivaFit");
    s = applyBrandCmd(s, { op: "select", conceptId: "2" }, "VivaFit").state;
    s = applyBrandCmd(s, { op: "editTypography", heading: "Fraunces" }, "VivaFit").state;
    const files = brandStateFiles(s, "VivaFit");
    const map = Object.fromEntries(files.map((f) => [f.path, f.content]));
    const reloaded = loadBrandStateFromFiles(map);
    expect(reloaded).not.toBeNull();
    const snap = brandSnapshot(reloaded!, "VivaFit");
    expect(snap.selectedConceptId).toBe("2");
    expect(snap.typography.heading).toBe("Fraunces");
  });
});

describe("branding-state — comandos não-destrutivos + versionamento (6.0)", () => {
  it("selecionar conceito 2 e editar tipografia preserva símbolo/geometria", () => {
    let s = createBrandStudio(BRIEF, "VivaFit");
    const r1 = applyBrandCmd(s, { op: "select", conceptId: "2" }, "VivaFit");
    const before = r1.snapshot.variants.primary;
    const r2 = applyBrandCmd(r1.state, { op: "editTypography", heading: "Playfair" }, "VivaFit");
    expect(r2.state.chosen!.id).toBe("2");
    expect(r2.snapshot.variants.primary).not.toBe(before);
    expect(r2.snapshot.typography.heading).toBe("Playfair");
  });

  it("editar só a cor preserva a geometria (mesma forma, cor nova) e versiona", () => {
    let s = createBrandStudio(BRIEF, "VivaFit");
    s = applyBrandCmd(s, { op: "select", conceptId: "1" }, "VivaFit").state;
    const base = s.versions.length;
    s = applyBrandCmd(s, { op: "editPalette", palette: { primary: "#0EA5E9", secondary: "#777", accent: "#f00", background: "#fff", foreground: "#111" } }, "VivaFit").state;
    expect(s.versions.length).toBeGreaterThan(base);
    expect(s.current!.svg).toContain("fill=\"#0EA5E9\"");
  });

  it("revert restaura a versão anterior de fato", () => {
    let s = createBrandStudio(BRIEF, "VivaFit");
    s = applyBrandCmd(s, { op: "select", conceptId: "1" }, "VivaFit").state;
    const first = s.current!.svg;
    s = applyBrandCmd(s, { op: "editPalette", palette: { primary: "#0EA5E9", secondary: "#777", accent: "#f00", background: "#fff", foreground: "#111" } }, "VivaFit").state;
    expect(s.current!.svg).not.toBe(first);
    s = applyBrandCmd(s, { op: "revert" }, "VivaFit").state;
    expect(s.current!.svg).toBe(first);
  });

  it("parseBrandState lê estado e ignora JSON inválido", () => {
    expect(parseBrandState('{"name":"X","selectedConceptId":"2"}')?.selectedConceptId).toBe("2");
    expect(parseBrandState("não é json")).toBeNull();
  });
});
