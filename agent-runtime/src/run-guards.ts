// Guardas de execução determinísticos (sem confiar só no prompt).
//
// O agente chegava a "responder" a um pedido de alteração sem tocar em nenhum
// arquivo (só list_files/get_site_context) e finalizava — com a resposta em inglês.
// Aqui fica a decisão pura de exigir UMA rodada de edição forçada (sem loop).

/** O pedido era uma ALTERAÇÃO (não conversa) e nada foi alterado? */
export function needsForcedEdit(runKind: string, touchedCount: number): boolean {
  return (runKind === "edit" || runKind === "generate") && touchedCount === 0;
}

/** Instrução curta e imperativa usada na rodada forçada (pt-BR, ação, escopo mínimo). */
export const FORCED_EDIT_INSTRUCTION =
  "VOCÊ NÃO ALTEROU NENHUM ARQUIVO e o usuário pediu uma ALTERAÇÃO. " +
  "Faça AGORA, em português do Brasil: (1) localize o arquivo certo com read_file; " +
  "(2) ALTERE o código com edit_file/write_file atendendo EXATAMENTE ao pedido, mexendo só no necessário; " +
  "(3) confirme o que mudou com finish_task. Responder sem editar é falha.";
