// Proposta comercial em PDF (client-side) — apresentação premium com a
// identidade visual do site (cores, tipografia, conceito) e paginação segura.
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

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const num = parseInt(n, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function shade(rgb: Rgb, amt: number): Rgb {
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
  return { r: f(rgb.r), g: f(rgb.g), b: f(rgb.b) };
}
function mix(rgb: Rgb, target: Rgb, t: number): Rgb {
  const f = (a: number, b: number) => Math.round(a + (b - a) * t);
  return { r: f(rgb.r, target.r), g: f(rgb.g, target.g), b: f(rgb.b, target.b) };
}
function rgbaCss(rgb: Rgb, a: number): string {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

export function pdfFileName(name: string): string {
  return `${sanitizeSlug(name, "projeto")}-proposta.pdf`;
}

// Gerencia layout por página com quebra automática segura.
class Flow {
  y: number;
  constructor(public doc: jsPDF, public margin: number, public pageH: number, public bottom: number) { this.y = margin; }
  get space() { return this.bottom - this.y; }
  ensure(h: number) {
    if (this.space < h) {
      this.doc.addPage();
      this.y = this.margin;
      return true;
    }
    return false;
  }
  gap(h: number) { this.y += h; }
  lineH(size: number) { return size * 1.5; }
  text(text: string, size: number, color: Rgb, opts?: { font?: string; align?: "left" | "center" | "right"; width?: number; maxH?: number }) {
    const font = opts?.font === "bold" ? "helvetica" : opts?.font === "italic" ? "helvetica" : "helvetica";
    const style = opts?.font === "bold" ? "bold" : opts?.font === "italic" ? "italic" : "normal";
    this.doc.setFont(font, style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color.r, color.g, color.b);
    const width = opts?.width ?? this.doc.internal.pageSize.getWidth() - this.margin * 2;
    if (opts?.align === "center") this.doc.text(text, this.doc.internal.pageSize.getWidth() / 2, this.y, { align: "center", maxWidth: width });
    else if (opts?.align === "right") this.doc.text(text, this.doc.internal.pageSize.getWidth() - this.margin, this.y, { align: "right", maxWidth: width });
    else this.doc.text(text, this.margin, this.y, { maxWidth: width });
    this.y += this.lineH(size);
  }
  wrap(text: string, size: number, color: Rgb, opts?: { font?: "bold" | "italic" | "normal"; width?: number; gapBefore?: number; gapAfter?: number }) {
    if (opts?.gapBefore) this.gap(opts.gapBefore);
    const width = opts?.width ?? this.doc.internal.pageSize.getWidth() - this.margin * 2;
    this.doc.setFont("helvetica", opts?.font ?? "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(color.r, color.g, color.b);
    const lines = this.doc.splitTextToSize(text, width);
    for (const line of lines as string[]) {
      this.ensure(size * 1.5);
      this.doc.text(line, this.margin, this.y, { maxWidth: width });
      this.y += this.lineH(size);
    }
    if (opts?.gapAfter) this.gap(opts.gapAfter);
  }
}

export async function buildCommercialPdf(spec: PdfInput, heroImage?: { dataUrl: string } | null): Promise<{ buffer: ArrayBuffer; fileName: string }> {
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

  const primaryHex = str(colors.primary) || "#0f766e";
  const secondaryHex = str(colors.secondary) || "#134e4a";
  const accentHex = str(colors.accent) || "#d97706";
  const bgHex = str(colors.background) || "#f8fafc";
  const surfaceHex = str(colors.surface) || "#ffffff";
  const onSurfaceHex = str(colors.on_surface) || "#0f172a";
  const mutedHex = str(colors.muted) || "#64748b";

  const P = hexToRgb(primaryHex);
  const S = hexToRgb(secondaryHex);
  const A = hexToRgb(accentHex);
  const BG = hexToRgb(bgHex);
  const SURF = hexToRgb(surfaceHex);
  const TXT = hexToRgb(onSurfaceHex);
  const MUT = hexToRgb(mutedHex);
  const WHITE = { r: 255, g: 255, b: 255 };

  const hero = obj(content.hero);
  const about = obj(content.about);
  const services = obj(content.services);
  const ctaContent = obj(content.cta);
  const contact = obj(content.contact);
  const servicesItems = arr(services.items).map(obj).filter((i) => str(i.title));
  const title = str(hero.title) || company;
  const subtitle = str(hero.subtitle);
  const visualStyle = str(ds.visual_style);
  const headingFont = str(typo.heading_font);
  const phone = str(contact.phone) || str(contact.whatsapp);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  const CW = W - M * 2;
  const BOTTOM = H - 52;

  const footer = (page: number) => {
    doc.setFontSize(7.5);
    doc.setTextColor(MUT.r, MUT.g, MUT.b);
    doc.text(`${company.toUpperCase()}  ·  PROPOSTA DE SITE`, M, H - 24);
    doc.text(String(page).padStart(2, "0"), W - M, H - 24, { align: "right" });
    doc.setDrawColor(mix(SURF, TXT, 0.06).r, mix(SURF, TXT, 0.06).g, mix(SURF, TXT, 0.06).b);
    doc.setLineWidth(0.6);
    doc.line(M, H - 32, W - M, H - 32);
  };

  const sectionTitle = (flow: Flow, label: string, number: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(A.r, A.g, A.b);
    doc.text(`${number}  ·  ${label.toUpperCase()}`, M, flow.y); flow.y += 14;
    doc.setFillColor(A.r, A.g, A.b);
    doc.rect(M, flow.y, 40, 2.5, "F");
    flow.y += 22;
  };

  /* ================= CAPA ================= */
  doc.setFillColor(S.r, S.g, S.b);
  doc.rect(0, 0, W, H, "F");
  // Glow decorativo discreto (círculos translúcidos)
  doc.setFillColor(mix(S, { r: 255, g: 255, b: 255 }, 0.06).r, mix(S, { r: 255, g: 255, b: 255 }, 0.06).g, mix(S, { r: 255, g: 255, b: 255 }, 0.06).b);
  doc.circle(W - 60, 90, 150, "F");
  doc.setFillColor(mix(S, { r: 255, g: 255, b: 255 }, 0.04).r, mix(S, { r: 255, g: 255, b: 255 }, 0.04).g, mix(S, { r: 255, g: 255, b: 255 }, 0.04).b);
  doc.circle(30, H - 60, 180, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(A.r, A.g, A.b);
  doc.text("PROPOSTA COMERCIAL", M, 120);

  // Nome grande com quebra
  doc.setFont("helvetica", "bold");
  doc.setFontSize(40);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  const nameLines = doc.splitTextToSize(company, CW * 0.9) as string[];
  let ny = 165;
  for (const l of nameLines.slice(0, 4)) {
    doc.text(l, M, ny);
    ny += 46;
  }
  if (segment) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(mix(S, WHITE, 0.62).r, mix(S, WHITE, 0.62).g, mix(S, WHITE, 0.62).b);
    doc.text([location ? `${segment} · ${location}` : segment], M, ny + 4);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(mix(S, WHITE, 0.7).r, mix(S, WHITE, 0.7).g, mix(S, WHITE, 0.7).b);
  doc.text("Identidade digital profissional, estratégia de conteúdo e", M, 640);
  doc.text("experiência sob medida para o seu segmento.", M, 660);

  if (heroImage) {
    try {
      const imgW = 210;
      const ratio = 4 / 3;
      const imgH = imgW / ratio;
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(W - M - imgW - 16, H - 170, imgW + 16, imgH + 16, 10, 10, "F");
      doc.addImage(heroImage.dataUrl, "JPEG", W - M - imgW - 8, H - 162, imgW, imgH);
    } catch { /* imagem opcional */ }
  }
  footer(1);
  doc.addPage();

  /* ================= PÁG 2 — VISÃO + IDENTIDADE ================= */
  const f2 = new Flow(doc, M, H, BOTTOM);
  f2.y = 110;
  sectionTitle(f2, "Visão do projeto", "01");

  f2.text("Objetivo", 13, TXT, { font: "bold" });
  f2.gap(-6);
  f2.wrap(`Apresentar ${company}${segment ? ` (${segment})` : ""} com presença digital profissional que gera contato qualificado, transmite a identidade do negócio e converte visitantes em clientes.`, 11.5, MUT, { gapAfter: 18 });

  if (title || subtitle) {
    f2.text("Conceito central", 13, TXT, { font: "bold" });
    f2.gap(-6);
    f2.wrap(title, 11.5, MUT);
    if (subtitle) f2.wrap(subtitle, 11.5, MUT, { gapAfter: 18 });
    else f2.gap(14);
  }

  f2.text("Identidade visual", 13, TXT, { font: "bold" });
  f2.gap(-6);
  f2.wrap(visualStyle || `Direção visual limpa e sofisticada, construída sob medida para o segmento ${segment || "da empresa"}, com tipografia e cores aplicadas de forma consistente.`, 11.5, MUT, { gapAfter: 20 });

  // Paleta de cores
  f2.ensure(70);
  f2.text("Paleta aplicada ao projeto", 12, TXT, { font: "bold" });
  f2.gap(-2);
  const swatch = [P, S, A, BG, SURF, TXT];
  const names = ["Primary", "Secondary", "Accent", "Background", "Surface", "Texto"];
  const sw = (CW - 60) / 6;
  const swY = f2.y;
  for (let i = 0; i < swatch.length; i++) {
    const x = M + i * (sw + 10);
    doc.setFillColor(swatch[i].r, swatch[i].g, swatch[i].b);
    doc.roundedRect(x, swY, sw, 34, 5, 5, "F");
    doc.setDrawColor(mix(SURF, TXT, 0.12).r, mix(SURF, TXT, 0.12).g, mix(SURF, TXT, 0.12).b);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, swY, sw, 34, 5, 5, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(TXT.r, TXT.g, TXT.b);
    doc.text(names[i].toUpperCase(), x, swY + 48, { maxWidth: sw });
  }
  f2.y = swY + 64;
  if (headingFont) {
    f2.ensure(40);
    f2.text(`Tipografia: ${headingFont}`, 11.5, TXT, { font: "bold" });
    f2.gap(-4);
    f2.wrap("Cabeçalhos com presença tipográfica forte e corpo de texto pensado para leitura confortável e hierarquia clara.", 10.5, MUT, { gapAfter: 6 });
  }
  footer(2);
  doc.addPage();

  /* ================= PÁG 3 — SITE / EXPERIÊNCIA ================= */
  const f3 = new Flow(doc, M, H, BOTTOM);
  f3.y = 110;
  sectionTitle(f3, "Experiência do site", "02");

  // Mockup desktop refinado
  const top = f3.y;
  const mkW = CW;
  const mkTop = 36;
  const mkH = 220;
  doc.setFillColor(mix(SURF, TXT, 0.05).r, mix(SURF, TXT, 0.05).g, mix(SURF, TXT, 0.05).b);
  doc.roundedRect(M - 10, top - 8, mkW + 20, mkH + 40, 14, 14, "F");
  doc.setFillColor(SURF.r, SURF.g, SURF.b);
  doc.roundedRect(M, top, mkW, mkH, 8, 8, "F");
  // header bar
  doc.setFillColor(SURF.r, SURF.g, SURF.b);
  doc.rect(M + 8, top + 8, mkW - 16, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(P.r, P.g, P.b);
  doc.text(company.slice(0, 22), M + 14, top + 25);
  // nav mock
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(MUT.r, MUT.g, MUT.b);
  const navLabels = ["Início", "Serviços", "Sobre", "Contato"];
  let nx = M + mkW - 190;
  for (const l of navLabels) {
    doc.text(l, nx, top + 25);
    nx += doc.getTextWidth(l) + 18;
  }
  doc.setFillColor(A.r, A.g, A.b);
  doc.roundedRect(M + mkW - 70, top + 13, 56, 16, 8, 8, "F");
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.text("Falar agora", M + mkW - 42, top + 24, { align: "center" });

  // body split: left text, right image
  doc.setFillColor(BG.r, BG.g, BG.b);
  doc.rect(M + 8, top + 34, mkW - 16, mkH - 42, "F");
  // texto
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(TXT.r, TXT.g, TXT.b);
  doc.text(doc.splitTextToSize(title, (mkW - 16) * 0.5), M + 20, top + 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUT.r, MUT.g, MUT.b);
  doc.text(doc.splitTextToSize(subtitle || "Experiência digital sob medida.", (mkW - 16) * 0.46), M + 20, top + 130);
  doc.setFillColor(P.r, P.g, P.b);
  doc.roundedRect(M + 20, top + mkH - 78, 100, 22, 11, 11, "F");
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Agendar agora", M + 70, top + mkH - 63, { align: "center" });

  if (heroImage) {
    try {
      doc.addImage(heroImage.dataUrl, "JPEG", M + 8 + (mkW - 16) * 0.54, top + 40, (mkW - 16) * 0.44, mkH - 54);
    } catch { /* mockup sem imagem */ }
  } else {
    doc.setFillColor(mix(SURF, TXT, 0.1).r, mix(SURF, TXT, 0.1).g, mix(SURF, TXT, 0.1).b);
    doc.roundedRect(M + 8 + (mkW - 16) * 0.54, top + 40, (mkW - 16) * 0.44, mkH - 54, 6, 6, "F");
    doc.setTextColor(MUT.r, MUT.g, MUT.b);
    doc.setFontSize(9);
    doc.text("IMAGEM\nDO NEGÓCIO", M + 8 + (mkW - 16) * 0.54 + (mkW - 16) * 0.22, top + 120, { align: "center" });
  }
  f3.y = top + mkH + 40;
  f3.text("Desktop", 9, MUT, { font: "bold" });

  // Destaques (seções do site)
  const sectionsTypes = (Array.isArray(spec.sections) ? spec.sections.map((s) => obj(s).type || "") : []).filter(Boolean);
  const sectionLabel: Record<string, string> = {
    hero: "Hero de impacto", services: "Serviços organizados", about: "História da marca", trust: "Prova e confiança",
    features: "Diferenciais", numbers: "Números", process: "Como funciona", gallery: "Galeria do ambiente",
    testimonials: "Depoimentos", faq: "Dúvidas", cta: "Chamada para ação", contact: "Contato direto",
  };
  const chips = sectionsTypes.length ? sectionsTypes.map((t) => sectionLabel[t] || t) : ["Hero de impacto", "Serviços", "Sobre", "Contato"];
  f3.ensure(120);
  f3.gap(16);
  f3.text("Estrutura pensada para conversão", 12, TXT, { font: "bold" });
  f3.gap(-4);
  const chipW = 150;
  const chipH = 26;
  const perRow = Math.floor((CW + 10) / (chipW + 10));
  for (let i = 0; i < chips.length; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const cx = M + col * (chipW + 10);
    const cy = f3.y + row * (chipH + 8);
    f3.ensure((row + 1) * (chipH + 8));
    doc.setFillColor(SURF.r, SURF.g, SURF.b);
    doc.roundedRect(cx, cy, chipW, chipH, 8, 8, "F");
    doc.setDrawColor(mix(SURF, TXT, 0.14).r, mix(SURF, TXT, 0.14).g, mix(SURF, TXT, 0.14).b);
    doc.setLineWidth(0.5);
    doc.roundedRect(cx, cy, chipW, chipH, 8, 8, "S");
    doc.setFillColor(A.r, A.g, A.b);
    doc.circle(cx + 15, cy + chipH / 2, 2.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(TXT.r, TXT.g, TXT.b);
    doc.text(chips[i], cx + 24, cy + chipH / 2 + 3, { maxWidth: chipW - 30 });
  }
  f3.y += Math.ceil(chips.length / perRow) * (chipH + 8) + 6;
  footer(3);
  doc.addPage();

  /* ================= PÁG 4 — CONTEÚDO / SERVIÇOS ================= */
  const f4 = new Flow(doc, M, H, BOTTOM);
  f4.y = 110;
  sectionTitle(f4, "Conteúdo e diferenciais", "03");

  const blocks: Array<{ t: string; d: string }> = [];
  if (servicesItems.length) {
    for (const it of servicesItems.slice(0, 6)) {
      blocks.push({ t: str(it.title), d: str(it.description) });
    }
  } else {
    blocks.push({ t: "Mensagem central", d: title });
    if (subtitle) blocks.push({ t: "Apoio", d: subtitle });
    blocks.push({ t: "Seção institucional", d: "Sobre o negócio, diferenciais e contexto para gerar confiança." });
  }

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    const cardH = 74;
    f4.ensure(cardH + 10);
    doc.setFillColor(SURF.r, SURF.g, SURF.b);
    doc.roundedRect(M, f4.y, CW, cardH, 10, 10, "F");
    doc.setDrawColor(mix(SURF, TXT, 0.08).r, mix(SURF, TXT, 0.08).g, mix(SURF, TXT, 0.08).b);
    doc.setLineWidth(0.5);
    doc.roundedRect(M, f4.y, CW, cardH, 10, 10, "S");
    doc.setFillColor(A.r, A.g, A.b);
    doc.roundedRect(M, f4.y, 3.5, cardH, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(TXT.r, TXT.g, TXT.b);
    doc.text(str(i + 1).padStart(2, "0"), M + 16, f4.y + 22);
    doc.setFontSize(10.5);
    doc.text(blk.t.slice(0, 60), M + 46, f4.y + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUT.r, MUT.g, MUT.b);
    const descLines = doc.splitTextToSize(blk.d || "Conteúdo editável conforme briefing do cliente.", CW - 62) as string[];
    let dy = f4.y + 40;
    for (const dl of descLines.slice(0, 3)) {
      doc.text(dl, M + 46, dy);
      dy += 13;
    }
    f4.y += cardH + 10;
  }
  footer(4);
  doc.addPage();

  /* ================= PÁG 5 — INVESTIMENTO + ENTREGA ================= */
  const f5 = new Flow(doc, M, H, BOTTOM);
  f5.y = 110;
  sectionTitle(f5, "Escopo e investimento", "04");

  f5.text("O que está incluído", 12, TXT, { font: "bold" });
  f5.gap(-2);
  const deliverables = [
    "Website profissional com identidade visual aplicada",
    "Versão 100% responsiva (desktop, tablet e celular)",
    "Navegação e chamadas para ação (CTAs) pensadas para conversão",
    "Conteúdo estratégico e estrutura otimizada",
    "Imagens ilustrativas integradas ao layout",
    "Publicação online + arquivo completo do projeto",
  ];
  for (const d of deliverables) {
    f5.ensure(20);
    doc.setFillColor(P.r, P.g, P.b);
    doc.circle(M + 5, f5.y - 3, 2.6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(TXT.r, TXT.g, TXT.b);
    doc.text(d, M + 18, f5.y, { maxWidth: CW - 20 });
    f5.y += 17;
  }
  f5.gap(10);

  f5.text("Investimento", 12, TXT, { font: "bold" });
  f5.gap(-2);
  const rows: Array<[string, string, string]> = [
    ["Desenvolvimento do site", "Investimento único", "R$ 499,00"],
    ["Publicação e configuração", "Incluso", "R$ 0,00"],
    ["Hospedagem no primeiro ano", "Incluso", "R$ 0,00"],
    ["Domínio próprio", "Recorrente anual", "R$ 40,00/ano"],
  ];
  const tblTop = f5.y;
  doc.setFillColor(mix(SURF, TXT, 0.03).r, mix(SURF, TXT, 0.03).g, mix(SURF, TXT, 0.03).b);
  doc.roundedRect(M, tblTop, CW, rows.length * 30 + 8, 10, 10, "F");
  rows.forEach((r, i) => {
    const yy = tblTop + 22 + i * 30;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(TXT.r, TXT.g, TXT.b);
    doc.text(r[0], M + 16, yy, { maxWidth: CW * 0.5 });
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(MUT.r, MUT.g, MUT.b);
    doc.text(r[1], M + CW * 0.52, yy, { maxWidth: CW * 0.18 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(TXT.r, TXT.g, TXT.b);
    doc.text(r[2], W - M - 16, yy, { align: "right" });
    if (i < rows.length - 1) {
      doc.setDrawColor(mix(SURF, TXT, 0.08).r, mix(SURF, TXT, 0.08).g, mix(SURF, TXT, 0.08).b);
      doc.setLineWidth(0.5);
      doc.line(M + 16, yy + 12, W - M - 16, yy + 12);
    }
  });
  f5.y = tblTop + rows.length * 30 + 14;
  doc.setFillColor(mix(P, { r: 255, g: 255, b: 255 }, 0.9).r, mix(P, { r: 255, g: 255, b: 255 }, 0.9).g, mix(P, { r: 255, g: 255, b: 255 }, 0.9).b);
  doc.roundedRect(M, f5.y, CW, 28, 8, 8, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(P.r, P.g, P.b);
  doc.text("Sem mensalidade obrigatória. O único custo recorrente é o domínio (R$ 40,00/ano).", W / 2, f5.y + 17, { align: "center" });
  f5.y += 46;
  footer(5);
  doc.addPage();

  /* ================= PÁG 6 — CTA FINAL ================= */
  doc.setFillColor(S.r, S.g, S.b);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(mix(S, WHITE, 0.07).r, mix(S, WHITE, 0.07).g, mix(S, WHITE, 0.07).b);
  doc.circle(W * 0.85, 80, 140, "F");
  doc.setFillColor(mix(S, WHITE, 0.05).r, mix(S, WHITE, 0.05).g, mix(S, WHITE, 0.05).b);
  doc.circle(40, H - 40, 160, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(A.r, A.g, A.b);
  doc.text("PRÓXIMO PASSO", M, 130);

  doc.setFontSize(34);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.text("Vamos começar?", M, 175);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(mix(S, WHITE, 0.72).r, mix(S, WHITE, 0.72).g, mix(S, WHITE, 0.72).b);
  const ctaLines = doc.splitTextToSize(`Aprove esta proposta e dê o próximo passo na presença digital de ${company}. Revisamos cada detalhe para que o site reflita exatamente o seu negócio.`, CW) as string[];
  doc.text(ctaLines, M, 220);

  doc.setFillColor(A.r, A.g, A.b);
  doc.roundedRect(M, 260, 150, 34, 17, 17, "F");
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const buttonText = phone ? "Aprovar por WhatsApp" : "Falar com o time";
  doc.text(buttonText, M + 75, 281, { align: "center" });

  if (phone) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(mix(S, WHITE, 0.7).r, mix(S, WHITE, 0.7).g, mix(S, WHITE, 0.7).b);
    doc.text(phone, M + 168, 282);
  }

  doc.setFontSize(9);
  doc.setTextColor(mix(S, WHITE, 0.5).r, mix(S, WHITE, 0.5).g, mix(S, WHITE, 0.5).b);
  doc.text(`© ${new Date().getFullYear()} ${company} — Proposta elaborada por TiagoProspector`, M, H - 40);
  footer(6);

  const buffer = doc.output("arraybuffer");
  return { buffer, fileName: pdfFileName(company) };
}
