// FASE 5.1 — INSTRUMENTAÇÃO DE PERFORMANCE (reutilizável, custo ~0).
//
// Mede o fluxo REAL de abrir um projeto React e chegar ao Preview:
//   T0 entrada no projeto → T1 dados carregados → T2 Studio montado →
//   T3 WebContainer solicitado → T4 boot pronto → T5 arquivos montados →
//   T6 dependências prontas → T7 Vite rodando → T8 Preview visível.
//
// Uso no console do navegador:
//   __prospectorPerf()      → tabela com deltas e total por etapa
//   __prospectorPerf.reset()→ limpa as marcas
//
// Nada aqui altera comportamento: sem `window` (testes/SSR) guarda só em memória.

export const PERF = {
  T0: "T0-entrada-projeto",
  T1: "T1-dados-projeto",
  T2: "T2-studio-montado",
  T3: "T3-webcontainer-solicitado",
  T4: "T4-webcontainer-pronto",
  T5: "T5-arquivos-montados",
  T6: "T6-dependencias-prontas",
  T7: "T7-vite-rodando",
  T8: "T8-preview-visivel",
} as const;

export type PerfMarkName = (typeof PERF)[keyof typeof PERF] | string;

export interface PerfMark {
  name: string;
  /** timestamp absoluto (performance.now quando disponível). */
  at: number;
  /** ms desde a marca anterior. */
  deltaMs: number;
  /** ms desde a primeira marca. */
  totalMs: number;
  detail?: Record<string, unknown>;
}

const marks: PerfMark[] = [];

function now(): number {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  } catch { /* noop */ }
  return Date.now();
}

/** Registra uma etapa (idempotente por nome: a primeira ocorrência vence). */
export function markPerf(name: PerfMarkName, detail?: Record<string, unknown>): void {
  if (!name) return;
  if (marks.some((m) => m.name === name)) return; // não duplicar em re-render
  const at = now();
  const prev = marks[marks.length - 1];
  const first = marks[0];
  marks.push({
    name,
    at,
    deltaMs: prev ? Math.round((at - prev.at) * 10) / 10 : 0,
    totalMs: first ? Math.round((at - first.at) * 10) / 10 : 0,
    detail,
  });
  expose();
}

export function getPerfSummary(): PerfMark[] {
  return marks.map((m) => ({ ...m }));
}

export function resetPerf(): void {
  marks.length = 0;
  expose();
}

function expose(): void {
  try {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __prospectorPerf?: (() => PerfMark[]) & { reset?: () => void } };
    const fn = (() => getPerfSummary()) as (() => PerfMark[]) & { reset?: () => void };
    fn.reset = () => resetPerf();
    w.__prospectorPerf = fn;
  } catch { /* ambiente sem window */ }
}
