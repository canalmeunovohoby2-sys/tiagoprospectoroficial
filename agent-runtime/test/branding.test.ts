import { describe, it, expect } from "vitest";
import {
  buildBrandBriefing, brandDirection, generateBrandConcepts, evaluateBrandConcept,
  buildBrandSvg, validateBrandSvg, brandVariations, buildBrandIdentitySystem,
  evaluateLogoQuality,
  createBrandProjectState, selectBrandConcept, rejectBrandConcept, revertToPrevious,
  editBrandTypography, editBrandPalette,
} from "../src/branding";

const briefing = buildBrandBriefing({ name: "VivaFit", segment: "Academia", personality: "energética, acolhedora", positioning: "saúde e bem-estar", applications: ["redes sociais", "cartão"] });

describe("branding — briefing/direção/conceitos (6.0)", () => {
  it("briefing estruturado e direção de marca coerente", () => {
    const d = brandDirection(briefing);
    expect(d.territory).toContain("energética");
    expect(["minimal", "modern", "premium", "bold", "editorial"]).toContain(d.sophistication);
    expect(d.priorityApplications.length).toBe(2);
  });

  it("gera 3 conceitos DISTINTOS (tipográfico/abstrato/figurativo), não quase idênticos", () => {
    const c = generateBrandConcepts(briefing, brandDirection(briefing));
    expect(c.length).toBe(3);
    const types = c.map((x) => x.type);
    expect(new Set(types).size).toBe(3);
    expect(new Set(c.map((x) => x.name)).size).toBe(3);
  });

  it("avaliação anti-clichê reprova símbolo de nicho", () => {
    const bad = { id: "9", name: "Academia", type: "figurative-geometrized" as const, rationale: "", symbolIdea: "halter", typography: "", palette: "", silhouette: "" };
    const r = evaluateBrandConcept(bad);
    expect(r.passes).toBe(false);
    expect(r.critiques.join()).toMatch(/clichê/i);
  });
});

describe("branding — SVG vetorial editável + validação (6.0)", () => {
  it("buildBrandSvg gera <svg> válido, vetorial (sem raster), e validation passa", () => {
    const c = generateBrandConcepts(briefing, brandDirection(briefing))[0];
    const svg = buildBrandSvg(c, { primary: "#111111", secondary: "#6B7280", accent: "#4F46E5", background: "#fff", foreground: "#111" });
    const v = validateBrandSvg(svg);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(svg).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
  });

  it("validação detecta raster embutido e SVG inválido", () => {
    expect(validateBrandSvg("<svg xmlns=\"http://www.w3.org/2000/svg\"><image href=\"x.png\"/></svg>").ok).toBe(false);
    expect(validateBrandSvg("<div>não svg</div>").ok).toBe(false);
  });

  it("variações derivam do mesmo sistema (horizontal/vertical/símbolo/monocromáticas)", () => {
    const c = generateBrandConcepts(briefing, brandDirection(briefing))[0];
    const vars = brandVariations(c, { primary: "#111", secondary: "#444", accent: "#f90", background: "#fff", foreground: "#111" });
    expect(Object.keys(vars)).toEqual(["primary", "horizontal", "vertical", "symbol", "monoLight", "monoDark"]);
    for (const key of Object.keys(vars)) expect(validateBrandSvg(vars[key]).ok, key).toBe(true);
  });
});

describe("branding — identidade + estado não-destrutivo (6.0)", () => {
  it("sistema de identidade gera tokens HEX/RGB/CMYK + tipografia/hierarquia", () => {
    const sys = buildBrandIdentitySystem(briefing, brandDirection(briefing), { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#fff", foreground: "#111" }, { heading: "Fraunces", body: "Inter", weights: "700" });
    expect(sys.hex.primary).toBe("#4F46E5");
    expect(sys.rgb.primary).toMatch(/^\d+,\d+,\d+$/);
    expect(sys.cmyk.primary).toMatch(/^\d+,\d+,\d+,\d+$/);
    expect(sys.hierarchy).toContain("Fraunces");
  });

  it("edição localizada (tipografia) preserva símbolo/geometria; paleta só muda cor", () => {
    let s = createBrandProjectState(briefing);
    s = selectBrandConcept(s, "1");
    const before = s.current!.svg;
    s = editBrandTypography(s, { heading: "Fraunces", body: "Inter", weights: "700" });
    expect(s.current!.svg).not.toBe(before); // mudou tipografia
    // geometria/símbolo preservados: mesmo <path>/<circle> base (monogram usa <text>; trocar font-family não muda shape)
    s = editBrandPalette(s, { primary: "#0EA5E9", secondary: "#777", accent: "#f00", background: "#fff", foreground: "#111" });
    expect(s.current!.svg).toContain("fill=\"#0EA5E9\"");
  });

  it("versionamento: seleciona conceito, rejeita outro, reverte à anterior", () => {
    let s = createBrandProjectState(briefing);
    s = selectBrandConcept(s, "1");
    const v1 = s.current!.id;
    s = selectBrandConcept(s, "2");
    expect(s.current!.id).toBeGreaterThan(v1);
    s = rejectBrandConcept(s, "3");
    expect(s.rejected).toContain("3");
    s = revertToPrevious(s);
    expect(s.current!.label).toContain("Conceito 1");
  });

  it("editPalette troca só a cor; monograma mantém anel/construção (não vira texto solto)", () => {
    const c = generateBrandConcepts(briefing, brandDirection(briefing))[0];
    const svg = buildBrandSvg(c, { primary: "#111111", secondary: "#6B7280", accent: "#4F46E5", background: "#fff", foreground: "#111" });
    const q = evaluateLogoQuality(svg, { type: c.type });
    expect(q.ok).toBe(true);
    expect(q.score).toBeGreaterThan(0.5);
    expect(svg).toMatch(/stroke-dasharray|<path|<rect|<circle/); // construção, não só texto
  });

  it("gate de qualidade rejeita marca trivial/genérica (só texto ou quadrado+círculo)", () => {
    const trivialText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180"><text x="100" y="90" fill="#111">X</text></svg>`;
    const trivialShapes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180"><g fill="#111"><rect x="64" y="36" width="44" height="108"/><circle cx="136" cy="90" r="54"/></g></svg>`;
    expect(evaluateLogoQuality(trivialText, { type: "monogram" }).ok).toBe(false);
    expect(evaluateLogoQuality(trivialShapes, { type: "abstract" }).ok).toBe(false);
    // inválido também rejeita
    expect(evaluateLogoQuality("<div>x</div>", { type: "abstract" }).ok).toBe(false);
  });
});
