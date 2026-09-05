// Project Preview Runtime (5.14) — renderiza o CÓDIGO REAL do workspace do
// Site Project em um iframe isolado (sandbox). Não reconstrói a SiteSpec:
// o documento exibido É o index.html materializado/alterado pelo agente.
//
// - LOCALIZA index.html no workspace (qualquer profundidade, ex.: slug/).
// - INJETA scripts/styles locais referenciados (main.js / site.css) quando
//   existirem no workspace (substitui a referência relativa pelo conteúdo).
// - SANITIZA: remove referências a .env/secrets; nunca expõe cookies/tokens
//   (o iframe roda sem allow-same-origin).
// - DETECTA erros comuns (sem doctype, html vazio, css/js desbalanceados).

import {
  normalizePath, listFiles, readFile,
  isBalancedJsSafe, type WorkspaceMap,
} from "./preview-helpers";

export interface PreparedPreview {
  ok: boolean;
  document?: string;      // HTML seguro para srcDoc
  htmlPath?: string;
  errors: string[];
  warnings: string[];
  fileCount: number;
}

const SECRET_RE = /(?:NVIDIA|GEMINI|DEEPSEEK|OPENAI|SUPABASE|ANON|SERVICE|API)_?(?:KEY|SECRET|TOKEN)\s*[:=]|\bsk-[A-Za-z0-9_-]{12,}\b|\beyJ[A-Za-z0-9_-]{20,}\./i;

function fileKey(p: string): string {
  const parts = p.split("/");
  return parts.slice(1).join("/"); // slug/... -> ...
}

// Prepara o documento do workspace para preview (blob URL / srcDoc).
export function prepareProjectPreview(files: WorkspaceMap | Record<string, string>): PreparedPreview {
  const ws: WorkspaceMap = {};
  for (const [k, v] of Object.entries(files ?? {})) {
    const n = normalizePath(k);
    if (n && typeof v === "string") ws[n] = v;
  }
  const names = listFiles(ws);
  if (names.length === 0) {
    return { ok: false, errors: ["Workspace vazio — nenhum arquivo de projeto."], warnings: [], fileCount: 0 };
  }

  // index.html pode estar em qualquer profundidade (slug/prefix). Prefere raiz.
  const htmlPath = names.find((p) => p === "index.html")
    ?? names.find((p) => p.endsWith("/index.html"))
    ?? names.find((p) => p.endsWith("index.html"));
  if (!htmlPath) {
    return { ok: false, errors: ["index.html não encontrado no workspace."], warnings: [], fileCount: names.length };
  }

  let html = readFile(ws, htmlPath);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!html) {
    return { ok: false, errors: [`Falha ao ler ${htmlPath}.`], warnings: [], fileCount: names.length };
  }

  if (!/<!doctype\s+html/i.test(html)) errors.push("index.html sem <!doctype html>.");
  if (!/<body[\s>]/i.test(html)) errors.push("index.html sem <body>.");

  // Injeta main.js local (referência relativa "./src/main.js") — substitui a tag.
  const mainRef = html.match(/<script\s+src="([^"]*\/?main\.js)"[^>]*>\s*<\/script>/i);
  if (mainRef) {
    const refPath = mainRef[1].replace(/^\.\//, "");
    const candidates = names.filter((n) => n.endsWith(refPath) || n.endsWith("/" + refPath) || n.endsWith("main.js"));
    const jsPath = candidates[0];
    if (jsPath) {
      const js = readFile(ws, jsPath) ?? "";
      if (js.trim()) {
        html = html.replace(mainRef[0], `<script>${js}</script>`);
      } else {
        html = html.replace(mainRef[0], "");
        warnings.push("main.js vazio — removido do preview.");
      }
    } else {
      warnings.push("main.js referenciado mas ausente no workspace.");
      html = html.replace(mainRef[0], "");
    }
  }

  // Injeta site.css local se referenciado por <link rel="stylesheet" href="./src/site.css">.
  const cssRef = html.match(/<link[^>]*href="([^"]*site\.css)"[^>]*>/i);
  if (cssRef) {
    const candidates = names.filter((n) => n.endsWith("site.css") || n.endsWith("/" + cssRef[1].replace(/^\.\//, "")));
    const cssPath = candidates[0];
    if (cssPath) {
      const css = readFile(ws, cssPath) ?? "";
      if (css.trim()) {
        html = html.replace(cssRef[0], `<style>${css}</style>`);
      } else {
        html = html.replace(cssRef[0], "");
        warnings.push("site.css vazio — removido do preview.");
      }
    }
  }

  // Embutir assets LOCAIS do workspace (ex.: assets/logo.png usados pelo Cline)
  // como dataURL — sem servidor, <img src="./assets/x.png"> não carregaria no
  // iframe srcDoc. Imagens até ~2MB viram data URL.
  html = embedLocalAssets(html, ws, names);

  // Remove qualquer referência a .env / arquivos sensíveis no documento.
  html = html.replace(/<script[^>]*src=["'][^"']*\.env[^"']*["'][^>]*>\s*<\/script>/gi, "");

  // Detecta segredos no documento (nunca deve ter).
  if (SECRET_RE.test(html)) {
    errors.push("Possível segredo/API key detectado no documento — preview bloqueado por segurança.");
  }

  // Valida balanceamento grosseiro de <style> embutido.
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) ?? [];
  for (const block of styleBlocks) {
    if (!isBalancedCssText(block)) {
      errors.push("CSS embutido no index.html parece desbalanceado.");
      break;
    }
  }

  return {
    ok: errors.length === 0,
    document: html,
    htmlPath,
    errors,
    warnings,
    fileCount: names.length,
  };
}

function embedLocalAssets(html: string, ws: WorkspaceMap, names: string[]): string {
  const lookups = names.map((n) => ({ key: fileKeyOf(n), n }));
  const MAX = 2_000_000;
  const findContent = (href: string): string | null => {
    const clean = href.replace(/^\.\//, "").split("?")[0];
    const hit = lookups.find((l) => l.key === clean || l.key.endsWith("/" + clean) || l.n.endsWith(clean));
    if (!hit) return null;
    const content = ws[hit.n];
    if (!content) return null;
    // data URL já embutido → mantém
    if (content.startsWith("data:")) return content;
    // conteúdo binário (base64) vindo do cliente? o workspace guarda texto;
    // se parecer base64 de imagem, tentamos wrapper data url.
    const lower = hit.n.toLowerCase();
    const mime = lower.endsWith(".png") ? "image/png" : lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" : lower.endsWith(".webp") ? "image/webp" : lower.endsWith(".gif") ? "image/gif" : lower.endsWith(".svg") ? "image/svg+xml" : null;
    if (!mime) return null;
    // conteúdo pode estar como dataURL string OU texto (não é img real) — só embute
    // se for base64 válido (aproximação: sem caracteres de HTML/css).
    if (content.length > MAX) return null;
    if (/^[A-Za-z0-9+/=\s]+$/.test(content.slice(0, 400)) && content.length > 100) {
      return `data:${mime};base64,${content.replace(/\s+/g, "")}`;
    }
    return null;
  };

  // <img src="./assets/x.png">
  html = html.replace(/(<img[^>]*\ssrc=["'])(\.\/[^"']+|assets\/[^"']+)(["'])/gi, (m, pre, href, post) => {
    const data = findContent(href);
    return data ? `${pre}${data}${post}` : m;
  });
  // url('./assets/x.png') em style inline
  html = html.replace(/(url\(["']?)(\.\/assets\/[^"')]+|assets\/[^"')]+)(["']?\))/gi, (m, pre, href, post) => {
    const data = findContent(href);
    return data ? `${pre}${data}${post}` : m;
  });
  return html;
}

function fileKeyOf(p: string): string {
  const parts = p.split("/");
  return parts.slice(1).join("/");
}

function isBalancedCssText(styleBlock: string): boolean {
  const inner = styleBlock.replace(/^<style[^>]*>/i, "").replace(/<\/style>$/i, "");
  // Usa a função compartilhada se disponível; fallback simples.
  if (typeof isBalancedJsSafe === "function") {
    // balanceamento de {} para CSS é igual ao de chaves em JS
    return isBalancedJsSafe(inner, "{", "}");
  }
  let open = 0;
  for (const ch of inner) {
    if (ch === "{") open++;
    else if (ch === "}") open--;
    if (open < 0) return false;
  }
  return open === 0;
}
