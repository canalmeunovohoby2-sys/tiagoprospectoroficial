import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runFirstGenQaCycle, qaResultIsPass, formatQaIssues, MAX_QA_CORRECTION_ROUNDS } from "../src/studio/agent-core/firstgen-qa";
import type { VisualVerification } from "../src/studio/agent-core/visual-verify";

const v = (over: Partial<VisualVerification> = {}): VisualVerification => ({
  verdict: "PASS", objective: "x", viewports: [], problems: [], cssLeftovers: [], brokenElements: 0,
  criticalErrors: [], screenshots: [], report: "", ...over,
});

const okBuild = async () => ({ ok: true, html: "<html><div id=root></div></html>" });

describe("firstGen QA · ciclo obrigatório (sem Chromium — dependências injetadas)", () => {
  it("QA passa → executado, sem rodada de correção", async () => {
    let verifies = 0;
    const r = await runFirstGenQaCycle({ root: "/w", instruction: "Crie o site", business: {} as never, buildProject: okBuild, runVisualVerification: async () => { verifies++; return v({}); }, correctWithAgent: async () => false });
    expect(r.executed).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.correctionRound).toBe(false);
    expect(verifies).toBe(1);
  });

  it("QA falha → devolve problemas ao agente → UMA rodada → QA final passa", async () => {
    let verifies = 0;
    const calls: string[] = [];
    const r = await runFirstGenQaCycle({
      root: "/w", instruction: "Crie o site", business: {} as never, buildProject: okBuild,
      runVisualVerification: async () => { verifies++; return verifies === 1 ? v({ verdict: "FAIL", criticalErrors: ["overflow horizontal no mobile"] }) : v({}); },
      correctWithAgent: async (issues) => { calls.push(issues); return true; },
    });
    expect(r.correctionRound).toBe(true);
    expect(r.pass).toBe(true);
    expect(verifies).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("overflow horizontal no mobile");
  });

  it("NÃO entra em loop: mesmo sempre falhando, no máx. 2 verificações e 1 correção", async () => {
    let verifies = 0;
    let corrections = 0;
    const r = await runFirstGenQaCycle({
      root: "/w", instruction: "x", business: {} as never, buildProject: okBuild,
      runVisualVerification: async () => { verifies++; return v({ verdict: "FAIL", criticalErrors: ["a"] }); },
      correctWithAgent: async () => { corrections++; return true; },
    });
    expect(MAX_QA_CORRECTION_ROUNDS).toBe(1);
    expect(verifies).toBe(2);
    expect(corrections).toBe(1);
    expect(r.pass).toBe(false);
    expect(r.correctionRound).toBe(true);
  });

  it("falha técnica do QA não é sucesso silencioso", async () => {
    const r = await runFirstGenQaCycle({
      root: "/w", instruction: "x", business: {} as never,
      buildProject: async () => { throw new Error("build quebrado"); },
      runVisualVerification: async () => v({}),
      correctWithAgent: async () => true,
    });
    expect(r.executed).toBe(true);
    expect(r.pass).toBe(false);
    expect(r.technicalFailure).toContain("build quebrado");
  });

  it("qaResultIsPass exige PASS sem erros críticos", () => {
    expect(qaResultIsPass(v({}))).toBe(true);
    expect(qaResultIsPass(v({ verdict: "FAIL" }))).toBe(false);
    expect(qaResultIsPass(v({ criticalErrors: ["x"] }))).toBe(false);
    expect(formatQaIssues(v({ criticalErrors: ["a"], problems: ["b"] }))).toContain("a");
  });

  it("LATÊNCIA · QA aprovado executa build UMA única vez (sem build duplicado)", async () => {
    let builds = 0;
    const r = await runFirstGenQaCycle({ root: "/w", instruction: "x", business: {} as never, buildProject: async () => { builds++; return { ok: true, html: "<html></html>" }; }, runVisualVerification: async () => v({}), correctWithAgent: async () => true });
    expect(r.pass).toBe(true);
    expect(builds).toBe(1);
  });

  it("LATÊNCIA · segundo build SÓ quando a correção alterou arquivos", async () => {
    let builds = 0;
    let verifies = 0;
    const r = await runFirstGenQaCycle({
      root: "/w", instruction: "x", business: {} as never,
      buildProject: async () => { builds++; return { ok: true, html: "<html></html>" }; },
      runVisualVerification: async () => { verifies++; return verifies === 1 ? v({ verdict: "FAIL", criticalErrors: ["a"] }) : v({}); },
      correctWithAgent: async () => true,
    });
    expect(r.pass).toBe(true);
    expect(builds).toBe(2); // 1 inicial + 1 pós-correção (nunca mais que isso)
    expect(verifies).toBe(2);
  });

  it("LATÊNCIA · onStep reporta etapas REAIS na ordem (preview → validação → ajuste → revalidação)", async () => {
    const steps: string[] = [];
    let verifies = 0;
    await runFirstGenQaCycle({
      root: "/w", instruction: "x", business: {} as never,
      buildProject: async () => ({ ok: true, html: "<html></html>" }),
      runVisualVerification: async () => { verifies++; return verifies === 1 ? v({ verdict: "FAIL", criticalErrors: ["a"] }) : v({}); },
      correctWithAgent: async () => true,
      onStep: (s) => steps.push(`${s.phase}:${s.detail}`),
    });
    expect(steps[0]).toContain("preview");
    expect(steps.some((s) => s.startsWith("validating"))).toBe(true);
    expect(steps.some((s) => s.startsWith("visual_edit"))).toBe(true);
  });

  it("preCheck determinístico (rascunho montado) força a correção mesmo com QA visual passando", async () => {
    let verifies = 0;
    const calls: string[] = [];
    const r = await runFirstGenQaCycle({
      root: "/w", instruction: "x", business: {} as never, buildProject: okBuild,
      runVisualVerification: async () => { verifies++; return verifies === 1 ? v({}) : v({}); },
      correctWithAgent: async (issues) => { calls.push(issues); return true; },
      preCheck: () => ["src/App.tsx ainda é o RASCUNHO bootstrap"],
    });
    expect(r.correctionRound).toBe(true);
    expect(calls[0]).toContain("RASCUNHO");
    expect(verifies).toBe(2);
  });

  it("fiação no servidor: QA só em firstGen React, com ressalva e payload honestos", () => {
    const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(src).toContain('runKind === "generate" && firstGen && !timedOut');
    expect(src).toContain("runFirstGenQaCycle");
    expect(src).toContain("⚠ Ressalva");
    expect(src).toContain("qa: { executed: firstGenQa.executed");
    // ROBUSTEZ: retry determinístico e limitado (UMA retomada) em falha do provider.
    expect(src).toContain("Provedor instável — retomando a execução…");
    expect(src).toContain("outcome = await oldAgent.runTask(mission, { continueSession: true });");
  });
});
