import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buscarUltimosRegistros,
  extrairResumoDoCodigo,
  montarContextoAntiRepeticao,
  salvarNoHistorico,
} from "../src/site-generator/anti-repetition";

// Integração do pacote `site-generator-pipeline`: o histórico por segmento é o que
// impede o modelo de convergir sempre para a mesma paleta/estrutura ("cara de IA").
let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pf-style-history-"));
  process.env.PROSPECTOR_STYLE_HISTORY = join(dir, "historico-sites.json");
});
afterEach(() => {
  delete process.env.PROSPECTOR_STYLE_HISTORY;
  rmSync(dir, { recursive: true, force: true });
});

const briefing = (primaria: string, headline: string, secoes: string[]) => ({
  paleta: { corPrimaria: primaria, corDestaque: "#F97316" },
  estiloVisual: { descricao: "editorial contemporâneo" },
  estruturaDeSecoes: secoes,
  promessaCentral: headline,
});

describe("anti-repetição · histórico de estilos", () => {
  it("sem histórico, liberdade total (e proíbe paleta default de framework)", () => {
    expect(montarContextoAntiRepeticao([])).toMatch(/liberdade total/i);
  });

  it("salva e devolve o resumo do MESMO segmento (sem vazar de outro)", () => {
    salvarNoHistorico("odontologia", briefing("#0F172A", "Sorriso planejado em 30 dias", ["hero", "especialidades", "contato"]));
    salvarNoHistorico("energia solar", briefing("#1E3A8A", "Economia real na conta de luz", ["hero", "economia"]));
    const odonto = buscarUltimosRegistros("odontologia");
    expect(odonto).toHaveLength(1);
    expect(odonto[0].headlineDoHero).toContain("Sorriso");
    expect(buscarUltimosRegistros("odontologia")[0].segmento).toBe("odontologia");
    expect(buscarUltimosRegistros("academia", 5, true).length).toBeGreaterThanOrEqual(2);
  });

  it("o contexto lista paleta/headline/seções e MANDA não repetir", () => {
    salvarNoHistorico("odontologia", briefing("#0F172A", "Sorriso planejado em 30 dias", ["hero", "especialidades"]));
    const ctx = montarContextoAntiRepeticao(buscarUltimosRegistros("odontologia"));
    expect(ctx).toMatch(/NÃO REPITA/i);
    expect(ctx).toContain("#0F172A");
    expect(ctx).toContain("Sorriso planejado em 30 dias");
    expect(ctx).toContain("hero > especialidades");
  });

  it("2 gerações seguidas do mesmo segmento mandam contextos DIFERENTES (anti-repetição real)", () => {
    const ctx1 = montarContextoAntiRepeticao(buscarUltimosRegistros("odontologia", 5));
    salvarNoHistorico("odontologia", briefing("#0F172A", "Sorriso planejado em 30 dias", ["hero", "especialidades"]));
    const ctx2 = montarContextoAntiRepeticao(buscarUltimosRegistros("odontologia", 5));
    expect(ctx1).not.toBe(ctx2);
    expect(ctx2).toContain("#0F172A");
  });

  it("extrai ART-DIRECTION e HEX do código realmente gerado", () => {
    const { artDirection, hexes } = extrairResumoDoCodigo({
      "src/App.tsx": `// ART-DIRECTION: odontologia premium, paleta mineral, hero assimétrico\nexport const c = "#0F172A";\nconst b = "#F97316";`,
    });
    expect(artDirection).toContain("odontologia premium");
    expect(hexes).toContain("#0f172a");
    expect(hexes).toContain("#f97316");
  });

  it("histórico corrompido/ausente não quebra (devolve vazio)", () => {
    expect(buscarUltimosRegistros("odontologia")).toEqual([]);
  });
});
