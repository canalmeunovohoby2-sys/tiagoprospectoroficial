// FASE 7.2 — GUARDA DO AUTOSAVE (pura e testável).
//
// PROBLEMA: o autosave do front grava direto no banco (`updateGeneratedCode`). Um
// snapshot capturado ANTES de uma geração pode chegar depois e sobrescrever
// `generated_code` com o RASCUNHO — mesmo com a geração tendo dado certo.
//
// SOLUÇÃO (sem novo sistema de revisão): quando o runtime aplica arquivos novos,
// guardamos o valor ANTERIOR de cada arquivo que ele mudou. No autosave, se algum
// desses arquivos voltou exatamente ao valor antigo, o snapshot é ANTIGO e é
// rejeitado. Edições REAIS do usuário (valor novo, diferente do antigo) passam.

export type RuntimeChangeMap = Map<string, string>;

/** Registra, para cada arquivo alterado pelo runtime, o valor ANTERIOR. */
export function recordRuntimeChange(
  before: Record<string, string> | null | undefined,
  after: Record<string, string> | null | undefined,
  target: RuntimeChangeMap,
): RuntimeChangeMap {
  const b = before ?? {};
  const a = after ?? {};
  target.clear();
  for (const [path, value] of Object.entries(a)) {
    if (b[path] !== value) target.set(path, b[path] ?? "");
  }
  return target;
}

export interface StaleCheck {
  /** O snapshot parece ANTERIOR ao trabalho do runtime? */
  stale: boolean;
  /** Arquivos que voltariam ao estado antigo (sobrescrevendo o runtime). */
  revertedFiles: string[];
}

/**
 * O snapshot que o autosave quer gravar REVERTE alguma mudança do runtime?
 * (Só isso é bloqueado — edições novas do usuário continuam sendo salvas.)
 */
export function detectStaleSnapshot(
  filesToSave: Record<string, string> | null | undefined,
  runtimeChange: RuntimeChangeMap | null | undefined,
): StaleCheck {
  const revertedFiles: string[] = [];
  if (!runtimeChange || runtimeChange.size === 0) return { stale: false, revertedFiles };
  const files = filesToSave ?? {};
  for (const [path, previous] of runtimeChange) {
    if ((files[path] ?? "") === previous) revertedFiles.push(path);
  }
  return { stale: revertedFiles.length > 0, revertedFiles };
}
