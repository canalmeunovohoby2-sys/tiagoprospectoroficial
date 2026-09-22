/**
 * FIRST-GEN WORKSPACE — impede que o site de OUTRO cliente seja entregue ao agente
 * como ponto de partida. A auditoria física provou um workspace "firstGen" contendo
 * index.html/índice CSS/componentes/content/motion do cliente anterior.
 *
 * Regras:
 * - Só roda em PRIMEIRA GERAÇÃO (estado do projeto, não "parece pequeno").
 * - Infra (Vite/TS/Tailwind/main) FICA; shell canônico é RESETADO; o resto é copiado
 *   para um BACKUP fora do workspace antes de sair.
 * - Nunca poda projeto já gerado/em edição (proteção de cliente).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

const IGNORAR = /(^|\/)(node_modules|dist|\.git|\.cache)(\/|$)/;

/** Infraestrutura necessária para React/Vite rodar (não é identidade visual). */
const INFRA: RegExp[] = [
  /^package(-lock)?\.json$/,
  /^vite\.config\.(ts|js|mjs)$/,
  /^tsconfig(\.node)?\.json$/,
  /^postcss\.config\.(js|cjs|mjs)$/,
  /^tailwind\.config\.(js|cjs|mjs|ts)$/,
  /^index\.html$/,
  /^src\/main\.tsx?$/,
  /^src\/vite-env\.d\.ts$/,
  /^src\/App\.tsx$/,
  /^src\/index\.css$/,
  /^public\/favicon\.(ico|svg)$/,
  /^\.gitignore$/,
  /^README\.md$/i,
];

export const BOOTSTRAP_SHELL_MARKER = "prospector-bootstrap";

export function isInfraPath(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  if (IGNORAR.test(p)) return true; // nunca mexer
  return INFRA.some((re) => re.test(p));
}

/** Conteúdo visual/de cliente que NÃO pode ser ponto de partida de uma 1ª geração. */
export function isVisualTemplatePath(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  if (IGNORAR.test(p)) return false;
  return !isInfraPath(p);
}

/** Só poda em 1ª geração e nunca em conversa pura. */
export function shouldPruneFirstGen(firstGen: boolean, runKind: string): boolean {
  return Boolean(firstGen) && runKind !== "conversation";
}

/** Lista (pura, testável) dos arquivos que sairiam numa 1ª geração contaminada. */
export function visualTemplatePaths(files: Record<string, string>): string[] {
  return Object.keys(files ?? {}).filter((p) => isVisualTemplatePath(p));
}

function shellCanonico(): Record<string, string> {
  return {
    "index.html": `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Novo site</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "src/App.tsx": `// ${BOOTSTRAP_SHELL_MARKER}: shell neutro — o site real substitui este arquivo.
export default function App() {
  return <main />;
}
`,
    "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
  };
}

export interface FirstGenPruneReport {
  backupDir: string;
  removed: string[];
  reset: string[];
}

/**
 * Em 1ª geração: backup dos arquivos de cliente e poda do workspace para infra + shell
 * canônico. Devolve o relatório. Nunca lança (proteção: falha não derruba a geração).
 */
export function backupAndPruneFirstGen(root: string, projectId: string): FirstGenPruneReport {
  const report: FirstGenPruneReport = { backupDir: "", removed: [], reset: [] };
  try {
    if (!existsSync(root)) return report;
    const backupDir = join(tmpdir(), "tiagoprospector-firstgen-backup", projectId || "projeto");
    const caminhar = (dir: string, acc: string[]): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, e.name);
        const rel = relative(root, abs).replace(/\\/g, "/");
        if (IGNORAR.test(rel)) continue;
        if (e.isDirectory()) acc = caminhar(abs, acc);
        else acc.push(rel);
      }
      return acc;
    };
    const arquivos = caminhar(root, []);
    for (const rel of arquivos) {
      const abs = join(root, rel);
      if (isVisualTemplatePath(rel)) {
        try {
          const dest = join(backupDir, rel);
          mkdirSync(join(dest, ".."), { recursive: true });
          copyFileSync(abs, dest);
        } catch { /* backup best-effort */ }
        try {
          if (statSync(abs).isFile()) rmSync(abs, { force: true });
          report.removed.push(rel);
        } catch { /* segue */ }
      }
    }
    for (const [rel, conteudo] of Object.entries(shellCanonico())) {
      const abs = join(root, rel);
      try {
        writeFileSync(abs, conteudo, "utf8");
        report.reset.push(rel);
      } catch { /* segue */ }
    }
    report.backupDir = report.removed.length > 0 ? backupDir : "";
    return report;
  } catch {
    return report;
  }
}
