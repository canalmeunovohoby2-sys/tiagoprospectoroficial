// Edição visual DETERMINÍSTICA (Fase 5).
//
// Altera o CÓDIGO REAL do projeto (nunca apenas o DOM do preview). Toda edição
// é LOCALIZADA: usa a origem do source map (`data-pfsrc` / matcher) para achar
// exatamente o elemento, e só aplica quando isso é seguro e único. Caso
// contrário devolve `ok:false` com motivo — o Studio então encaminha ao Coder.
//
// Suportado (com segurança):
//   - texto: elemento com conteúdo textual SIMPLES (sem tags filhas);
//   - estilo: merge no `style` inline existente, ou na regra CSS da classe
//     (top-level, sem pseudo) quando existir — sem duplicar CSS;
//   - atributo: href/src/alt/… pontuais.
//
// NÃO suportado aqui (vai para o Coder com contexto): edição por breakpoint,
// estrutura ambígua, elemento sem origem confiável, reescrita de componentes.

import { normalizeStudioPath } from "./fileTree";
import type { ElementSourceLocation } from "./sourceMap";
import type { StudioFileMap } from "./types";

const HTML_EXT_RE = /\.(html?|htm)$/i;
const CSS_EXT_RE = /\.css$/i;

export type VisualEditKind = "text" | "style" | "attribute";

export interface VisualStyleChange {
  property: string;
  value: string;
}

export interface VisualEditTarget {
  selector: string;
  tagName?: string;
  id?: string;
  classes?: string[];
  text?: string;
  pfsrc?: string | null;
  sourceLocation?: ElementSourceLocation | null;
  /** Escopo: global (default) ou breakpoint (roteado ao Coder). */
  scope?: "global" | "mobile" | "tablet" | string;
}

export interface VisualEditPlan {
  kind: VisualEditKind;
  changes?: VisualStyleChange[];
  text?: string;
  attribute?: { name: string; value: string };
}

export interface VisualEditResult {
  ok: boolean;
  reason?: string;
  kind?: VisualEditKind;
  file?: string;
  /** Onde a edição foi aplicada. */
  mode?: "html-inline" | "css-rule" | "html-text" | "html-attribute";
  before?: string;
  after?: string;
  files?: StudioFileMap;
}

interface LocatedElement {
  ok: true;
  file: string;
  start: number;
  end: number;
  content: string;
}
interface LocateFailure {
  ok: false;
  reason: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttrValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function braceDepth(css: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
  }
  return depth;
}

/** Fim (após `>`) da tag iniciada em `start`, respeitando aspas. */
function findTagEnd(content: string, start: number): number {
  let quote = "";
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i + 1;
    }
  }
  return -1;
}

function findTagAtLine(content: string, line: number, tagName?: string): { start: number; end: number } | null {
  if (!Number.isFinite(line) || line < 1) return null;
  const lines = content.split("\n");
  if (line > lines.length) return null;
  let lineStart = 0;
  for (let i = 0; i < line - 1; i += 1) lineStart += lines[i].length + 1;
  const lineText = lines[line - 1];
  const tag = (tagName ?? "").trim();
  const re = tag ? new RegExp(`<${escapeRegExp(tag)}(?=[\\s/>])`, "i") : /<[a-zA-Z][a-zA-Z0-9:-]*(?=[\s/>])/;
  const m = re.exec(lineText);
  if (!m) return null;
  const start = lineStart + m.index;
  const end = findTagEnd(content, start);
  return end > start ? { start, end } : null;
}

function parsePfSrc(pfSrc: string): { file: string; line: number } | null {
  const hash = /^(.*?)#L(\d+)/i.exec(pfSrc.trim());
  if (hash) return { file: normalizeStudioPath(hash[1]) || hash[1], line: Number(hash[2]) };
  const colon = /^(.*):(\d+)$/.exec(pfSrc.trim());
  if (colon) return { file: normalizeStudioPath(colon[1]) || colon[1], line: Number(colon[2]) };
  return null;
}

function hasAttr(tagText: string, name: string): boolean {
  return new RegExp(`\\s${escapeRegExp(name)}\\s*=`, "i").test(tagText);
}

function getAttr(tagText: string, name: string): string | null {
  const re = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  const m = re.exec(tagText);
  return m ? m[2] : null;
}

function setAttr(tagText: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${escapeRegExp(name)}\\s*=\\s*)(["'])([\\s\\S]*?)\\2`, "i");
  if (re.test(tagText)) {
    return tagText.replace(re, `$1$2${escapeAttrValue(value)}$2`);
  }
  const selfClose = /\/>\s*$/.test(tagText);
  const at = selfClose ? tagText.lastIndexOf("/>") : tagText.lastIndexOf(">");
  const pos = at < 0 ? tagText.length : at;
  return `${tagText.slice(0, pos)} ${name}="${escapeAttrValue(value)}"${tagText.slice(pos)}`;
}

/** Localiza o elemento no HTML: origem resolvida (linha) ou matcher único. */
function locateElement(files: StudioFileMap, target: VisualEditTarget): LocatedElement | LocateFailure {
  const srcFile = target.sourceLocation?.status === "resolved" ? target.sourceLocation.file : undefined;
  const srcLine = target.sourceLocation?.status === "resolved" ? target.sourceLocation.line : undefined;

  if (srcFile && files[srcFile] !== undefined && HTML_EXT_RE.test(srcFile) && srcLine) {
    const content = files[srcFile];
    const tag = findTagAtLine(content, srcLine, target.tagName);
    if (tag) return { ok: true, file: srcFile, start: tag.start, end: tag.end, content };
  }

  const parsed = target.pfsrc ? parsePfSrc(target.pfsrc) : null;
  if (parsed && files[parsed.file] !== undefined && HTML_EXT_RE.test(parsed.file)) {
    const content = files[parsed.file];
    const tag = findTagAtLine(content, parsed.line, target.tagName);
    if (tag) return { ok: true, file: parsed.file, start: tag.start, end: tag.end, content };
  }

  // Fallback: matcher único por id > classe > texto (mesma lógica do sourceMap).
  const htmlFiles = Object.keys(files).filter((p) => HTML_EXT_RE.test(p));
  const patterns: RegExp[] = [];
  if (target.id) patterns.push(new RegExp(`<[^>]*\\bid\\s*=\\s*["']${escapeRegExp(target.id)}["']`, "i"));
  const cls = target.classes?.find((c) => c && !c.startsWith("pf-"));
  if (cls) patterns.push(new RegExp(`<[^>]*\\bclass(?:Name)?\\s*=\\s*["'][^"']*\\b${escapeRegExp(cls)}\\b[^"']*["']`, "i"));
  const text = (target.text ?? "").trim();
  if (text.length >= 4) patterns.push(new RegExp(escapeRegExp(text), "i"));

  const hits: Array<{ file: string; start: number; end: number }> = [];
  for (const file of htmlFiles) {
    const content = files[file];
    for (const re of patterns) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      const m: RegExpExecArray | null = g.exec(content);
      if (!m) continue;
      const firstIndex = m.index;
      // Mais de uma correspondência no MESMO arquivo → ambíguo (não arriscar).
      if (g.exec(content)) return { ok: false, reason: "Elemento ambíguo: mais de uma correspondência no arquivo — edição direta bloqueada (encaminhado ao Coder)." };
      const tagStart = content.lastIndexOf("<", firstIndex);
      const start = tagStart >= 0 ? tagStart : firstIndex;
      const end = findTagEnd(content, start);
      if (end > start) hits.push({ file, start, end });
      break; // uma correspondência por arquivo
    }
    if (hits.length > 1) break;
  }
  if (hits.length === 1) {
    const hit = hits[0];
    return { ok: true, file: hit.file, start: hit.start, end: hit.end, content: files[hit.file] };
  }
  return {
    ok: false,
    reason: target.sourceLocation?.status === "unsupported"
      ? target.sourceLocation.reason ?? "Origem não suportada para edição direta."
      : "Elemento sem origem única — edição direta bloqueada (encaminhado ao Coder).",
  };
}

interface CssRuleHit {
  file: string;
  bodyStart: number;
  bodyEnd: number;
  selector: string;
}

function findTopLevelCssRule(css: string, className: string): Omit<CssRuleHit, "file"> | null {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  const classRe = new RegExp(`\\.${escapeRegExp(className)}(?![\\w-])`);
  while ((m = re.exec(css))) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    if (braceDepth(css, m.index) !== 0) continue; // ignora regras dentro de @media
    if (selector.includes(":")) continue; // ignora pseudo-estados (:hover etc.)
    if (!classRe.test(selector)) continue;
    const bodyStart = m.index + m[1].length + 1;
    return { bodyStart, bodyEnd: bodyStart + m[2].length, selector };
  }
  return null;
}

function findCssRuleForClass(files: StudioFileMap, className: string): CssRuleHit | null {
  const cssFiles = Object.keys(files).filter((p) => CSS_EXT_RE.test(p)).sort();
  for (const file of cssFiles) {
    const rule = findTopLevelCssRule(files[file], className);
    if (rule) return { file, ...rule };
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

function innerTextRange(content: string, tagEnd: number, tagName: string): { innerStart: number; innerEnd: number; inner: string } | null {
  const closeRe = new RegExp(`</${escapeRegExp(tagName)}\\s*>`, "i");
  const rest = content.slice(tagEnd);
  const close = closeRe.exec(rest);
  if (!close) return null;
  const inner = content.slice(tagEnd, tagEnd + close.index);
  // Elemento com tags filhas (mesmo tipo) → não é texto simples/seguro.
  if (new RegExp(`<${escapeRegExp(tagName)}(?=[\\s/>])`, "i").test(inner)) return null;
  return { innerStart: tagEnd, innerEnd: tagEnd + close.index, inner };
}

function updateFile(files: StudioFileMap, file: string, content: string): StudioFileMap {
  return { ...files, [file]: content };
}

/**
 * Aplica uma edição visual determinística ao mapa de arquivos. Retorna o mapa
 * atualizado SOMENTE quando a edição é segura e única; caso contrário `ok:false`.
 */
export function applyVisualEdit(files: StudioFileMap, target: VisualEditTarget, plan: VisualEditPlan): VisualEditResult {
  if (plan.kind === "style" && (!plan.changes || plan.changes.length === 0)) {
    return { ok: false, reason: "Nenhuma propriedade de estilo informada." };
  }
  if (plan.kind === "text" && (plan.text === undefined || plan.text === null)) {
    return { ok: false, reason: "Nenhum texto informado." };
  }
  if (plan.kind === "attribute" && (!plan.attribute || !plan.attribute.name)) {
    return { ok: false, reason: "Atributo não informado." };
  }
  if (target.scope && target.scope !== "global") {
    return { ok: false, reason: `Escopo "${target.scope}": edição por breakpoint precisa do Coder (respeita os @media existentes).` };
  }

  const located = locateElement(files, target);
  if (!located.ok) return { ok: false, reason: located.reason };

  const { file, start, end, content } = located;
  const tagText = content.slice(start, end);
  const tagName = target.tagName || (/^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(tagText)?.[1] ?? "");

  if (plan.kind === "text") {
    const range = innerTextRange(content, end, tagName);
    if (!range) return { ok: false, reason: "Elemento com estrutura interna — edição de texto direta bloqueada (encaminhado ao Coder)." };
    const plain = !range.inner.includes("<");
    if (!plain) return { ok: false, reason: "Elemento contém tags filhas — edição de texto direta bloqueada (encaminhado ao Coder)." };
    const expected = (target.text ?? "").replace(/\s+/g, " ").trim();
    const current = range.inner.replace(/\s+/g, " ").trim();
    if (expected && current !== expected) {
      return { ok: false, reason: "O conteúdo atual não corresponde à seleção (preview desatualizado?) — encaminhado ao Coder." };
    }
    const nextText = plan.text ?? "";
    const nextContent = content.slice(0, range.innerStart) + nextText + content.slice(range.innerEnd);
    return {
      ok: true,
      kind: "text",
      file,
      mode: "html-text",
      before: current,
      after: nextText,
      files: updateFile(files, file, nextContent),
    };
  }

  if (plan.kind === "attribute" && plan.attribute) {
    const { name, value } = plan.attribute;
    const before = getAttr(tagText, name) ?? "";
    const nextTag = setAttr(tagText, name, value);
    const nextContent = content.slice(0, start) + nextTag + content.slice(end);
    return {
      ok: true,
      kind: "attribute",
      file,
      mode: "html-attribute",
      before,
      after: value,
      files: updateFile(files, file, nextContent),
    };
  }

  // STYLE
  const changes = plan.changes ?? [];
  const firstClass = target.classes?.find((c) => c && !c.startsWith("pf-"));

  // 1) `style` inline existente — merge (preserva demais declarações).
  if (hasAttr(tagText, "style")) {
    const before = getAttr(tagText, "style") ?? "";
    let merged = before;
    for (const change of changes) merged = mergeCssDeclaration(merged, change.property, change.value);
    const nextTag = setAttr(tagText, "style", merged.trim());
    const nextContent = content.slice(0, start) + nextTag + content.slice(end);
    return { ok: true, kind: "style", file, mode: "html-inline", before, after: merged.trim(), files: updateFile(files, file, nextContent) };
  }

  // 2) Regra CSS da classe (sem duplicar CSS, preserva o design).
  if (firstClass) {
    const rule = findCssRuleForClass(files, firstClass);
    if (rule) {
      const css = files[rule.file];
      const body = css.slice(rule.bodyStart, rule.bodyEnd);
      let merged = body;
      for (const change of changes) merged = mergeCssDeclaration(merged, change.property, change.value);
      const nextCss = css.slice(0, rule.bodyStart) + merged + css.slice(rule.bodyEnd);
      const before = body.replace(/\s+/g, " ").trim().slice(0, 200);
      return { ok: true, kind: "style", file: rule.file, mode: "css-rule", before, after: merged.replace(/\s+/g, " ").trim().slice(0, 200), files: updateFile(files, rule.file, nextCss) };
    }
  }

  // 3) Sem regra de classe → cria/merge `style` inline no elemento.
  let inline = "";
  for (const change of changes) inline = mergeCssDeclaration(inline, change.property, change.value);
  const nextTag = setAttr(tagText, "style", inline.trim());
  const nextContent = content.slice(0, start) + nextTag + content.slice(end);
  return { ok: true, kind: "style", file, mode: "html-inline", before: "", after: inline.trim(), files: updateFile(files, file, nextContent) };
}

/**
 * Evidência da alteração: confirma que a propriedade/texto está no ARQUIVO
 * final (fonte de verdade) — não apenas que "a edição rodou".
 */
export function verifyVisualEdit(files: StudioFileMap, target: VisualEditTarget, plan: VisualEditPlan, result: VisualEditResult): { ok: boolean; detail: string } {
  if (!result.ok || !result.file) return { ok: false, detail: result.reason ?? "edição não aplicada" };
  const content = files[result.file];
  if (content === undefined) return { ok: false, detail: `arquivo ${result.file} ausente após a edição` };

  if (plan.kind === "text") {
    const located = locateElement(files, target);
    if (!located.ok) return { ok: false, detail: located.reason };
    const range = innerTextRange(located.content, located.end, target.tagName || "div");
    if (!range) return { ok: false, detail: "elemento não localizável após a edição" };
    const now = range.inner.replace(/\s+/g, " ").trim();
    const expected = (plan.text ?? "").replace(/\s+/g, " ").trim();
    return now === expected
      ? { ok: true, detail: `texto atualizado em ${result.file}` }
      : { ok: false, detail: "texto não confere após a edição" };
  }

  if (plan.kind === "attribute" && plan.attribute) {
    const located = locateElement(files, target);
    if (!located.ok) return { ok: false, detail: located.reason };
    const tagText = located.content.slice(located.start, located.end);
    const val = getAttr(tagText, plan.attribute.name);
    return val === plan.attribute.value
      ? { ok: true, detail: `${plan.attribute.name} atualizado em ${result.file}` }
      : { ok: false, detail: `${plan.attribute.name} não confere após a edição` };
  }

  const changes = plan.changes ?? [];
  const normalized = content.replace(/\s+/g, " ");
  const missing = changes.filter((c) => !normalized.includes(`${c.property}: ${c.value}`.replace(/\s+/g, " ")));
  return missing.length === 0
    ? { ok: true, detail: `${changes.length} propriedade(s) confirmadas em ${result.file}` }
    : { ok: false, detail: `propriedade(s) não confirmadas: ${missing.map((m) => m.property).join(", ")}` };
}
