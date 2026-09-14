// Utilitários de diff do Studio (Fase 6). Puros — usados pelo diálogo de
// histórico para gerar patch unificado e contagens de linhas a partir de dois
// conteúdos (original vs modificado).

import { createTwoFilesPatch } from "diff";

export interface UnifiedDiffResult {
  patch: string;
  additions: number;
  deletions: number;
  changed: boolean;
}

/** Gera um patch unificado (contexto 3) e conta linhas adicionadas/removidas. */
export function buildUnifiedDiff(before: string, after: string, filePath: string): UnifiedDiffResult {
  const original = before ?? "";
  const modified = after ?? "";
  if (original === modified) return { patch: "", additions: 0, deletions: 0, changed: false };
  const patch = createTwoFilesPatch(
    filePath,
    filePath,
    original,
    modified,
    "antes",
    "depois",
    { context: 3 },
  );
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { patch, additions, deletions, changed: true };
}

/** Resumo curto "+X −Y" (ou "sem alterações"). */
export function diffSummary(additions: number, deletions: number): string {
  if (additions === 0 && deletions === 0) return "sem alterações";
  return `+${additions} −${deletions}`;
}
