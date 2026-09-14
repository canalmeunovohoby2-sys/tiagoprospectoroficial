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
