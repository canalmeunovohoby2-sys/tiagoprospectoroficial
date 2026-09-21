// Raciocínio do agente exibido TEMPORARIAMENTE no chat (estilo Kilo Code / Cline).
//
// Os eventos `agent_interaction` do tipo "thought" são o PENSAMENTO real do agente
// (o que ele está analisando e pretendendo fazer). Aqui eles são isolados para um
// bloco recolhível: enquanto o agente trabalha o bloco fica aberto e crescendo; ao
// terminar, ele se recolhe e o que permanece na conversa é a RESPOSTA final.
//
// Módulo PURO (testável) — não depende de React.
//
// Título do bloco: "Raciocínio"/"Revisão do plano" — o conteúdo é o que o agente
// pensou (resumido), sem expor nomes de ferramentas nem passos internos.

import type { StudioInteractionItem, StudioThoughtItem } from "./interactions";
import { looksInternalContext } from "./internalContext";

const MAX_THOUGHT_CHARS = 1_200;

/** Pensamentos reais do agente, na ordem em que aconteceram (vazios descartados). */
export function thoughtsOf(items: StudioInteractionItem[] | undefined): StudioThoughtItem[] {
  return (items ?? []).filter(
    // Contexto interno NUNCA é exibido como pensamento (defesa em profundidade —
    // o runtime já bloqueia na origem).
    (i): i is StudioThoughtItem => i.kind === "thought" && !!i.content.trim() && !looksInternalContext(i.content),
  );
}

/** Normaliza um pensamento para exibição (uma linha longa vira parágrafo contínuo). */
export function normalizeThought(content: string, limit = MAX_THOUGHT_CHARS): string {
  const text = (content ?? "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

/** Rótulo do cabeçalho do bloco de raciocínio. */
export function reasoningLabel(streaming: boolean, count: number): string {
  if (streaming) return "Pensando…";
  if (count <= 0) return "Raciocínio";
  if (count === 1) return "Raciocínio";
  return `Raciocínio · ${count} etapas`;
}

/** Resumo curto para acessibilidade/aria. */
export function reasoningAriaLabel(streaming: boolean, count: number): string {
  return streaming
    ? "Raciocínio do agente em andamento"
    : `Raciocínio do agente (${count} ${count === 1 ? "etapa" : "etapas"}) — clique para expandir`;
}
