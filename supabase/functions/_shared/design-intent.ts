// Design Intent — heurísticas puras que orientam o comportamento do AGENTE
// (não um chatbot): amplitude do pedido, referências contextuais e sinais de
// objetivo amplo. Usado pelo edit-site (ciclo autônomo) e testável no front.

export type RequestAmplitude = "surgical" | "broad";

// Sinais de pedido AMPLO = ordem de trabalho completa ("deixa premium",
// "melhora tudo", "site primeiro mundo"). Disparam o ciclo autônomo
// (análise → plano → múltiplas mudanças → auto-crítica → refinamento).
const BROAD_PATTERNS: RegExp[] = [
  /(deixa|deixar|deixe|fica|deix[ea]|est[aá]|quer[eo]|preciso)\s+(mais|bem|tudo|todo|realmente)/i,
  /mais\s+(premium|profissional|sofisticad[oa]|elegante|modern[oa]|bonit[oa]|top|chique|refinad[oa]|impactante|atraente|convers[ií]vel|digno|nobre|caprichad[oa])/i,
  /primeiro\s+mundo|world[- ]class|high[- ]end|alto\s+padr[ãa]o|padr[ãa]o\s+alto/i,
  /melhora\s+(tudo|o\s+site|geral|a\s+p[aá]gina|o\s+design|a\s+aparencia|a\s+apar[eê]ncia|os\s+cards|o\s+hero)|melhorar\s+(tudo|geral|o\s+site)/i,
  /reformul|redesign|refina\s+(tudo|geral|o\s+site|o\s+design|a\s+composi[cç][aã]o)|refinar\s+(tudo|geral|o\s+site)/i,
  /d[aá]\s+um\s+upgrade|turbina|aprimora\s+(tudo|o\s+site|o\s+design|a\s+p[aá]gina)/i,
  /n[aã]o\s+est[aá]\s+(bom|premium|profissional|legal|bonito)|est[aá]\s+(feio|simples|b[aá]sico|fraco|pobre|amador|quadrado)/i,
  /pode\s+ficar\s+melhor|deixa\s+com\s+cara|deixa\s+parecendo|10\.?000|dez\s+mil/i,
  /eleva\s+(o\s+)?n[ií]vel|n[ií]vel\s+acima|outro\s+n[ií]vel/i,
  /fique\s+(mais\s+|bem\s+|realmente\s+|super\s+)?(bonit[oa]|premium|profissional|sofisticad[oa]|elegante|chique|top|incr[ií]vel|impactante)/i,
];

// Sinais de pedido cirúrgico (alteração pontual) — NÃO devem disparar o ciclo
// completo: alteração específica de valor/parte pequena.
const SURGICAL_PATTERNS: RegExp[] = [
  /troca\s+(a\s+)?(cor|texto|t[ií]tulo|imagem|foto|palavra|número|número|icone|ícone)/i,
  /muda\s+(a\s+)?(cor|a\s+cor|texto|t[ií]tulo|font|fonte|pre[cç]o|telefone|whatsapp|bot[aã]o)/i,
  /alter[ao]\s+(a\s+)?(cor|o\s+texto|o\s+t[ií]tulo|a\s+frase|o\s+n[ií]mero|a\s+fonte)/i,
  /adiciona\s+(uma\s+)?(se[cç][aã]o|faq|pergunta|card|imagem|bot[aã]o)/i,
  /remove\s+(a\s+)?(se[cç][aã]o|faq|pergunta|card|imagem|bot[aã]o|a\s+palavra)/i,
  /coloca\s+(a\s+)?palavra|escreve\s+(a\s+)?palavra/i,
];

export function classifyAmplitude(instruction: string): RequestAmplitude {
  const text = String(instruction ?? "").trim();
  if (!text) return "broad"; // sem contexto não dá para ser cirúrgico
  const surgical = SURGICAL_PATTERNS.some((re) => re.test(text));
  if (surgical) return "surgical";
  const broad = BROAD_PATTERNS.some((re) => re.test(text));
  return broad ? "broad" : "surgical";
}

// Referências contextuais que exigem consultar o histórico da conversa antes
// de agir ("essa seção", "a anterior", "aquela imagem", "deixa como estava").
const CONTEXTUAL_REF_PATTERNS: RegExp[] = [
  /aquela|aquilo|esse\s+da[íi]|essa\s+se[cç][aã]o|a\s+se[cç][aã]o\s+(anterior|de\s+antes)|a\s+(hero|imagem|cor|tipografia|fonte)\s+(que|de|antiga|anterior)/i,
  /a\s+(anterior|primeira\s+vers[aã]o|vers[aã]o\s+anterior)|como\s+estava|igual\s+a|na\s+mesma\s+linha|mesmo\s+estilo|mesma\s+(coisa|estrutura|composi[cç][aã]o)/i,
  /deixa\s+(como|igual)|mant[eê]m\s+(como|a\s+mesma|esse|aquela)|volta\s+com|desfaz/i,
];

export function hasContextualReference(instruction: string): boolean {
  const text = String(instruction ?? "");
  return CONTEXTUAL_REF_PATTERNS.some((re) => re.test(text));
}
