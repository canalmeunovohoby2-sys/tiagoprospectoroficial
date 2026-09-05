// Contexto conversacional para o agente edit-site (Conversational Design
// Intelligence). Monta um transcript intercalado usuário/assistente + memória
// curta de decisões, preservando referências ("essa seção", "a cor anterior",
// "mantém a hero") sem enviar contexto infinito ao modelo.
// Puro — testável no front.

export interface ChatTurnLike {
  role: "user" | "assistant";
  text: string;
}

const ROLE_LABEL: Record<ChatTurnLike["role"], string> = {
  user: "Usuário",
  assistant: "Assistente",
};

// Padrões de fala que indicam decisão/preferência — entram na memória curta.
const DECISION_PATTERNS = [
  /\bgostei\b/i,
  /\bgostei\b|\bamei\b/i,
  /\bnao\s*gostei\b|\bnão\s*gostei\b|\bodeio\b|\bremova\b|\btira\b/i,
  /\bmant[eê]m\b|\bmant[eê]nha\b|\bconserva\b|\bpreserva\b/i,
  /\baprovad[oa]\b|\bquero\b|\bprefiro\b|\bqueria\b/i,
  /\bdeixa\b|\bdeixar\b|\bmuda\b|\bcoloque\b/i,
  /\bmais\s+(premium|sóbrio|sobrio|escuro|claro|elegante|moderno|simples)\b/i,
  /\bmenos\b/i,
  /\bvolta\b|\bdesfaz\b|\banterior\b|\bantes\b/i,
  /\bmesmo\b|\bigual\b|\bna\s*mesma\s*linha\b/i,
];

export function isDecisionTurn(text: string): boolean {
  return DECISION_PATTERNS.some((re) => re.test(text));
}

// Monta o transcript a ser enviado ao agente.
// - Mantém as últimas MAX_TURNS mensagens (intercaladas usuário/assistente);
// - garante que a ÚLTIMA mensagem do usuário esteja presente;
// - corta texto longo por turno para caber no contexto.
export function buildConversationContext(messages: ChatTurnLike[], opts?: { maxTurns?: number; maxCharsPerTurn?: number }): string[] {
  const maxTurns = opts?.maxTurns ?? 12;
  const maxChars = opts?.maxCharsPerTurn ?? 700;
  const items = (messages ?? [])
    .filter((m) => typeof m?.text === "string" && m.text.trim().length > 0)
    .map((m) => ({ role: m.role, text: m.text.trim() }));

  // A última mensagem do usuário sempre fica no topo do contexto.
  const lastUserIdx = items.map((m) => m.role).lastIndexOf("user");
  const windowStart = Math.max(0, items.length - maxTurns);
  const sliceFrom = lastUserIdx >= 0 && lastUserIdx < windowStart ? lastUserIdx : windowStart;

  const windowed = items.slice(sliceFrom);
  return windowed.map((m) => {
    const body = m.text.length > maxChars ? m.text.slice(0, maxChars) + "…" : m.text;
    return `${ROLE_LABEL[m.role]}: ${body}`;
  });
}

// Memória curta de decisões/preferências do usuário nesta conversa.
// Serve como lembrete compacto ("usuário aprovou X", "usuário pediu mais X").
export function buildDesignMemory(messages: ChatTurnLike[], opts?: { max?: number; maxChars?: number }): string[] {
  const max = opts?.max ?? 4;
  const maxChars = opts?.maxChars ?? 240;
  const notes: string[] = [];
  for (const m of messages ?? []) {
    if (m.role !== "user") continue;
    if (!isDecisionTurn(m.text)) continue;
    const body = m.text.length > maxChars ? m.text.slice(0, maxChars) + "…" : m.text;
    if (!notes.includes(body)) notes.push(body);
  }
  return notes.slice(-max);
}
