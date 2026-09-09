import { describe, it, expect } from "vitest";
import { toBrandView, realPreviewSvg, resolveBrandIntent, type BrandSnapshotLike } from "../lib/brandingView";

const snapshot: BrandSnapshotLike = {
  name: "VivaFit",
  concepts: [
    { id: "1", name: "Monograma V", type: "monogram", rationale: "tipográfico" },
    { id: "2", name: "Símbolo Abstrato", type: "abstract", rationale: "geométrico" },
    { id: "3", name: "Figurativo", type: "figurative-geometrized", rationale: "ícone" },
  ],
  selectedConceptId: "2",
  rejected: ["3"],
  currentVersionId: 2,
  variants: { primary: "<svg></svg>", symbol: "<svg></svg>", monoLight: "<svg></svg>" },
  palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#fff", foreground: "#111" },
  typography: { heading: "Fraunces", body: "Inter", weights: "700" },
  identity: { hierarchy: "título Fraunces 700", photoDirection: "editorial", applicationRules: "usar SVG real" },
  versions: [{ id: 1, label: "conceito original" }, { id: 2, label: "símbolo refinado" }],
};

describe("brandingView — projeção do snapshot (6.1)", () => {
  it("toBrandView marca status selecionado/rejeitado/disponível", () => {
    const v = toBrandView(snapshot);
    expect(v.concepts.find((c) => c.id === "2")?.status).toBe("selecionado");
    expect(v.concepts.find((c) => c.id === "3")?.status).toBe("rejeitado");
    expect(v.concepts.find((c) => c.id === "1")?.status).toBe("disponível");
    expect(v.hasBrand).toBe(true);
  });

  it("preview usa o SVG real do artefato (não mock)", () => {
    const v = toBrandView(snapshot);
    expect(realPreviewSvg(v, "primary")).toContain("<svg");
    expect(realPreviewSvg(v, "symbol")).toBe(snapshot.variants.symbol);
    expect(realPreviewSvg(v, "inexistente")).toBe("");
  });

  it("histórico marca versão atual", () => {
    const v = toBrandView(snapshot);
    expect(v.currentVersionId).toBe(2);
    expect(v.versions.find((x) => x.id === 2)?.current).toBe(true);
    expect(v.versions.find((x) => x.id === 1)?.current).toBe(false);
  });
});

describe("brandingView — resolução de intenção do chat (6.1)", () => {
  it("'Gostei do conceito 2' → select 2", () => {
    const r = resolveBrandIntent("Gostei do conceito 2.");
    expect(r.op).toBe("select");
    if (r.op === "select") expect(r.conceptId).toBe("2");
  });
  it("'Volta para a versão anterior' → revert", () => {
    expect(resolveBrandIntent("Volta para a versão anterior.").op).toBe("revert");
  });
  it("'Muda só a tipografia' → editTypography", () => {
    expect(resolveBrandIntent("Muda só a tipografia.").op).toBe("editTypography");
  });
  it("'fonte mais sofisticada' → editTypography Playfair", () => {
    const r = resolveBrandIntent("Quero uma fonte mais sofisticada.");
    expect(r.op).toBe("editTypography");
    if (r.op === "editTypography") expect(r.heading).toBe("Playfair Display");
  });
  it("'deixa o símbolo mais fino' → editThickness", () => {
    expect(resolveBrandIntent("Deixa o símbolo mais fino.").op).toBe("editThickness");
  });
  it("não resolvido → unknown", () => {
    expect(resolveBrandIntent("qual é a sua opinião?").op).toBe("unknown");
  });
});
