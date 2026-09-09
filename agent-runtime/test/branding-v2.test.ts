import { describe, it, expect } from "vitest";
import {
  buildBrandBriefing, brandDirection, generateBrandConcepts,
  buildBrandConstruction, evaluateBrandConceptStrict, refineBrandConstruction,
  brandSVGQualityGate, brandReductionAudit, brandMonochromeAudit, buildBrandPresentation,
  buildBrandSvg, brandVariations, buildBrandIdentitySystem, createBrandProjectState,
  selectBrandConcept, editBrandThickness, editBrandTypography, editBrandPalette, revertToPrevious,
} from "../src/branding";

const briefing = buildBrandBriefing({ name: "VivaFit", segment: "Academia", personality: "energética", applications: ["redes sociais", "cartão"] });
const dir = brandDirection(briefing);
const concepts = generateBrandConcepts(briefing, dir);
const constr = buildBrandConstruction(concepts[0], briefing, dir);
const palette = { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#FFFFFF", foreground: "#111111" };

describe("branding 8 — construção vetorial estrutural", () => {
  it("buildBrandConstruction gera lógica construtiva verificável (não 'ficou bonito')", () => {
    expect(constr.geometryStrategy).toBeTruthy();
    expect(constr.constructionLogic).toContain("VivaFit");
    expect(constr.grid?.cols).toBeGreaterThanOrEqual(4);
    expect(constr.negativeSpace).toBeTruthy();
    expect(constr.primitives.length).toBeGreaterThan(0);
    expect(["simétrica", "assimétrica-intencional", "rotacional"]).toContain(constr.symmetry);
  });

  it("conceitos distintos geram construções diferentes", () => {
    const c = concepts.map((x) => buildBrandConstruction(x, briefing, dir));
    expect(new Set(c.map((x) => x.geometryStrategy)).size).toBe(3);
  });
});

describe("branding 8 — gate anti-genericidade + refinamento", () => {
  it("gate forte rejeita conceito sem lógica construtiva", () => {
    const bad = { id: "9", name: "X", type: "abstract" as const, rationale: "", symbolIdea: "halter", typography: "", palette: "", silhouette: "" };
    const r = evaluateBrandConceptStrict(bad, briefing);
    expect(r.pass).toBe(false);
    expect(r.critiques.length).toBeGreaterThan(0);
  });

  it("refinamento resolve problemas objetivos (grid/contraforma/ancoragem) e preserva base", () => {
    const r = refineBrandConstruction(constr, briefing);
    expect(r.construction.grid!.cols).toBeGreaterThanOrEqual(6);
    expect(r.construction.negativeSpace).toBeTruthy();
    expect(r.construction.conceptId).toBe(constr.conceptId);
  });
});

describe("branding 8 — quality gate / redução / monocromia", () => {
  it("brandSVGQualityGate exige vetor, viewBox, fill e sem raster", () => {
    const svg = buildBrandSvg(concepts[0], palette, { variant: "symbol" });
    const g = brandSVGQualityGate(svg);
    expect(g.ok).toBe(true);
    expect(g.issues).toEqual([]);
  });

  it("auditoria de redução valida escalas; escada favicon exige simplicidade", () => {
    const svg = buildBrandSvg(concepts[0], palette, { variant: "symbol" });
    const audit = brandReductionAudit(svg);
    expect(audit.length).toBe(4);
    expect(audit.find((a) => a.size === "favicon")).toBeTruthy();
  });

  it("auditoria de monocromia passa com variações mono válidas", () => {
    const vars = brandVariations(concepts[0], palette);
    const m = brandMonochromeAudit(vars);
    expect(m.ok).toBe(true);
  });
});

describe("branding 8 — apresentação + edição não-destrutiva + versionamento", () => {
  it("apresentação profissional organiza conceito/construção/paleta/tipografia/variações", () => {
    const identity = buildBrandIdentitySystem(briefing, dir, palette, { heading: "Fraunces", body: "Inter", weights: "700" });
    const p = buildBrandPresentation({ concept: concepts[0], construction: constr, identity, variations: brandVariations(concepts[0], palette), briefing });
    expect(p).toContain("APRESENTAÇÃO DE MARCA");
    expect(p).toContain("CONCEITO 1");
    expect(p).toContain("Paleta: #4F46E5");
  });

  it("edição de espessura preserva conceito; tipografia preserva símbolo; cor preserva geometria", () => {
    let s = createBrandProjectState(briefing);
    s = selectBrandConcept(s, "1");
    const geom = s.chosen!.id;
    s = editBrandThickness(s, 1.2);
    expect(s.chosen!.id).toBe(geom);
    s = editBrandTypography(s, { heading: "Playfair", body: "Inter", weights: "700" });
    expect(s.chosen!.id).toBe(geom);
    s = editBrandPalette(s, { primary: "#0EA5E9", secondary: "#777", accent: "#f00", background: "#fff", foreground: "#111" });
    expect(s.current!.svg).toContain("fill=\"#0EA5E9\"");
  });

  it("versionamento + revert restaura a versão anterior de fato", () => {
    let s = createBrandProjectState(briefing);
    s = selectBrandConcept(s, "1");
    const first = s.current!.svg;
    s = editBrandPalette(s, { primary: "#0EA5E9", secondary: "#777", accent: "#f00", background: "#fff", foreground: "#111" });
    const changed = s.current!.svg;
    expect(changed).not.toBe(first);
    s = revertToPrevious(s);
    expect(s.current!.svg).toBe(first);
  });
});
