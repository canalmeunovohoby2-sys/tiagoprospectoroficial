// CODER do Site Studio.
//
// O Coder é a EXECUÇÃO REAL. Não é um agente novo: delega ao ProspectorSiteAgent
// (Cline) já validado — com as ferramentas reais do projeto e TODOS os guards
// existentes (completion/regression/scope/work-evidence/visual). O módulo aqui
// apenas monta o prompt de execução (com o plano do Planner, quando houver) e
// define o contrato de sinais de controle.
//
// Sinais de controle (contrato DaveLovable):
//   DELEGATE_TO_PLANNER — o executor precisa de uma nova estratégia.
//   SUBTASK_DONE        — o passo atual do plano foi concluído.
//   TERMINATE           — não há mais trabalho.

export interface StudioCoderPromptInput {
  instruction: string;
  /** Blocos de contexto já montados pelo runtime (memória, conversa, anexos). */
  contextPrefix?: string;
  /** Plano estruturado do Planner (quando a rota passou pelo Planner). */
  plan?: string | null;
  /** Feedback/resultado anterior quando o Coder pediu replanejamento. */
  feedback?: string;
  /** Caminhos reais do projeto (estrutura; NÃO os conteúdos). */
  projectFiles?: string[];
}

export const STUDIO_CODER_SIGNALS = `SINAIS DE CONTROLE:
- Quando concluir TODOS os passos do plano, finalize com a ferramenta finish_task.
- Se precisar de uma NOVA estratégia (o plano não cobre o necessário), escreva DELEGATE_TO_PLANNER na sua resposta e explique o motivo — o Planner será acionado novamente.
- Após concluir um passo intermediário, indique SUBTASK_DONE.
- Não invente sucesso: só finalize depois de aplicar e verificar de verdade.`;

export function buildStudioCoderPrompt(input: StudioCoderPromptInput): string {
  const parts: string[] = [];
  if (input.contextPrefix) parts.push(input.contextPrefix);

  // Estrutura do projeto (Fase 3): o Coder sabe os CAMINHOS reais sem receber o
  // conteúdo de todos os arquivos — economiza contexto e ancora as edições.
  if (input.projectFiles?.length) {
    const shown = input.projectFiles.slice(0, 80);
    const rest = input.projectFiles.length - shown.length;
    parts.push(
      `\n[ESTRUTURA DO PROJETO — caminhos reais; use read_file/grep_search/glob_search para o conteúdo]\n${shown.map((f) => `- ${f}`).join("\n")}${rest > 0 ? `\n- …(+${rest} arquivo(s))` : ""}\n`,
    );
  }

  if (input.plan && input.plan.trim()) {
    parts.push(`\n[PLANO DO PLANNER — execute na ordem, usando as ferramentas reais do projeto]\n${input.plan.trim()}\n`);
  }
  if (input.feedback && input.feedback.trim()) {
    parts.push(`\n[RESULTADO ANTERIOR — reavalie antes de continuar]\n${input.feedback.trim()}\n`);
  }
  parts.push(`\n${input.instruction}`);
  parts.push(`\n\n${STUDIO_CODER_SIGNALS}`);
  return parts.join("");
}
