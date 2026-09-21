// Defesa em profundidade no FRONTEND: o runtime já bloqueia o contexto interno na
// origem (sanitizeUserFacing + thoughts), mas se algo escapar não pode ser exibido.
// Os blocos abaixo são instruções internas do agente — nunca conteúdo do usuário.
const MARKERS: RegExp[] = [
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
  /^\s*system\s*:/i,
  /^\s*developer\s*:/i,
];

/** Texto com características de contexto interno do agente (nunca user-facing). */
export function looksInternalContext(text: string): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  return t.split(/\r?\n/).some((line) => MARKERS.some((re) => re.test(line)));
}
