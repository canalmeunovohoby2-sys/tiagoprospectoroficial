// Resolução do NOME COMERCIAL da empresa — fonte única para PDF, slug/link e título.
//
// Regra: NUNCA tratar checklist/slug/nome-de-arquivo como nome de empresa. Não
// inventa nome: apenas filtra valores claramente inválidos e, quando possível,
// extrai um nome comercial plausível do prompt (sem usar o checklist).

const INVALID_COMPANY =
  /checklist|leia\s+antes|antes\s+de\s+compilar|estrutural\s+de\s+execu|proposta\s+comercial\s*·?\s*$/i;

/** Normaliza e valida um nome comercial. Devolve "" se não for um nome válido. */
export function resolveCompanyName(value: unknown): string {
  let v = typeof value === "string" ? value : "";
  v = v
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, " ")
    .replace(/^\s*#+\s*/g, " ")
    .replace(/[*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!v) return "";
  if (INVALID_COMPANY.test(v)) return "";
  if (/\.(pdf|html?|zip|tsx?|jsx?|css|json|png|jpe?g|svg)$/i.test(v)) return "";
  // eslint-disable-next-line no-useless-escape
  if (!/\s/.test(v) && /^[a-z0-9]+(?:[-_][a-z0-9]+){3,}$/i.test(v) && v.length >= 24) return "";
  return v;
}

/** Slug de URL a partir do nome comercial resolvido (ou "" se não houver nome). */
export function companySlug(value: unknown): string {
  const name = resolveCompanyName(value);
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Slug que NÃO pode existir (derivado de checklist/instrução interna). */
export function isInvalidCompanySlug(slug: string): boolean {
  const s = String(slug ?? "").toLowerCase();
  return /checklist|leia-antes|antes-de-compilar|estrutural-de-execucao/.test(s);
}

/**
 * Extrai um nome comercial PLAUSÍVEL do prompt do usuário (importante para
 * projetos sem lead, onde o prompt virava o "nome"). Nunca devolve checklist/
 * slug. Se não encontrar nada confiável, devolve "" (o chamador usa fallback).
 */
export function extractCompanyFromPrompt(prompt: string): string {
  const text = String(prompt ?? "");
  const patterns: RegExp[] = [
    /\b(?:empresa|neg[óo]cio|cliente)\s*[:\-]\s*([A-Za-zÀ-ú0-9&.'\- ]{3,60})/i,
    /\b(?:site|p[áa]gina|landing(?: page)?)\s+(?:para|da|do|de)\s+([A-Za-zÀ-ú0-9&.'\- ]{3,60})/i,
    /\bpara\s+(?:a|o)\s+([A-ZÀ-Ú][A-Za-zÀ-ú0-9&.'\- ]{2,50})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const v = resolveCompanyName(m?.[1] ?? "");
    if (v && v.split(/\s+/).length >= 1 && v.length >= 3) return v;
  }
  // Varre linhas curtas e "com cara de nome" (2+ palavras, sem markdown).
  for (const line of text.split(/\r?\n/)) {
    const v = resolveCompanyName(line);
    if (v && v.split(/\s+/).length >= 2 && v.length <= 50) return v;
  }
  return "";
}
