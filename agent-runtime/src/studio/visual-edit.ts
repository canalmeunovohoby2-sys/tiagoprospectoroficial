// Visual Edit DETERMINÍSTICO server-side (C3) — React/TSX, CSS e HTML.
//
// Só aplica quando o alvo é INEQUÍVOCO e a edição é localizada (nunca
// reescreve o arquivo inteiro). Em qualquer ambiguidade/JSX complexo/breakpoint,
// devolve `handoff: "coder"` para o Coder da C1 executar com contexto.
//
// Segurança: reutiliza `normalizeGitPath` (bloqueia `..`, `.git`, `.env`/credenciais)
// e `safeWorkspaceJoin` (nunca sai do workspace) + `readWorkspace`.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeGitPath, readWorkspaceFile } from "./git.js";
import { readWorkspace, safeWorkspaceJoin } from "../workspace.js";

export interface VisualEditChange {
  property: string;
  value: string;
}

export interface VisualEditInput {
  file?: string;
  line?: number;
  selector?: string;
  tagName?: string;
  classes?: string[];
  /** Texto atual (para conferir antes de substituir). */
  text?: string;
  /** Novo texto (edição de texto). */
  newText?: string;
  /** Mudanças de estilo. */
  changes?: VisualEditChange[];
  /** Escopo (somente "global" é determinístico). */
  scope?: string;
}

export interface VisualEditOutcome {
  ok: boolean;
  applied: boolean;
  handoff?: "coder";
  reason?: string;
  error?: string;
  files?: Record<string, string>;
  mode?: "tsx-inline-style" | "tsx-text" | "css-rule" | "html-inline";
}

const ALLOWED_CSS_PROPS = new Set([
  "color", "background", "background-color", "font", "font-family", "font-size", "font-weight",
  "text-align", "padding", "margin", "border", "border-radius", "opacity", "width", "height",
  "box-shadow", "display", "gap", "letter-spacing", "line-height",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTagEnd(content: string, start: number): number {
  let quote = "";
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === ">") {
      return i + 1;
    }
  }
  return -1;
}

function findElementAtLine(content: string, line: number, tagName?: string): { start: number; end: number } | null {
  if (!Number.isFinite(line) || line < 1) return null;
  const lines = content.split("\n");
  if (line > lines.length) return null;
  let lineStart = 0;
  for (let i = 0; i < line - 1; i += 1) lineStart += lines[i].length + 1;
  const lineText = lines[line - 1];
  const tag = (tagName ?? "").trim();
  const re = tag ? new RegExp(`<${escapeRegExp(tag)}(?=[\\s/>])`) : /<[A-Za-z][A-Za-z0-9.:-]*(?=[\s/>])/;
  const m = re.exec(lineText);
  if (!m) return null;
  const start = lineStart + m.index;
  const end = findTagEnd(content, start);
  return end > start ? { start, end } : null;
}

/** Localiza o elemento por linha; fallback por atributo único (classe). */
function locateElement(content: string, input: VisualEditInput): { start: number; end: number } | null {
  if (input.line) {
    const byLine = findElementAtLine(content, input.line, input.tagName);
    if (byLine) return byLine;
  }
  const cls = input.classes?.find((c) => c && !c.startsWith("pf-"));
  if (cls) {
    const re = new RegExp(`<[^>]*\\bclassName\\s*=\\s*["'\`][^"'\`]*\\b${escapeRegExp(cls)}\\b[^"'\`]*["'\`]|<[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegExp(cls)}\\b[^"']*["']`);
    const m = re.exec(content);
    if (m) {
      const tagStart = content.lastIndexOf("<", m.index);
      const end = findTagEnd(content, tagStart);
      if (end > tagStart) return { start: tagStart, end };
    }
  }
  return null;
}

function findInlineStyleSpan(tagText: string): { propStart: number; propEnd: number } | null {
  const m = /\bstyle\s*=\s*\{\{/.exec(tagText);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = tagText.indexOf("}}", start);
  if (end < 0) return null;
  return { propStart: start, propEnd: end };
}

function replaceInlineStyle(tagText: string, changes: VisualEditChange[]): string | null {
  const span = findInlineStyleSpan(tagText);
  if (!span) return null;
  let body = tagText.slice(span.propStart, span.propEnd);
  for (const change of changes) {
    const camel = change.property.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    const re = new RegExp(`(\\b${escapeRegExp(camel)}\\s*:\\s*)(["'\`])([\\s\\S]*?)\\2`);
    if (!re.test(body)) return null; // propriedade ausente → não arriscar (Coder)
    body = body.replace(re, `$1$2${change.value}$2`);
  }
  return tagText.slice(0, span.propStart) + body + tagText.slice(span.propEnd);
}

function innerTextRange(content: string, tagEnd: number, tagName: string): { innerStart: number; innerEnd: number; inner: string } | null {
  const closeRe = new RegExp(`</${escapeRegExp(tagName)}\\s*>`);
  const rest = content.slice(tagEnd);
  const close = closeRe.exec(rest);
  if (!close) return null;
  const inner = content.slice(tagEnd, tagEnd + close.index);
  if (new RegExp(`<${escapeRegExp(tagName)}(?=[\\s/>])`).test(inner)) return null; // aninhado → não é texto simples
  return { innerStart: tagEnd, innerEnd: tagEnd + close.index, inner };
}

function findTopLevelCssRule(css: string, className: string): { bodyStart: number; bodyEnd: number } | null {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let depth = 0;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const classRe = new RegExp(`\\.${escapeRegExp(className)}(?![\\w-])`);
  while ((m = re.exec(css))) {
    // recalcula a profundidade aproximada até m.index
    for (let i = lastIndex; i < m.index; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
    }
    lastIndex = m.index;
    const selector = m[1].trim();
    if (depth === 0 && !selector.startsWith("@") && !selector.includes(":") && classRe.test(selector)) {
      const bodyStart = m.index + m[1].length + 1;
      return { bodyStart, bodyEnd: bodyStart + m[2].length };
    }
  }
  return null;
}

function mergeCssDeclaration(body: string, property: string, value: string): string {
  const parts = body.split(";");
  let found = false;
  const mapped = parts.map((part) => {
    const t = part.trim();
    if (!t) return part;
    const ci = t.indexOf(":");
    if (ci > 0 && t.slice(0, ci).trim().toLowerCase() === property.toLowerCase()) {
      found = true;
      return ` ${property}: ${value}`;
    }
    return part;
  });
  if (found) return mapped.join(";");
  const suffix = body.trim() ? (body.trimEnd().endsWith(";") ? " " : "; ") : " ";
  return `${body.trimEnd()}${suffix}${property}: ${value};`;
}

/**
 * Aplica uma edição visual determinística ao workspace. Nunca lança.
 */
export function applyDeterministicVisualEdit(root: string, input: VisualEditInput): VisualEditOutcome {
  try {
    const rel = normalizeGitPath(input.file);
    if (!rel) return { ok: true, applied: false, handoff: "coder", reason: "Arquivo de origem inválido ou sensível." };
    const abs = safeWorkspaceJoin(root, rel);
    if (!abs || !existsSync(abs)) return { ok: true, applied: false, handoff: "coder", reason: "Arquivo de origem não existe no workspace." };

    if (input.scope && input.scope !== "global") {
      return { ok: true, applied: false, handoff: "coder", reason: `Escopo "${input.scope}": alteração responsiva precisa do Coder.` };
    }

    const content = readFileSync(abs, "utf8");
    const isCss = /\.(css|scss|less)$/i.test(rel);
    const isTsx = /\.(tsx|jsx)$/i.test(rel);
    const isHtml = /\.(html?|htm)$/i.test(rel);

    // ---- TEXTO ----
    if (input.newText !== undefined && input.newText !== null) {
      if (!isTsx && !isHtml) return { ok: true, applied: false, handoff: "coder", reason: "Edição de texto direta não suportada neste tipo de arquivo." };
      const el = locateElement(content, input);
      if (!el) return { ok: true, applied: false, handoff: "coder", reason: "Elemento não localizado com segurança." };
      const tagText = content.slice(el.start, el.end);
      const tagMatch = /^<([A-Za-z][A-Za-z0-9.:-]*)/.exec(tagText);
      if (!tagMatch) return { ok: true, applied: false, handoff: "coder", reason: "Tag inválida." };
      const range = innerTextRange(content, el.end, tagMatch[1]);
      if (!range || range.inner.includes("<")) return { ok: true, applied: false, handoff: "coder", reason: "Elemento com estrutura JSX complexa — enviado ao Coder." };
      const expected = (input.text ?? "").replace(/\s+/g, " ").trim();
      const current = range.inner.replace(/\s+/g, " ").trim();
      if (expected && current !== expected) return { ok: true, applied: false, handoff: "coder", reason: "Conteúdo atual difere da seleção (stale) — enviado ao Coder." };
      const next = content.slice(0, range.innerStart) + input.newText + content.slice(range.innerEnd);
      writeFileSync(abs, next, "utf8");
      return { ok: true, applied: true, mode: "tsx-text", files: readWorkspace(root) };
    }

    // ---- ESTILO ----
    const changes = (input.changes ?? []).filter((c) => ALLOWED_CSS_PROPS.has(c.property.toLowerCase()));
    if (changes.length === 0) return { ok: true, applied: false, handoff: "coder", reason: "Sem propriedades de estilo suportadas." };

    if (isCss) {
      const cls = input.classes?.find((c) => c && !c.startsWith("pf-"));
      if (!cls) return { ok: true, applied: false, handoff: "coder", reason: "Sem classe para localizar a regra CSS." };
      const rule = findTopLevelCssRule(content, cls);
      if (!rule) return { ok: true, applied: false, handoff: "coder", reason: "Regra CSS da classe não encontrada." };
      let body = content.slice(rule.bodyStart, rule.bodyEnd);
      for (const c of changes) body = mergeCssDeclaration(body, c.property, c.value);
      const next = content.slice(0, rule.bodyStart) + body + content.slice(rule.bodyEnd);
      writeFileSync(abs, next, "utf8");
      return { ok: true, applied: true, mode: "css-rule", files: readWorkspace(root) };
    }

    if (isTsx || isHtml) {
      const el = locateElement(content, input);
      if (!el) return { ok: true, applied: false, handoff: "coder", reason: "Elemento não localizado com segurança." };
      const tagText = content.slice(el.start, el.end);
      if (/style\s*=\s*\{\{/.test(tagText) && isTsx) {
        const nextTag = replaceInlineStyle(tagText, changes);
        if (nextTag) {
          const next = content.slice(0, el.start) + nextTag + content.slice(el.end);
          writeFileSync(abs, next, "utf8");
          return { ok: true, applied: true, mode: "tsx-inline-style", files: readWorkspace(root) };
        }
      }
      if (isHtml && /\bstyle\s*=\s*["']/.test(tagText)) {
        const styleMatch = /\bstyle\s*=\s*["']([^"']*)["']/.exec(tagText);
        if (styleMatch) {
          let body = styleMatch[1];
          for (const c of changes) body = mergeCssDeclaration(body, c.property, c.value);
          const nextTag = tagText.replace(styleMatch[0], `style="${body.trim()}"`);
          const next = content.slice(0, el.start) + nextTag + content.slice(el.end);
          writeFileSync(abs, next, "utf8");
          return { ok: true, applied: true, mode: "html-inline", files: readWorkspace(root) };
        }
      }
      return { ok: true, applied: false, handoff: "coder", reason: "Estilo em componente JSX sem `style` inline — o Coder edita a classe/componente real." };
    }

    return { ok: true, applied: false, handoff: "coder", reason: "Tipo de arquivo não suportado para edição direta." };
  } catch (e) {
    return { ok: false, applied: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Lê um arquivo do workspace para o diff/contexto (helper). */
export function readVisualTarget(root: string, file: string): string | null {
  return readWorkspaceFile(root, file);
}
