// Escopo de EDIÇÃO: detecta quando o pedido é uma mudança VISUAL GLOBAL (cor/tema/
// identidade/minimalismo...) e se o Coder realmente VARREU o projeto (busca/mais de
// um arquivo/tokens). Usado para cobrar coerência — evita "patch mínimo" que deixa
// metade do site com a identidade antiga.

/** O pedido é uma mudança visual de identidade (não um ajuste pontual de texto)? */
export function isGlobalVisualEdit(instruction: string): boolean {
  const t = String(instruction ?? "").toLowerCase();
  if (!t.trim()) return false;
  const GLOBAL = /(paleta|\bcor(es)?\b|tema|identidade visual|design system|redesign|reformul|reconstru|escuro|dark|\bclaro\b|minimalista|sofisticad|moderniz|site inteiro|todo o site|p[aá]gina inteira|toda a p[aá]gina|tipografia|fontes?\b|visual|estilo)/i;
  // Pedidos locais explícitos não contam como globais.
  const LOCAL = /(s[oó] (o|a|esse|essa|esta) |apenas (o|a)|somente (o|a)|neste bot[aã]o|nesse card|nessa se[cç][aã]o espec[ií]fica)/i;
  return GLOBAL.test(t) && !LOCAL.test(t);
}

const GLOBAL_STYLE_FILE = /(\.css$|tailwind\.config|theme|tokens|globals?\.(css|ts)|index\.css$|styles?\.(ts|tsx)$)/i;

export interface EditSweepInput {
  /** Arquivos realmente alterados nesta execução. */
  touched: string[];
  /** Ferramentas usadas (grep_search/glob_search provam varredura). */
  toolNames: string[];
}

/** O Coder varreu o projeto (buscou, tocou vários arquivos ou mexeu em tokens/CSS)? */
export function wasProjectSwept({ touched, toolNames }: EditSweepInput): boolean {
  if (touched.length >= 2) return true;
  if (touched.some((p) => GLOBAL_STYLE_FILE.test(p))) return true;
  return toolNames.some((n) => n === "grep_search" || n === "glob_search" || n === "file_search");
}

/** Nudge (PT-BR) para o Coder completar uma mudança global de identidade. */
export const EDIT_SWEEP_NUDGE = [
  "Sua alteração parece LOCAL. O pedido é uma mudança de IDENTIDADE no site inteiro.",
  "Faça agora, antes de concluir:",
  "1) use grep_search para achar TODAS as ocorrências da identidade atual (hex/rgb, classes Tailwind, gradientes, bg-, text-, border-, hover:, focus:, variáveis CSS, tailwind.config, index.css);",
  "2) atualize primeiro os tokens/variáveis/design system e depois TODOS os pontos afetados (header, hero, seções, cards, botões, links, bordas, sombras, footer, overlays, estados);",
  "3) elimine o que ficou com a identidade antiga;",
  "4) revise a coerência visual entre todas as seções. Só conclua quando o site inteiro refletir o pedido.",
].join("\n");

// ── Verificação de PALETA: o pedido nomeou uma cor? A identidade antiga ficou? ──

interface ColorFamily { re: RegExp; hexes: string[]; classes: string[] }

const COLOR_FAMILIES: ColorFamily[] = [
  { re: /vermelh|\bred\b/i, hexes: ["#ef4444", "#dc2626", "#f87171", "#b91c1c", "#e11d48"], classes: ["red"] },
  { re: /azul|\bblue\b|\bsky\b/i, hexes: ["#3b82f6", "#2563eb", "#1d4ed8", "#0ea5e9", "#60a5fa"], classes: ["blue", "sky"] },
  { re: /verde|\bgreen\b|\bemerald\b/i, hexes: ["#22c55e", "#16a34a", "#10b981", "#059669"], classes: ["green", "emerald"] },
  { re: /amarelo|\byellow\b|\bamber\b/i, hexes: ["#eab308", "#facc15", "#f59e0b"], classes: ["yellow", "amber"] },
  { re: /laranja|\borange\b/i, hexes: ["#f97316", "#fb923c", "#ea580c"], classes: ["orange"] },
  { re: /roxo|violeta|\bviolet\b|\bpurple\b/i, hexes: ["#8b5cf6", "#7c3aed", "#a855f7", "#6366f1"], classes: ["purple", "violet", "indigo"] },
  { re: /rosa|\bpink\b|\brose\b/i, hexes: ["#ec4899", "#db2777", "#f472b6"], classes: ["pink", "rose"] },
  { re: /dourad|\bgold\b/i, hexes: ["#d4af37", "#f3e5ab", "#c8a25a"], classes: ["amber", "yellow"] },
  { re: /\bpreto\b|\bblack\b|\bescuro\b|\bdark\b/i, hexes: ["#000000", "#050505", "#0d0e12", "#0f172a", "#111827"], classes: ["black", "slate-9", "zinc-9", "neutral-9"] },
  { re: /\bbranco\b|\bwhite\b|\bclaro\b|\blight\b/i, hexes: ["#ffffff", "#f8fafc", "#f1f5f9", "#fafafa"], classes: ["white"] },
];

/** Cor(es) nomeadas no pedido (ex.: "troque para vermelho") → tokens esperados. */
export function namedColorTarget(instruction: string): { hexes: string[]; classes: string[] } | null {
  const t = String(instruction ?? "");
  const hits = COLOR_FAMILIES.filter((f) => f.re.test(t));
  if (hits.length === 0) return null;
  return { hexes: hits.flatMap((h) => h.hexes), classes: hits.flatMap((h) => h.classes) };
}

/** Tokens de cor presentes no código (hex + família de classe Tailwind). */
export function colorTokens(files: Record<string, string> | null | undefined): Set<string> {
  const tokens = new Set<string>();
  if (!files) return tokens;
  const text = Object.values(files).filter((v) => typeof v === "string").join("\n");
  for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) tokens.add(m[0].toLowerCase());
  for (const m of text.matchAll(/\b(?:bg|text|border|from|via|to|ring|fill|stroke|shadow|decoration|outline|accent|caret|divide)-(red|blue|sky|green|emerald|yellow|amber|orange|purple|violet|indigo|pink|rose|slate|zinc|neutral|stone|gray|black|white)-\d{2,3}\b/g)) {
    tokens.add(m[1].toLowerCase());
    tokens.add(`${m[1].toLowerCase()}-9`);
  }
  return tokens;
}

/** O alvo do pedido apareceu no resultado? */
export function targetApplied(after: Set<string>, target: { hexes: string[]; classes: string[] }): boolean {
  return target.hexes.some((h) => after.has(h.toLowerCase())) || target.classes.some((c) => after.has(c.toLowerCase()));
}

/** A identidade ANTERIOR continua dominante no resultado (>=60% dos tokens)? */
export function paletteStillOld(before: Set<string>, after: Set<string>): boolean {
  if (before.size === 0) return false;
  let kept = 0;
  for (const t of before) if (after.has(t)) kept += 1;
  return kept / before.size >= 0.6;
}

/** O pedido fala de cor/tema/identidade (mesmo sem nomear uma cor exata)? */
export function mentionsColorChange(instruction: string): boolean {
  return /(\bcor(es)?\b|paleta|tema|identidade visual|design system|\bescuro\b|\bdark\b|\bclaro\b|\blight\b|gradiente|neon|dourad|met[aá]lic)/i.test(String(instruction ?? ""));
}

/** A paleta NÃO mudou: nada saiu, nada novo entrou (a identidade segue idêntica). */
export function paletteUnchanged(before: Set<string>, after: Set<string>): boolean {
  if (before.size === 0) return false;
  let kept = 0;
  for (const t of before) if (after.has(t)) kept += 1;
  if (kept / before.size < 0.9) return false;
  for (const t of after) if (!before.has(t)) return false;
  return true;
}

/** Nudge com EVIDÊNCIA de que a identidade antiga permaneceu no código. */
export function colorNotAppliedNudge(kept: string[]): string {  return [
    "Você NÃO aplicou a mudança de cor pedida em todo o site — a identidade ANTERIOR ainda está no código.",
    kept.length ? `Cores antigas que continuam presentes: ${kept.slice(0, 12).join(", ")}.` : "",
    "Faça agora: aplique a NOVA cor no design system/tokens e substitua TODAS as ocorrências antigas (classes Tailwind, hex, gradientes, bg-/text-/border-/ring-, hover:/focus:, botões, links, cards, header, hero, footer, overlays).",
    "Use grep_search para não deixar nenhuma sobra e só conclua quando o site inteiro usar a nova identidade.",
  ].filter(Boolean).join("\n");
}

// ── Inspeção obrigatória antes de editar (edição NÃO é "tiro no escuro") ──

/**
 * Arquivos EXISTENTES que o Coder alterou SEM ter lido nesta execução.
 * Editar um arquivo existente sem inspecioná-lo é o principal motivo de
 * alteração parcial/errada. Arquivos NOVOS não entram (não havia o que ler).
 */
export function uninspectedEdits(existing: Set<string>, touched: string[], readPaths: string[]): string[] {
  const read = new Set(readPaths);
  return touched.filter((p) => existing.has(p) && !read.has(p));
}

/** Nudge (PT-BR) exigindo INSPECIONAR antes de concluir a edição. */
export function UNINSPECTED_NUDGE(files: string[]): string {
  return [
    "Você alterou arquivos EXISTENTES sem tê-los inspecionado nesta execução:",
    ...files.map((f) => `- ${f}`),
    "Antes de concluir: use read_file nesses arquivos e grep_search para localizar TODAS as ocorrências relacionadas ao pedido;",
    "confirme no código REAL o que já mudou e o que ficou para trás e complete a alteração ponta a ponta (sem sobras).",
    "Só finalize quando o resultado refletir exatamente o que o usuário pediu.",
  ].join("\n");
}
