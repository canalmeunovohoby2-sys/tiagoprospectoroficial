import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// O bug real do chat ("4 min / 4 arquivos") vinha de ORCAMENTO CURTO. Aqui garantimos, por
// contrato estatico, que GERAR tem orcamento de geracao (tempo E iteracoes) e EDITAR segue curto:
// sem isso uma geracao completa (16 arquivos, medida em ~6m37s) e cortada no meio.
const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");

describe("orcamento de execucao · gerar x editar", () => {
  it("GERAR tem 15 min; EDITAR continua capado em 2 min", () => {
    expect(src).toContain("Math.max(baseTimeout, 900_000), 900_000)");
    expect(src).toContain("Math.min(baseTimeout, 120_000)");
    const i = src.indexOf("const baseTimeout");
    const bloco = src.slice(i, i + 400);
    expect(bloco).toContain('runKindEfetivo === "generate"');
  });

  it("GERAR recebe no minimo 80 iteracoes (EDITAR nao muda)", () => {
    expect(src).toContain("maxIterations: runKindEfetivo === \"generate\" ? Math.max(Number(body.maxIterations ?? 0), 80) : body.maxIterations");
  });

  it("o endpoint /generate tambem nao nasce com poucas iteracoes", () => {
    expect(src).toContain("GENERATE_MAX_ITERATIONS ?? 45");
  });
});

describe("primeira geracao · conclusao completa", () => {
  it("exige o site COMPLETO e limita o navegador a uma checagem curta", () => {
    const id = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8");
    expect(id).toContain("so finalize com o site COMPLETO");
    expect(id).toContain("nao use o navegador como etapa longa");
    expect(id).toContain("Nunca entregue meio site pedindo continuacao");
  });
});
describe("telemetria minima de geracao (só log)", () => {
  it("registra start, agent-ready e run-end com tempo/iteracoes/touched/qa", () => {
    const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(src).toContain('genTrace("start"');
    expect(src).toContain('genTrace("agent-ready"');
    expect(src).toContain('genTrace("run-end"');
    expect(src).toContain("runStartedAt");
  });
});