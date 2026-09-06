// Proposta comercial em PDF (client-side) — apresentação premium com a
// identidade visual do site (cores, tipografia, conceito) e paginação segura.
//
// Design (5.30): editorial, profissional e legível em QUALQUER paleta. Texto
// sempre sobre superfícies seguras com contraste garantido (WCAG ~4.5:1);
// páginas escuras usam branco + acento normalizado. Mockups reais do site em
// "notebook" (desktop) e "celular" quando screenshots são fornecidos.
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
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
function obj(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const num = parseInt(n, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function luminance({ r, g, b }: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
export function ensureContrast(fg: Rgb, bg: Rgb, min = 4.2): Rgb {
  if (contrastRatio(fg, bg) >= min) return fg;
  const isLight = luminance(bg) > 0.45;
  return isLight ? { r: 30, g: 34, b: 40 } : { r: 255, g: 255, b: 255 };
}
// Escolhe entre texto escuro e claro o de MAIOR contraste sobre o fundo dado.
export function readableTextFor(bg: Rgb, darkText: Rgb, lightText: Rgb): Rgb {
  return contrastRatio(bg, darkText) >= contrastRatio(bg, lightText) ? darkText : lightText;
}
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return { r: f(a.r, b.r), g: f(a.g, b.g), b: f(a.b, b.b) };
}
function css(rgb: Rgb): string { return `rgb(${rgb.r},${rgb.g},${rgb.b})`; }
function clampHex(hex: string): string {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return "";
  return hex;
}

export function pdfFileName(name: string): string {
  return `${sanitizeSlug(name, "projeto")}-proposta.pdf`;
}

// ---------------------------------------------------------------- paleta base
const WHITE = { r: 255, g: 255, b: 255 };
const PAPER = { r: 255, g: 255, b: 255 };
const SURFACE = { r: 246, g: 247, b: 249 };
const HAIR = { r: 226, g: 229, b: 234 };
const INK = { r: 24, g: 27, b: 32 };       // texto principal
const MUT = { r: 94, g: 102, b: 112 };     // texto secundário
const NIGHT = { r: 10, g: 13, b: 17 };     // fundo escuro
const NIGHT_2 = { r: 17, g: 21, b: 27 };

// Fundo/acento derivados do projeto, NORMALIZADOS para nunca ficarem ilegíveis.
interface Theme {
  brand: Rgb;       // primária forte (sobre branco, >=4.5)
  brandSoft: Rgb;   // tom brando p/ blocos
  accent: Rgb;      // acento claro (sobre fundo escuro, >=3)
  inkOnLight: Rgb;
  mutedOnLight: Rgb;
  swatches: Array<{ hex: string; name: string }>;
}

function buildTheme(hexs: Record<string, string>): Theme {
  const primary = clampHex(str(hexs.primary)) || "#1f6f62";
  const secondary = clampHex(str(hexs.secondary)) || "#0f3440";
  const accent = clampHex(str(hexs.accent)) || "#e8862e";
  const bg = clampHex(str(hexs.background)) || "#f4f6f5";
  const surface = clampHex(str(hexs.surface)) || "#ffffff";
  const onSurface = clampHex(str(hexs.on_surface)) || "#111827";

  const brand = ensureContrast(hexToRgb(primary), PAPER, 4.5);
  const brandSoft = mix(hexToRgb(primary), PAPER, 0.9);
  const accentRaw = hexToRgb(accent);
  const accentDark = ensureContrast(accentRaw, NIGHT, 3);
  const inkOnLight = ensureContrast(hexToRgb(onSurface), PAPER, 6);
  const swatches: Array<{ hex: string; name: string }> = [
    { hex: primary, name: "Primária" },
    { hex: secondary, name: "Secundária" },
    { hex: accent, name: "Acento" },
    { hex: bg, name: "Fundo" },
    { hex: surface, name: "Superfície" },
    { hex: onSurface, name: "Texto" },
  ];
  return { brand, brandSoft, accent: accentDark, inkOnLight, mutedOnLight: MUT, swatches };
}

// ---------------------------------------------------------------- helpers layout
function wrapLines(doc: jsPDF, text: string, maxW: number): string[] {
  return doc.splitTextToSize(text, maxW) as string[];
}

function rrect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill?: Rgb, stroke?: Rgb) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (fill) { doc.setFillColor(fill.r, fill.g, fill.b); doc.roundedRect(x, y, w, h, rr, rr, "F"); }
  if (stroke) { doc.setDrawColor(stroke.r, stroke.g, stroke.b); doc.setLineWidth(0.6); doc.roundedRect(x, y, w, h, rr, rr, "S"); }
}

function text(doc: jsPDF, t: string, x: number, y: number, size: number, color: Rgb, style: "normal" | "bold" | "italic" = "normal", align: "left" | "center" | "right" = "left") {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color.r, color.g, color.b);
  doc.text(t, x, y, { align });
}

class Page {
  doc: jsPDF;
  W: number; H: number; M = 54;
  y = 0;
  footerFn: (page: number) => void;
  pageNo = 1;
  constructor(doc: jsPDF) {
    this.doc = doc;
    this.W = doc.internal.pageSize.getWidth();
    this.H = doc.internal.pageSize.getHeight();
    this.y = this.M;
    this.footerFn = () => {};
  }
  get contentW() { return this.W - this.M * 2; }
  get bottom() { return this.H - 46; }
  ensure(h: number) {
    if (this.y + h > this.bottom) {
      this.doc.addPage();
      this.pageNo += 1;
      this.y = 44;
      this.drawFooter();
    }
  }
  gap(h: number) { this.y += h; }
  header(label: string, num: string, theme: Theme, subtitle?: string) {
    const d = this.doc;
    this.ensure(64);
    d.setFillColor(theme.brand.r, theme.brand.g, theme.brand.b);
    d.rect(this.M, this.y, 22, 3, "F");
    this.y += 12;
    text(d, `${num}  ·  ${label.toUpperCase()}`, this.M, this.y, 9.5, theme.brand, "bold");
    this.y += 14;
    if (subtitle) {
      text(d, subtitle, this.M, this.y, 11.5, MUT);
      this.y += 20;
    } else {
      this.y += 12;
    }
  }
  drawFooter() {
    const d = this.doc;
    d.setDrawColor(HAIR.r, HAIR.g, HAIR.b);
    d.setLineWidth(0.6);
    d.line(this.M, this.H - 32, this.W - this.M, this.H - 32);
    text(d, "PROPOSTA DE SITE", this.M, this.H - 19, 7, MUT, "normal");
    text(d, String(this.pageNo).padStart(2, "0"), this.W - this.M, this.H - 19, 7, MUT, "normal", "right");
  }
}

// ---------------------------------------------------------------- mockups reais
function imgAspect(doc: jsPDF, dataUrl: string): number {
  try {
    const p = doc.getImageProperties(dataUrl);
    if (p && p.width > 0 && p.height > 0) return p.width / p.height;
  } catch { /* ignore */ }
  return 16 / 10;
}

// Mockup "notebook": card + barra de navegador + screenshot/hero real.
function drawDesktopMock(doc: jsPDF, x: number, y: number, w: number, img?: string | null, theme?: Theme) {
  const th = theme ?? buildTheme({});
  // sombra suave
  doc.setFillColor(225, 228, 233);
  doc.roundedRect(x + 3, y + 4, w, 190, 12, 12, "F");
  const chrome = 30;
  rrect(doc, x, y, w, chrome, 0, th.inkOnLight, undefined);
  // bolinhas
  doc.setFillColor(255, 95, 87); doc.circle(x + 16, y + chrome / 2, 3.2, "F");
  doc.setFillColor(254, 188, 46); doc.circle(x + 26, y + chrome / 2, 3.2, "F");
  doc.setFillColor(40, 200, 64); doc.circle(x + 36, y + chrome / 2, 3.2, "F");
  // url pill
  rrect(doc, x + 52, y + 8, w - 60, 14, 7, NIGHT_2);
  text(doc, "seu-site.com.br", x + 60, y + 18, 6.5, { r: 200, g: 205, b: 212 });
  const bodyY = y + chrome;
  const bodyH = 160;
  rrect(doc, x, bodyY, w, bodyH, 0, SURFACE);
  if (img) {
    try {
      const fmt = img.startsWith("data:image/png") ? "PNG" : "JPEG";
      const ar = imgAspect(doc, img);
      let iw = w - 24;
      let ih = iw / ar;
      const maxH = bodyH - 16;
      if (ih > maxH) { ih = maxH; iw = ih * ar; }
      const ix = x + (w - iw) / 2;
      const iy = bodyY + (bodyH - ih) / 2;
      rrect(doc, x + 12, bodyY + 8, w - 24, bodyH - 16, 4, { r: 30, g: 34, b: 40 });
      doc.addImage(img, fmt, ix, iy, iw, ih);
    } catch { /* desenha placeholder elegante */ }
  } else {
    text(doc, "Site com identidade premium", x + w / 2, bodyY + bodyH / 2 - 6, 9, MUT, "normal", "center");
    text(doc, "(captura disponível após a publicação)", x + w / 2, bodyY + bodyH / 2 + 10, 7, MUT, "normal", "center");
  }
}

// Mockup de celular: corpo + tela com screenshot (ou imagem do hero).
function drawPhoneMock(doc: jsPDF, x: number, y: number, w: number, img?: string | null, theme?: Theme) {
  const th = theme ?? buildTheme({});
  const h = w * 2.05;
  const bezel = w * 0.055;
  // corpo
  doc.setFillColor(235, 237, 240);
  doc.roundedRect(x + 2, y + 3, w, h, w * 0.16, w * 0.16, "F");
  rrect(doc, x, y, w, h, w * 0.14, th.inkOnLight);
  // notch
  doc.setFillColor(th.inkOnLight.r, th.inkOnLight.g, th.inkOnLight.b);
  doc.roundedRect(x + w * 0.3, y + 7, w * 0.4, 6, 3, 3, "F");
  const sw = w - bezel * 2;
  const sh = h - bezel * 2;
  rrect(doc, x + bezel, y + bezel, sw, sh, w * 0.05, NIGHT_2);
  if (img) {
    try {
      const fmt = img.startsWith("data:image/png") ? "PNG" : "JPEG";
      const ar = imgAspect(doc, img);
      const tgtH = sh - 10;
      let tw = tgtH * ar;
      if (tw > sw - 10) { tw = sw - 10; }
      const tgt = tw / ar;
      doc.addImage(img, fmt, x + bezel + (sw - tw) / 2, y + bezel + (sh - tgt) / 2, tw, tgt);
    } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------- capa decorativa
function coverDeco(doc: jsPDF, page: Page, theme: Theme) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, page.W, page.H, "F");
  // faixa superior discreta
  doc.setFillColor(theme.brandSoft.r, theme.brandSoft.g, theme.brandSoft.b);
  doc.rect(0, 0, page.W, 6, "F");
  // círculos brandos ao fundo
  doc.setFillColor(theme.brandSoft.r, theme.brandSoft.g, theme.brandSoft.b);
  doc.circle(page.W - 70, 70, 150, "F");
  doc.setFillColor(mix(theme.brandSoft, WHITE, 0.5).r, mix(theme.brandSoft, WHITE, 0.5).g, mix(theme.brandSoft, WHITE, 0.5).b);
  doc.circle(40, page.H - 40, 180, "F");
}

export async function buildCommercialPdf(spec: PdfInput, heroImage?: { dataUrl: string } | null, screenshots?: string[]): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const b = obj(spec.business);
  const ds = obj(spec.design_system);
  const colors = obj(ds.colors) as Record<string, string>;
  const content = obj(spec.content);
  const typo = obj(ds.typography);
  const company = str(b.name) || "Empresa";
  const segment = str(b.segment);
  const city = str(b.city);
  const state = str(b.state);
  const location = [city, state].filter(Boolean).join("/");
  const theme = buildTheme(colors);

  const hero = obj(content.hero);
  const services = obj(content.services);
  const contact = obj(content.contact);
  const servicesItems = arr(services.items).map(obj).filter((i) => str(i.title));
  const title = str(hero.title) || company;
  const subtitle = str(hero.subtitle);
  const visualStyle = str(ds.visual_style);
  const headingFont = str(typo.heading_font);
  const phone = str(contact.phone) || str(contact.whatsapp);
  const wa = str(contact.whatsapp);
  const desktopShot = Array.isArray(screenshots) ? screenshots[0] ?? null : heroImage?.dataUrl ?? null;
  const mobileShot = Array.isArray(screenshots) ? screenshots[1] ?? null : null;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pg = new Page(doc);
  const W = pg.W, M = pg.M, CW = pg.contentW;

  /* ============================================================ CAPA */
  coverDeco(doc, pg, theme);
  text(doc, "PROPOSTA COMERCIAL", M, 90, 10.5, theme.brand, "bold");
  doc.setFillColor(theme.brand.r, theme.brand.g, theme.brand.b);
  doc.rect(M, 100, 34, 2.4, "F");

  // Nome do negócio em destaque
  text(doc, company, M, 176, 40, theme.inkOnLight, "bold");
  if (segment) {
    text(doc, `${segment}${location ? `  ·  ${location}` : ""}`, M, 198, 13, MUT);
  }
  // linha editorial de apoio
  doc.setFillColor(HAIR.r, HAIR.g, HAIR.b);
  doc.rect(M, 236, CW, 0.8, "F");
  const conceptLine = subtitle || `Presença digital profissional e sob medida para ${company}.`;
  const conceptLines = wrapLines(doc, conceptLine, CW * 0.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12.5);
  doc.setTextColor(MUT.r, MUT.g, MUT.b);
  conceptLines.slice(0, 3).forEach((l, i) => doc.text(l, M, 266 + i * 19));

  // Selo do projeto
  rrect(doc, M, 330, 200, 32, 16, theme.brandSoft);
  text(doc, "SITE PROFISSIONAL — FEITO SOB MEDIDA", M + 16, 350, 9, theme.brand, "bold");
  text(doc, "Criado a partir da identidade e dos dados reais do seu negócio", M + 16, 360, 6.5, theme.mutedOnLight);

  // Barra de conteúdo da capa (sem comprometer legibilidade)
  pg.y = 500;
  // Assinatura
  text(doc, "Elaborado por TiagoProspector", M, pg.H - 90, 8, MUT);
  doc.setFillColor(theme.brand.r, theme.brand.g, theme.brand.b);
  doc.rect(M, pg.H - 84, 26, 2.2, "F");
  pg.drawFooter();

  /* ============================================================ PÁG 2 — VISÃO */
  pg.doc.addPage(); pg.pageNo = 2; pg.y = 44; pg.drawFooter();
  pg.header("Visão do projeto", "01", theme);

  pg.ensure(40);
  text(doc, "Objetivo", M, pg.y, 12, theme.inkOnLight, "bold"); pg.gap(2);
  const objLines = wrapLines(doc, `Apresentar ${company}${segment ? ` (${segment})` : ""} com presença digital profissional: transmitir a identidade do negócio, gerar contato qualificado e converter visitantes em clientes.`, CW);
  for (const l of objLines) { pg.ensure(16); text(doc, l, M, pg.y, 10.5, MUT); pg.gap(15); }
  pg.gap(10);

  if (title && title !== company) {
    pg.ensure(40);
    text(doc, "Conceito central", M, pg.y, 12, theme.inkOnLight, "bold"); pg.gap(2);
    const cl = wrapLines(doc, title, CW);
    for (const l of cl) { pg.ensure(15); text(doc, l, M, pg.y, 10.5, MUT); pg.gap(15); }
    pg.gap(8);
  }

  pg.ensure(40);
  text(doc, "Identidade visual", M, pg.y, 12, theme.inkOnLight, "bold"); pg.gap(2);
  const vs = visualStyle || `Direção visual limpa e sofisticada, construída para o segmento ${segment || "da empresa"}, com cores e tipografia aplicadas de forma consistente.`;
  const vsl = wrapLines(doc, vs, CW);
  for (const l of vsl) { pg.ensure(15); text(doc, l, M, pg.y, 10.5, MUT); pg.gap(15); }

  // Paleta com hex
  pg.gap(16);
  pg.ensure(120);
  text(doc, "Paleta aplicada ao projeto", M, pg.y, 12, theme.inkOnLight, "bold"); pg.gap(8);
  const chipW = (CW - 5 * 12) / 6;
  const chipY = pg.y;
  for (let i = 0; i < theme.swatches.length; i++) {
    const s = theme.swatches[i];
    const c = clampHex(s.hex) ? hexToRgb(s.hex) : { r: 200, g: 200, b: 200 };
    const cx = M + i * (chipW + 12);
    rrect(doc, cx, chipY, chipW, 44, 6, c);
    doc.setDrawColor(HAIR.r, HAIR.g, HAIR.b); doc.setLineWidth(0.5);
    doc.roundedRect(cx, chipY, chipW, 44, 6, 6, "S");
    text(doc, s.name, cx, chipY + 58, 7, MUT, "bold");
    text(doc, (s.hex || "").toUpperCase(), cx, chipY + 68, 6.5, MUT);
  }
  pg.y = chipY + 78;
  if (headingFont) {
    pg.ensure(50);
    text(doc, `Tipografia: ${headingFont}`, M, pg.y, 11.5, theme.inkOnLight, "bold"); pg.gap(2);
    text(doc, "Cabeçalhos com presença tipográfica e corpo de texto confortável, com hierarquia clara.", M, pg.y, 10, MUT); pg.gap(16);
  }

  /* ============================================================ PÁG 3 — EXPERIÊNCIA / MOCKUPS */
  pg.doc.addPage(); pg.pageNo = 3; pg.y = 44; pg.drawFooter();
  pg.header("Experiência do site", "02", theme, "Capturas reais do projeto criado para você.");

  // Desktop / notebook (ocupa ~70% da largura)
  const deskW = CW * 0.62;
  const deskY = pg.y + 4;
  drawDesktopMock(doc, M, deskY, deskW, desktopShot, theme);
  text(doc, "Desktop — versão completa", M, deskY + 196, 7.5, MUT);

  // Celular ao lado
  const phoneTop = pg.y;
  const phoneW = Math.min(132, CW - deskW - 40);
  drawPhoneMock(doc, M + deskW + 34, phoneTop, phoneW, mobileShot, theme);
  text(doc, "Mobile — otimizado", M + deskW + 34, phoneTop + phoneW * 2.05 + 6, 7.5, MUT);

  pg.y = Math.max(deskY + 232, phoneTop + phoneW * 2.05 + 20);
  pg.ensure(40);
  text(doc, "O que você está recebendo", M, pg.y, 12, theme.inkOnLight, "bold"); pg.gap(6);
  const selling = [
    "Design sob medida, com a identidade visual do seu negócio",
    "Layout 100% responsivo — celular, tablet e computador",
    "Navegação clara e chamadas para ação em pontos estratégicos",
    "Conteúdo real e bem estruturado, pronto para publicar",
  ];
  for (const s of selling) {
    pg.ensure(20);
    doc.setFillColor(theme.brand.r, theme.brand.g, theme.brand.b);
    doc.circle(M + 4, pg.y - 3.5, 2.6, "F");
    text(doc, s, M + 16, pg.y, 10.5, theme.inkOnLight);
    pg.gap(20);
  }

  /* ============================================================ PÁG 4 — CONTEÚDO E DIFERENCIAIS */
  pg.doc.addPage(); pg.pageNo = 4; pg.y = 44; pg.drawFooter();
  pg.header("Conteúdo e diferenciais", "03", theme);

  const blocks: Array<{ t: string; d: string }> = servicesItems.length
    ? servicesItems.slice(0, 6).map((it) => ({ t: str(it.title), d: str(it.description) }))
    : [
        { t: title, d: subtitle || "Mensagem central apresentada logo na primeira dobra." },
        { t: "Estrutura orientada a conversão", d: "Seções organizadas para guiar o visitante até o contato." },
      ];

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    const cardH = 72;
    pg.ensure(cardH + 12);
    rrect(doc, M, pg.y, CW, cardH, 10, SURFACE);
    doc.setDrawColor(HAIR.r, HAIR.g, HAIR.b); doc.setLineWidth(0.6);
    doc.roundedRect(M, pg.y, CW, cardH, 10, 10, "S");
    doc.setFillColor(theme.brand.r, theme.brand.g, theme.brand.b);
    doc.roundedRect(M, pg.y + 14, 3, cardH - 28, 1.5, 1.5, "F");
    text(doc, String(i + 1).padStart(2, "0"), M + 18, pg.y + 26, 9, theme.brand, "bold");
    text(doc, blk.t.slice(0, 70), M + 52, pg.y + 26, 11, theme.inkOnLight, "bold");
    const dLines = wrapLines(doc, blk.d || "", CW - 68).slice(0, 2);
    let dy = pg.y + 42;
    for (const dl of dLines) { text(doc, dl, M + 52, dy, 9.5, MUT); dy += 13; }
    pg.y += cardH + 12;
  }

  /* ============================================================ PÁG 5 — ESCOPO E INVESTIMENTO */
  pg.doc.addPage(); pg.pageNo = 5; pg.y = 44; pg.drawFooter();
  pg.header("Escopo, publicação e investimento", "04", theme);

  pg.ensure(30);
  text(doc, "Publicação e acesso", M, pg.y, 12, theme.inkOnLight, "bold"); pg.gap(6);
  const pub = [
    "Seu site publicado com endereço (URL) público e estável",
    "Edições futuras aplicadas no mesmo endereço — o link que você divulga não muda",
    "Hospedagem e domínio configurados por nossa equipe",
  ];
  for (const p of pub) {
    pg.ensure(18);
    doc.setFillColor(theme.accent.r, theme.accent.g, theme.accent.b);
    doc.circle(M + 4, pg.y - 3.5, 2.6, "F");
    text(doc, p, M + 16, pg.y, 10, theme.inkOnLight);
    pg.gap(18);
  }

  pg.gap(10);
  pg.ensure(40);
  text(doc, "O que está incluído", M, pg.y, 12, theme.inkOnLight, "bold"); pg.gap(6);
  const deliverables = [
    "Website profissional com identidade visual aplicada",
    "Versão 100% responsiva (desktop, tablet e celular)",
    "Navegação e CTAs pensadas para conversão",
    "Conteúdo estratégico, real e sem invenções",
    "Imagens ilustrativas integradas ao layout",
    "Publicação online + arquivo completo do projeto",
  ];
  for (const d of deliverables) {
    pg.ensure(19);
    text(doc, `—  ${d}`, M + 4, pg.y, 10, theme.inkOnLight);
    pg.gap(19);
  }

  // Tabela de investimento
  pg.gap(8);
  pg.ensure(150);
  const rows: Array<[string, string, string]> = [
    ["Desenvolvimento do site", "Investimento único", "R$ 499,00"],
    ["Hospedagem", "Primeiro ano incluso", "R$ 0,00"],
    ["Mensalidade", "Sem mensalidade", "R$ 0,00"],
    ["Publicação e configuração", "Incluso", "R$ 0,00"],
    ["Domínio próprio", "Aproximadamente", "R$ 40,00/ano"],
  ];
  const tblTop = pg.y;
  rrect(doc, M, tblTop, CW, rows.length * 30 + 12, 12, SURFACE);
  doc.setDrawColor(HAIR.r, HAIR.g, HAIR.b); doc.setLineWidth(0.8);
  doc.roundedRect(M, tblTop, CW, rows.length * 30 + 12, 12, 12, "S");
  rows.forEach((r, i) => {
    const yy = tblTop + 26 + i * 30;
    text(doc, r[0], M + 20, yy, 10.5, theme.inkOnLight, "bold");
    text(doc, r[1], M + 20 + CW * 0.34, yy, 8.5, MUT);
    text(doc, r[2], W - M - 20, yy, 11.5, r[2] === "R$ 499,00" ? theme.brand : theme.inkOnLight, "bold", "right");
    if (i < rows.length - 1) {
      doc.setDrawColor(HAIR.r, HAIR.g, HAIR.b); doc.setLineWidth(0.6);
      doc.line(M + 20, yy + 12, W - M - 20, yy + 12);
    }
  });
  pg.y = tblTop + rows.length * 30 + 22;
  pg.ensure(60);
  // Callout do investimento
  rrect(doc, M, pg.y, CW, 46, 10, theme.brandSoft);
  text(doc, "Investimento único de R$ 499,00 — sem mensalidade e sem surpresa.", M + 18, pg.y + 20, 11.5, theme.brand, "bold");
  text(doc, "O único custo recorrente é o domínio (aproximadamente R$ 40,00/ano).", M + 18, pg.y + 35, 9.5, theme.inkOnLight);

  /* ============================================================ PÁG 6 — CTA FINAL */
  pg.doc.addPage(); pg.pageNo = 6; pg.y = 44;
  doc.setFillColor(NIGHT.r, NIGHT.g, NIGHT.b);
  doc.rect(0, 0, W, pg.H, "F");
  doc.setFillColor(mix(NIGHT, theme.accent, 0.12).r, mix(NIGHT, theme.accent, 0.12).g, mix(NIGHT, theme.accent, 0.12).b);
  doc.circle(W - 70, 60, 160, "F");
  doc.setFillColor(mix(NIGHT, WHITE, 0.04).r, mix(NIGHT, WHITE, 0.04).g, mix(NIGHT, WHITE, 0.04).b);
  doc.circle(30, pg.H - 30, 150, "F");

  text(doc, "PRÓXIMO PASSO", M, 120, 10, theme.accent, "bold");
  text(doc, "Vamos colocar seu negócio", M, 168, 30, WHITE, "bold");
  text(doc, "no mapa digital?", M, 200, 30, WHITE, "bold");

  const ctaLines = wrapLines(doc, `Aprove esta proposta e dê o próximo passo na presença digital de ${company}. Cada detalhe foi pensado para o seu negócio — e futuras edições continuam no mesmo endereço público.`, CW);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(228, 232, 236);
  ctaLines.slice(0, 4).forEach((l, i) => doc.text(l, M, 258 + i * 19));

  // Botão de contato
  rrect(doc, M, 340, 220, 40, 20, theme.accent);
  const btnText = luminance(theme.accent) > 0.5 ? NIGHT : WHITE;
  text(doc, wa || phone ? "Aprovar pelo WhatsApp" : "Falar com o time", M + 110, 365, 11.5, btnText, "bold", "center");
  if (wa || phone) {
    text(doc, `${wa || phone}`, M + 248, 365, 11, mix(WHITE, NIGHT, 0.25));
  }
  text(doc, `© ${new Date().getFullYear()} ${company} — Proposta elaborada por TiagoProspector`, M, pg.H - 46, 8, { r: 150, g: 158, b: 168 });

  pg.drawFooter();

  const buffer = doc.output("arraybuffer");
  return { buffer, fileName: pdfFileName(company) };
}
