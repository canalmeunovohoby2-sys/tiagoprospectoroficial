// Visual Evidence (6.0) — estrutura provider-agnostic que descreve a evidência
// real de uma página renderizada: screenshot real + viewport + geometria (browser_
// measure) + DOM/elementos + console. NUNCA gera/imaginifica screenshot e NUNCA
// confunde "screenshot capturado" com "análise visual realizada".
// Puro e testável (build + summarizer).

import { type MeasuredElement, type ViewportInfo, distanceBelow, distanceRight, horizontalAlignment, overlapArea, contains, overlapsX, overlapsY, proportionWidth, proportionHeight } from "./geometry.js";

export type MimeImage = "image/png" | "image/jpeg" | "image/webp";

export interface VisualEvidence {
  screenshot?: { data: string; mimeType: MimeImage };
  viewport: ViewportInfo;
  /** Saída de browser_measure (elementos medidos) + relações — evidência geométrica. */
  geometry?: unknown;
  /** Resumo estrutural do DOM (elementos, overflow, textura). */
  dom?: unknown;
  consoleErrors?: string[];
  capturedAt: string;
}

export interface BuildVisualEvidenceInput {
  screenshot?: { data: string; mimeType: MimeImage };
  viewport: ViewportInfo;
  geometry?: unknown;
  dom?: unknown;
  consoleErrors?: string[];
}

export function buildVisualEvidence(input: BuildVisualEvidenceInput): VisualEvidence {
  return {
    ...(input.screenshot ? { screenshot: input.screenshot } : {}),
    viewport: input.viewport,
    ...(input.geometry !== undefined ? { geometry: input.geometry } : {}),
    ...(input.dom !== undefined ? { dom: input.dom } : {}),
    consoleErrors: Array.isArray(input.consoleErrors) ? input.consoleErrors.slice(0, 20) : [],
    capturedAt: new Date().toISOString(),
  };
}

/** Indica que NÃO houve screenshot real (ausência honesta, nunca simulada). */
export function hasScreenshot(ev: VisualEvidence): boolean {
  return !!ev.screenshot && typeof ev.screenshot.data === "string" && ev.screenshot.data.length > 0;
}

// ---- Resumo ESTRUTURADO (sem visão multimodal) ----
// Gera um texto de evidência a partir de geometria/DOM/viewport. Não é "análise
// visual por imagem"; é evidência estruturada que o modelo pode usar para decidir.

export interface GeometricEvidence {
  elements: MeasuredElement[];
  viewport: ViewportInfo;
}

function isGeometric(ev: unknown): ev is GeometricEvidence {
  return !!ev && typeof ev === "object" && "elements" in (ev as Record<string, unknown>) && "viewport" in (ev as Record<string, unknown>);
}

export function summarizeStructuredEvidence(ev: VisualEvidence): string {
  const lines: string[] = [];
  lines.push(`EVIDÊNCIA ESTRUTURADA (modo: structured — sem análise visual por imagem)`);
  lines.push(`Viewport: ${ev.viewport.width} × ${ev.viewport.height}${ev.viewport.deviceScaleFactor ? ` (dpr ${ev.viewport.deviceScaleFactor})` : ""}`);
  if (ev.consoleErrors?.length) {
    lines.push(`Console errors (${ev.consoleErrors.length}):`);
    for (const e of ev.consoleErrors.slice(0, 6)) lines.push(`- ${e.slice(0, 140)}`);
  } else {
    lines.push(`Console errors: nenhum`);
  }
  const g = ev.geometry;
  if (!isGeometric(g) || g.elements.length === 0) {
    lines.push(`Geometria: sem elementos mensuráveis (use browser_measure para obter).`);
    return lines.join("\n");
  }
  const els = g.elements.filter((e) => !e.notFound && !e.error);
  lines.push(`Geometria (${els.length} elementos):`);
  for (const e of els) {
    const b = e.box;
    lines.push(`- [${e.selector}] ${e.tag}${e.id ? "#" + e.id : ""}${e.classes ? "." + e.classes : ""} box x=${b.x} y=${b.y} w=${b.width} h=${b.height} right=${b.right} bottom=${b.bottom}`);
    for (const p of ["fontSize", "fontWeight", "textAlign", "display", "position"] as const) {
      if (e.style?.[p]) lines.push(`    ${p}: ${e.style[p]}`);
    }
  }
  // Relações entre consecutivos (evidência confiável, sem heurística complexa).
  const rel: string[] = [];
  for (let i = 0; i + 1 < els.length; i++) {
    const a = els[i].box, b = els[i + 1].box;
    rel.push(`${els[i + 1].selector} abaixo de ${els[i].selector}: ${distanceBelow(a, b)}px`);
    rel.push(`${els[i + 1].selector} à direita de ${els[i].selector}: ${distanceRight(a, b)}px`);
    const al = horizontalAlignment(a, b);
    if (al) rel.push(`${els[i].selector} e ${els[i + 1].selector}: alinhados à ${al}`);
    if (overlapsX(a, b)) rel.push(`${els[i].selector} e ${els[i + 1].selector}: mesma faixa horizontal`);
    if (overlapsY(a, b)) rel.push(`${els[i].selector} e ${els[i + 1].selector}: mesma faixa vertical`);
    const area = overlapArea(a, b);
    if (area > 0) rel.push(`${els[i].selector} e ${els[i + 1].selector}: SOBREPOSTOS (${area}px²)`);
    if (contains(a, b)) rel.push(`${els[i + 1].selector} contido em ${els[i].selector}`);
  }
  if (rel.length) lines.push(`Relações:`, ...rel.map((r) => `- ${r}`));
  const props = els.slice(0, 8).map((e) => `${e.selector} ocupa ${(proportionWidth(e.box, g.viewport) * 100).toFixed(1)}% da largura do viewport`);
  if (props.length) lines.push(`Proporção:`, ...props.map((p) => `- ${p}`));
  return lines.join("\n");
}
