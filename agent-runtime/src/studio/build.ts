// Build de produção REAL do projeto React (C5) — roda no runtime, no workspace
// do projeto, SEM shell livre e SEM comando vindo do cliente.
//
// Fluxo: ensure deps (npm install, 1x) → `npm run build` (script do próprio
// package.json) → valida `dist/` → colapsa o build num HTML auto-contido
// (inline de JS/CSS) para publicação pelo pipeline existente.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface BuildRun {
  ok: boolean;
  log: string;
  html?: string;
  distFiles?: Record<string, string>;
  error?: string;
}

const INSTALL_TIMEOUT_MS = 420_000;
const BUILD_TIMEOUT_MS = 300_000;
const MAX_LOG = 60_000;
const REACT_BUILD_MARKER = "<!-- prospector-react-build -->";

const TEXT_EXT = new Set(["html", "htm", "js", "mjs", "cjs", "css", "json", "svg", "txt", "map", "webmanifest"]);

function sanitizedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== "string") continue;
    if (/key|token|secret|password|passwd|credential|api|auth|cookie|session/i.test(k)) continue;
    env[k] = v;
  }
  env.CI = "1";
  env.npm_config_audit = "false";
  env.npm_config_fund = "false";
  return env;
}

function npmCmd(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpm(root: string, args: string[], timeoutMs: number): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    let out = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(npmCmd(), args, { cwd: root, env: sanitizedEnv(), shell: process.platform === "win32", windowsHide: true });
    } catch (e) {
      resolve({ code: -1, log: e instanceof Error ? e.message : String(e) });
      return;
    }
    let done = false;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, log: out.length > MAX_LOG ? out.slice(-MAX_LOG) : out });
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* noop */ }
      finish(-1);
    }, timeoutMs);
    child.stdout?.on("data", (d) => { if (out.length < MAX_LOG * 2) out += String(d); });
    child.stderr?.on("data", (d) => { if (out.length < MAX_LOG * 2) out += String(d); });
    child.on("error", (e) => { out += `\n${e.message}`; finish(-1); });
    child.on("close", (code) => finish(code));
  });
}

/** Garante dependências instaladas no workspace (npm install 1x). */
export async function ensureProjectDeps(root: string, log: string[] = []): Promise<{ ok: boolean; error?: string; log: string }> {
  if (existsSync(join(root, "node_modules"))) return { ok: true, log: "" };
  if (!existsSync(join(root, "package.json"))) return { ok: false, error: "Projeto sem package.json.", log: "" };
  const res = await runNpm(root, ["install", "--no-audit", "--no-fund", "--prefer-offline"], INSTALL_TIMEOUT_MS);
  const text = `[install]\n${res.log}`;
  log.push(text);
  if (res.code !== 0) return { ok: false, error: `npm install falhou (exit ${res.code}).`, log: text };
  return { ok: true, log: text };
}

/** Coleta os arquivos de texto de `dist/` (mapa relativo posix). */
export function collectDistFiles(root: string): Record<string, string> {
  const dist = join(root, "dist");
  if (!existsSync(dist)) return {};
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.isFile()) continue;
      const rel = relative(dist, full).split(sep).join("/");
      const ext = (rel.split(".").pop() ?? "").toLowerCase();
      if (!TEXT_EXT.has(ext)) continue; // binário (png/woff) fica de fora do single-file
      try {
        if (statSync(full).size > 3_000_000) continue;
        const content = readFileSync(full, "utf8");
        if (content.length > 0) out[rel] = content;
      } catch { /* ignora */ }
    }
  };
  walk(dist);
  return out;
}

function assetKey(ref: string, distFiles: Record<string, string>): string | null {
  const clean = ref.split("?")[0].split("#")[0].replace(/^\/+/, "").replace(/^\.\//, "");
  if (distFiles[clean] !== undefined) return clean;
  const hit = Object.keys(distFiles).find((k) => k === clean || k.endsWith(`/${clean}`) || clean.endsWith(`/${k}`));
  return hit ?? null;
}

/** Valida o output do build (index.html não vazio). */
export function validateBuildOutput(distFiles: Record<string, string>): { ok: boolean; error?: string } {
  const html = distFiles["index.html"];
  if (!html || !/<body[\s>]/i.test(html)) return { ok: false, error: "Build não gerou dist/index.html válido." };
  return { ok: true };
}

/**
 * Runtime de NAVEGAÇÃO do site publicado.
 *
 * O site publicado roda num iframe `srcDoc` SANDBOX SEM `allow-same-origin`
 * (origem opaca). Nesse contexto, um clique em `<a href="#secao">` dispara uma
 * navegação de fragmento que o sandbox bloqueia/recarrega — e como o app React é
 * um module script inline, ele não reinicializa depois, então o menu "morre".
 *
 * Esta correção intercepta os cliques de âncora (fase de captura, no documento)
 * e faz o scroll na própria página, SEM navegação. Por ser um script clássico
 * embutido no HTML, ele roda de novo a cada load — o menu continua funcionando
 * depois de qualquer reload/F5. Não cria roteador nem navegação paralela.
 */
export const PUBLIC_NAV_RUNTIME_SCRIPT = [
  '<script data-prospector-nav="1">',
  "(function(){",
  "  function scrollToHash(hash){",
  '    var id = String(hash || "").replace(/^#/, "");',
  "    if(!id){ try{ window.scrollTo({top:0,behavior:\"smooth\"}); }catch(e){ window.scrollTo(0,0); } return true; }",
  "    var el = document.getElementById(id) || (document.getElementsByName(id)[0] || null);",
  "    if(!el) return false;",
  "    try{ el.scrollIntoView({behavior:\"smooth\",block:\"start\"}); }catch(e){ try{ el.scrollIntoView(); }catch(e2){} }",
  "    return true;",
  "  }",
  '  document.addEventListener("click", function(ev){',
  "    var node = ev.target;",
  '    var a = node && node.closest ? node.closest("a[href]") : null;',
  "    if(!a || a.hasAttribute(\"data-prospector-external\")) return;",
  '    var href = a.getAttribute("href") || "";',
  '    if(href.charAt(0) === "#"){',
  "      ev.preventDefault();",
  '      if(scrollToHash(href)){ try{ history.replaceState(null, "", href); }catch(e){} }',
  "      return;",
  "    }",
  "    try{",
  "      var u = new URL(href, location.href);",
  "      var sameDoc = u.origin === location.origin && u.pathname === location.pathname && !u.search && !!u.hash;",
  '      if(sameDoc){ ev.preventDefault(); if(scrollToHash(u.hash)){ try{ history.replaceState(null, "", u.hash); }catch(e){} } }',
  "    }catch(e){}",
  "  }, true);",
  '  window.addEventListener("load", function(){ try{ if(location.hash){ scrollToHash(location.hash); } }catch(e){} });',
  "})();",
  "</script>",
].join("\n");

/** Injeta o runtime de âncoras antes de `</body>` (ou no fim, se ausente). */
export function injectPublicNavRuntime(html: string): string {
  if (!html) return html;
  if (html.includes('data-prospector-nav="1"')) return html;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx >= 0) return `${html.slice(0, idx)}\n${PUBLIC_NAV_RUNTIME_SCRIPT}\n${html.slice(idx)}`;
  return `${html}\n${PUBLIC_NAV_RUNTIME_SCRIPT}`;
}

/**
 * Colapsa o build Vite num HTML auto-contido (inline de JS/CSS). Assim o site
 * publicado renderiza pelo pipeline existente (published_code → iframe), sem
 * depender de servidor de assets. Não altera o código-fonte do projeto.
 */
export function collapseDistToSingleHtml(distFiles: Record<string, string>): string | null {
  const html = distFiles["index.html"];
  if (!html) return null;
  let out = html;
  out = out.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src: string) => {
    const key = assetKey(src, distFiles);
    if (!key) return match;
    return `<script type="module">\n${distFiles[key]}\n</script>`;
  });
  out = out.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (match, href: string) => {
    const key = assetKey(href, distFiles);
    return key ? `<style>\n${distFiles[key]}\n</style>` : match;
  });
  out = out.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi, "");
  out = injectPublicNavRuntime(out);
  return `${REACT_BUILD_MARKER}\n${out}`;
}

/** Marca usada para o site público saber que o HTML é um build React colapsado. */
export function isReactBuildHtml(html: string): boolean {
  return typeof html === "string" && html.includes(REACT_BUILD_MARKER);
}

/** Executa o build de produção real do projeto React. */
export async function buildReactProject(root: string): Promise<BuildRun> {
  const log: string[] = [];
  const deps = await ensureProjectDeps(root, log);
  if (!deps.ok) return { ok: false, log: log.join("\n"), error: deps.error };

  const built = await runNpm(root, ["run", "build"], BUILD_TIMEOUT_MS);
  log.push(`[build]\n${built.log}`);
  if (built.code !== 0) {
    return { ok: false, log: log.join("\n"), error: `Build falhou (exit ${built.code}).` };
  }

  const distFiles = collectDistFiles(root);
  const validation = validateBuildOutput(distFiles);
  if (!validation.ok) return { ok: false, log: log.join("\n"), error: validation.error, distFiles };

  const html = collapseDistToSingleHtml(distFiles);
  if (!html) return { ok: false, log: log.join("\n"), error: "Falha ao colapsar o build para publicação.", distFiles };
  return { ok: true, log: log.join("\n"), html, distFiles };
}
