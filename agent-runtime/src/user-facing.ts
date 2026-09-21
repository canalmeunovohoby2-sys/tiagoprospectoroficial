// SEPARAÇÃO contexto interno × saída do usuário.
//
// Os blocos internos (IDIOMA, MEMÓRIA DE DECISÕES, CONVERSA RECENTE, DIREÇÃO
// CRIATIVA, AUTONOMIA TOTAL, ANEXOS…) são contexto para o modelo — NUNCA devem
// aparecer no chat. Aqui fica a barreira de SAÍDA (defesa em profundidade): a
// origem também é corrigida (prompt + rótulo do pedido atual), mas se o modelo
// ecoar o contexto, isto impede a exposição.

/** Marcadores de contexto interno que jamais podem ir ao usuário. */
export const INTERNAL_MARKERS = [
  /^\s*IDIOMA\s*\(obrigat[óo]rio\)/i,
  /^\s*MEM[ÓO]RIA DE DECIS[ÕO]ES/i,
  /^\s*CONVERSA RECENTE/i,
  /^\s*TRANSCRIPT DA CONVERSA/i,
  /^\s*DIREÇÃO CRIATIVA DESTE NEG[ÓO]CIO/i,
  /^\s*DIREÇÃO CRIATIVA\s*$/i,
  /^\s*AUTONOMIA TOTAL/i,
  /^\s*VELOCIDADE\s*\(/i,
  /^\s*ANEXOS DO USU[ÁA]RIO/i,
  /^\s*EDIÇÃO DE ASSET\s*\(/i,
  /^\s*MAPA\/LOCALIZAÇÃO EM EDIÇÃO/i,
  /^\s*INSTRUÇÃO DO USU[ÁA]RIO\s*:/i,
  /^\s*PEDIDO ATUAL\s*\(/i,
  /^\s*CONTEXTO DA EMPRESA\s*\(/i,
  /^\s*C[ÓO]DIGO INTEGRAL\s*:/i,
  /^\s*PROJETO REACT\s*\(obrigat[óo]rio/i,
  /^\s*system\s*:/i,
  /^\s*developer\s*:/i,
];

export function looksInternalContext(text: string): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  return t.split(/\r?\n/).some((line) => INTERNAL_MARKERS.some((re) => re.test(line)));
}

/** Remove parágrafos/linhas de contexto interno e devolve o texto do usuário.
 *  Se sobrar nada útil, retorna "" — o chamador responde com mensagem honesta. */
export function sanitizeUserFacing(text: string): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  const kept: string[] = [];
  let skipping = false;
  for (const line of raw.split(/\r?\n/)) {
    const isInternal = INTERNAL_MARKERS.some((re) => re.test(line));
    if (isInternal) { skipping = true; continue; }
    // Linha curta terminando com ":" logo após um bloco interno ainda é cabeçalho.
    if (skipping && /^\s*[-•]\s/.test(line) === false && line.trim().endsWith(":") && line.trim().length < 80) continue;
    skipping = false;
    kept.push(line);
  }
  const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out.length >= 8 ? out : "";
}

export const EMPTY_REPLY_FALLBACK = "Não consegui concluir essa resposta. Pode reformular o pedido?";
