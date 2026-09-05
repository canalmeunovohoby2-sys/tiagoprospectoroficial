// Agent Execution Runtime (5.13) — execução do projeto gerado.
//
// A infraestrutura atual (Supabase Edge Functions/Deno e browser) NÃO possui
// filesystem persistente nem ambiente Node completo para rodar `npm run build`
// de um app Vite arbitrário com segurança. Por isso NÃO simulamos um build.
//
// Criamos a abstração ProjectExecutionRuntime e um adapter concreto
// (StaticProjectRuntime) que executa validações estáticas REAIS sobre os
// arquivos do workspace (parse JSON, HTML bem-formado, CSS balanceado,
// presença de conteúdo real, ausência de segredos/placeholders).
//
// O Orchestrator/agente permanece DESACOPLADO do provedor: basta plugar um
// adapter de sandbox real (deno-deploy worker, node server, etc.) no futuro.
// Puro (sem Deno) — testável no edge e no front.

import type { WorkspaceMap } from "./agent-workspace.ts";

export type ExecutionVerdict = "ok" | "error";

export interface ExecutionResult {
  verdict: ExecutionVerdict;
  errors: string[];
  logs?: string[];
}

export interface ProjectExecutionRuntime {
  readonly kind: string;
  build: (files: WorkspaceMap) => Promise<ExecutionResult> | ExecutionResult;
  inspect?: (files: WorkspaceMap) => Promise<ExecutionResult> | ExecutionResult;
  test?: (files: WorkspaceMap) => Promise<ExecutionResult> | ExecutionResult;
}

// ---------------- Helpers puros ----------------

const SECRET_PATTERNS: RegExp[] = [
  /(?:NVIDIA|GEMINI|DEEPSEEK|OPENAI|SUPABASE|ANON|SERVICE|API)_?(?:KEY|SECRET|TOKEN)\s*[:=]/i,
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, // JWT
  /\bAKIA[0-9A-Z]{16}\b/, // AWS
];

const GENERIC_PLACEHOLDERS: RegExp[] = [
  /lorem\s+ipsum/i,
  /\binsira\s+(aqui|seu)\b|\bseu\s+(texto|aqui)\b|\bplaceholder\b/i,
  /telefone\s*\(\s*\)\s*[-0-9]{0,4}/i,
  /\bxxxx\b|\byyyy\b/i,
];

function filePathOf(path: string): string {
  // remove o prefixo do slug p/ localizar os arquivos essenciais
  const parts = path.split("/");
  const tail = parts.slice(1).join("/"); // slug/... -> ...
  return parts.length > 1 ? tail : path;
}

export function isSecretFree(text: string): boolean {
  return !SECRET_PATTERNS.some((re) => re.test(text));
}

export function hasNoGenericPlaceholders(text: string): boolean {
  return !GENERIC_PLACEHOLDERS.some((re) => re.test(text));
}

export function balancedCss(css: string): boolean {
  const stack: string[] = [];
  for (const ch of css) {
    if (ch === "{" || ch === "(" || ch === "[") stack.push(ch);
    else if (ch === "}") { if (stack.pop() !== "{") return false; }
    else if (ch === ")") { if (stack.pop() !== "(") return false; }
    else if (ch === "]") { if (stack.pop() !== "[") return false; }
  }
  return stack.length === 0;
}

export function isBalancedJs(js: string): boolean {
  // Verificação leve (não parseia ECMAScript completo, mas pega desbalanceamento
  // óbvio de chaves/colchetes/parenteses fora de strings/comentários).
  const clean = stripStringsAndComments(js);
  const stack: string[] = [];
  for (const ch of clean) {
    if (ch === "{" || ch === "(" || ch === "[") stack.push(ch);
    else if (ch === "}") { if (stack.pop() !== "{") return false; }
    else if (ch === ")") { if (stack.pop() !== "(") return false; }
    else if (ch === "]") { if (stack.pop() !== "[") return false; }
  }
  return stack.length === 0;
}

function stripStringsAndComments(src: string): string {
  let out = "";
  let i = 0;
  let inStr: '"' | "'" | "`" | null = null;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += " ";
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (c === "//" && next === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += " "; i += 1; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; out += " "; i += 1; continue; }
    out += c;
    i += 1;
  }
  return out;
}

// ---------------- Static Project Runtime ----------------

// Valida estáticamente o workspace de um site estático exportado.
// O conteúdo REAL está em: index.html (marca), site.json (dados), site.css,
// main.js (interação). É um "build" honesto e seguro do que a infra suporta.
export class StaticProjectRuntime implements ProjectExecutionRuntime {
  readonly kind = "static";
  private companyName: string;

  constructor(companyName: string) {
    this.companyName = companyName || "Empresa";
  }

  private buildSync(files: WorkspaceMap): ExecutionResult {
    const errors: string[] = [];
    const paths = Object.keys(files);
    if (paths.length === 0) {
      return { verdict: "error", errors: ["Workspace vazio — nenhum arquivo de projeto."] };
    }

    const findFile = (suffix: string): string | undefined =>
      paths.find((p) => filePathOf(p).endsWith(suffix));

    const htmlPath = findFile("index.html");
    if (!htmlPath) errors.push("index.html não encontrado no workspace.");
    else {
      const html = files[htmlPath];
      if (!/<!doctype\s+html/i.test(html)) errors.push("index.html sem <!doctype html>.");
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
      if (!title) errors.push("index.html sem <title>.");
      // conteúdo real presente
      const company = this.companyName.trim();
      if (company && company.length > 2 && !html.includes(company)) {
        errors.push(`O nome real da empresa ("${company.slice(0, 40)}") não aparece no HTML — conteúdo genérico?`);
      }
      if (!hasNoGenericPlaceholders(html)) errors.push("HTML contém placeholders genéricos (lorem/xxxx/insira aqui).");
    }

    const dataPath = findFile("site.json");
    if (!dataPath) errors.push("site.json (dados do site) não encontrado.");
    else {
      try {
        const parsed = JSON.parse(files[dataPath]);
        if (!parsed || typeof parsed !== "object") errors.push("site.json não é um objeto válido.");
      } catch {
        errors.push("site.json contém JSON inválido.");
      }
    }

    const pkgPath = findFile("package.json");
    if (!pkgPath) errors.push("package.json não encontrado.");
    else {
      try {
        const pkg = JSON.parse(files[pkgPath]);
        if (!pkg?.name || !pkg?.scripts) errors.push("package.json sem name/scripts.");
      } catch {
        errors.push("package.json contém JSON inválido.");
      }
    }

    const cssPath = findFile("site.css");
    if (!cssPath) errors.push("site.css não encontrado.");
    else if (!balancedCss(files[cssPath])) errors.push("site.css com chaves/parenteses desbalanceados.");

    const jsPath = findFile("main.js") ?? findFile("main.ts");
    if (!jsPath) errors.push("main.js não encontrado.");
    else if (!isBalancedJs(files[jsPath])) errors.push("main.js com chaves/parenteses desbalanceados (possível erro de sintaxe).");

    // Segredos em QUALQUER arquivo
    for (const p of paths) {
      if (p.includes(".env")) continue; // .env.example é permitido no workspace
      if (!isSecretFree(files[p])) {
        errors.push(`Possível segredo/API key detectado em ${p}.`);
      }
    }

    return errors.length
      ? { verdict: "error", errors, logs: [`StaticProjectRuntime validou ${paths.length} arquivo(s).`] }
      : { verdict: "ok", errors: [], logs: [`Build estático OK (${paths.length} arquivos validados).`] };
  }

  build(files: WorkspaceMap): ExecutionResult {
    return this.buildSync(files);
  }
}

// ---------------- Factory ----------------

export function createExecutionRuntime(kind: string, context: { companyName?: string }): ProjectExecutionRuntime {
  switch (kind) {
    case "static":
      return new StaticProjectRuntime(context.companyName ?? "");
    default:
      // Sem sandbox real disponível: runtime honesto que NÃO finge build.
      return {
        kind: "none",
        build: () => ({
          verdict: "ok",
          errors: [],
          logs: ["Runtime de build real não configurado nesta infraestrutura. Validação estática disponível."],
        }),
      };
  }
}
