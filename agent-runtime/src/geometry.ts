// Geometry helpers (6.0) — lógica PURA de geometria/relações entre boxes e viewport.
// Testável sem navegador (unit tests). Usada pela tool browser_measure para
// transformar bounding boxes reais do DOM renderizado em dados estruturados.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right?: number;
  bottom?: number;
}

export interface ViewportInfo {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

const r1 = (v: number) => Math.round((Number(v) || 0) * 10) / 10;

export function norm(b: Box): Required<Box> {
  return { x: r1(b.x), y: r1(b.y), width: r1(b.width), height: r1(b.height), right: r1(b.right ?? b.x + b.width), bottom: r1(b.bottom ?? b.y + b.height) };
}

/** Distância vertical do fundo de A ao topo de B (negativo = sobreposto). */
export function distanceBelow(a: Box, b: Box): number {
  return r1(norm(b).y - norm(a).bottom);
}

/** Distância horizontal da direita de A à esquerda de B (negativo = sobreposto). */
export function distanceRight(a: Box, b: Box): number {
  return r1(norm(b).x - norm(a).right);
}

export function overlapsX(a: Box, b: Box): boolean {
  const A = norm(a), B = norm(b);
  return A.x < B.right && B.x < A.right;
}

export function overlapsY(a: Box, b: Box): boolean {
  const A = norm(a), B = norm(b);
  return A.y < B.bottom && B.y < A.bottom;
}

export function overlapArea(a: Box, b: Box): number {
  const A = norm(a), B = norm(b);
  if (!overlapsX(A, B) || !overlapsY(A, B)) return 0;
  const w = Math.max(0, Math.min(A.right, B.right) - Math.max(A.x, B.x));
  const h = Math.max(0, Math.min(A.bottom, B.bottom) - Math.max(A.y, B.y));
  return r1(w * h);
}

/** B contém A? (A dentro da área de B) */
export function contains(outer: Box, inner: Box): boolean {
  const O = norm(outer), I = norm(inner);
  return I.x >= O.x && I.right <= O.right && I.y >= O.y && I.bottom <= O.bottom;
}

export type HorizontalAlignment = "left" | "center" | "right" | null;

/** Alinhamento horizontal aproximado entre dois elementos (mesmo left/center/right). */
export function horizontalAlignment(a: Box, b: Box, threshold = 4): HorizontalAlignment {
  const A = norm(a), B = norm(b);
  if (Math.abs(A.x - B.x) <= threshold) return "left";
  if (Math.abs(A.x + A.width / 2 - (B.x + B.width / 2)) <= threshold) return "center";
  if (Math.abs(A.right - B.right) <= threshold) return "right";
  return null;
}

/** Proporção da largura do elemento em relação ao viewport (0–1). */
export function proportionWidth(b: Box, vp: ViewportInfo): number {
  return vp.width ? Math.round((norm(b).width / vp.width) * 1000) / 1000 : 0;
}

/** Proporção da altura do elemento em relação ao viewport (0–1). */
export function proportionHeight(b: Box, vp: ViewportInfo): number {
  return vp.height ? Math.round((norm(b).height / vp.height) * 1000) / 1000 : 0;
}

export interface MeasuredElement {
  selector: string;
  tag: string;
  id: string;
  classes: string;
  text: string;
  box: Box;
  style: Record<string, string>;
  notFound?: boolean;
  error?: string;
}

// Conjunto de propriedades computadas úteis para diagnóstico visual.
export const MEASURE_STYLE_PROPS = [
  "display", "position", "margin", "padding", "gap", "fontSize", "fontWeight",
  "lineHeight", "textAlign", "width", "maxWidth", "height", "minHeight",
] as const;
