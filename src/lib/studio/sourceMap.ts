// Source Map do Studio (ADR-2) — associa ELEMENTO VISUAL → arquivo/linha.
//
// Sites do Prospector são HTML estático (não React), então NÃO existe
// `_debugSource` do Fiber. A estratégia determinística é anotar a CÓPIA DE
// PREVIEW com `data-pfsrc="<arquivo>:<linha>"` e, quando isso não existir,
// cair num matcher por id/classe/texto com índice de linhas.
//
// REGRA ABSOLUTA: nunca inventar localização. Sem certeza → devolver estado
// explícito (`unresolved`/`unsupported`) em vez de apontar para o arquivo errado.
//
// A anotação `data-pfsrc` é aplicada SOMENTE à cópia de preview — nunca ao
// `generated_code`, publicação ou exportação.

import { normalizeStudioPath } from "./fileTree";
import type { StudioElementDescriptor, StudioRect } from "./bridgeProtocol";
import type { StudioDevice, StudioFileMap } from "./types";

export type ElementSourceStatus = "resolved" | "unresolved" | "unsupported";

export interface ElementSourceLocation {
  status: ElementSourceStatus;
  file?: string;
  line?: number;
  column?: number;
  reason?: string;
  confidence?: "exact" | "heuristic";
}

const HTML_EXT_RE = /\.(html?|htm)$/i;
const REACT_EXT_RE = /\.(tsx|jsx)$/i;

function countNewlines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") n += 1;
  return n;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineOfIndex(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) if (content[i] === "\n") line += 1;
  return line;
}

/**
 * Anota as tags de abertura de um HTML com `data-pfsrc="<arquivo>:<linha>"`
 * (linha ORIGINAL do arquivo). Não toca no conteúdo de `<script>`/`<style>`
 * nem duplica anotação existente. Uso: SOMENTE na cópia de preview.
 */
export function annotateHtmlSource(html: string, filePath: string): string {
  const file = normalizeStudioPath(filePath) || filePath;
  let out = "";
  let i = 0;
  let line = 1;
  const n = html.length;

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    line += countNewlines(html.slice(i, lt));
    out += html.slice(i, lt);

    // Comentário.
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const e = end < 0 ? n : end + 3;
      const chunk = html.slice(lt, e);
      out += chunk;
      line += countNewlines(chunk);
      i = e;
      continue;
    }
    // Declaração/doctype/processing.
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const gt = html.indexOf(">", lt);
      const e = gt < 0 ? n : gt + 1;
      const chunk = html.slice(lt, e);
      out += chunk;
      line += countNewlines(chunk);
      i = e;
      continue;
    }

    const closing = html[lt + 1] === "/";
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(html.slice(lt + (closing ? 2 : 1)));
    if (!nameMatch) {
      out += "<";
      i = lt + 1;
      continue;
    }
    const tagName = nameMatch[0];
    const lowerTag = tagName.toLowerCase();

    // Fim da tag respeitando aspas.
    let k = lt + (closing ? 2 : 1) + tagName.length;
    let quote = "";
    while (k < n) {
      const ch = html[k];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      k += 1;
    }
    const tagEnd = Math.min(k + 1, n);
    const tagText = html.slice(lt, tagEnd);
    const tagStartLine = line;
    line += countNewlines(tagText);

    const isRawText = !closing && (lowerTag === "script" || lowerTag === "style");
    if (closing || isRawText || /data-pfsrc\s*=/i.test(tagText)) {
      out += tagText;
    } else {
      const selfClose = /\/>\s*$/.test(tagText);
      const insertAt = selfClose ? tagText.lastIndexOf("/>") : tagText.lastIndexOf(">");
      const at = insertAt < 0 ? tagText.length : insertAt;
      const marker = ` data-pfsrc="${escapeAttr(file)}:${tagStartLine}"`;
      out += tagText.slice(0, at) + marker + tagText.slice(at);
    }

    i = tagEnd;
    if (isRawText) {
      // Pula o conteúdo bruto até a tag de fechamento (não anotar JS/CSS).
      const closeRe = new RegExp(`</${tagName}\\s*>`, "i");
      const rest = html.slice(i);
      const m = closeRe.exec(rest);
      if (m) {
        const raw = rest.slice(0, m.index + m[0].length);
        out += raw;
        line += countNewlines(raw);
        i += raw.length;
      }
    }
  }
  return out;
}

interface SourceMatch {
  file: string;
  line: number;
  index: number;
}

function findFirst(content: string, re: RegExp): SourceMatch | null {
  const m = re.exec(content);
  if (!m) return null;
  return { file: "", line: lineOfIndex(content, m.index), index: m.index };
}

function searchHtmlFiles(files: StudioFileMap, buildRegex: () => RegExp): SourceMatch | null {
  const matches: SourceMatch[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!HTML_EXT_RE.test(path)) continue;
    const hit = findFirst(content, buildRegex());
    if (hit) matches.push({ ...hit, file: path });
    if (matches.length > 1) break;
  }
  return matches.length === 1 ? matches[0] : null;
}

function searchReactFiles(files: StudioFileMap, buildRegex: () => RegExp): string | null {
  for (const [path, content] of Object.entries(files)) {
    if (!REACT_EXT_RE.test(path)) continue;
    if (buildRegex().test(content)) return path;
  }
  return null;
}

function parsePfSrc(pfSrc: string, files: StudioFileMap): ElementSourceLocation | null {
  const raw = pfSrc.trim();
  let file = "";
  let line: number | undefined;
  let column: number | undefined;
  const hash = /^(.*?)#L(\d+)(?:C(\d+))?$/i.exec(raw);
  const colon = /^(.*):(\d+)(?::(\d+))?$/.exec(raw);
  if (hash) {
    file = hash[1];
    line = Number(hash[2]);
    column = hash[3] ? Number(hash[3]) : undefined;
  } else if (colon) {
    file = colon[1];
    line = Number(colon[2]);
    column = colon[3] ? Number(colon[3]) : undefined;
  } else {
    return null;
  }
  const normalized = normalizeStudioPath(file) || file;
  const key = files[normalized] !== undefined
    ? normalized
    : Object.keys(files).find((k) => k === normalized || k.endsWith(`/${normalized}`));
  if (!key || line === undefined || !Number.isFinite(line)) return null;
  return { status: "resolved", file: key, line, column, confidence: "exact" };
}

/** Resolve a origem de um elemento selecionado. Nunca chuta um arquivo errado. */
export function resolveElementSource(files: StudioFileMap, element: StudioElementDescriptor | null | undefined): ElementSourceLocation {
  if (!element) return { status: "unresolved", reason: "nenhum elemento selecionado" };

  // 1) PRIORIDADE MÁXIMA: origem React real (`_debugSource` do dev build).
  if (element.reactSource?.file) {
    const normalized = normalizeStudioPath(element.reactSource.file) || element.reactSource.file;
    const key = files[normalized] !== undefined
      ? normalized
      : Object.keys(files).find((k) => k === normalized || k.endsWith(`/${normalized}`));
    if (key) {
      return { status: "resolved", file: key, line: element.reactSource.line, column: element.reactSource.column, confidence: "exact" };
    }
    return { status: "unsupported", file: element.reactSource.file, reason: "Componente não pertence ao workspace do projeto (origem React fora do src)." };
  }

  if (element.pfsrc) {
    const parsed = parsePfSrc(element.pfsrc, files);
    if (parsed) return parsed;
    // pfsrc presente mas arquivo não existe no mapa atual → preview desatualizado.
  }

  const idRe = element.id ? () => new RegExp(`\\bid\\s*=\\s*["']${escapeRegExp(element.id)}["']`, "i") : null;
  if (idRe) {
    const html = searchHtmlFiles(files, idRe);
    if (html) return { status: "resolved", file: html.file, line: html.line, confidence: "heuristic" };
    const react = searchReactFiles(files, idRe);
    if (react) return { status: "unsupported", file: react, reason: "Componente React/TSX: sem _debugSource do Fiber em build estático." };
  }

  const firstClass = element.classes?.find((c) => c && !c.startsWith("pf-"));
  if (firstClass) {
    // Aceita `class` (HTML) e `className` (JSX) para o mesmo matcher.
    const classRe = () => new RegExp(`\\bclass(?:Name)?\\s*=\\s*["'][^"']*\\b${escapeRegExp(firstClass)}\\b[^"']*["']`, "i");
    const html = searchHtmlFiles(files, classRe);
    if (html) return { status: "resolved", file: html.file, line: html.line, confidence: "heuristic" };
    const react = searchReactFiles(files, classRe);
    if (react) return { status: "unsupported", file: react, reason: "Componente React/TSX: sem _debugSource do Fiber em build estático." };
  }

  const text = (element.text ?? "").trim().slice(0, 60);
  if (text.length >= 4) {
    const textRe = () => new RegExp(escapeRegExp(text), "i");
    const html = searchHtmlFiles(files, textRe);
    if (html) return { status: "resolved", file: html.file, line: html.line, confidence: "heuristic" };
    const react = searchReactFiles(files, textRe);
    if (react) return { status: "unsupported", file: react, reason: "Componente React/TSX: sem _debugSource do Fiber em build estático." };
  }

  return { status: "unresolved", reason: "Origem não determinada: elemento sem data-pfsrc e sem correspondência única no HTML." };
}

/** Contexto estruturado do elemento para o agente (Fase 4 prepara; Fase 5 usa). */
export function formatElementContextForAgent(selection: {
  tagName?: string;
  selector?: string;
  text?: string;
  classes?: string[];
  sourceLocation?: ElementSourceLocation;
  rect?: StudioRect;
} | null | undefined): string {
  if (!selection) return "";
  const origin = selection.sourceLocation?.status === "resolved" && selection.sourceLocation.file
    ? `${selection.sourceLocation.file}${selection.sourceLocation.line ? `:${selection.sourceLocation.line}` : ""}`
    : "origem não determinada";
  const lines = [
    "[ELEMENTO SELECIONADO NO PREVIEW]",
    `tag: ${selection.tagName ?? "?"}`,
    selection.selector ? `seletor: ${selection.selector}` : null,
    selection.classes?.length ? `classes: ${selection.classes.join(" ")}` : null,
    `origem: ${origin}`,
    selection.text ? `texto: ${selection.text}` : null,
    selection.rect ? `viewport rect: x=${selection.rect.x} y=${selection.rect.y} w=${selection.rect.width} h=${selection.rect.height}` : null,
    "",
    "[PEDIDO]",
  ].filter((l): l is string => l !== null);
  return `${lines.join("\n")}\n`;
}

export interface VisualAgentInstructionInput {
  selection: {
    selector?: string;
    tagName?: string;
    text?: string;
    classes?: string[];
    attributes?: Record<string, string>;
    rect?: StudioRect;
    sourceLocation?: ElementSourceLocation;
    componentName?: string;
  } | null;
  /** Pedido do usuário em linguagem natural. */
  request: string;
  device?: StudioDevice;
  scope?: string;
  /** Alterações pretendidas (com valor anterior, quando houver). */
  changes?: Array<{ property: string; value: string; before?: string }>;
}

/**
 * Instrução ESTRUTURADA para o Coder a partir de uma seleção visual (Fase 5).
 * Nunca envia só "mude o título": inclui arquivo/linha, seletor, texto atual,
 * viewport, escopo e valores antes/depois quando existirem.
 */
export function buildVisualAgentInstruction(input: VisualAgentInstructionInput): string {
  const sel = input.selection;
  const src = sel?.sourceLocation;
  const origin = src?.status === "resolved" && src.file
    ? `${src.file}${src.line ? `:${src.line}` : ""}`
    : "origem não determinada (localize pelo seletor/texto e confirme antes de editar)";

  const attrKeys = Object.keys(sel?.attributes ?? {}).filter((k) => !["srcset", "sizes"].includes(k)).slice(0, 10);
  const attrs = attrKeys.map((k) => `${k}="${String(sel?.attributes?.[k] ?? "").slice(0, 120)}"`);

  const lines: string[] = [
    "[ELEMENTO SELECIONADO NO PREVIEW]",
    sel?.componentName ? `componente: ${sel.componentName}` : null,
    `tag: ${sel?.tagName ?? "?"}`,
    sel?.selector ? `seletor: ${sel.selector}` : null,
    sel?.classes?.length ? `classes: ${sel.classes.join(" ")}` : null,
    `origem: ${origin}`,
    sel?.text ? `texto atual: ${sel.text}` : null,
    attrs.length ? `atributos: ${attrs.join(" ")}` : null,
    sel?.rect ? `rect: x=${sel.rect.x} y=${sel.rect.y} w=${sel.rect.width} h=${sel.rect.height}` : null,
    `viewport: ${input.device ?? "desktop"}`,
    input.scope ? `escopo: ${input.scope}` : null,
  ].filter((l): l is string => l !== null);

  if (input.changes?.length) {
    lines.push("", "[ALTERAÇÃO PRETENDIDA]");
    for (const c of input.changes) {
      lines.push(`- ${c.property}: ${c.value}${c.before ? ` (antes: ${c.before})` : ""}`);
    }
  }

  lines.push(
    "",
    "[COMO EXECUTAR]",
    "Altere SOMENTE o arquivo/elemento indicado, com edit_file (edição localizada).",
    "Preserve classes, demais propriedades, estrutura, animações e responsividade (inclua/ajuste @media apenas se o pedido exigir breakpoint).",
    "Depois de editar, confirme que a alteração existe no arquivo final.",
    "",
    "[PEDIDO DO USUÁRIO]",
    input.request.trim() || "(sem texto adicional)",
    "",
  );
  return lines.join("\n");
}
