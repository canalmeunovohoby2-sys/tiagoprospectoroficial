// Mensagem amigável para erros do provedor de IA / runtime de geração.
// Compartilhado entre a página do projeto e a API de site projects para que
// erros NUNCA sejam mascarados (antes havia uma referência quebrada).
export function friendlyAiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();
  if (/non-2xx|edge function returned|http 5\d\d|503|529/.test(lower)) {
    return "O serviço de IA está temporariamente ocupado. Nada foi alterado — tente novamente em instantes.";
  }
  if (/429|quota|rate_limit|limite de uso/.test(lower)) {
    return "Atingimos o limite temporário de uso da IA. Nada foi alterado — tente novamente em alguns instantes.";
  }
  if (/timeout|tempo limite|took too long/.test(lower)) {
    return "A IA demorou demais para responder. Nada foi alterado — tente novamente.";
  }
  if (/fetch|network|connection|ssl|tls|cerificado|dns|resolve|enospc|.buffer|out of memory|heap|insufficient memory/i.test(lower)) {
    return "Não foi possível conectar ao servidor de geração. Verifique sua conexão e tente novamente em instantes.";
  }
  if (raw.length > 200) return `Erro: ${raw.slice(0, 120)}…`;
  return raw;
}
