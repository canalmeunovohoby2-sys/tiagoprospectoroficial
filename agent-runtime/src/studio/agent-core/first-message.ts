// Primeira mensagem do Coder (C1): árvore + conteúdo relevante + pedido.
//
// Princípio do DaveLovable, mas com LIMITES: não envia o projeto inteiro
// cegamente. Prioriza arquivos-base do React/Vite; arquivos grandes são
// truncados e o Coder usa `read_file` para aprofundar.

import type { BusinessContext } from "../../tools.js";

export interface FirstMessageInput {
  instruction: string;
  files: Record<string, string>;
  business?: BusinessContext;
  /** Limite por arquivo incluído (default 24KB). */
  maxFileBytes?: number;
  /** Limite somado de conteúdo incluído (default 120KB). */
  maxTotalBytes?: number;
}

const PRIORITY_PATTERNS: RegExp[] = [
  /^package\.json$/,
  /^index\.html$/,
  /^vite\.config\.[cm]?[jt]s$/,
  /^tsconfig(\..+)?\.json$/,
  /^tailwind\.config\.[cm]?[jt]s$/,
  /^postcss\.config\.[cm]?[jt]s$/,
  /^README(\.md)?$/i,
  /^src\/main\.[jt]sx?$/,
  /^src\/App\.[jt]sx?$/,
  /^src\/index\.css$/,
  /^src\/.*\.(tsx|jsx|ts|js|css)$/,
  /\.(tsx|jsx|ts|js|css|json|html|md)$/,
];

function isSensitive(path: string): boolean {
  const p = path.toLowerCase();
  if (p.includes(".env")) return true;
  if (/(^|\/)(node_modules|\.git)\//.test(p)) return true;
  return /(^|\/)(\.npmrc|\.netrc|\.git-credentials|id_rsa|id_ed25519)$/.test(p);
}

function isTextLike(path: string): boolean {
  return /\.(tsx|jsx|ts|js|mjs|cjs|css|scss|json|html|htm|md|txt|svg|yml|yaml)$/i.test(path);
}

/** Marca do rascunho neutro (mesma marca do template do front). */
const BOOTSTRAP_MARKER = "prospector-bootstrap";

/** true quando o projeto ainda contém o BOOTSTRAP (rascunho) a ser substituído. */
export function isBootstrapProject(files: Record<string, string>): boolean {
  for (const path of ["src/App.tsx", "src/index.css"]) {
    const content = files?.[path];
    if (typeof content === "string" && content.includes(BOOTSTRAP_MARKER)) return true;
  }
  return false;
}

/** Árvore de arquivos do projeto (só caminhos), ordenada por prioridade. */
export function projectTree(files: Record<string, string>): string[] {
  const paths = Object.keys(files ?? {}).filter((p) => !isSensitive(p));
  return paths.sort((a, b) => {
    const ia = PRIORITY_PATTERNS.findIndex((re) => re.test(a));
    const ib = PRIORITY_PATTERNS.findIndex((re) => re.test(b));
    const na = ia < 0 ? 999 : ia;
    const nb = ib < 0 ? 999 : ib;
    return na === nb ? a.localeCompare(b) : na - nb;
  });
}

export function buildFirstMessage(input: FirstMessageInput): string {
  const maxFileBytes = input.maxFileBytes ?? 24_000;
  const maxTotalBytes = input.maxTotalBytes ?? 120_000;
  const tree = projectTree(input.files);
  const b = input.business ?? {};
  const businessLine = [b.name ? `Empresa: ${b.name}` : null, b.segment ? `Segmento: ${b.segment}` : null, b.city ? `Cidade: ${b.city}` : null]
    .filter(Boolean)
    .join(" · ");

  const included: string[] = [];
  let total = 0;
  for (const path of tree) {
    if (!isTextLike(path)) continue;
    const content = input.files[path];
    if (typeof content !== "string") continue;
    if (content.length > maxFileBytes) {
      included.push(`File: ${path}\n(truncado — use read_file para o restante)\n\`\`\`\n${content.slice(0, maxFileBytes)}\n\`\`\``);
      total += maxFileBytes;
    } else {
      included.push(`File: ${path}\n\`\`\`\n${content}\n\`\`\``);
      total += content.length;
    }
    if (total >= maxTotalBytes) {
      included.push(`(contexto truncado no limite de ${maxTotalBytes} bytes — use read_file/grep_search para o restante)`);
      break;
    }
  }

  return [
    `Pedido do usuário: ${input.instruction}`,
    "",
    "Você está em um projeto React + Vite + TypeScript + Tailwind (workspace real).",
    businessLine ? `Contexto do negócio: ${businessLine}` : null,
    isBootstrapProject(input.files)
      ? "BOOTSTRAP DESCARTÁVEL: o projeto começa com um rascunho neutro (marcado `prospector-bootstrap`). Ele NÃO é a identidade final — SUBSTITUA-O por uma implementação PRÓPRIA deste negócio, sem preservar cores/estrutura do rascunho."
      : null,
    "",
    `Árvore de arquivos do projeto (${tree.length} arquivos):`,
    tree.map((p) => `  ${p}`).join("\n"),
    "",
    "Conteúdo dos arquivos relevantes (você pode ler outros com read_file):",
    included.join("\n\n"),
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
