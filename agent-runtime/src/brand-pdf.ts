// Brand PDF (11) — manual/apresentação profissional da identidade visual, gerado
// automaticamente a partir dos dados REAIS do Branding Studio (brand-state.json +
// assets/brand/*.svg) e dos mockups REAIS persistidos no Artifact Store. Exclusivo
// por projeto: composição, cores, tipografia, hierarquia e ritmo derivam da própria
// identidade. Não inventa dados; omite/degrada quando um recurso não existe.
// Geração controlada (jsPDF programático), NÃO conversão frágil HTML→PDF.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const clib = require("@napi-rs/canvas") as { createCanvas: unknown; Canvas: unknown; loadImage: (b: Buffer) => Promise<{ width: number; height: number } & NodeJS.EventEmitter> };
import { jsPDF } from "jspdf";
import { loadBrandStateFromFiles, brandSnapshot, STATE_PATH, ASSET_DIR } from "./branding-state.js";
import { ArtifactStore } from "./artifact-store.js";
import { loadMockupArtifacts, type LoadedMockupArtifacts } from "./mockup-integration.js";

// ---- Tipos ----
export interface PdfMockup { applicationId: string; dataUrl: string; width: number; height: number; }
export interface PdfBrandData {
  name: string;
  palette: { primary: string; secondary: string; accent: string; background: string; foreground: string };
  typography: { heading: string; body: string; weights: string };
  variants: Record<string, string>;        // svg por variação
  concept: { type: string; name: string; rationale: string; symbolIdea: string; silhouette: string; typography: string; palette: string } | null;
  construction: { constructionLogic: string; grid?: string | null; primitives: Array<{ primitive: string; args: Record<string, string | number | boolean> }> } | null;
  identity: { hierarchy: string; photoDirection: string; composition: string; graphicElements: string; applicationRules: string };
  mockups: PdfMockup[];
}

export interface PdfDesignSystem {
  primary: string; secondary: string; accent: string; background: string; foreground: string;
  headingFont: string;   // família jsPDF usada (fallback documentado)
  bodyFont: string;
  headingStyle: "bold" | "normal";
  bodyStyle: "normal" | "italic";
  displayScale: number;  // fator da escala tipográfica (maior = mais dramático)
  spacingScale: number;
  borderRadius: number;
  graphicLanguage: string;
  compositionMode: "symbolic" | "typographic" | "asymmetric" | "geometric";
  pageSize: { w: number; h: number };
  fallbackFonts: { heading: string; body: string };
}

export type PdfPageDef = "cover" | "concept" | "logo" | "construction" | "variations" | "palette" | "typography" | "graphics" | "applications" | "mockups" | "closing";

export interface GeneratedBrandPdf {
  pdfBuffer: Buffer;
  pageCount: number;
  pageNames: PdfPageDef[];
  design: PdfDesignSystem;
  validation: { ok: boolean; checks: string[]; issues: string[] };
  contentBytes: number;
}

interface Rgb { r: number; g: number; b: number; }

// ---- Utilitários de cor (real, sem inventar CMYK como ICC) ----
export function hexToRgb(hex: string): Rgb {
  const m = String(hex ?? "").replace("#", "");
  const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
// Conversão técnica RGB→CMYK (documentada como conversão, NÃO perfil ICC de impressão).
export function rgbToCmyk({ r, g, b }: Rgb): { c: number; m: number; y: number; k: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: Math.round(((1 - rr - k) / (1 - k)) * 100), m: Math.round(((1 - gg - k) / (1 - k)) * 100), y: Math.round(((1 - bb - k) / (1 - k)) * 100), k: Math.round(k * 100) };
}

function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: Rgb, b: Rgb): number {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function styleFor(hex: string): string { return hex.replace("#", "").toUpperCase(); }

// ---- Mapa de fontes: identidade (Google) → padrão jsPDF (fallback documentado) ----
const SERIF = /serif|playfair|fraunces|garamond|merriweather|libre|cormorant|plitz|lora|georgia/i;
export function mapFont(family: string): { js: string; note: string } {
  if (SERIF.test(family)) return { js: "times", note: `serifa (${family}) → Times (fallback interno)` };
  if (/mono|code|courier/i.test(family)) return { js: "courier", note: `mono (${family}) → Courier (fallback interno)` };
  return { js: "helvetica", note: `sans (${family}) → Helvetica (fallback interno)` };
}

// ---- Preparação dos dados a partir dos arquivos reais ----
export function buildBrandPdfData(stateFiles: Record<string, string>, mockups: PdfMockup[]): PdfBrandData | null {
  const raw = stateFiles[STATE_PATH];
  if (!raw) return null;
  const state = loadBrandStateFromFiles(stateFiles);
  if (!state) return null;
  const concept = state.chosen;
  const snap = brandSnapshot(state, stateFiles[STATE_PATH] ? (parseName(stateFiles[STATE_PATH]) ?? "Marca") : "Marca");
  const construction = (concept ? snap.construction : null) as PdfBrandData["construction"];
  // SVGs REAIS persistidos (assets/brand/*.svg) têm precedência sobre os regenerados:
  // o PDF deve exibir a logo efetivamente aprovada, não uma reconstrução de snapshot.
  const variants: Record<string, string> = {};
  for (const [k, regenerated] of Object.entries(snap.variants ?? {})) {
    const persisted = stateFiles[`${ASSET_DIR}/${k}.svg`];
    if (persisted) variants[k] = persisted;
    else if (k === "primary" && !Object.keys(variants).length) variants[k] = regenerated; // fallback honesto se nenhum artefato persistido
  }
  return {
    name: snap.name,
    palette: snap.palette,
    typography: snap.typography,
    variants,
    concept: concept ? { type: concept.type, name: concept.name, rationale: concept.rationale, symbolIdea: concept.symbolIdea, silhouette: concept.silhouette, typography: concept.typography, palette: concept.palette } : null,
    construction,
    identity: {
      hierarchy: snap.identity.hierarchy, photoDirection: snap.identity.photoDirection,
      composition: (snap.identity as { composition?: string }).composition ?? "",
      graphicElements: (snap.identity as { graphicElements?: string }).graphicElements ?? "",
      applicationRules: (snap.identity as { applicationRules?: string }).applicationRules ?? "",
    },
    mockups,
  };
}

function parseName(raw: string): string | null {
  try { const j = JSON.parse(raw) as { name?: string }; return j.name ?? null; } catch { return null; }
}

// ---- Sistema visual (derivado da identidade real) ----
export function derivePdfDesignSystem(brand: PdfBrandData): PdfDesignSystem {
  const p = brand.palette;
  const headingMap = mapFont(brand.typography.heading);
  const bodyMap = mapFont(brand.typography.body || brand.typography.heading);
  const type = brand.concept?.type ?? "abstract";
  const compositionMode: PdfDesignSystem["compositionMode"] =
    type === "monogram" ? "symbolic" : type === "figurative-geometrized" ? "asymmetric" : "geometric";
  const displayScale = brand.typography.weights?.includes("9") || /900|black|display/i.test(brand.typography.weights) ? 1.15 : 1.0;
  const sophistication = brand.identity.photoDirection?.toLowerCase() ?? "";
  const spacingScale = /editorial|premium/.test(sophistication) ? 1.2 : 1.0;
  return {
    primary: p.primary, secondary: p.secondary, accent: p.accent, background: p.background, foreground: p.foreground,
    headingFont: headingMap.js, bodyFont: bodyMap.js,
    headingStyle: "bold", bodyStyle: "normal",
    displayScale, spacingScale,
    borderRadius: type === "abstract" ? 8 : 0,
    graphicLanguage: brand.identity.graphicElements || "formas derivadas do símbolo",
    compositionMode,
    pageSize: { w: 842, h: 595 }, // A4 landscape (deck)
    fallbackFonts: { heading: headingMap.note, body: bodyMap.note },
  };
}

// ---- Seleção de páginas (nunca cria página vazia sem conteúdo) ----
export function selectPdfPages(brand: PdfBrandData, hasMockups: boolean): PdfPageDef[] {
  const pages: PdfPageDef[] = ["cover"];
  if (brand.concept) pages.push("concept");
  pages.push("logo");
  if (brand.construction) pages.push("construction");
  if (Object.keys(brand.variants).length > 1) pages.push("variations");
  pages.push("palette");
  if (brand.typography?.heading) pages.push("typography");
  if (brand.identity.graphicElements || brand.construction) pages.push("graphics");
  if (hasMockups) pages.push("applications");
  if (hasMockups) pages.push("mockups");
  pages.push("closing");
  return pages;
}

// ---- Renderização (helpers) ----
function fill(doc: jsPDF, x: number, y: number, w: number, h: number, hex: string) {
  const c = hexToRgb(hex); doc.setFillColor(c.r, c.g, c.b); doc.rect(x, y, w, h, "F");
}
function drawText(doc: jsPDF, t: string, x: number, y: number, size: number, hex: string, font: string, style: "bold" | "normal" | "italic" = "normal", align: "left" | "center" | "right" = "left") {
  const c = hexToRgb(hex); doc.setTextColor(c.r, c.g, c.b); doc.setFont(font, style); doc.setFontSize(size); doc.text(t, x, y, { align });
}
function wrap(doc: jsPDF, t: string, w: number, size: number): string[] {
  const lines = doc.splitTextToSize(t, w);
  return lines;
}

function renderLogoPng(svg: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const img = await (clib.loadImage as (b: Buffer) => Promise<{ width: number; height: number } & NodeJS.EventEmitter>)(Buffer.from(svg));
        const c = (clib as { createCanvas: (w: number, h: number) => { getContext: (s: string) => { drawImage: (i: unknown, a: number, b: number, cw?: number, ch?: number) => void; getImageData: (a: number, b: number, c: number, d: number) => { data: Uint8ClampedArray } }, toBuffer: (m: string) => Buffer, width: number, height: number } }).createCanvas(w, h);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const png = c.toBuffer("image/png");
        resolve(`data:image/png;base64,${png.toString("base64")}`);
      } catch (e) { reject(e); }
    })();
  });
}

// Primitivas reais da construção → desenho (círculo/retângulo/linha/polígono); senão texto.
function drawConstructionPrimitives(doc: jsPDF, prims: Array<{ primitive: string; args: Record<string, string | number | boolean> }>, x: number, y: number, scale: number, hex: string) {
  for (const d of prims) {
    const a = d.args; const c = hexToRgb(hex); doc.setDrawColor(c.r, c.g, c.b); doc.setFillColor(c.r, c.g, c.b);
    if (d.primitive === "circle") {
      const r = Number(a.r ?? 20) * scale; doc.circle(x, y, r, "S");
    } else if (d.primitive === "rect") {
      const w = Number(a.width ?? a.w ?? 40) * scale, h = Number(a.height ?? a.h ?? 40) * scale; doc.rect(x, y, w, h, "S");
    } else if (d.primitive === "line") {
      doc.line(x, y, x + Number(a.length ?? 40) * scale, y);
    } else if (d.primitive === "polygon" && Array.isArray(a.points)) {
      const pts = (a.points as (string | number)[]).map(Number); const arr: [number, number][] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) arr.push([x + pts[i] * scale, y + pts[i + 1] * scale]);
      if (arr.length >= 3) doc.lines(arr, x, y, [1, 1], "S", true);
    }
  }
}

// ---- Páginas ----
const M = 44; // margem base (pt)

function pageCover(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem, logos: Record<string, string>) {
  const { w, h } = ds.pageSize;
  fill(doc, 0, 0, w, h, ds.primary);
  const fg = contrast(hexToRgb(ds.primary), hexToRgb(ds.background)) > 3 ? ds.background : "#ffffff";
  const logo = logos.primary;
  if (logo) {
    if (ds.compositionMode === "symbolic" || ds.compositionMode === "geometric") doc.addImage(logo, "PNG", w * 0.5 - w * 0.22, h * 0.28, w * 0.44, w * 0.31);
    else doc.addImage(logo, "PNG", w * 0.14, h * 0.24, w * 0.52, w * 0.37);
  } else {
    drawText(doc, brand.name, w * 0.5, h * 0.5, 60 * ds.displayScale, fg, ds.headingFont, "bold", "center");
  }
  drawText(doc, brand.name.toUpperCase(), w * 0.5, h * 0.86, 13, fg, ds.headingFont, "bold", "center");
  drawText(doc, "Manual da Identidade Visual", w * 0.5, h * 0.905, 10, fg, ds.bodyFont, "normal", "center");
}

function renderConceptPage(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w } = ds.pageSize;
  drawText(doc, "CONCEITO / DIREÇÃO DA MARCA", M, 60, 10, ds.accent, ds.bodyFont, "normal");
  drawText(doc, brand.concept?.name ?? brand.name, M, 104, 30 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  if (brand.concept) {
    drawText(doc, brand.concept.type.toUpperCase(), M, 128, 10, ds.secondary, ds.bodyFont, "normal");
    let y = 166; doc.setFont(ds.bodyFont, "normal"); doc.setFontSize(15);
    for (const line of wrap(doc, brand.concept.rationale || "—", w - 2 * M, 15)) { const c = hexToRgb(ds.foreground); doc.setTextColor(c.r, c.g, c.b); doc.text(line, M, y, { align: "left" }); y += 22; }
    drawText(doc, `Símbolo: ${brand.concept.symbolIdea || "—"}`, M, y + 20, 11, ds.foreground, ds.bodyFont, "normal");
    drawText(doc, `Silhueta: ${brand.concept.silhouette || "—"}`, M, y + 38, 11, ds.foreground, ds.bodyFont, "normal");
  }
  if (brand.identity.photoDirection) drawText(doc, `Direção fotográfica: ${brand.identity.photoDirection}`, M, y0(brand.concept) + 70, 11, ds.secondary, ds.bodyFont, "normal");
  void w;
}

function y0(c: PdfBrandData["concept"]): number { return c ? 250 : 130; }

function renderLogoPage(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem, logos: Record<string, string>) {
  const { w } = ds.pageSize;
  drawText(doc, "LOGO PRINCIPAL", M, 60, 10, ds.accent, ds.bodyFont, "normal");
  const logo = logos.primary;
  if (logo) doc.addImage(logo, "PNG", M, 90, 360, 252);
  else drawText(doc, "Logo não disponível.", M, 120, 14, ds.foreground, ds.bodyFont, "normal");
  const on = brand.variants.primary ? `(SVG real: ${brand.variants.primary.length} bytes)` : "(SVG real ausente)";
  drawText(doc, on, M, 370, 9, ds.secondary, ds.bodyFont, "italic");
  drawText(doc, "WORDMARK", M + 380, 90, 11, ds.accent, ds.bodyFont, "normal");
  drawText(doc, brand.name, M + 380, 130, 28, ds.foreground, ds.headingFont, "bold");
  drawText(doc, brand.typography.heading, M + 380, 156, 13, ds.secondary, ds.bodyFont, "normal");
}

export function renderVariations(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem, logos: Record<string, string>) {
  const { w } = ds.pageSize;
  drawText(doc, "VARIAÇÕES DA MARCA", M, 60, 26 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  const keys = Object.keys(logos);
  if (keys.length === 0) { drawText(doc, "Sem variações disponíveis.", M, 120, 14, ds.foreground, ds.bodyFont, "normal"); return; }
  const cols = Math.min(3, keys.length); const gap = 16;
  const cw = (w - 2 * M - gap * (cols - 1)) / cols; const ch = cw * 0.7;
  keys.slice(0, 3).forEach((k, i) => {
    const x = M + i * (cw + gap);
    fill(doc, x, 100, cw, ch, ds.background);
    try { doc.addImage(logos[k], "PNG", x + 8, 108, cw - 16, ch - 16); } catch { /* noop */ }
    drawText(doc, k.toUpperCase(), x + cw / 2, 100 + ch + 16, 9, ds.foreground, ds.bodyFont, "normal", "center");
  });
}

export function renderPalette(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w } = ds.pageSize;
  drawText(doc, "PALETA CROMÁTICA", M, 60, 26 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  const colors = [["Primária", ds.primary], ["Secundária", ds.secondary], ["Destaque", ds.accent], ["Fundo", ds.background], ["Texto", ds.foreground]];
  const cols = colors.length; const gap = 14; const cw = (w - 2 * M - gap * (cols - 1)) / cols; const ch = 150;
  colors.forEach(([name, hex], i) => {
    const x = M + i * (cw + gap);
    fill(doc, x, 110, cw, ch, hex);
    const on = contrast(hexToRgb(hex), hexToRgb("#000000")) > 3 ? "#000000" : "#ffffff";
    drawText(doc, name, x + 10, 130, 11, on, ds.bodyFont, "bold");
    drawText(doc, styleFor(hex), x + 10, 148, 12, on, ds.bodyFont, "normal");
    const rgb = hexToRgb(hex);
    drawText(doc, `RGB ${rgb.r} ${rgb.g} ${rgb.b}`, x + 10, 168, 8, on, ds.bodyFont, "normal");
    const cmyk = rgbToCmyk(rgb);
    drawText(doc, `CMYK ${cmyk.c}/${cmyk.m}/${cmyk.y}/${cmyk.k}`, x + 10, 182, 8, on, ds.bodyFont, "normal");
  });
  drawText(doc, "CMYK = conversão técnica RGB→CMYK (não é perfil ICC de impressão).", M, 290, 9, ds.foreground, ds.bodyFont, "italic");
}

export function renderTypography(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w } = ds.pageSize;
  void w;
  drawText(doc, "TIPOGRAFIA", M, 60, 26 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  drawText(doc, `Família (heading): ${brand.typography.heading} · peso ${brand.typography.weights}`, M, 110, 14, ds.foreground, ds.headingFont, "bold");
  drawText(doc, `Família (corpo): ${brand.typography.body}`, M, 132, 14, ds.foreground, ds.bodyFont, "normal");
  drawText(doc, "Hierarquia: " + (brand.identity.hierarchy || "—"), M, 160, 12, ds.secondary, ds.bodyFont, "normal");
  drawText(doc, "AaBbCcDdEeFfGgHhIiJjKk", M, 220, 64, ds.primary, ds.headingFont, "bold");
  drawText(doc, brand.name, M, 300, 30, ds.foreground, ds.bodyFont, "normal");
  drawText(doc, `Fallback do ambiente: ${ds.fallbackFonts.heading} · ${ds.fallbackFonts.body}`, M, 340, 8, ds.foreground, ds.bodyFont, "italic");
}

export function renderGraphics(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w } = ds.pageSize;
  drawText(doc, "ELEMENTOS GRÁFICOS", M, 60, 26 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  let y = 110;
  if (brand.identity.graphicElements) {
    doc.setFont(ds.bodyFont, "normal"); doc.setFontSize(14);
    for (const line of wrap(doc, brand.identity.graphicElements, w - 2 * M, 14)) { const c = hexToRgb(ds.foreground); doc.setTextColor(c.r, c.g, c.b); doc.text(line, M, y); y += 20; }
  } else {
    drawText(doc, "Sem elementos gráficos definidos.", M, y, 14, ds.foreground, ds.bodyFont, "normal");
  }
  if (brand.construction) {
    drawText(doc, "Construção: " + (brand.construction.constructionLogic || "—"), M, y + 40, 11, ds.secondary, ds.bodyFont, "normal");
    if (brand.construction.primitives.length) drawConstructionPrimitives(doc, brand.construction.primitives, M, y + 160, 1.4, ds.primary);
  }
}

export function renderApplications(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w } = ds.pageSize;
  drawText(doc, "APLICAÇÕES / MOCKUPS REAIS", M, 60, 24 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  drawText(doc, "Aplicações efetivamente geradas e persistidas (PSD Master → PNG real).", M, 86, 10, ds.secondary, ds.bodyFont, "normal");
  const mocks = brand.mockups;
  if (!mocks.length) { drawText(doc, "Nenhuma aplicação real gerada.", M, 130, 14, ds.foreground, ds.bodyFont, "normal"); return; }
  const cols = Math.min(3, mocks.length); const gap = 16; const cw = (w - 2 * M - gap * (cols - 1)) / cols; const ch = 210;
  mocks.slice(0, cols).forEach((m, i) => {
    const x = M + i * (cw + gap);
    fill(doc, x, 120, cw, ch, ds.background);
    try { doc.addImage(m.dataUrl, "PNG", x + 8, 128, cw - 16, ch - 30); } catch { /* noop */ }
    drawText(doc, m.applicationId, x + cw / 2, 120 + ch + 16, 10, ds.foreground, ds.bodyFont, "bold", "center");
  });
}

export function renderMockupsFull(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w } = ds.pageSize;
  drawText(doc, "MOCKUPS", M, 60, 26 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  const mocks = brand.mockups;
  if (!mocks.length) { drawText(doc, "Nenhum mockup real persistido.", M, 120, 14, ds.foreground, ds.bodyFont, "normal"); return; }
  const cols = Math.min(3, mocks.length); const gap = 16; const cw = (w - 2 * M - gap * (cols - 1)) / cols; const ch = 210;
  mocks.forEach((m, i) => {
    const x = M + (i % cols) * (cw + gap); const y = 120 + Math.floor(i / cols) * (ch + 30);
    fill(doc, x, y, cw, ch, ds.background);
    try { doc.addImage(m.dataUrl, "PNG", x + 8, y + 8, cw - 16, ch - 26); } catch { /* noop */ }
    drawText(doc, m.applicationId, x + cw / 2, y + ch + 16, 10, ds.foreground, ds.bodyFont, "bold", "center");
  });
}

export function renderClosing(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w, h } = ds.pageSize;
  fill(doc, 0, 0, w, h, ds.background);
  fill(doc, 0, h - 60, w, 60, ds.primary);
  drawText(doc, brand.name, M, h - 22, 16, ds.foreground, ds.headingFont, "bold");
  drawText(doc, "Todos os elementos apresentados refletem a identidade e os mockups reais deste projeto.", M, 80, 12, ds.foreground, ds.bodyFont, "normal");
}

export function renderConstruction(doc: jsPDF, brand: PdfBrandData, ds: PdfDesignSystem) {
  const { w } = ds.pageSize;
  drawText(doc, "CONSTRUÇÃO DA MARCA", M, 60, 24 * ds.displayScale, ds.foreground, ds.headingFont, "bold");
  if (!brand.construction) { drawText(doc, "Sem dados de construção disponíveis.", M, 120, 14, ds.foreground, ds.bodyFont, "normal"); return; }
  let y = 110; doc.setFont(ds.bodyFont, "normal"); doc.setFontSize(14);
  for (const line of wrap(doc, brand.construction.constructionLogic || "—", w - 2 * M, 14)) { const c = hexToRgb(ds.foreground); doc.setTextColor(c.r, c.g, c.b); doc.text(line, M, y); y += 20; }
  if (brand.construction.primitives.length) drawConstructionPrimitives(doc, brand.construction.primitives, M, y + 60, 1.6, ds.primary);
}

/** Rasteriza as variantes SVG reais → PNG (data URL), para inclusão no PDF. */
export async function rasterizeBrandVariants(variants: Record<string, string>, w: number, h: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, svg] of Object.entries(variants)) {
    if (!svg) continue;
    try { out[k] = await renderLogoPng(svg, w, h); } catch { /* página omite */ }
  }
  return out;
}

// ---- Renderização do PDF completo (renderiza variantes SVG→PNG ANTES) ----
export async function generateBrandPdf(brand: PdfBrandData, opts?: { pageSize?: { w: number; h: number } }): Promise<GeneratedBrandPdf> {
  const ds = derivePdfDesignSystem(brand);
  const pages = selectPdfPages(brand, brand.mockups.length > 0);
  const logos = await rasterizeBrandVariants(brand.variants, Math.round(ds.pageSize.w * 0.5), Math.round(ds.pageSize.w * 0.32));
  const PDF = jsPDF; const doc = new PDF({ unit: "pt", format: [ds.pageSize.w, ds.pageSize.h] });
  doc.setLineWidth(0.6);

  const renderers: Record<PdfPageDef, () => void> = {
    cover: () => pageCover(doc, brand, ds, logos),
    concept: () => renderConceptPage(doc, brand, ds),
    logo: () => renderLogoPage(doc, brand, ds, logos),
    construction: () => renderConstruction(doc, brand, ds),
    variations: () => renderVariations(doc, brand, ds, logos),
    palette: () => renderPalette(doc, brand, ds),
    typography: () => renderTypography(doc, brand, ds),
    graphics: () => renderGraphics(doc, brand, ds),
    applications: () => renderApplications(doc, brand, ds),
    mockups: () => renderMockupsFull(doc, brand, ds),
    closing: () => renderClosing(doc, brand, ds),
  };

  const used: PdfPageDef[] = [];
  pages.forEach((p, i) => {
    if (i > 0) doc.addPage([ds.pageSize.w, ds.pageSize.h], "landscape");
    drawText(doc, `${brand.name} · Manual da Identidade Visual`, ds.pageSize.w - M, ds.pageSize.h - 14, 8, ds.secondary, ds.bodyFont, "normal", "right");
    used.push(p);
    renderers[p]();
  });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  const validation = validateBrandPdf(pdfBuffer, { pages: used, mockups: brand.mockups, ds });
  return { pdfBuffer, pageCount: used.length, pageNames: used, design: ds, validation, contentBytes: pdfBuffer.length };
}

// ---- Validação (arquivo + conteúdo/geometria) ----
export function validateBrandPdf(pdfBuffer: Buffer, ctx?: { pages: PdfPageDef[]; mockups: PdfMockup[]; ds: PdfDesignSystem }): { ok: boolean; checks: string[]; issues: string[] } {
  const checks: string[] = []; const issues: string[] = [];
  const head = pdfBuffer.subarray(0, 5).toString("latin1");
  checks.push(`assinatura PDF: ${head === "%PDF-" ? "ok" : "inválida"}`);
  if (head !== "%PDF-") issues.push("assinatura PDF ausente/inválida");
  // contagem de páginas via /Type /Page (heurística) e /Count
  const buf = pdfBuffer.toString("latin1");
  const pageMarkers = (buf.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const count = ctx?.pages?.length ?? pageMarkers;
  checks.push(`páginas esperadas: ${count} (marcadores /Page: ${pageMarkers})`);
  if (count > 0 && pageMarkers === 0) issues.push("nenhum marcador /Page encontrado");
  // dimensões (MediaBox heurístico)
  const mb = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(buf);
  checks.push(`dimensões: ${mb ? `${Math.round(+mb[1])}x${Math.round(+mb[2])}` : "não detectadas"}`);
  // mockup: imagens presentes
  if (ctx) {
    checks.push(`mockups no modelo: ${ctx.mockups.length > 0 ? "presentes" : "nenhum"}`);
    if (ctx.pages.includes("applications") && ctx.mockups.length === 0) issues.push("página de aplicações sem mockups");
  }
  return { ok: issues.length === 0, checks, issues };
}

// ---- Persistência (ArtifactStore) + recuperação ----
export interface BrandPdfMetadata {
  versionId: string; projectId: string; identityName: string; identityVersion?: number | string | null;
  mockupVersion?: string | null; pageCount: number; pageNames: PdfPageDef[];
  primary: string; secondary: string; accent: string;
  createdAt: string; validationOk: boolean; outputPdf: string;
}

export async function persistBrandPdf(store: ArtifactStore, projectId: string, meta: BrandPdfMetadata, pdfBuffer: Buffer): Promise<void> {
  const base = `pdf`;
  await store.putProjectFile(projectId, `${base}/versions/${meta.versionId}.pdf`, pdfBuffer);
  await store.putProjectFile(projectId, `${base}/versions/${meta.versionId}.json`, Buffer.from(JSON.stringify(meta, null, 2)));
  await store.putProjectFile(projectId, `${base}/current.pdf`, pdfBuffer);
  await store.putProjectFile(projectId, `${base}/current.json`, Buffer.from(JSON.stringify(meta, null, 2)));
  // manifest de versões (append-only)
  let versions: string[] = [];
  const prev = await store.getProjectFile(projectId, `${base}/versions.json`);
  if (prev) { try { versions = JSON.parse(prev.toString()); } catch { versions = []; } }
  if (!versions.includes(meta.versionId)) versions.push(meta.versionId);
  await store.putProjectFile(projectId, `${base}/versions.json`, Buffer.from(JSON.stringify(versions)));
}

export async function loadBrandPdf(store: ArtifactStore, projectId: string): Promise<{ currentPdf: Buffer | null; currentMeta: BrandPdfMetadata | null; versions: string[] } | null> {
  const base = `pdf`;
  const pdf = await store.getProjectFile(projectId, `${base}/current.pdf`);
  const metaBuf = await store.getProjectFile(projectId, `${base}/current.json`);
  let versions: string[] = [];
  const vsBuf = await store.getProjectFile(projectId, `${base}/versions.json`);
  if (vsBuf) { try { versions = JSON.parse(vsBuf.toString()); } catch { versions = []; } }
  return {
    currentPdf: pdf ?? null,
    currentMeta: metaBuf ? (JSON.parse(metaBuf.toString()) as BrandPdfMetadata) : null,
    versions,
  };
}

// ---- Orquestrador: identidade + mockups + store → PDF persistido ----
export async function generateAndPersistBrandPdf(input: { store: ArtifactStore; projectId: string; stateFiles: Record<string, string>; mockups?: PdfMockup[]; mockupVersion?: string | null }): Promise<GeneratedBrandPdf & { metadata: BrandPdfMetadata; persisted: boolean }> {
  const brand = buildBrandPdfData(input.stateFiles, input.mockups ?? []);
  if (!brand) throw new Error("brand_pdf: identidade não encontrada (brand-state.json ausente)");
  const gen = await generateBrandPdf(brand);
  const versionId = new Date().toISOString().replace(/[:.]/g, "-");
  const meta: BrandPdfMetadata = {
    versionId, projectId: input.projectId, identityName: brand.name,
    identityVersion: null, mockupVersion: input.mockupVersion ?? null,
    pageCount: gen.pageCount, pageNames: gen.pageNames,
    primary: brand.palette.primary, secondary: brand.palette.secondary, accent: brand.palette.accent,
    createdAt: new Date().toISOString(), validationOk: gen.validation.ok, outputPdf: `${versionId}.pdf`,
  };
  await persistBrandPdf(input.store, input.projectId, meta, gen.pdfBuffer);
  return { ...gen, metadata: meta, persisted: gen.validation.ok && gen.pdfBuffer.length > 0 };
}

// ---- Conveniência: mockups a partir do ArtifactStore ----
export async function loadBrandMockups(store: ArtifactStore, projectId: string): Promise<PdfMockup[]> {
  const recovered = await loadMockupArtifacts(store, projectId);
  const out: PdfMockup[] = [];
  for (const pv of recovered.previews) {
    const du = recovered.previewDataUrls[pv.applicationId];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (recovered.currentMetadata as any)?.previews?.find((x: any) => x.applicationId === pv.applicationId);
    if (du) out.push({ applicationId: pv.applicationId, dataUrl: du, width: m?.width ?? pv.width ?? 300, height: m?.height ?? pv.height ?? 200 });
  }
  return out;
}

// ---- Manifesto (texto) para a UI — o PDF binário NUNCA vai para generated_code ----
export const PDF_RESULT_REL = "assets/pdfs/pdf-result.json";
export const PDF_HISTORY_REL = "assets/pdfs/pdf-history.json";

export interface BrandPdfResultText {
  status: "ready" | "error";
  versionId: string;
  identityName: string;
  identityVersion?: number | string | null;
  mockupVersion?: string | null;
  pageCount: number;
  pageNames: PdfPageDef[];
  primary: string; secondary: string; accent: string;
  createdAt: string;
  validationOk: boolean;
  persisted: boolean;
  pdfRelPath: string;
  reason?: string;
}

export function brandPdfResultText(meta: BrandPdfMetadata, opts: { persisted: boolean; status?: "ready" | "error"; reason?: string }): BrandPdfResultText {
  return {
    status: opts.status ?? (opts.persisted && meta.validationOk ? "ready" : "error"),
    versionId: meta.versionId, identityName: meta.identityName, identityVersion: meta.identityVersion,
    mockupVersion: meta.mockupVersion, pageCount: meta.pageCount, pageNames: meta.pageNames,
    primary: meta.primary, secondary: meta.secondary, accent: meta.accent,
    createdAt: meta.createdAt, validationOk: meta.validationOk, persisted: opts.persisted,
    pdfRelPath: "pdf/current.pdf", reason: opts.reason,
  };
}

/** Escreve o manifesto do PDF no workspace (texto) e retorna o mapa de arquivos. */
export function writeBrandPdfManifest(workspaceRoot: string, meta: BrandPdfMetadata, opts: { persisted: boolean; status?: "ready" | "error"; reason?: string }): Record<string, string> {
  const result = brandPdfResultText(meta, opts);
  let history: BrandPdfResultText[] = [];
  const hp = join(workspaceRoot, PDF_HISTORY_REL);
  if (existsSync(hp)) { try { history = JSON.parse(readFileSync(hp, "utf8")); } catch { history = []; } }
  history.push({ ...result, pageNames: [...result.pageNames] });
  mkdirSync(join(workspaceRoot, "assets/pdfs"), { recursive: true });
  writeFileSync(join(workspaceRoot, PDF_RESULT_REL), JSON.stringify(result, null, 2));
  writeFileSync(hp, JSON.stringify(history, null, 2));
  return { [PDF_RESULT_REL]: JSON.stringify(result, null, 2), [PDF_HISTORY_REL]: JSON.stringify(history, null, 2) };
}
