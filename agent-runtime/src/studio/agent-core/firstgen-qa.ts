// CORREÇÃO Nº2 (auditoria) — QA visual OBRIGATÓRIO na primeira geração React.
// Ciclo mínimo: GERAR → BUILD/PREVIEW → QA REAL (Chromium) → [UMA rodada de
// correção com os problemas devolvidos ao agente] → QA FINAL → concluir.
// Sem loop infinito: no máximo 1 rodada de correção (2 verificações no total).
// A direção criativa do projeto continua soberana — o QA verifica EXECUÇÃO e
// qualidade, nunca impõe template (dark/glass/glow/paleta/estrutura fixa).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BusinessContext } from "../../tools.js";
import { objectiveFromInstruction, type VisualVerification } from "./visual-verify.js";

/** Limite rígido: UMA rodada de correção após o QA inicial (2 verificações). */
export const MAX_QA_CORRECTION_ROUNDS = 1;

export interface FirstGenQaResult {
  executed: boolean;
  pass: boolean;
  correctionRound: boolean;
  technicalFailure: string;
  final: VisualVerification | null;
}

/** Verdict é "pass" e não há erro crítico → QA aprovado. */
export function qaResultIsPass(v: VisualVerification): boolean {
  return v.verdict === "PASS" && v.criticalErrors.length === 0;
}

/** Problemas formatados para devolver ao agente (limite p/ manter o contexto curto). */
export function formatQaIssues(v: VisualVerification): string {
  return [...v.criticalErrors, ...v.problems].filter(Boolean).slice(0, 10).join("\n- ");
}

/**
 * Executa o ciclo de QA da primeira geração. Dependências injetadas (build e
 * verificação) para permitir teste sem Chromium. O agente só é chamado quando
 * o QA falha e ainda há rodada disponível.
 * LATÊNCIA (correção nº3): o build roda UMA vez; o segundo build só acontece
 * quando a rodada de correção ALTEROU arquivos (nunca build duplicado em vão).
 * `onStep` reporta a etapa REAL em andamento (sem progresso inventado).
 */
export async function runFirstGenQaCycle(opts: {
  root: string;
  instruction: string;
  business: BusinessContext;
  buildProject: (root: string) => Promise<{ ok: boolean; html?: string; error?: string }>;
  runVisualVerification: (input: { serveDir: string; objective: string }) => Promise<VisualVerification>;
  correctWithAgent: (issues: string) => Promise<boolean>;
  onStep?: (step: { phase: string; detail: string }) => void;
  /** Problemas estruturais DETERMINÍSTICOS detectados antes do QA (ex.: rascunho
   *  bootstrap ainda montado). Se houver, contam como falha e forçam a rodada
   *  de correção mesmo que o QA visual passe. */
  preCheck?: () => string[];
}): Promise<FirstGenQaResult> {
  const step = (phase: string, detail: string): void => {
    try { opts.onStep?.({ phase, detail }); } catch { /* noop */ }
  };
  const empty = (tech: string): FirstGenQaResult => ({ executed: true, pass: false, correctionRound: false, technicalFailure: tech, final: null });

  const objective = objectiveFromInstruction(opts.instruction, opts.business);
  let serveDir = "";
  try {
    const preIssues = (() => { try { return opts.preCheck?.() ?? []; } catch { return []; } })();
    // BUILD ÚNICO: serve para o QA inicial E (sem correção) para o final.
    step("preview", "Executando o preview do site…");
    const built = await opts.buildProject(opts.root);
    if (!built.ok || !built.html) return empty(built.error || "Falha ao compilar o projeto para verificação visual.");
    serveDir = mkdtempSync(join(tmpdir(), "prospector-qa-"));
    writeFileSync(join(serveDir, "index.html"), built.html, "utf8");

    step("validating", "Verificando o site em desktop, tablet e mobile…");
    const first = await opts.runVisualVerification({ serveDir, objective });
    if (qaResultIsPass(first) && preIssues.length === 0) return { executed: true, pass: true, correctionRound: false, technicalFailure: "", final: first };

    // QA falhou (ou rascunho determinístico detectado) → UMA rodada de correção.
    const issues = [...preIssues, formatQaIssues(first)].filter(Boolean);
    let correctionRound = false;
    try {
      correctionRound = await opts.correctWithAgent(issues.join("\n- "));
    } catch {
      correctionRound = false;
    }
    if (!correctionRound) return { executed: true, pass: false, correctionRound: false, technicalFailure: "", final: first };

    // Correção pode ter alterado arquivos → REBUILD (único caso de segundo build).
    step("visual_edit", "Aplicando os ajustes visuais da correção…");
    const rebuilt = await opts.buildProject(opts.root);
    if (!rebuilt.ok || !rebuilt.html) return empty(rebuilt.error || "Falha ao recompilar após a correção visual.");
    writeFileSync(join(serveDir, "index.html"), rebuilt.html, "utf8");

    step("validating", "Verificando novamente o site após os ajustes…");
    const second = await opts.runVisualVerification({ serveDir, objective });
    return { executed: true, pass: qaResultIsPass(second), correctionRound: true, technicalFailure: "", final: second };
  } catch (e) {
    return empty(e instanceof Error ? e.message : String(e));
  } finally {
    if (serveDir) { try { rmSync(serveDir, { recursive: true, force: true }); } catch { /* noop */ } }
  }
}
