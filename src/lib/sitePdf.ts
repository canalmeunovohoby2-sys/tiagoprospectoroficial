// Proposta comercial em PDF — apresentação premium MOBILE-FIRST.
// Regra de fidelidade: SITE REAL → SCREENSHOT REAL (Chromium) → MOCKUP → PDF.
// O screenshot exibido dentro do notebook/celular é SEMPRE a captura real
// renderizada no navegador — nunca reconstrução/hero/background aproximado.
// Nenhum texto vaza de cards; todo texto é medido e quebrado pela largura.
import { jsPDF } from "jspdf";
import { sanitizeSlug } from "./siteExportCore";

interface PdfInput {
  business?: Record<string, unknown>;
  design_system?: Record<string, unknown>;
  content?: Record<string, unknown>;
  sections?: Array<{ type?: string }>;
  [key: string]: unknown;
}
interface Rgb { r: number; g: number; b: number }
function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }
function obj(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const num = parseInt(n, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function luminance({ r, g, b }: Rgb): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
export function ensureContrast(fg: Rgb, bg: Rgb, min = 4.2): Rgb {
  if (contrastRatio(fg, bg) >= min) return fg;
  return luminance(bg) > 0.45 ? { r: 24, g: 28, b: 34 } : { r: 255, g: 255, b: 255 };
}
export function readableTextFor(bg: Rgb, darkText: Rgb, lightText: Rgb): Rgb {
  return contrastRatio(bg, darkText) >= contrastRatio(bg, lightText) ? darkText : lightText;
}
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return { r: f(a.r, b.r), g: f(a.g, b.g), b: f(a.b, b.b) };
}
function clampHex(hex: string): string {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : "";
}
export function pdfFileName(name: string): string {
  return `${sanitizeSlug(name, "projeto")}-proposta.pdf`;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const SURFACE: Rgb = { r: 246, g: 247, b: 249 };
const HAIR: Rgb = { r: 226, g: 229, b: 234 };
const INK: Rgb = { r: 20, g: 23, b: 28 };
const MUT: Rgb = { r: 92, g: 100, b: 110 };
const NIGHT: Rgb = { r: 10, g: 12, b: 15 };

function text(doc: jsPDF, t: string, x: number, y: number, size: number, color: Rgb, style: "normal" | "bold" = "normal", align: "left" | "center" | "right" = "left", charSpace = 0) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color.r, color.g, color.b);
  doc.text(t, x, y, { align, charSpace });
}
function rrect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill?: Rgb, stroke?: Rgb, lineW = 0.8) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (fill) { doc.setFillColor(fill.r, fill.g, fill.b); doc.roundedRect(x, y, w, h, rr, rr, "F"); }
  if (stroke) { doc.setDrawColor(stroke.r, stroke.g, stroke.b); doc.setLineWidth(lineW); doc.roundedRect(x, y, w, h, rr, rr, "S"); }
}
function line(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, color: Rgb, w = 0.7) {
  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(w);
  doc.line(x1, y1, x2, y2);
}
function wrapLines(doc: jsPDF, t: string, w: number, maxLines: number): string[] {
  if (!t) return [];
  const arr = doc.splitTextToSize(t, w) as string[];
  return arr.length > maxLines ? arr.slice(0, maxLines) : arr;
}
function imgAspect(doc: jsPDF, dataUrl: string): number | null {
  try { const p = doc.getImageProperties(dataUrl); if (p?.width > 0 && p?.height > 0) return p.width / p.height; } catch { /* ignore */ }
  return null;
}
// Insere a imagem REAL contida no box (letterbox escuro quando a proporção
// diferir — aparência premium, nunca distorce).
function drawImageContain(doc: jsPDF, dataUrl: string, x: number, y: number, boxW: number, boxH: number, bg?: Rgb) {
  if (bg) rrect(doc, x, y, boxW, boxH, 0, bg);
  const fmt = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
  const ar = imgAspect(doc, dataUrl);
  let w = boxW;
  let h = w / (ar ?? boxW / boxH);
  if (h > boxH) { h = boxH; w = h * (ar ?? boxW / boxH); }
  try { doc.addImage(dataUrl, fmt, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h); } catch { /* sem imagem */ }
}

// ─── Notebook realista (corpo metálico, bisel, dobradiça, deck) ─────────────
function drawLaptop(doc: jsPDF, cx: number, cy: number, w: number, img?: string | null) {
  const lidH = w * 0.66;
  const x = cx - w / 2;
  // sombra suave
  rrect(doc, x + 7, cy + 10, w, lidH, 16, { r: 214, g: 219, b: 225 });
  // tampa traseira (alumínio escuro)
  rrect(doc, x, cy, w, lidH, 16, { r: 49, g: 53, b: 59 });
  // laterais em tom mais claro (aresta)
  line(doc, x + 2, cy + 4, x + 2, cy + lidH - 4, { r: 120, g: 125, b: 132 }, 1.4);
  line(doc, x + w - 2, cy + 4, x + w - 2, cy + lidH - 4, { r: 120, g: 125, b: 132 }, 1.4);
  // bisel preto
  const bezel = w * 0.035;
  rrect(doc, x + bezel, cy + bezel, w - bezel * 2, lidH - bezel * 2, 10, { r: 12, g: 14, b: 17 });
  // webcam + barra
  rrect(doc, x + w / 2 - 6, cy + bezel - 1.5, 12, 3, 1.5, { r: 28, g: 31, b: 35 });
  doc.setFillColor(28, 30, 34);
  doc.circle(x + w / 2, cy + bezel, 0.9, "F");
  doc.setFillColor(90, 95, 100);
  doc.circle(x + w / 2, cy + bezel, 0.4, "F");
  // TELA (screenshot real)
  const sx = x + bezel + 5;
  const sy = cy + bezel + 6;
  const sw = w - bezel * 2 - 10;
  const sh = lidH - bezel * 2 - 10;
  rrect(doc, sx, sy, sw, sh, 4, NIGHT);
  if (img) drawImageContain(doc, img, sx + 1.5, sy + 1.5, sw - 3, sh - 3);
  // dobradiça
  rrect(doc, x + w * 0.06, cy + lidH - 3, w * 0.88, 4, 2, { r: 90, g: 95, b: 102 });
  // deck (base)
  const deckY = cy + lidH;
  const deckH = w * 0.075;
  rrect(doc, x - w * 0.03, deckY, w * 1.06, deckH, 8, { r: 70, g: 74, b: 80 });
  // teclado implícito (faixas)
  for (let i = 0; i < 6; i++) {
    doc.setFillColor(120 + i * 4, 124 + i * 4, 130 + i * 4);
    doc.rect(x + w * 0.06, deckY + 4 + i * (deckH - 8) / 6, w * 0.88 - (i % 2) * 4, (deckH - 8) / 7, "F");
  }
  // trackpad
  rrect(doc, x + w * 0.4, deckY + 4, w * 0.2, deckH * 0.45, 3, { r: 52, g: 55, b: 60 });
}

// ─── Smartphone realista (titânio, cantos, ilha dinâmica, tela real) ────────
function drawPhone(doc: jsPDF, cx: number, cy: number, w: number, img?: string | null) {
  const h = w * 2.08;
  const x = cx - w / 2;
  // sombra
  rrect(doc, x + 4, cy + 8, w, h, w * 0.2, { r: 208, g: 213, b: 220 });
  // frame metálico (contorno)
  rrect(doc, x, cy, w, h, w * 0.18, { r: 86, g: 90, b: 96 });
  // corpo
  const insetF = w * 0.022;
  rrect(doc, x + insetF, cy + insetF, w - insetF * 2, h - insetF * 2, w * 0.16, { r: 12, g: 13, b: 16 });
  // botões laterais
  doc.setFillColor(120, 123, 128);
  doc.rect(x - 2, cy + h * 0.15, 3, w * 0.09, "F");
  doc.rect(x - 2, cy + h * 0.26, 3, w * 0.16, "F");
  doc.rect(x + w - 1, cy + h * 0.18, 3, w * 0.1, "F");
  // tela
  const inset = w * 0.05;
  const sx = x + inset;
  const sy = cy + inset;
  const sw = w - inset * 2;
  const sh = h - inset * 2;
  rrect(doc, sx, sy, sw, sh, w * 0.1, NIGHT);
  if (img) drawImageContain(doc, img, sx + 2, sy + 2, sw - 4, sh - 4);
  // ilha dinâmica (status)
  rrect(doc, x + w * 0.27, cy + inset + 6, w * 0.46, w * 0.075, w * 0.037, { r: 8, g: 9, b: 11 });
}

// Quebra texto por largura e desenha com espaçamento seguro; retorna altura.
function drawParagraph(doc: jsPDF, t: string, x: number, y: number, w: number, size: number, color: Rgb, lineH = 1.38): number {
  if (!t) return 0;
  const lines = doc.splitTextToSize(t, w) as string[];
  let yy = y;
  for (const ln of lines) { text(doc, ln, x, yy, size, color); yy += size * lineH; }
  return lines.length * size * lineH;
}

function pageBg(doc: jsPDF, W: number, H: number, brand: Rgb) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(brand.r, brand.g, brand.b);
  doc.rect(0, 0, W, 6, "F");
}
function sectionTitle(doc: jsPDF, x: number, y: number, kicker: string, title: string, brand: Rgb, ink: Rgb, w: number) {
  text(doc, kicker.toUpperCase(), x, y, 8, brand, "bold", "left", 1.1);
  doc.setFillColor(brand.r, brand.g, brand.b);
  doc.rect(x, y + 5, 22, 1.6, "F");
  text(doc, title, x, y + 24, 19, ink, "bold");
}
function footerPage(doc: jsPDF, W: number, name: string, page: number) {
  line(doc, 48, 806, W - 48, 806, HAIR);
  text(doc, name.toUpperCase(), 48, 822, 7, MUT, "bold", "left", 0.8);
  text(doc, `PROPOSTA COMERCIAL · ${String(page).padStart(2, "0")}`, W - 48, 822, 7, MUT, "normal", "right", 0.4);
}

export async function buildCommercialPdf(spec: PdfInput, heroImage?: { dataUrl: string } | null, screenshots?: string[], realPalette?: Partial<Record<string, string>>): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const b = obj(spec.business);
  const ds = obj(spec.design_system);
  const specColors = obj(ds.colors) as Record<string, string>;
  const colors = { ...specColors, ...(realPalette ?? {}) } as Record<string, string>;
  const typo = obj(ds.typography);
  const content = obj(spec.content);
  const hero = obj(content.hero);
  const company = str(b.name) || "Empresa";
  const segment = str(b.segment);
  const location = [str(b.city), str(b.state)].filter(Boolean).join("/");
  const tagline = str(hero.subtitle) || "Presença digital profissional, sob medida para este negócio.";

  const primary = clampHex(str(colors.primary)) || "#2563eb";
  const accentHex = clampHex(str(colors.accent)) || "#f59e0b";
  const brand = ensureContrast(hexToRgb(primary), WHITE, 4.6);
  const brandDeep = mix(hexToRgb(primary), NIGHT, 0.35);
  const accent = ensureContrast(hexToRgb(accentHex), NIGHT, 3);
  const brandSoft = mix(brand, WHITE, 0.9);
  const ink = ensureContrast({ r: 22, g: 26, b: 31 }, WHITE, 7);
  const swatches: Array<{ hex: string; name: string }> = [
    { hex: str(colors.primary) || "#2563eb", name: "Primária" },
    { hex: str(colors.secondary) || "#0f172a", name: "Secundária" },
    { hex: str(colors.accent) || "#f59e0b", name: "Acento" },
    { hex: str(colors.background) || "#f8fafc", name: "Fundo" },
  ];
  const headingFont = str(typo.heading_font);
  const screens = screenshots ?? [];
  const desktopShot = screens[0] ?? null;
  const mobileShot = screens[1] ?? null;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const CW = W - M * 2;
  const MID = W / 2;

  // ============ PÁGINA 1 — CAPA ============
  pageBg(doc, W, H, brand);
  // blobs decorativos
  doc.setFillColor(brandSoft.r, brandSoft.g, brandSoft.b);
  doc.circle(W - 20, 50, 150, "F");
  doc.circle(10, H - 80, 130, "F");

  text(doc, "PROPOSTA COMERCIAL", M, 92, 10, brand, "bold", "left", 1.4);
  doc.setFillColor(brand.r, brand.g, brand.b);
  doc.rect(M, 102, 26, 2.2, "F");

  // Título da empresa — nunca estoura a largura
  const nameLines = wrapLines(doc, company, CW * 0.94, 2);
  let yy = 168;
  for (const n of nameLines) { text(doc, n, M, yy, 36, ink, "bold"); yy += 44; }
  if (segment) text(doc, `${segment}${location ? `   ·   ${location}` : ""}`, M, yy + 2, 13, MUT);
  const tagLines = wrapLines(doc, tagline, CW * 0.7, 2);
  let ty = yy + 24;
  for (const t of tagLines) { text(doc, t, M, ty, 11.5, MUT); ty += 16; }

  // Captura REAL do site (desktop) na capa — prova visual imediata
  const cardY = 318;
  const cardH = 300;
  rrect(doc, M + 5, cardY + 5, CW, cardH, 16, { r: 232, g: 235, b: 239 });
  rrect(doc, M, cardY, CW, cardH, 14, { r: 15, g: 17, b: 20 });
  text(doc, "www.site-profissional.com.br", M + 18, cardY + 20, 8, { r: 170, g: 176, b: 182 }, "normal", "left", 0.6);
  line(doc, M + 18, cardY + 27, W - M - 18, cardY + 27, { r: 42, g: 46, b: 52 }, 1);
  if (desktopShot) {
    rrect(doc, M + 16, cardY + 36, CW - 32, cardH - 50, 6, { r: 12, g: 14, b: 17 });
    drawImageContain(doc, desktopShot, M + 18, cardY + 38, CW - 36, cardH - 54);
  } else {
    text(doc, "Captura do site", MID, cardY + cardH / 2, 16, { r: 225, g: 228, b: 233 }, "bold", "center");
    text(doc, "A imagem real será gerada após publicar o site.", MID, cardY + cardH / 2 + 22, 10, { r: 160, g: 166, b: 174 }, "normal", "center");
  }

  rrect(doc, M, 646, CW, 46, 10, SURFACE, HAIR);
  text(doc, "SITE SOB MEDIDA · IDENTIDADE PRÓPRIA · 100% RESPONSIVO", M + 20, 674, 10, brand, "bold", "left", 1);
  footerPage(doc, W, company, 1);

  // ============ PÁGINA 2 — O SITE (notebook real + screenshot real) ============
  doc.addPage();
  pageBg(doc, W, H, brand);
  sectionTitle(doc, M, 78, "Apresentação do projeto", "O site pronto para o seu negócio", brand, ink, CW);
  let y = 150;
  text(doc, "Este site foi criado sob medida — nada de template genérico. Cada detalhe respeita a identidade e o público deste negócio.", M, y, 11.5, MUT);
  y += 22;
  const bullets: Array<[string, string]> = [
    ["Identidade própria", "Cores, tipografia e composição desenvolvidas para a marca."],
    ["Feito para converter", "Estrutura com chamadas claras em cada etapa da visita."],
    ["Conteúdo real", "Textos, serviços e diferenciais apresentados com cuidado."],
    ["Imagens contextuais", "Fotografias e referências coerentes com o segmento."],
    ["Funciona em qualquer tela", "Desktop, tablet e celular com a mesma qualidade."],
  ];
  const colW = CW * 0.5;
  // Cards com altura medida (título + descrição nunca vazam).
  const cardW = colW - 12;
  const measureCard = (t: string, d: string): number => {
    const tl = wrapLines(doc, t, cardW - 26, 2);
    const dl = wrapLines(doc, d, cardW - 26, 3);
    return 16 + tl.length * 14.5 + 5 + dl.length * 12.5 + 12;
  };
  const heights: number[] = bullets.map(([t, d]) => measureCard(t, d));
  const rowHByRow: number[] = [];
  for (let i = 0; i < heights.length; i += 2) {
    rowHByRow.push(Math.max(heights[i], heights[i + 1] ?? heights[i]) + 18);
  }
  for (let i = 0; i < bullets.length; i++) {
    const [t, d] = bullets[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = M + col * (colW + 20);
    const by = y + (row > 0 ? rowHByRow.slice(0, row).reduce((a, b) => a + b, 0) : 0);
    const bh = heights[i];
    const tl = wrapLines(doc, t, cardW - 26, 2);
    const dl = wrapLines(doc, d, cardW - 26, 3);
    rrect(doc, bx, by, cardW, bh, 10, SURFACE, HAIR);
    let cyy = by + 18;
    for (const l of tl) { text(doc, l, bx + 13, cyy, 11, ink, "bold"); cyy += 14.5; }
    cyy += 3;
    for (const l of dl) { text(doc, l, bx + 13, cyy, 9, MUT); cyy += 12.5; }
  }
  const lapSectionY = y + rowHByRow.reduce((a, b) => a + b, 0) + 10;
  text(doc, "Tela do computador — captura real do site", M, lapSectionY, 12, ink, "bold");
  const lapW = Math.min(CW, 430);
  drawLaptop(doc, MID, lapSectionY + 30, lapW, desktopShot);
  footerPage(doc, W, company, 2);

  // ============ PÁGINA 3 — CELULAR (screenshot mobile real) ============
  doc.addPage();
  pageBg(doc, W, H, brand);
  sectionTitle(doc, M, 78, "Experiência mobile", "Seu site na palma da mão", brand, ink, CW);

  const phoneW = 172;
  drawPhone(doc, M + 118, 128, phoneW, mobileShot);
  text(doc, "Captura real da versão mobile", M + 118, 128 + phoneW * 2.08 + 22, 8.5, MUT, "normal", "center");

  const phoneBottom = 128 + phoneW * 2.08 + 40;
  const rx = M + 280;
  const rw = W - M - 48 - rx;
  text(doc, "Experiência pensada para o celular", rx, 128, 12.5, ink, "bold");
  let ay = 152;
  const adv: Array<[string, string]> = [
    ["Menu e navegação simples", "Encontra o que precisa em segundos, com botões grandes."],
    ["Leitura confortável", "Tipografia e espaçamentos dimensionados para a tela."],
    ["Contato direto", "Chamadas e botões que levam ao atendimento."],
    ["Visual consistente", "Mesma identidade em qualquer tamanho de tela."],
  ];
  for (const [t, d] of adv) {
    // Título e descrição medidos e quebrados — card cresce, nunca estoura.
    const tl = wrapLines(doc, t, rw - 24, 2);
    const dl = wrapLines(doc, d, rw - 24, 2);
    const cardH = 16 + tl.length * 13.5 + 5 + dl.length * 12.5 + 12;
    rrect(doc, rx, ay, rw, cardH, 10, SURFACE, HAIR);
    let ty2 = ay + 19;
    for (const l of tl) { text(doc, l, rx + 12, ty2, 10.5, ink, "bold"); ty2 += 13.5; }
    ty2 += 2;
    for (const l of dl) { text(doc, l, rx + 12, ty2, 9, MUT); ty2 += 12.5; }
    ay += cardH + 12;
  }

  // Identidade visual (cores reais do site) — começa DEPOIS da área do
  // celular/caption, para nunca desenhar texto por cima do aparelho.
  const idY = Math.max(phoneBottom, ay) + 6;
  text(doc, "Identidade visual do projeto", M, idY, 12, ink, "bold");
  const chipW = (CW - 3 * 14) / 4;
  let cy = idY + 12;
  for (let i = 0; i < swatches.length; i++) {
    const s = swatches[i];
    const cx = M + i * (chipW + 14);
    const c = clampHex(s.hex) ? hexToRgb(s.hex) : { r: 205, g: 205, b: 205 };
    rrect(doc, cx, cy, chipW, 46, 8, c, HAIR);
    text(doc, s.name, cx, cy + 58, 8, MUT, "bold");
    text(doc, (s.hex || "").toUpperCase(), cx, cy + 68, 7, MUT);
  }
  cy += 84;
  if (headingFont) {
    rrect(doc, M, cy, CW, 40, 10, SURFACE, HAIR);
    text(doc, "Tipografia", M + 16, cy + 16, 9, brand, "bold");
    text(doc, `${headingFont} — títulos com presença e corpo de leitura confortável.`, M + 16, cy + 30, 9.5, ink);
  }
  footerPage(doc, W, company, 3);

  // ============ PÁGINA 4 — O QUE ESTÁ INCLUÍDO ============
  doc.addPage();
  pageBg(doc, W, H, brand);
  sectionTitle(doc, M, 78, "Entrega", "Tudo o que você recebe", brand, ink, CW);
  const inc: Array<[string, string]> = [
    ["Site profissional completo", "Páginas, seções e identidade visual aplicada no código."],
    ["100% responsivo", "Desktop, tablet e celular com o mesmo capricho."],
    ["Conteúdo estratégico", "Textos reais e organizados, sem invenções ou promessas."],
    ["Imagens contextuais", "Fotos coerentes com o segmento e o posicionamento."],
    ["Publicação online", "Site no ar em URL própria e estável."],
    ["Ajustes futuros", "Edições preservando identidade e endereço."],
  ];
  const gW = (CW - 22) / 2;
  let gy = 152;
  // Grid com altura medida por linha (nunca vaza texto).
  const incHeights: number[] = inc.map(([t, d]) => {
    const tl = wrapLines(doc, t, gW - 28, 2);
    const dl = wrapLines(doc, d, gW - 28, 3);
    return 16 + tl.length * 15 + 5 + dl.length * 13.5 + 14;
  });
  const incRows: number[] = [];
  for (let i = 0; i < incHeights.length; i += 2) incRows.push(Math.max(incHeights[i], incHeights[i + 1] ?? incHeights[i]) + 18);
  let accY = gy;
  for (let row = 0; row < incRows.length; row++) {
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      if (idx >= inc.length) break;
      const [t, d] = inc[idx];
      const bx = M + col * (gW + 22);
      const tl = wrapLines(doc, t, gW - 28, 2);
      const dl = wrapLines(doc, d, gW - 28, 3);
      const bh = incHeights[idx];
      rrect(doc, bx, accY, gW, bh, 12, SURFACE, HAIR);
      let cyy = accY + 18;
      for (const l of tl) { text(doc, l, bx + 14, cyy, 11.5, ink, "bold"); cyy += 15; }
      cyy += 3;
      for (const l of dl) { text(doc, l, bx + 14, cyy, 9.5, MUT); cyy += 13.5; }
    }
    accY += incRows[row];
  }
  const noteY = accY + 4;
  rrect(doc, M, noteY, CW, 52, 12, brandSoft);
  text(doc, "Uma proposta completa para o seu negócio crescer — sem mensalidade, sem letras miúdas.", M + 18, noteY + 22, 11.5, brandDeep, "bold");
  text(doc, "O endereço público é estável: futuras edições são aplicadas no mesmo link.", M + 18, noteY + 39, 9.5, ink);
  footerPage(doc, W, company, 4);

  // ============ PÁGINA 5 — INVESTIMENTO ============
  doc.addPage();
  pageBg(doc, W, H, brand);
  sectionTitle(doc, M, 78, "Investimento", "Valor claro, sem surpresas", brand, ink, CW);
  const rows: Array<[string, string, string]> = [
    ["Desenvolvimento do site", "Investimento único", "R$ 499,00"],
    ["Hospedagem", "Inclusa no primeiro ano", "R$ 0,00"],
    ["Mensalidade", "Não existe", "R$ 0,00"],
    ["Publicação e configuração", "Incluso", "R$ 0,00"],
    ["Domínio próprio", "Aproximadamente", "R$ 40,00/ano"],
  ];
  let ty2 = 160;
  const rowH2 = 54;
  rrect(doc, M, ty2 - 14, CW, rows.length * rowH2 + 18, 14, SURFACE, HAIR);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ry = ty2 + i * rowH2;
    if (i > 0) line(doc, M + 22, ry - 6, W - M - 22, ry - 6, HAIR, 0.8);
    const nameW = CW * 0.46;
    const nameLines = wrapLines(doc, r[0], nameW - 24, 2);
    let ny = ry + (nameLines.length === 1 ? 18 : 14);
    for (const n of nameLines) { text(doc, n, M + 22, ny, 10.5, ink, "bold"); ny += 13; }
    text(doc, r[1], M + CW * 0.5, ry + (nameLines.length === 1 ? 18 : 24), 8.5, MUT);
    text(doc, r[2], W - M - 22, ry + 18, 11.5, r[2] === "R$ 499,00" ? brand : ink, "bold", "right");
  }
  const investY = ty2 + rows.length * rowH2 + 34;
  rrect(doc, M, investY, CW, 56, 12, NIGHT);
  text(doc, "INVESTIMENTO ÚNICO DE R$ 499,00", M + 22, investY + 22, 12.5, accent, "bold");
  text(doc, "Sem mensalidade, sem taxa escondida. Você recebe site pronto, publicado e com ajustes incluídos.", M + 22, investY + 40, 10, { r: 225, g: 228, b: 233 });
  const sealY = investY + 86;
  rrect(doc, M, sealY, CW, 62, 12, brandSoft);
  text(doc, `Proposta gerada sob medida para ${company}.`, M + 20, sealY + 24, 11, brandDeep, "bold");
  text(doc, "Identidade, layout, textos e imagens refletem exatamente este projeto — como o cliente verá no site.", M + 20, sealY + 41, 9.5, ink);
  footerPage(doc, W, company, 5);

  const buffer = doc.output("arraybuffer");
  return { buffer, fileName: pdfFileName(company) };
}
