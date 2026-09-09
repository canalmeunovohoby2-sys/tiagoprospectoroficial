// Mockup orchestrator (6.10) — decide COMO uma identidade é apresentada em
// mockups (plano contextual, não-fixo), seleciona templates production-ready e
// executa as aplicações disponíveis, isolando falhas. Mesmo motor (mockup-library
// + mockup-apply). Nunca fabrica alternativa quando não há mockup adequado.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findMockupCandidates, diverseCandidates, isProductionReady, scoreMockup, type MockupTemplate, type MockupTarget, type MockupCategory, type MockupCriteria } from "./mockup-library.js";
import { applyBrandToMockup, type ApplyData } from "./mockup-apply.js";

export interface AppIntent { target: MockupTarget; category: MockupCategory; priority: number; count: number; justification: string; }
export interface ApplicationPlan { brandName: string; intents: AppIntent[]; }

/** Plano CONTEXTUAL (não lista fixa): deriva aplicações a partir do negócio. */
export function buildApplicationPlan(ctx: { brandName?: string; segment?: string }): ApplicationPlan {
  const seg = String(ctx?.segment ?? "").toLowerCase();
  const brandName = ctx?.brandName ?? "Marca";
  const has = (...words: string[]) => words.some((w) => seg.includes(w));
  let intents: AppIntent[] = [];
  if (has("restauran", "bar", "café", "cafe", "gastronom", "comida")) {
    intents = [
      { target: "facade", category: "signage", priority: 1, count: 1, justification: "fachada para a identidade da casa" },
      { target: "packaging", category: "packaging", priority: 2, count: 1, justification: "embalagem para delivery/retirada" },
      { target: "shirt", category: "uniforms", priority: 3, count: 1, justification: "uniforme da equipe" },
      { target: "business_card", category: "stationery", priority: 4, count: 1, justification: "cartão para clientes" },
      { target: "social", category: "social", priority: 5, count: 1, justification: "post de divulgação" },
    ];
  } else if (has("academ", "fitness", "muscul")) {
    intents = [
      { target: "shirt", category: "uniforms", priority: 1, count: 1, justification: "uniforme/dry-fit da academia" },
      { target: "bag", category: "packaging", priority: 2, count: 1, justification: "sacola/kit do aluno" },
      { target: "social", category: "social", priority: 3, count: 1, justification: "post de treino/matrícula" },
      { target: "digital", category: "digital", priority: 4, count: 1, justification: "tela/app" },
    ];
  } else {
    intents = [
      { target: "business_card", category: "stationery", priority: 1, count: 1, justification: "identidade em papelaria" },
      { target: "social", category: "social", priority: 2, count: 1, justification: "presença digital" },
      { target: "facade", category: "signage", priority: 3, count: 1, justification: "sinalização da empresa" },
    ];
  }
  return { brandName, intents };
}

export interface PlannedApplication {
  intent: AppIntent;
  template: MockupTemplate | null;
  status: "ready" | "unavailable" | "incompatible";
  reason?: string;
}

export interface PlanOptions {
  /** Determina se um template está production-ready (license + asset presente). */
  isReady?: (t: MockupTemplate) => boolean;
  /** Requer uma área de aplicação conhecida (sem inventar coords). */
  requireArea?: boolean;
}

export function planMockupApplications(plan: ApplicationPlan, templates: MockupTemplate[], opts: PlanOptions = {}): PlannedApplication[] {
  const isReady = opts.isReady ?? ((t) => isProductionReady(t, true));
  const used = new Set<string>();
  return plan.intents.map((intent) => {
    let cands = findMockupCandidates(templates, { category: intent.category, target: intent.target } as MockupCriteria);
    cands = cands.filter((t) => isReady(t));
    if (opts.requireArea) cands = cands.filter((t) => !!(t as MockupTemplate & { applicationArea?: unknown }).applicationArea);
    if (!cands.length) return { intent, template: null, status: "unavailable", reason: "sem mockup production-ready compatível" };
    let chosen = diverseCandidates(cands, { category: intent.category, target: intent.target }, used)[0] ?? cands[0];
    used.add(chosen.id);
    return { intent, template: chosen, status: "ready" };
  });
}

export interface MockupApplicationResult {
  application: { target: MockupTarget; category: MockupCategory; justification: string };
  templateId: string | null;
  outputPath?: string;
  status: "applied" | "validated" | "unsupported" | "failed" | "unavailable";
  method?: string;
  width?: number;
  height?: number;
  error?: string;
  validations?: string[];
}

export interface RunOptions { brandSvg: string; assetsRoot: string; workspaceDir: string; isReady?: (t: MockupTemplate) => boolean; }

/** Executa o plano: para cada aplicação pronta, renderiza; falha isolada não interrompe. */
export async function runApplicationPipeline(plan: ApplicationPlan, templates: MockupTemplate[], opts: RunOptions): Promise<MockupApplicationResult[]> {
  const planned = planMockupApplications(plan, templates, { isReady: opts.isReady ?? ((t) => isProductionReady(t, true)), requireArea: true });
  const results: MockupApplicationResult[] = [];
  for (const p of planned) {
    const base = { application: { target: p.intent.target, category: p.intent.category, justification: p.intent.justification }, templateId: p.template?.id ?? null };
    if (p.status !== "ready" || !p.template) {
      results.push({ ...base, status: "unavailable", error: p.reason });
      continue;
    }
    const t = p.template;
    const templateArea = (t as MockupTemplate & { applicationArea?: unknown }).applicationArea;
    const assetPath = join(opts.assetsRoot, t.asset.path);
    try {
      const out: ApplyData = await applyBrandToMockup(
        { brandSvg: opts.brandSvg, template: t, assetPath, applicationArea: templateArea as never },
        { render: true, workspaceDir: opts.workspaceDir },
      );
      results.push({ ...base, outputPath: out.outputPath, status: out.status === "validated" ? "validated" : out.status, method: out.method, width: out.width, height: out.height, error: out.error, validations: out.validations });
    } catch (e) {
      results.push({ ...base, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
