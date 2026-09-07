// Estratégia segura de contexto: o transcript completo da conversa é persistido,
// mas ao reconstruir o initialMessages para o Cline Agent nunca enviamos
// histórico ilimitado. Cortamos em fronteira de TURNO (mensagem do usuário),
// preservando trocas completas usuário→assistant→tools→resultado — assim a
// continuação ("agora deixa azul", "essa seção") não perde o turno anterior.

export interface ConversationMessageLike {
  role?: unknown;
  tool_calls?: unknown;
  tool_call_id?: unknown;
  [k: string]: unknown;
}

export const DEFAULT_MAX_MESSAGES = 60;

function roleOf(m: unknown): unknown {
  if (m && typeof m === "object" && "role" in m) return (m as Record<string, unknown>).role;
  return undefined;
}

function hasToolCalls(m: unknown): boolean {
  if (m && typeof m === "object" && "tool_calls" in m) {
    const tc = (m as Record<string, unknown>).tool_calls;
    return Array.isArray(tc) && tc.length > 0;
  }
  return false;
}

/**
 * Retorna a janela final de mensagens para enviar ao modelo.
 * - mensagens <= maxMessages → retorna todas;
 * - acima disso → corta no início da mensagem de role "user" mais próxima do
 *   fim (fronteira natural de turno), garantindo que nenhuma sequência de
 *   tool_calls fique órfã;
 * - se não houver fronteira user na janela, recua até um assistant SEM
 *   tool_calls (fim de turno limpo); se nem isso, corta no tamanho máximo.
 */
export function trimConversationWindow(
  messages: unknown[] | null | undefined,
  maxMessages = DEFAULT_MAX_MESSAGES,
): ConversationMessageLike[] {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= maxMessages) return messages as ConversationMessageLike[];

  // Corta no máximo, mas garante incluir a última mensagem.
  let start = messages.length - maxMessages;

  // 1) Fronteira ideal: próxima mensagem de usuário (novo turno) dentro da janela.
  let userBoundary = -1;
  for (let i = start; i < messages.length; i++) {
    if (roleOf(messages[i]) === "user") { userBoundary = i; break; }
  }
  if (userBoundary >= 0) return messages.slice(userBoundary) as ConversationMessageLike[];

  // 2) Fallback: recua até um assistant sem tool_calls (fim de turno limpo).
  for (let i = start - 1; i >= 0; i--) {
    const m = messages[i];
    const isAssistant = roleOf(m) === "assistant";
    if (isAssistant && !hasToolCalls(m) && !("tool_call_id" in (m && typeof m === "object" ? (m as Record<string, unknown>) : {}))) {
      return messages.slice(i) as ConversationMessageLike[];
    }
  }

  // 3) Último recurso: corta no tamanho máximo.
  return messages.slice(start) as ConversationMessageLike[];
}
