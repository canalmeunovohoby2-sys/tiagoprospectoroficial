// ROUTER do Site Studio.
//
// Decide se o pedido vai DIRETO ao Coder (edição pontual) ou passa pelo Planner
// (tarefa complexa/multietapa). Reproduz o CONTRATO do DaveLovable
// (`[VISUAL EDIT]`/`[BUG FIX]`/edição cirúrgica → Coder; demais → Planner), mas
// reaproveita os detetores já validados do Prospector em vez de reinventar
// heurísticas frágeis: `isBugReport`, `requestsFramingFix`, `isSurgicalEditTask`.

import { isSurgicalEditTask } from "../prospector-site-agent.js";
import { isBugReport } from "../completion-guard.js";
import { requestsFramingFix } from "../regression-guard.js";

export type StudioRoute = "coder" | "planner";

export interface StudioRouteSignal {
  kind: string;
  detail?: string;
}

export interface StudioRouteDecision {
  route: StudioRoute;
  reason: string;
  signals: StudioRouteSignal[];
}

const VISUAL_EDIT_RE = /^\s*\[(?:visual edit|visual|edi[çc][ãa]o visual|bug fix|fix)\]/i;

const STRATEGY_RE =
  /(estrat[eé]gia|planejamento|repens(?:e|ar)|reconsider|dire[çc][ãa]o criativa|revis(?:e|ar|ão)\s+(?:o\s+)?site|site inteiro|p[aá]gina inteira|todas as se[çc][õo]es|v[aá]rias se[çc][õo]es|reorganiz)/i;

const REBUILD_RE =
  /(refa[çc]a|refazer|reconstru|redesenhe|redesenhar|repense|transforme|reimagina|reestruture|do zero|novo layout|nova vers[aã]o|novo site)/i;

const CHAIN_RE =
  /(,\s*e\s+(?:tamb[eé]m\s+)?(?:adicione|crie|coloque|troque|altere|remova|ajuste|melhore|corrija)|\bdepois\b[^.]*\b(?:adicione|crie|coloque|troque|altere|remova|ajuste|melhore)|e\s+tamb[eé]m\b[^.]*\b(?:adicione|crie|coloque|troque|altere|remova|ajuste|melhore))/i;

const IMPERATIVE_RE =
  /\b(adicione|crie|coloque|troque|altere|remova|ajuste|melhore|corrija|mude|deixe|inclua|reorganize|escreva|revise|redesenhe|refa[çc]a|reconstrua|transforme)\b/gi;

/** Mede complexidade APENAS como sinal estrutural (não como única fonte). */
export function assessStudioComplexity(instruction: string): { complex: boolean; signals: StudioRouteSignal[] } {
  const text = String(instruction ?? "").trim();
  const signals: StudioRouteSignal[] = [];
  if (!text) return { complex: false, signals };
  const imperatives = text.match(IMPERATIVE_RE) ?? [];
  if (imperatives.length >= 3) signals.push({ kind: "multi_action", detail: `${imperatives.length} ações distintas` });
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (sentences.length >= 3) signals.push({ kind: "long_request", detail: "pedido longo com múltiplas etapas" });
  if (STRATEGY_RE.test(text)) signals.push({ kind: "strategy", detail: "estratégia/escopo amplo" });
  if (REBUILD_RE.test(text)) signals.push({ kind: "rebuild", detail: "reconstrução/redesenho" });
  if (CHAIN_RE.test(text)) signals.push({ kind: "chained", detail: "ações encadeadas" });
  return { complex: signals.length > 0, signals };
}

/**
 * Decide o caminho da execução. Determinístico e auditável (a decisão e os
 * sinais são emitidos como `agent_interaction` no stream).
 */
export function routeStudioTask(input: { instruction: string; mode?: "edit" | "generate" }): StudioRouteDecision {
  const text = String(input.instruction ?? "").trim();
  if (!text) {
    return { route: "coder", reason: "Sem instrução: Coder direto.", signals: [] };
  }

  // Geração inicial usa pipeline dedicada (/generate) — aqui rota direta.
  if (input.mode === "generate") {
    return { route: "coder", reason: "Geração usa o pipeline dedicado.", signals: [{ kind: "generate" }] };
  }

  // Contrato de sinais explícitos do DaveLovable.
  if (VISUAL_EDIT_RE.test(text)) {
    return { route: "coder", reason: "Sinal explícito de edição visual/bug: Coder direto.", signals: [{ kind: "explicit_signal" }] };
  }

  // Detetores já validados no Prospector (mais robustos que palavra-chave).
  if (isBugReport(text)) {
    return { route: "coder", reason: "Defeito reproduzível: correção direta no Coder.", signals: [{ kind: "bug" }] };
  }

  // COMPLEXIDADE antes de "framing/cirúrgica": um redesenho amplo pode citar
  // "inteiro" ou uma imagem e NÃO deve ser tratado como ajuste pontual.
  const complexity = assessStudioComplexity(text);
  if (complexity.complex) {
    return {
      route: "planner",
      reason: "Tarefa complexa/multietapa: Planner decompõe antes do Coder executar.",
      signals: complexity.signals,
    };
  }

  if (requestsFramingFix(text)) {
    return { route: "coder", reason: "Ajuste de enquadramento/imagem: Coder direto.", signals: [{ kind: "framing" }] };
  }

  if (isSurgicalEditTask(text)) {
    return { route: "coder", reason: "Edição pontual (cirúrgica): Coder direto.", signals: [{ kind: "surgical" }] };
  }

  // Consulta/análise simples: mantém Coder direto (o agente de edição responde
  // sem alterar arquivos e a conclusão é verificada pelos guards existentes).
  return { route: "coder", reason: "Edição direta (sem necessidade de plano).", signals: [] };
}
