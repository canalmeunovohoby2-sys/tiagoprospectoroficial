// Proposta comercial em PDF — versão definitiva (5.39).
// Máx. 4 páginas densas: capa c/ print → o site (desktop real + identidade) →
// mobile + vantagens → orçamento. SEM botões/contato dentro do documento.
// Contraste garantido; screenshots reais quando disponíveis (fallback elegante).
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
  return luminance(bg) > 0.45 ? { r: 30, g: 34, b: 40 } : { r: 255, g: 255, b: 255 };
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
function wrap(doc: jsPDF, t: string, w: number): string[] { return doc.splitTextToSize(t, w) as string[]; }

export function pdfFileName(name: string): string {
  return `${sanitizeSlug(name, "projeto")}-proposta.pdf`;
}

const WHITE = { r: 255, g: 255, b: 255 };
const SURFACE = { r: 246, g: 247, b: 249 };
const HAIR = { r: 226, g: 229, b: 234 };
const INK = { r: 22, g: 25, b: 31 };
const MUT = { r: 88, g: 96, b: 106 };
const NIGHT = { r: 11, g: 14, b: 18 };

function text(doc: jsPDF, t: string, x: number, y: number, size: number, color: Rgb, style: "normal" | "bold" = "normal", align: "left" | "center" | "right" = "left") {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color.r, color.g, color.b);
  doc.text(t, x, y, { align });
}
function rrect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill?: Rgb, stroke?: Rgb) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (fill) { doc.setFillColor(fill.r, fill.g, fill.b); doc.roundedRect(x, y, w, h, rr, rr, "F"); }
  if (stroke) { doc.setDrawColor(stroke.r, stroke.g, stroke.b); doc.setLineWidth(0.6); doc.roundedRect(x, y, w, h, rr, rr, "S"); }
}
function imgAspect(doc: jsPDF, dataUrl: string): number {
  try { const p = doc.getImageProperties(dataUrl); if (p?.width > 0 && p?.height > 0) return p.width / p.height; } catch { /* ignore */ }
  return 16 / 10;
}
function drawImageFitted(doc: jsPDF, dataUrl: string, x: number, y: number, boxW: number, boxH: number) {
  const fmt = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
  const ar = imgAspect(doc, dataUrl);
  let w = boxW; let h = w / ar;
  if (h > boxH) { h = boxH; w = h * ar; }
  doc.addImage(dataUrl, fmt, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

// Notebook realista: sombra, corpo do laptop e tela com o screenshot real.
function drawLaptopMock(doc: jsPDF, x: number, y: number, w: number, img?: string | null) {
  const lidH = w * 0.66;
  const bezel = w * 0.025;
  // sombra
  doc.setFillColor(222, 226, 231);
  doc.roundedRect(x + 6, y + 8, w, lidH, 14, 14, "F");
  // corpo (tampa) arredondado
  rrect(doc, x, y, w, lidH, 14, { r: 56, g: 60, b: 66 });
  // barra superior + webcam
  doc.setFillColor(205, 209, 214);
  doc.rect(x + bezel, y + 5, w - bezel * 2, 2, "F");
  const sw = w - bezel * 2;
  const sh = lidH - bezel * 2 - 4;
  rrect(doc, x + bezel, y + bezel, sw, sh, 6, NIGHT);
  if (img) {
    const inner = 5;
    try {
      const fmt = img.startsWith("data:image/png") ? "PNG" : "JPEG";
      const ar = imgAspect(doc, img);
      let iw = sw - inner * 2;
      let ih = iw / ar;
      if (ih > sh - inner * 2) { ih = sh - inner * 2; iw = ih * ar; }
      doc.addImage(img, fmt, x + bezel + (sw - iw) / 2, y + bezel + (sh - ih) / 2, iw, ih);
    } catch { /* tela vazia elegante */ }
  }
  // base do laptop (deck)
  rrect(doc, x - w * 0.02, y + lidH, w * 1.04, w * 0.055, 6, { r: 132, g: 137, b: 143 });
  rrect(doc, x - w * 0.01, y + lidH - 3, w * 1.02, 5, 3, { r: 226, g: 229, b: 234 });
}

// Smartphone moderno: corpo escuro, cantos arredondados, notch e screenshot real.
function drawPhoneMock(doc: jsPDF, x: number, y: number, w: number, img?: string | null) {
  const h = w * 2.04;
  // sombra
  doc.setFillColor(222, 226, 231);
  doc.roundedRect(x + 3, y + 6, w, h, w * 0.18, w * 0.18, "F");
  // corpo
  rrect(doc, x, y, w, h, w * 0.16, { r: 24, g: 25, b: 28 });
  // botões laterais
  doc.setFillColor(70, 72, 76);
  doc.rect(x - 2, y + h * 0.16, 2.5, w * 0.08, "F");
  doc.rect(x - 2, y + h * 0.27, 2.5, w * 0.14, "F");
  doc.rect(x + w, y + h * 0.18, 2.5, w * 0.09, "F");
  // tela
  const inset = w * 0.045;
  const sw = w - inset * 2;
  const sh = h - inset * 2;
  rrect(doc, x + inset, y + inset, sw, sh, w * 0.09, NIGHT);
  // notch (dynamic island)
  doc.setFillColor(15, 16, 18);
  doc.roundedRect(x + w * 0.3, y + inset + 5, w * 0.4, w * 0.07, w * 0.035, w * 0.035, "F");
  if (img) {
    const inner = 3;
    try {
      const fmt = img.startsWith("data:image/png") ? "PNG" : "JPEG";
      const ar = imgAspect(doc, img);
      let iw = sw - inner * 2;
      let ih = iw / ar;
      if (ih > sh - inner * 2 - 10) { ih = sh - inner * 2 - 10; iw = ih * ar; }
      doc.addImage(img, fmt, x + inset + (sw - iw) / 2, y + inset + (sh - ih) / 2, iw, ih);
    } catch { /* tela vazia elegante */ }
  }
}
function header(doc: jsPDF, W: number, label: string, n: string, brand: Rgb, y: number) {
  doc.setFillColor(brand.r, brand.g, brand.b);
  doc.rect(54, y, 20, 2.4, "F");
  text(doc, `${n} · ${label.toUpperCase()}`, 54, y + 14, 9, brand, "bold");
}
function footer(doc: jsPDF, W: number, label: string, pageNo: number) {
  doc.setDrawColor(HAIR.r, HAIR.g, HAIR.b);
  doc.setLineWidth(0.6);
  doc.line(54, 812, W - 54, 812);
  text(doc, label.toUpperCase(), 54, 826, 6.5, MUT);
  text(doc, String(pageNo).padStart(2, "0"), W - 54, 826, 6.5, MUT, "normal", "right");
}

export async function buildCommercialPdf(spec: PdfInput, heroImage?: { dataUrl: string } | null, screenshots?: string[], realPalette?: Partial<Record<string, string>>): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const b = obj(spec.business);
  const ds = obj(spec.design_system);
  const specColors = obj(ds.colors) as Record<string, string>;
  // Paleta REAL extraída do site tem prioridade sobre design_system.
  const colors: Record<string, string> = { ...specColors, ...(realPalette ?? {}) };
  const typo = obj(ds.typography);
  const content = obj(spec.content);
  const hero = obj(content.hero);
  const company = str(b.name) || "Empresa";
  const segment = str(b.segment);
  const location = [str(b.city), str(b.state)].filter(Boolean).join("/");
  const title = str(hero.title) || company;
  const subtitle = str(hero.subtitle);

  const primary = clampHex(str(colors.primary)) || "#2563eb";
  const accentRaw = clampHex(str(colors.accent)) || "#f59e0b";
  const brand = ensureContrast(hexToRgb(primary), WHITE, 4.5);
  const brandSoft = mix(hexToRgb(primary), WHITE, 0.88);
  const accent = ensureContrast(hexToRgb(accentRaw), NIGHT, 3);
  const inkOnLight = ensureContrast({ r: 24, g: 27, b: 32 }, WHITE, 6);
  const swatches: Array<{ hex: string; name: string }> = [
    { hex: str(colors.primary) || "#2563eb", name: "Primária" },
    { hex: str(colors.secondary) || "#0f172a", name: "Secundária" },
    { hex: str(colors.accent) || "#f59e0b", name: "Acento" },
    { hex: str(colors.background) || "#f8fafc", name: "Fundo" },
  ];
  const headingFont = str(typo.heading_font);
  const desktop = Array.isArray(screenshots) ? screenshots[0] ?? null : heroImage?.dataUrl ?? null;
  const mobile = Array.isArray(screenshots) ? screenshots[1] ?? null : null;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const CW = W - M * 2;

  /* ==================== PÁGINA 1 — CAPA ==================== */
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, "F");
  doc.setFillColor(brand.r, brand.g, brand.b); doc.rect(0, 0, W, 7, "F");
  // decoração leve
  doc.setFillColor(brandSoft.r, brandSoft.g, brandSoft.b); doc.circle(W - 30, 40, 170, "F");

  text(doc, "PROPOSTA COMERCIAL", M, 96, 10, brand, "bold");
  doc.setFillColor(brand.r, brand.g, brand.b); doc.rect(M, 106, 30, 2.2, "F");

  text(doc, company, M, 172, 38, inkOnLight, "bold");
  if (segment) text(doc, `${segment}${location ? `  ·  ${location}` : ""}`, M, 194, 12, MUT);
  text(doc, title, M, 218, 15, inkOnLight, "bold");
  const coverSub = wrap(doc, subtitle || "Presença digital profissional, sob medida para este negócio.", CW * 0.72).slice(0, 3);
  text(doc, coverSub.join("\n"), M, 238, 10.5, MUT);

  // Print principal (desktop) na capa — prova visual logo na 1ª página
  const coverY = 300;
  doc.setFillColor(238, 240, 243); doc.roundedRect(M + 2, coverY + 3, CW, 316, 12, 12, "F");
  rrect(doc, M, coverY, CW, 316, 10, NIGHT);
  text(doc, "seu-site.com.br", M + 18, coverY + 20, 7.5, { r: 190, g: 195, b: 202 });
  doc.setFillColor(255, 255, 255); doc.rect(M + 1, coverY + 26, CW - 2, 1, "F");
  if (desktop) {
    const imgH = 262;
    rrect(doc, M + 16, coverY + 38, CW - 32, imgH, 4, { r: 24, g: 27, b: 32 });
    drawImageFitted(doc, desktop, M + 18, coverY + 40, CW - 36, imgH - 4);
  } else {
    text(doc, "Visão do site", M + CW / 2, coverY + 160, 16, { r: 225, g: 228, b: 233 }, "bold", "center");
    text(doc, "Captura será anexada após a publicação.", M + CW / 2, coverY + 184, 10, { r: 170, g: 175, b: 183 }, "normal", "center");
  }
  // faixa de assinatura
  rrect(doc, M, 642, CW, 40, 8, SURFACE, HAIR);
  text(doc, "SITE PROFISSIONAL · IDENTIDADE PRÓPRIA · RESPONSIVO", M + 18, 667, 9, brand, "bold");
  footer(doc, W, company, 1);

  /* ==================== PÁGINA 2 — O SITE + IDENTIDADE ==================== */
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, "F");
  doc.setFillColor(brand.r, brand.g, brand.b); doc.rect(0, 0, W, 7, "F");
  header(doc, W, "O site que você vai receber", "01", brand, 54);
  let y = 96;

  text(doc, "O projeto foi criado sob medida para este negócio — não é template:", M, y, 11.5, inkOnLight, "bold");
  y += 16;
  const bullets = [
    "Identidade visual aplicada (cores, tipografia e composição próprias)",
    "Estrutura orientada a conversão com CTAs claros",
    "Conteúdo real e bem apresentado, seção por seção",
    "Imagens contextuais, coerentes com o segmento",
    "100% responsivo — computador, tablet e celular",
  ];
  for (const bt of bullets) {
    doc.setFillColor(brand.r, brand.g, brand.b); doc.circle(M + 4, y - 3, 2.4, "F");
    text(doc, bt, M + 15, y, 10.5, inkOnLight);
    y += 19;
  }
  y += 12;

  // Print desktop (real) dentro de um notebook realista
  const lapY = y + 6;
  const lapW = Math.min(CW, 470);
  const lapX = M + (CW - lapW) / 2;
  text(doc, "Tela do computador", M, y - 2, 11, inkOnLight, "bold");
  drawLaptopMock(doc, lapX, lapY, lapW, desktop);
  y = lapY + lapW * 0.72 + 22;

  // Identidade
  text(doc, "Identidade visual do projeto", M, y, 11, inkOnLight, "bold");
  y += 10;
  const chipW = (CW - 3 * 12) / 4;
  for (let i = 0; i < swatches.length; i++) {
    const s = swatches[i];
    const cx = M + i * (chipW + 12);
    const c = clampHex(s.hex) ? hexToRgb(s.hex) : { r: 200, g: 200, b: 200 };
    rrect(doc, cx, y, chipW, 40, 6, c, HAIR);
    text(doc, s.name, cx, y + 54, 7, MUT, "bold");
    text(doc, (s.hex || "").toUpperCase(), cx, y + 64, 6.5, MUT);
  }
  y += 76;
  if (headingFont) {
    rrect(doc, M, y, CW, 40, 8, SURFACE, HAIR);
    text(doc, "Tipografia", M + 16, y + 16, 9, brand, "bold");
    text(doc, `${headingFont} — cabeçalhos com presença e hierarquia clara; corpo confortável de leitura.`, M + 16, y + 30, 9, inkOnLight);
  }
  footer(doc, W, company, 2);

  /* ==================== PÁGINA 3 — MOBILE + VANTAGENS ==================== */
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, "F");
  doc.setFillColor(brand.r, brand.g, brand.b); doc.rect(0, 0, W, 7, "F");
  header(doc, W, "Seu site em qualquer tela", "02", brand, 54);
  y = 92;

  const leftW = CW * 0.46;
  const rightX = M + leftW + 34;

  text(doc, "Celular e tablet", M, y, 11, inkOnLight, "bold");
  y += 12;
  // Smartphone realista com o screenshot mobile dentro
  const phoneW = Math.min(leftW, 158);
  const phoneX = M + (leftW - phoneW) / 2;
  drawPhoneMock(doc, phoneX, y, phoneW, mobile);

  text(doc, "Suas vantagens", rightX, 92, 11, inkOnLight, "bold");
  const adv: Array<[string, string]> = [
    ["URL pública e estável", "O endereço do site não muda — edições futuras são aplicadas no mesmo link."],
    ["Hospedagem inclusa", "Publicação e configuração cuidadas pela nossa equipe, sem mensalidade."],
    ["Sem mensalidade", "Você paga só pelo desenvolvimento. O domínio custa cerca de R$ 40,00/ano."],
    ["Edições simples", "Peça ajustes a qualquer momento; a identidade e o endereço são preservados."],
    ["Identidade preservada", "Cores, tipografia e estrutura seguem o conceito aprovado por você."],
  ];
  let ay = 108;
  for (const [t2, d2] of adv) {
    const dl = wrap(doc, d2, rightX > M ? CW - leftW - 34 : CW).slice(0, 2);
    rrect(doc, rightX, ay - 10, (rightX > M ? CW - leftW - 34 : CW), 58, 8, SURFACE, HAIR);
    text(doc, t2, rightX + 12, ay + 4, 10, inkOnLight, "bold");
    let dy = ay + 20;
    for (const l of dl) { text(doc, l, rightX + 12, dy, 8.5, MUT); dy += 11; }
    ay += 68;
  }
  footer(doc, W, company, 3);

  /* ==================== PÁGINA 4 — INVESTIMENTO ==================== */
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, "F");
  doc.setFillColor(brand.r, brand.g, brand.b); doc.rect(0, 0, W, 7, "F");
  header(doc, W, "Investimento e garantias", "03", brand, 54);
  y = 96;

  text(doc, "O que está incluído", M, y, 12, inkOnLight, "bold");
  y += 14;
  const inc = [
    "Site profissional com identidade visual aplicada",
    "Versão responsiva (desktop, tablet e celular)",
    "Imagens contextuais integradas ao layout",
    "Conteúdo real e estratégico, sem invenções",
    "Publicação online + projeto completo entregue",
    "Edições futuras no mesmo endereço público",
  ];
  for (const it of inc) {
    text(doc, `—  ${it}`, M, y, 10, inkOnLight);
    y += 19;
  }
  y += 8;

  const rows: Array<[string, string, string]> = [
    ["Desenvolvimento do site", "Investimento único", "R$ 499,00"],
    ["Hospedagem", "Inclusa no primeiro ano", "R$ 0,00"],
    ["Mensalidade", "Não existe", "R$ 0,00"],
    ["Publicação e configuração", "Incluso", "R$ 0,00"],
    ["Domínio próprio", "Aproximadamente", "R$ 40,00/ano"],
  ];
  const tblY = y;
  rrect(doc, M, tblY, CW, rows.length * 32 + 16, 12, SURFACE, HAIR);
  rows.forEach((r2, i) => {
    const yy = tblY + 26 + i * 32;
    text(doc, r2[0], M + 20, yy, 10.5, inkOnLight, "bold");
    text(doc, r2[1], M + CW * 0.42, yy, 8.5, MUT);
    text(doc, r2[2], W - M - 20, yy, 11.5, r2[2] === "R$ 499,00" ? brand : inkOnLight, "bold", "right");
    if (i < rows.length - 1) {
      doc.setDrawColor(HAIR.r, HAIR.g, HAIR.b); doc.setLineWidth(0.6);
      doc.line(M + 20, yy + 13, W - M - 20, yy + 13);
    }
  });
  y = tblY + rows.length * 32 + 30;

  rrect(doc, M, y, CW, 52, 10, brandSoft);
  text(doc, "Investimento único de R$ 499,00 — sem mensalidade e sem surpresa.", M + 18, y + 21, 11.5, brand, "bold");
  text(doc, "O site fica em uma URL pública estável: futuras edições são aplicadas no mesmo endereço, sem mudar o link que você divulga.", M + 18, y + 38, 9.5, inkOnLight);

  // selo de confiança (sem contato/botões)
  const sealY = H - 150;
  rrect(doc, M, sealY, CW, 74, 12, NIGHT);
  text(doc, "PROPOSTA PREMIUM", M + 20, sealY + 22, 10, accent, "bold");
  text(doc, `Documento gerado sob medida para ${company}. Identidade, layout e conteúdo refletem exatamente este projeto.`, M + 20, sealY + 40, 9.5, { r: 225, g: 228, b: 233 });
  text(doc, `© ${new Date().getFullYear()} — Proposta comercial de desenvolvimento de site.`, M + 20, sealY + 58, 8, { r: 160, g: 165, b: 173 });
  footer(doc, W, company, 4);

  const buffer = doc.output("arraybuffer");
  return { buffer, fileName: pdfFileName(company) };
}
