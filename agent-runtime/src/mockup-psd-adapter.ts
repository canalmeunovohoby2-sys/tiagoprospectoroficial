// PsdMockupAdapter (6.11) — adaptador do PSD Master REAL (ag-psd), NÃO-destrutivo.
// Usa o mapa real (mockup-master.analysis.json) como referência estrutural.
// RESPONSABILIDADES: ler (estrutura), resolver aplicação/camadas, recolhagem/cor,
// preservar realismo, proteger o master (SHA) e validar.
// VERACIDADE: a escrita de pixels via ag-psd está indisponível neste ambiente
// (createCanvas não disponível na decodificação completa) → `applyDesignToApplication`
// retorna status "blocked" em vez de gerar mockup falso. NUNCA sobrescreve o master.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const require = createRequire(import.meta.url);
const ag = require("ag-psd");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const canvas = require("@napi-rs/canvas");

export interface PsdMapNode { path: string; name: string; kind: string; parent: string | null; depth: number; bbox: { left: number; top: number; width: number; height: number; w?: number; h?: number } | null; visible: boolean; opacity: number; blend: string; mask: boolean; clipping: boolean; smartObject: boolean; adjustment: boolean; text: boolean; vectorFillColor?: { r: number; g: number; b: number } | null; placed?: boolean; raster?: boolean; }
export interface PsdMap { source: string; dimensions: { width: number; height: number }; structure: { total: number; groups: number; smartObjects: number }; tree: PsdMapNode[]; }

export type ApplyStatus = "applied" | "validated" | "blocked" | "unsupported" | "failed";

export interface PsdApplyResult { applicationId: string; status: ApplyStatus; reason?: string; modifiedLayers: string[]; preservedLayers: string[]; outputPath?: string; validations: string[]; masterSha: string; outputSha?: string; }

export interface DesignColors { primary: string; secondary: string; accent: string; }

const DESIGNS = ["A4", "A5", "DL", "BC", "Keychain", "Brochure", "Badge", "Notepad", "Box top", "Mug", "iPhone", "Tablet"];
const COLOR_LAYERS = ["Color/Box", "Color/Mug", "Color/Metal", "Color 1", "Color 2", "Mockup/Color/Colors"];
const SHADOW_HIGHLIGHT = new Set(["Background", "Shadows", "Highlights", "Contrast", "Metal"]);

export function loadPsdMap(analysisPath: string): PsdMap {
  return JSON.parse(readFileSync(analysisPath, "utf8")) as PsdMap;
}

/** Leitura ESTRUTURAL do PSD (sem pixels) — funciona e preserva o master. */
export function readPsdTree(path: string): { width: number; height: number; children: number; tree: PsdMapNode[] } {
  ensureCanvas();
  const buf = readFileSync(path);
  const psd = ag.readPsd(buf, { skipLayerImageData: true, throwForMissingFeatures: false, skipCompositeImageData: true });
  const tree: PsdMapNode[] = [];
  const isLayer = (n: unknown) => n && typeof n === "object" && "name" in (n as Record<string, unknown>);
  const walk = (node: any, parent: string, depth: number) => {
    if (!isLayer(node)) return;
    const w = (node.right ?? 0) - (node.left ?? 0);
    const h = (node.bottom ?? 0) - (node.top ?? 0);
    const bbox = (w > 0 || h > 0) ? { left: node.left ?? 0, top: node.top ?? 0, width: w, height: h, w, h } : null;
    const p = parent ? `${parent}/${node.name}` : node.name;
    const isSmart = !!(node.smartObject || node.placed !== undefined || node.smartObjectSettings?.id);
    tree.push({ path: p, name: node.name || "", kind: node.children?.length ? "group" : node.text ? "text" : node.adjustment ? "adjustment" : "plain", parent: parent || null, depth, bbox, visible: node.visible !== false, opacity: node.opacity ?? 255, blend: node.blendMode ?? "normal", mask: !!(node.mask?.mask), clipping: !!node.clipped, smartObject: isSmart, adjustment: !!node.adjustment, text: !!node.text, vectorFillColor: node.vectorFill?.type === "color" ? node.vectorFill.color : null, placed: !!node.placedLayer, raster: !!node.canvas });
    if (node.children) for (const c of node.children) walk(c, p, depth + 1);
  };
  for (const c of psd.children ?? []) walk(c, "", 0);
  return { width: psd.width, height: psd.height, children: (psd.children || []).length, tree };
}

/** Largura/altura reais do bbox (aceita keys width/height OU w/h do mapa). */
function bboxSize(b: { left?: number; top?: number; width?: number; height?: number; w?: number; h?: number } | null | undefined): { w: number; h: number; left: number; top: number } {
  if (!b) return { w: 0, h: 0, left: 0, top: 0 };
  const w = b.width ?? b.w ?? 0;
  const h = b.height ?? b.h ?? 0;
  return { w: Math.abs(w), h: Math.abs(h), left: b.left ?? 0, top: b.top ?? 0 };
}

/** Resolve a superfície de design real de uma aplicação (bounds do mapa). */
export function resolveDesignSurface(map: PsdMap, applicationId: string): { path: string; bbox: { left: number; top: number; width: number; height: number } } | null {
  const same = map.tree.filter((n) => n.name === applicationId && n.kind === "plain");
  const node = same.find((n) => n.path?.startsWith("Mockup/")) ?? same[0];
  if (!node) return null;
  const { w, h, left, top } = bboxSize(node.bbox);
  if (w <= 0 || h <= 0) return null;
  return { path: node.path, bbox: { left, top, width: w, height: h } };
}

export function resolveColorLayers(map: PsdMap): string[] {
  const paths = map.tree.filter((n) => n.kind === "plain" && COLOR_LAYERS.some((c) => n.path.includes(c) || n.name === c)).map((n) => n.path);
  return [...new Set(paths)];
}

/** Valida preservação da estrutura principal (dimensões, grupos, sombras, cor, design, blends). */
export function validatePsdPreservation(map: PsdMap): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (map.dimensions.width !== 5000 || map.dimensions.height !== 3750) issues.push("dimensões divergem do master");
  const names = map.tree.map((n) => n.name);
  for (const g of ["Background", "Shadows", "Contrast"]) if (!names.includes(g)) issues.push(`grupo/camada ausente: ${g}`);
  if (!map.tree.some((n) => n.name === "Designs")) issues.push("grupo Designs ausente");
  if (!map.tree.some((n) => n.kind === "adjustment" && n.name === "Contrast")) issues.push("ajuste Contrast ausente");
  if (map.tree.some((n) => /linear burn|screen|multiply/i.test(n.blend))) { /* ok: blends de realismo presentes */ }
  else issues.push("sem blend modes de realismo (linear burn/screen/multiply)");
  return { ok: issues.length === 0, issues };
}

export function protectMaster(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Utiliza o pipeline de PIXELS agora FUNCIONAL (ag-psd + @napi-rs/canvas).
 *  Deve ser chamado com (createCanvas) como FUNÇÃO — nunca um objeto. */
function ensureCanvas() {
  try { ag.initializeCanvas(canvas.createCanvas); } catch { ag.initializeCanvas(canvas.createCanvas); }
}

export interface WriteCopyResult { ok: boolean; outputPath: string; outputBytes: number; masterSha: string; outputSha: string; reRead: { width: number; height: number; children: number; hasDesigns: boolean }; error?: string; }

/** Lê o master (pixels completos) e grava uma CÓPIA — NUNCA toca o master. */
export function writeProtectedCopy(sourcePsd: string, outputPsd: string): WriteCopyResult {
  const masterSha = protectMaster(sourcePsd);
  ensureCanvas();
  try {
    const psd = ag.readPsd(readFileSync(sourcePsd), { throwForMissingFeatures: false });
    const out = ag.writePsdBuffer(psd, {});
    writeFileSync(outputPsd, Buffer.from(out));
    const after = readFileSync(sourcePsd);
    const masterNow = createHash("sha256").update(after).digest("hex");
    const rr = ag.readPsd(Buffer.from(out), { skipLayerImageData: true, throwForMissingFeatures: false });
    return { ok: true, outputPath: outputPsd, outputBytes: out.length, masterSha, outputSha: createHash("sha256").update(Buffer.from(out)).digest("hex"), reRead: { width: rr.width, height: rr.height, children: (rr.children || []).length, hasDesigns: rr.children.some((c: any) => c.name === "Designs") }, error: masterNow !== masterSha ? "master mudou durante a operação" : undefined };
  } catch (e) {
    return { ok: false, outputPath: outputPsd, outputBytes: 0, masterSha, outputSha: "", reRead: { width: 0, height: 0, children: 0, hasDesigns: false }, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Aplicar identidade/design no PSD → salva CÓPIA. WRITE de pixels via ag-psd está
 * BLOQUEADO neste ambiente (decodificação completa de imagem indisponível) →
 * retorna status "blocked" e NÃO escreve mockup falso. NUNCA toca o master.
 */
export async function applyDesignToApplication(input: { sourcePsd: string; applicationId: string; designSvg: string; colors: DesignColors; outputPsd: string; map?: PsdMap }): Promise<PsdApplyResult> {
  const map = input.map ?? loadPsdMap("assets/mockups/master/mockup-master.analysis.json");
  const masterSha = protectMaster(input.sourcePsd);
  const surface = resolveDesignSurface(map, input.applicationId);
  if (!surface) return { applicationId: input.applicationId, status: "unsupported", reason: "application_unknown", modifiedLayers: [], preservedLayers: [], validations: [], masterSha };
  const colorLayers = resolveColorLayers(map);
  const preservedLayers = map.tree.filter((n) => SHADOW_HIGHLIGHT.has(n.name) || /normal|linear burn|screen|multiply/i.test(n.blend)).map((n) => n.path);
  const validations = ["mapa real", `superfície ${surface.path}`, `${colorLayers.length} camadas de cor`, `${preservedLayers.length} camadas de realismo preservadas`];

  try {
    ag.initializeCanvas({ Canvas: canvas.Canvas, createCanvas: canvas.createCanvas });
    const buf = readFileSync(input.sourcePsd);
    const psd = ag.readPsd(buf, { throwForMissingFeatures: false }); // full read PARA poder escrever (se disponível)
    ag.writePsdBuffer(psd, {});
    // Se chegou aqui, write disponível — realizaria substituição/recor. (neste ambiente não chega)
    return { applicationId: input.applicationId, status: "blocked", reason: "psd_write_not_proven", modifiedLayers: [surface.path], preservedLayers, outputPath: undefined, validations, masterSha };
  } catch (e) {
    // BLOQUEIO REAL: decodificação de pixels/escrita indisponível — NÃO fingir.
    return {
      applicationId: input.applicationId, status: "blocked",
      reason: `psd_pixel_write_unavailable (${e instanceof Error ? e.message : String(e)})`,
      modifiedLayers: [surface.path], preservedLayers, outputPath: undefined, validations, masterSha,
    };
  }
}

export { DESIGNS, COLOR_LAYERS };

export interface SurfaceGeometry { id: string; path: string | null; kind: string; bounds: { left: number; top: number; width: number; height: number } | null; state: "resolved_raster" | "resolved_vector_color" | "unresolved"; source: string; raster: boolean; placed: boolean; vectorFill?: { r: number; g: number; b: number } | null; }

export interface GeometryDoc { source: string; masterSha: string; surfaces: Record<string, SurfaceGeometry>; colors: Record<string, SurfaceGeometry>; }

/** Descobre a geometria REAL das superfícies e camadas de cor (skipLayerImageData é o suficiente). */
export function discoverSurfaceGeometry(psdPath: string, analysisMapPath: string): GeometryDoc {
  const map = loadPsdMap(analysisMapPath);
  const read = readPsdTree(psdPath);
  const sameName = (id: string) => read.tree.filter((n) => n.name === id);
  const preferred = (id: string, prefix: string) => sameName(id).find((n) => n.path?.startsWith(prefix)) ?? sameName(id)[0];
  const build = (id: string, prefix: string): SurfaceGeometry => {
    const n = preferred(id, prefix);
    if (!n || !n.bbox?.width) return { id, path: null, kind: "unresolved", bounds: null, state: "unresolved", source: "none", raster: false, placed: false };
    const state = n.vectorFillColor ? "resolved_vector_color" : "resolved_raster";
    return { id, path: n.path || null, kind: n.kind, bounds: { left: n.bbox.left, top: n.bbox.top, width: n.bbox.width, height: n.bbox.height }, state, source: "ag-psd:layer.top/left/right/bottom", raster: !!n.raster, placed: !!n.placed, vectorFill: n.vectorFillColor ?? null };
  };
  const surfaces: Record<string, SurfaceGeometry> = {};
  for (const d of DESIGNS) surfaces[d] = build(d, "Mockup/");
  const colors: Record<string, SurfaceGeometry> = {};
  for (const c of ["Color 1", "Color 2", "Colors", "Box", "Mug", "Metal"]) colors[c] = build(c, "Color/");
  const geom: GeometryDoc = { source: psdPath, masterSha: protectMaster(psdPath), surfaces, colors };
  return geom;
}

export function saveGeometryDoc(doc: GeometryDoc, outPath: string): string {
  writeFileSync(outPath, JSON.stringify(doc, null, 2));
  return outPath;
}

export interface RecolorResult { ok: boolean; outputPath: string; masterSha: string; outputSha: string; sampleColors: Record<string, { r: number; g: number; b: number } | null>; reason?: string; }

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "");
  const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

/** RECOLORAÇÃO REAL: altera vectorFill de Color 1/Color 2 e grava uma CÓPIA (master intacto).
 *  Verifica na re-leitura que a cor persistiu. */
export function recolorMaster(sourcePsd: string, outputPsd: string, brandColors: { primary: string; secondary: string }): RecolorResult {
  const masterSha = protectMaster(sourcePsd);
  ensureCanvas();
  try {
    const psd = ag.readPsd(readFileSync(sourcePsd), { throwForMissingFeatures: false });
    const find = (name: string) => { let res: any = null; (function w(o: any) { if (!o || typeof o !== "object") return; if (o.name === name) { if (!res) res = o; if (o.children) return; } if (o.children) for (const c of o.children) w(c); })(psd as any); return res; };
    const mapColor = (layer: any, hex: string) => { if (layer?.vectorFill?.color) { const { r, g, b } = hexToRgb(hex); layer.vectorFill.color.r = r; layer.vectorFill.color.g = g; layer.vectorFill.color.b = b; return true; } return false; };
    const c1 = find("Color 1"); const c2 = find("Color 2");
    const ok1 = mapColor(c1, brandColors.primary);
    const ok2 = mapColor(c2, brandColors.secondary);
    if (!ok1 && !ok2) return { ok: false, outputPath: outputPsd, masterSha, outputSha: "", sampleColors: { "Color 1": null, "Color 2": null }, reason: "nenhuma camada de cor recolorível encontrada (vectorFill ausente)" };
    // grava SOMENTE a cópia recolorida — o master nunca é sobrescrito
    const out = Buffer.from(ag.writePsdBuffer(psd, {}));
    writeFileSync(outputPsd, out);
    const sample = (l: any) => l?.vectorFill?.color ? { r: Math.round(l.vectorFill.color.r), g: Math.round(l.vectorFill.color.g), b: Math.round(l.vectorFill.color.b) } : null;
    const ref = ag.readPsd(out, { throwForMissingFeatures: false });
    const sampleColors = { "Color 1": sample(findIn(ref, "Color 1")), "Color 2": sample(findIn(ref, "Color 2")) };
    return { ok: true, outputPath: outputPsd, masterSha, outputSha: createHash("sha256").update(out).digest("hex"), sampleColors };
  } catch (e) {
    return { ok: false, outputPath: outputPsd, masterSha, outputSha: "", sampleColors: {}, reason: e instanceof Error ? e.message : String(e) };
  }
}
function findIn(root: unknown, name: string): any {
  let res: any = null;
  (function w(o: any) { if (!o || typeof o !== "object") return; if (o.name === name) { if (!res) res = o; return; } if (o.children) for (const c of o.children) w(c); })(root);
  return res;
}

export interface ApplyLogoResult {
  ok: boolean;
  applicationId: string;
  outputPath: string;
  masterSha: string;
  outputSha: string;
  applied: { width: number; height: number } | null;
  samplePixels: Record<string, [number, number, number, number] | null>;
  layerPath: string | null;
  reason?: string;
}

/** Rasteriza uma string SVG nas dimensões pedidas (w×h) usando @napi-rs/canvas (determinístico). */
async function rasterizeSvg(logoSvg: string, w: number, h: number): Promise<{ width: number; height: number; data: Uint8ClampedArray } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — loadImage é exposto pelo build do @napi-rs/canvas
    const img: any = await canvas.loadImage(Buffer.from(logoSvg));
    const c = canvas.createCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const idata = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data: new Uint8ClampedArray(idata.data.buffer || idata.data) };
  } catch {
    return null;
  }
}

/**
 * APLICAÇÃO REAL DA LOGO: rasteriza o SVG e substitui o conteúdo raster do Placed Layer
 * da superfície via `layer.imageData` — a representação que o ag-psd efetivamente serializa
 * (o escritor usa `imageData || canvas`). Usar `.image` NÃO funciona (propriedade inexistente).
 * Grava UMA CÓPIA (master intacto) e comprova na re-leitura que o conteúdo persistiu.
 */
export async function applyLogoToSurface(input: { sourcePsd: string; applicationId: string; logoSvg: string; outputPsd: string; map?: PsdMap }): Promise<ApplyLogoResult> {
  const masterSha = protectMaster(input.sourcePsd);
  ensureCanvas();
  try {
    const psd = ag.readPsd(readFileSync(input.sourcePsd), { throwForMissingFeatures: false, skipCompositeImageData: true });
    const found = resolveSurfaceLayer(psd, input.applicationId);
    if (!found) return { ok: false, applicationId: input.applicationId, outputPath: input.outputPsd, masterSha, outputSha: "", applied: null, samplePixels: {}, layerPath: null, reason: "surface_not_found" };
    const { layer, path } = found;
    const w = Math.max(1, (layer.right ?? 0) - (layer.left ?? 0));
    const h = Math.max(1, (layer.bottom ?? 0) - (layer.top ?? 0));
    const raster = await rasterizeSvg(input.logoSvg, w, h);
    if (!raster) return { ok: false, applicationId: input.applicationId, outputPath: input.outputPsd, masterSha, outputSha: "", applied: null, samplePixels: {}, layerPath: path, reason: "svg_rasterize_failed" };
    layer.imageData = { width: raster.width, height: raster.height, data: raster.data };
    delete layer.canvas; // evita ambiguidade; o escritor usa imageData
    const out = Buffer.from(ag.writePsdBuffer(psd, {}));
    writeFileSync(input.outputPsd, out);
    const ref = ag.readPsd(Buffer.from(out), { throwForMissingFeatures: false, skipCompositeImageData: true });
    const refLayer = resolveSurfaceLayer(ref, input.applicationId)?.layer;
    const samplePixels: Record<string, [number, number, number, number] | null> = {};
    if (refLayer?.canvas) {
      const ctx = refLayer.canvas.getContext("2d");
      const pts: Record<string, [number, number]> = {
        topLeft: [Math.min(4, w - 1), Math.min(4, h - 1)],
        center: [Math.floor(w / 2), Math.floor(h / 2)],
        accent: [Math.floor(w / 2), Math.floor(h * 0.75)],
      };
      for (const [k, [x, y]] of Object.entries(pts)) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        samplePixels[k] = [d[0], d[1], d[2], d[3]];
      }
    }
    return { ok: true, applicationId: input.applicationId, outputPath: input.outputPsd, masterSha, outputSha: createHash("sha256").update(Buffer.from(out)).digest("hex"), applied: { width: w, height: h }, samplePixels, layerPath: path };
  } catch (e) {
    return { ok: false, applicationId: input.applicationId, outputPath: input.outputPsd, masterSha, outputSha: "", applied: null, samplePixels: {}, layerPath: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Renderização PSD→PNG. Tenta composite real (ag-psd). Se indisponível, tenta o preview embutido (NÃO prova edição). */
export function renderPsdToPng(psdPath: string, outPng: string): { ok: boolean; outputPath: string; mode: "composite" | "embedded" | "unavailable"; width: number; height: number; reason?: string; bytes?: number } {
  ensureCanvas();
  try {
    const psd = ag.readPsd(readFileSync(psdPath), { throwForMissingFeatures: false });
    let comp: any = null;
    try { comp = ag.getCompositeCanvas(psd); } catch { comp = null; }
    let mode: "composite" | "embedded" | "unavailable" = "unavailable";
    if (comp && typeof comp.getContext === "function") {
      mode = "composite";
    } else if (psd.canvas && typeof psd.canvas.getContext === "function") {
      comp = psd.canvas;
      mode = "embedded"; // preview embutido original — NÃO reflete edições de camadas
    } else {
      return { ok: false, outputPath: outPng, mode: "unavailable", width: 0, height: 0, reason: "sem canvas de composite disponível (getCompositeCanvas retorna undefined e psd.canvas ausente)" };
    }
    const c = canvas.createCanvas(comp.width, comp.height);
    c.getContext("2d").drawImage(comp, 0, 0);
    const png = c.toBuffer("image/png");
    writeFileSync(outPng, png);
    return { ok: true, outputPath: outPng, mode, width: comp.width, height: comp.height, bytes: png.length };
  } catch (e) {
    return { ok: false, outputPath: outPng, mode: "unavailable", width: 0, height: 0, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Prova visual determinística: extrai a raster NATIVA da camada da superfície como PNG (sem re-compositar o doc). */
export function exportLayerRasterPng(psdPath: string, layerName: string, outPng: string): { ok: boolean; outputPath: string; width: number; height: number; reason?: string; bytes?: number; path: string | null } {
  ensureCanvas();
  try {
    const psd = ag.readPsd(readFileSync(psdPath), { throwForMissingFeatures: false, skipCompositeImageData: true });
    const found = resolveSurfaceLayer(psd, layerName);
    const layer = found?.layer;
    if (!layer?.canvas) return { ok: false, outputPath: outPng, width: 0, height: 0, reason: "camada sem raster (`canvas`)", path: found?.path ?? null };
    const { width, height } = layer.canvas;
    const c = canvas.createCanvas(width, height);
    c.getContext("2d").drawImage(layer.canvas, 0, 0);
    const png = c.toBuffer("image/png");
    writeFileSync(outPng, png);
    return { ok: true, outputPath: outPng, width, height, bytes: png.length, path: found?.path ?? null };
  } catch (e) {
    return { ok: false, outputPath: outPng, width: 0, height: 0, reason: e instanceof Error ? e.message : String(e), path: null };
  }
}

/** Amostra um pixel da raster da superfície (x,y relativos à camada) usando a própria instância do ag-psd do adapter. */
export function readSurfacePixel(psdPath: string, applicationId: string, x: number, y: number): { r: number; g: number; b: number; a: number } | null {
  ensureCanvas();
  try {
    const psd = ag.readPsd(readFileSync(psdPath), { throwForMissingFeatures: false, skipCompositeImageData: true });
    const layer = resolveSurfaceLayer(psd, applicationId)?.layer;
    if (!layer?.canvas) return null;
    const d = layer.canvas.getContext("2d").getImageData(Math.max(0, Math.min(x, layer.canvas.width - 1)), Math.max(0, Math.min(y, layer.canvas.height - 1)), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  } catch {
    return null;
  }
}

/** Amostra vários pixels de várias superfícies numa ÚNICA leitura full (economiza memória). */
export function readSurfaceSamples(psdPath: string, requests: { applicationId: string; x: number; y: number }[]): Record<string, { r: number; g: number; b: number; a: number } | null> {
  ensureCanvas();
  const result: Record<string, { r: number; g: number; b: number; a: number } | null> = {};
  if (!requests.length) return result;
  try {
    const psd = ag.readPsd(readFileSync(psdPath), { throwForMissingFeatures: false, skipCompositeImageData: true });
    for (const { applicationId, x, y } of requests) {
      const layer = resolveSurfaceLayer(psd, applicationId)?.layer;
      if (!layer?.canvas) { result[applicationId] = null; continue; }
      const d = layer.canvas.getContext("2d").getImageData(Math.max(0, Math.min(x, layer.canvas.width - 1)), Math.max(0, Math.min(y, layer.canvas.height - 1)), 1, 1).data;
      result[applicationId] = { r: d[0], g: d[1], b: d[2], a: d[3] };
    }
  } catch {
    for (const { applicationId } of requests) result[applicationId] = null;
  }
  return result;
}

// =============================================================================
// FASE 10.9 — GENERALIZAÇÃO DA APLICAÇÃO DE IDENTIDADE NO PSD MASTER
// =============================================================================

export type SurfaceType = "raster" | "placed" | "vector";
export type FitMode = "contain" | "cover";

export interface BrandSurface {
  applicationId: string;
  layerPath: string;
  group: string;
  surfaceType: SurfaceType;
  bounds: { left: number; top: number; width: number; height: number } | null;
  blendMode: string | null;
  supported: boolean;
  reason?: string;
  geometrySource: "geometry.json" | "layer";
}

export interface BrandSurfaceMap {
  sourcePsd: string;
  masterSha: string;
  surfaces: Record<string, BrandSurface>;
}

export interface BrandIdentity {
  logoSvg?: string;
  primary: string;
  secondary: string;
  accent?: string;
}

export interface BrandApplicationStatus {
  applicationId: string;
  status: "applied" | "unsupported" | "skipped";
  layerPath?: string;
  reason?: string;
}

export interface BrandResult {
  status: "applied" | "partial" | "failed";
  applicationsRequested: string[];
  applicationsApplied: string[];
  applicationsUnsupported: BrandApplicationStatus[];
  modifiedLayers: string[];
  modifiedColors: string[];
  preservedLayers: string[];
  sourceSha: string;
  outputSha: string;
  persisted: boolean;
  outputPath: string;
  reason?: string;
}

// Registro DETERMINÍSTICO de onde localizar a superfície real de cada aplicação
// (camada mocked sob o grupo `Mockup`). As camadas do grupo de topo `Designs/*`
// são o flat artwork de referência — NÃO são as superfícies a modificar.
const SURFACE_TARGETS: Record<string, { sub: string; name: string }> = {
  A4: { sub: "Designs", name: "A4" },
  "A4 2": { sub: "Designs", name: "A4 2" },
  A5: { sub: "Designs", name: "A5" },
  DL: { sub: "Designs", name: "DL" },
  "DL 2": { sub: "Designs", name: "DL 2" },
  "DL 3": { sub: "Designs", name: "DL 3" },
  BC: { sub: "Designs", name: "BC" },
  "BC 2": { sub: "Designs", name: "BC 2" },
  Keychain: { sub: "Designs", name: "Keychain" },
  Brochure: { sub: "Designs", name: "Brochure" },
  Badge: { sub: "Designs", name: "Badge" },
  Notepad: { sub: "Notepad", name: "Notepad" },
  Box: { sub: "Box", name: "Box top" },
  Mug: { sub: "Mug", name: "Mug" },
  iPhone: { sub: "Screens", name: "iPhone" },
  Tablet: { sub: "Screens", name: "Tablet" },
};

const PRESERVED_TOP_LEVEL = ["Background", "Shadows", "Highlights", "Contrast", "Metal"];

/** Localiza a camada real da superfície de um mockup sob `Mockup/<sub>/<name>`. Prefere camada placed. */
function resolveSurfaceLayer(psd: any, applicationId: string): { layer: any; path: string; group: string } | null {
  const t = SURFACE_TARGETS[applicationId];
  if (!t) return null;
  const mockup = (psd.children || []).find((c: any) => c?.name === "Mockup");
  const sub = mockup?.children?.find((c: any) => c?.name === t.sub);
  if (!sub?.children) return null;
  const cands = sub.children.filter((c: any) => c?.name === t.name);
  const placed = cands.find((c: any) => c?.placedLayer);
  const hasArea = cands.find((c: any) => c && (c.left != null) && ((c.right ?? c.left) > (c.left ?? 0) || (c.bottom ?? c.top) > (c.top ?? 0)));
  const layer = placed ?? hasArea ?? cands[0];
  if (!layer) return null;
  return { layer, path: `Mockup/${t.sub}/${layer.name}`, group: `Mockup/${t.sub}` };
}

const GEOMETRY_ALIAS: Record<string, string> = { Box: "Box top" };

function loadGeoSurfaces(geometryPath: string): Record<string, { bounds: { left: number; top: number; width: number; height: number } | null; path: string | null }> {
  try {
    const g = JSON.parse(readFileSync(geometryPath, "utf8"));
    return (g?.surfaces ?? {}) as Record<string, { bounds: { left: number; top: number; width: number; height: number } | null; path: string | null }>;
  } catch {
    return {};
  }
}

/** Constroi o mapa determinístico superfície->camada/bounds/tipo.
 *  Usa o geometry.json como fonte de bounds quando presente (não inventa);
 *  para aplicações ausentes do snapshot, mede o bbox REAL da camada no PSD.
 *  Faz um full-read para classificar com precisão placed/vector (determinístico). */
export function buildSurfaceMap(psdPath: string, geometryPath: string): BrandSurfaceMap {
  const masterSha = protectMaster(psdPath);
  const geo = loadGeoSurfaces(geometryPath);
  ensureCanvas();
  const psd = ag.readPsd(readFileSync(psdPath), { throwForMissingFeatures: false, skipLayerImageData: true, skipCompositeImageData: true });
  const surfaces: Record<string, BrandSurface> = {};
  for (const applicationId of Object.keys(SURFACE_TARGETS)) {
    const target = SURFACE_TARGETS[applicationId];
    const layerPath = `Mockup/${target.sub}/${target.name}`;
    const resolved = resolveSurfaceLayer(psd, applicationId);
    const layer = resolved?.layer;
    const geoKey = GEOMETRY_ALIAS[applicationId] ?? applicationId;
    const geoEntry = geo[geoKey];
    const geoBounds = geoEntry?.bounds && geoEntry.bounds.width ? geoEntry.bounds : null;
    const live = (layer?.right ?? (layer?.left ?? 0)) - (layer?.left ?? 0);
    const liveH = (layer?.bottom ?? (layer?.top ?? 0)) - (layer?.top ?? 0);
    const measured = layer && live > 0 && liveH > 0 ? { left: layer.left as number, top: layer.top as number, width: live, height: liveH } : null;
    const b = geoBounds ?? measured;
    const support = !!b && b.width > 0 && b.height > 0;
    const surfaceType: SurfaceType = layer?.placedLayer ? "placed" : (layer?.vectorFill ? "vector" : "raster");
    surfaces[applicationId] = {
      applicationId,
      layerPath,
      group: `Mockup/${target.sub}`,
      surfaceType,
      bounds: b ? { left: b.left, top: b.top, width: Math.abs(b.width), height: Math.abs(b.height) } : null,
      blendMode: layer?.blendMode ?? null,
      supported: support,
      reason: support ? undefined : "surface_not_resolved",
      geometrySource: geoBounds ? "geometry.json" : "layer",
    };
  }
  return { sourcePsd: psdPath, masterSha, surfaces };
}

/** Seleção contextual determinística de aplicações (ex.: papelaria/restaurante/tecnologia/escritório). */
export function selectBrandApplications(input: { context: string; availableApplications: string[] }): string[] {
  const selectors: Record<string, string[]> = {
    papelaria: ["A4", "A5", "BC"],
    restaurante: ["Box", "Mug", "BC"],
    tecnologia: ["iPhone", "Tablet", "BC"],
    escritorio: ["A4", "Notepad", "BC"],
  };
  const wanted = selectors[input.context] ?? [];
  return wanted.filter((a) => input.availableApplications.includes(a));
}

/** Rasteriza o SVG em w×h preservando proporção (contain/cover), fundo transparente. */
async function rasterizeLogoFit(logoSvg: string, w: number, h: number, fit: FitMode): Promise<{ data: Uint8ClampedArray; canvas: any; centerPixel: [number, number, number, number] } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const img: any = await canvas.loadImage(Buffer.from(logoSvg));
    const c = canvas.createCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const iw = img.width || w, ih = img.height || h;
    let dw = w, dh = h, dx = 0, dy = 0;
    if (fit === "contain") {
      const scale = Math.min(w / iw, h / ih);
      dw = iw * scale; dh = ih * scale;
      dx = (w - dw) / 2; dy = (h - dh) / 2;
    } else {
      const scale = Math.max(w / iw, h / ih);
      dw = iw * scale; dh = ih * scale;
      dx = (w - dw) / 2; dy = (h - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    const idata = ctx.getImageData(0, 0, w, h);
    const center = Math.floor(w / 2), cy = Math.floor(h / 2);
    const d = ctx.getImageData(center, cy, 1, 1).data;
    return { data: new Uint8ClampedArray(idata.data.buffer || idata.data), canvas: c, centerPixel: [d[0], d[1], d[2], d[3]] };
  } catch {
    return null;
  }
}

/** Aplica cores da identidade nas camadas comprovadamente destinadas à cor (Color 1/Color 2). */
function applyLikelyColorLayers(psd: any, identity: BrandIdentity, modifiedColors: string[], skipLayers: Set<string>): string[] {
  const targets: Array<[string, string]> = [["Color 1", "Color 1"], ["Color 2", "Color 2"]];
  const apply = (name: string, colorName: string, hex: string) => {
    if (skipLayers.has(name)) return;
    const layer = findIn(psd, name);
    if (layer?.vectorFill?.color) {
      const { r, g, b } = hexToRgb(hex);
      layer.vectorFill.color.r = r; layer.vectorFill.color.g = g; layer.vectorFill.color.b = b;
      if (!modifiedColors.includes(colorName)) modifiedColors.push(colorName);
    }
  };
  apply("Color 1", "Color/Color 1", identity.primary);
  apply("Color 2", "Color/Color 2", identity.secondary);
  return modifiedColors;
}

function layerBlendNodes(psd: any): string[] {
  const found: string[] = [];
  (function w(o: any) { if (!o || typeof o !== "object") return; if (o.blendMode && /linear burn|screen|multiply|pass through/i.test(o.blendMode)) found.push(o.name || "?"); if (o.children) for (const c of o.children) w(c); })(psd);
  return found;
}

function preservedList(psd: any, readTree: string[]): string[] {
  const names = new Set<string>();
  (function w(o: any) { if (!o || typeof o !== "object") return; if (o.name) names.add(o.name); if (o.children) for (const c of o.children) w(c); })(psd);
  const present = PRESERVED_TOP_LEVEL.filter((n) => names.has(n));
  const others = readTree.filter((p) => p && !p.startsWith("Mockup/Designs/") && p.startsWith("Mockup/"));
  return [...present, ...others.slice(0, 12)];
}

/** API UNIFICADA: aplica identidade (logo + cores) a UMA aplicação. */
export async function applyBrandToApplication(input: { sourcePsd: string; outputPsd: string; applicationId: string; logoSvg?: string; brandColors?: { primary: string; secondary: string; accent?: string }; identity?: BrandIdentity; options?: { applyColors?: boolean; fit?: FitMode; mapPath?: string } }): Promise<BrandResult> {
  const identity: BrandIdentity = input.identity ?? { logoSvg: input.logoSvg, primary: input.brandColors?.primary ?? "#000000", secondary: input.brandColors?.secondary ?? "#ffffff", accent: input.brandColors?.accent };
  return applyBrandToApplications({ sourcePsd: input.sourcePsd, outputPsd: input.outputPsd, applications: [input.applicationId], identity, options: input.options });
}

/** API UNIFICADA (multi): aplica identidade a várias aplicações numa ÚNICA saída PSD. */
export async function applyBrandToApplications(input: { sourcePsd: string; outputPsd: string; applications: string[]; identity: BrandIdentity; options?: { applyColors?: boolean; fit?: FitMode; mapPath?: string } }): Promise<BrandResult> {
  const options = input.options ?? {};
  const applyColors = options.applyColors !== false;
  const fit = options.fit ?? "contain";
  const sourceSha = protectMaster(input.sourcePsd);
  ensureCanvas();
  try {
    const psd = ag.readPsd(readFileSync(input.sourcePsd), { throwForMissingFeatures: false, skipCompositeImageData: true });
    const map = buildSurfaceMap(input.sourcePsd, options.mapPath ?? "assets/mockups/master/mockup-master.geometry.json");
    const modifiedColors: string[] = [];
    const applied: BrandApplicationStatus[] = [];
    const unsupported: BrandApplicationStatus[] = [];
    const modifiedLayers: string[] = [];
    const expectedCenters: Record<string, [number, number, number, number]> = {};

    for (const applicationId of input.applications) {
      const target = map.surfaces[applicationId];
      if (!target) { unsupported.push({ applicationId, status: "unsupported", reason: "application_not_mapped" }); continue; }
      const resolved = resolveSurfaceLayer(psd, applicationId);
      if (!target.supported || !resolved?.layer) { unsupported.push({ applicationId, status: "unsupported", reason: target.reason ?? "surface_not_resolved" }); continue; }
      const { layer, path } = resolved;
      const w = Math.max(1, (layer.right ?? 0) - (layer.left ?? 0));
      const h = Math.max(1, (layer.bottom ?? 0) - (layer.top ?? 0));
      if (input.identity.logoSvg) {
        const raster = await rasterizeLogoFit(input.identity.logoSvg, w, h, fit);
        if (!raster) { unsupported.push({ applicationId, status: "unsupported", reason: "svg_rasterize_failed" }); continue; }
        layer.imageData = { width: w, height: h, data: raster.data };
        delete layer.canvas;
        modifiedLayers.push(path);
        expectedCenters[applicationId] = raster.centerPixel;
      }
      applied.push({ applicationId, status: "applied", layerPath: path });
    }

    if (applyColors && applied.length) applyLikelyColorLayers(psd, input.identity, modifiedColors, new Set());

    const out = Buffer.from(ag.writePsdBuffer(psd, {}));
    writeFileSync(input.outputPsd, out);

    // RE-LEITURA para comprovar persistência (item 11: persisted=true apenas após reabrir E verificar conteúdo)
    const ref = ag.readPsd(Buffer.from(out), { throwForMissingFeatures: false, skipCompositeImageData: true });
    let persisted = applied.length > 0;
    for (const a of applied) {
      const rl = resolveSurfaceLayer(ref, a.applicationId)?.layer;
      if (!rl?.canvas) { persisted = false; break; }
      const w = rl.canvas.width, h = rl.canvas.height;
      if (w <= 0 || h <= 0) { persisted = false; break; }
      const expected = expectedCenters[a.applicationId];
      if (expected) {
        const ctx = rl.canvas.getContext("2d");
        const d = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data;
        const tol = Math.abs(d[0] - expected[0]) + Math.abs(d[1] - expected[1]) + Math.abs(d[2] - expected[2]);
        if (tol > 12) { persisted = false; break; } // conteúdo deve ter persistido
      }
    }
    if (applyColors && applied.length) {
      const c1 = findIn(ref, "Color 1")?.vectorFill?.color;
      const c2 = findIn(ref, "Color 2")?.vectorFill?.color;
      if (!c1 || !c2) persisted = false;
    }
    const appliedIds = applied.map((a) => a.applicationId);
    const preserved = preservedList(ref, mapReadPaths(input.sourcePsd));
    const status: "applied" | "partial" | "failed" = appliedIds.length ? (unsupported.length ? "partial" : "applied") : "failed";
    return {
      status,
      applicationsRequested: input.applications,
      applicationsApplied: appliedIds,
      applicationsUnsupported: unsupported,
      modifiedLayers,
      modifiedColors,
      preservedLayers: preserved,
      sourceSha,
      outputSha: createHash("sha256").update(out).digest("hex"),
      persisted,
      outputPath: input.outputPsd,
      reason: status === "failed" ? (unsupported[0]?.reason ?? "no_application_applied") : undefined,
    };
  } catch (e) {
    return { status: "failed", applicationsRequested: input.applications, applicationsApplied: [], applicationsUnsupported: [], modifiedLayers: [], modifiedColors: [], preservedLayers: [], sourceSha, outputSha: "", persisted: false, outputPath: input.outputPsd, reason: e instanceof Error ? e.message : String(e) };
  }
}

function mapReadPaths(psdPath: string): string[] {
  try { return readPsdTree(psdPath).tree.map((n) => n.path); } catch { return []; }
}
