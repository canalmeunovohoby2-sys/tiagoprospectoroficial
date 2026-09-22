import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCuratedImages, selectImageCandidate } from "../src/image-pipeline";

const cand = (title: string, url = "https://images.pexels.com/photos/1/p.jpeg") => ({ url, source: "pexels", title, description: title, query: "q", relevance: 0.3, reason: "", rejected: false });
const INTENT = { role: "hero", subject: "odontologia clinica premium", mood: "", composition: "", treatment: "", avoid: [] } as never;

describe("fontes de imagem: lead=referencia, user=ativo, Pexels=apresentacao", () => {
  it("business.photos (lead) NAO ativa hero fotorrealista na direcao", () => {
    const src = readFileSync(join(process.cwd(), "src/studio/agent-core/design-direction.ts"), "utf8");
    expect(src).toContain("const realPhotos = false;");
    expect(src).toContain("LEAD_REFERENCE_ONLY");
  });
  it("o brief nao chama foto do lead de ativo do cliente", () => {
    const src = readFileSync(join(process.cwd(), "src/studio/agent-core/creative-brief.ts"), "utf8");
    expect(src).toContain("REFERENCIA do estabelecimento");
    const sem = src.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    expect(sem).not.toContain("ativos do cliente");
  });
  it("a prioridade do prompt e usuario > pipeline curado > lead", () => {
    const sem = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    expect(sem).toContain("assets enviados pelo usuario > pipeline de imagens curado");
  });
});

describe("curadoria: relevancia minima e contexto", () => {
  it("sem relevancia suficiente NAO seleciona imagem (fallback)", () => {
    const ruim = { ...cand("person in office professional", "https://images.pexels.com/photos/2/x.jpeg"), relevance: 0.1 };
    const sel = selectImageCandidate({ candidates: [ruim], intent: INTENT });
    expect(sel.candidate).toBeNull();
    expect(sel.needsFallback).toBe(true);
  });
  it("candidato odontologico ganha prioridade sobre generico usando o contexto real", () => {
    const generico = cand("person in office professional");
    const dental = cand("modern dental clinic reception with dentist chair");
    const bloco = formatCuratedImages("hero", [generico, dental], { segment: "odontologia", positioning: "clinica premium" });
    expect(bloco.indexOf("dental clinic")).toBeLessThan(bloco.indexOf("office professional"));
  });
});
