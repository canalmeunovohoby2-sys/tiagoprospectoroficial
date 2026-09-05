// Proposta comercial em PDF (client-side) usando a identidade do site.
import { jsPDF } from "jspdf";
import { sanitizeSlug } from "./siteExportCore";

interface PdfInput {
  business?: Record<string, unknown>;
  design_system?: Record<string, unknown>;
  content?: Record<string, unknown>;
  sections?: Array<{ type?: string }>;
  [key: string]: unknown;
}

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const num = parseInt(n, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function pdfFileName(name: string): string {
  return `${sanitizeSlug(name, "projeto")}-proposta.pdf`;
}

export async function buildCommercialPdf(spec: PdfInput, heroImage?: { dataUrl: string } | null): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const b = spec.business ?? {};
  const ds = (spec.design_system ?? {}) as Record<string, unknown>;
  const colors = (ds.colors && typeof ds.colors === "object" ? ds.colors : {}) as Record<string, string>;
  const content = spec.content ?? {};
  const company = str(b.name) || "Empresa";
  const segment = str(b.segment);
  const prim = colors.primary ?? "#0f766e";
  const sec = colors.secondary ?? "#134e4a";
  const accent = colors.accent ?? "#b45309";
  const bgLight = colors.background ?? "#f8fafc";
  const pr = hexToRgb(prim);
  const sc = hexToRgb(sec);
  const ac = hexToRgb(accent);
  const bg = hexToRgb(bgLight);
  const text = hexToRgb(colors.on_surface ?? "#0f172a");
  const hero = (content.hero && typeof content.hero === "object" ? content.hero : {}) as Record<string, unknown>;
  const about = (content.about && typeof content.about === "object" ? content.about : {}) as Record<string, unknown>;
  const services = (content.services && typeof content.services === "object" ? content.services : {}) as Record<string, unknown>;
  const sectionTypes = Array.isArray(spec.sections) ? spec.sections.map((s) => s.type ?? "") : [];

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); // 595
  const H = doc.internal.pageSize.getHeight(); // 842
  const M = 52;
  const CW = W - M * 2;

  const note = () => doc.setTextColor(150);
  const resetText = () => doc.setTextColor(text[0], text[1], text[2]);
  const footer = (page: number) => {
    doc.setFontSize(8);
    note();
    doc.text(`${company} Â· TiagoProspector`, M, H - 30);
    doc.text(`PÃ¡gina ${page}`, W - M, H - 30, { align: "right" });
  };

  // CAPA
  doc.setFillColor(sc[0], sc[1], sc[2]);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M, H - 160, 8, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text("PROPOSTA DE PRESENÃ‡A DIGITAL", M, 150);
  doc.setFontSize(44);
  doc.setFont("helvetica", "bold");
  const lines = doc.splitTextToSize(company, CW);
  doc.text(lines.slice(0, 4), M, 230);
  if (segment) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 210, 210);
    doc.text(segment, M, 280);
  }
  doc.setFontSize(11);
  doc.setTextColor(210, 220, 220);
  doc.text(["Projeto profissional de website com identidade prÃ³pria,", "conteÃºdo estratÃ©gico e experiÃªncia responsiva."], M, 620);
  if (heroImage) {
    try {
      const ratio = 4 / 3;
      const iw = CW * 0.46;
      const ih = iw / ratio;
      doc.addImage(heroImage.dataUrl, "JPEG", W - M - iw, 330, iw, ih);
    } catch { /* imagem opcional */ }
  }
  footer(1);
  doc.addPage();

  // VISÃƒO DO PROJETO
  resetText();
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(pr[0], pr[1], pr[2]);
  doc.text("VisÃ£o do projeto", M, 90);
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M, 108, 64, 3, "F");
  doc.setTextColor(text[0], text[1], text[2]);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  let y = 170;
  const title = str(hero.title) || company;
  const sub = str(hero.subtitle);
  const style = str((ds.visual_style as string) ?? "");
  const heading = str((ds.typography as Record<string, unknown>)?.heading_font ?? "");
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Objetivo`, M, y); y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(doc.splitTextToSize(`Apresentar ${company}${segment ? ` (${segment})` : ""} com uma presenÃ§a digital profissional, gerando contato qualificado e transmitindo a identidade do negÃ³cio.`, CW), M, y); y += 60;
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("Proposta visual", M, y); y += 22;
  doc.setFont("helvetica", "normal"); doc.setFontSize(12);
  const visualText = style ? style : `DireÃ§Ã£o visual limpa e profissional, construÃ­da sob medida para o segmento ${segment || "da empresa"}.`;
  const vt = doc.splitTextToSize(visualText, CW);
  doc.text(vt, M, y); y += vt.length * 18 + 26;
  if (heading) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("Tipografia e identidade", M, y); y += 22;
    doc.setFont("helvetica", "normal"); doc.setFontSize(12);
    doc.text(doc.splitTextToSize(`Tipografia de tÃ­tulos: ${heading}. Cores, espaÃ§amentos e componentes aplicados de forma consistente no site.`, CW), M, y); y += 60;
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text("ConteÃºdo principal", M, y); y += 24;
  doc.setFont("helvetica", "normal"); doc.setFontSize(12);
  const bullets = [
    title ? `Mensagem principal: ${title}` : null,
    sub ? `Apoio: ${sub}` : null,
    str(about.body) ? "SeÃ§Ã£o institucional com texto sobre o negÃ³cio." : null,
    "Estrutura pensada para conversÃ£o (CTAs e contato em destaque).",
    "Layout responsivo (desktop e celular).",
  ].filter(Boolean) as string[];
  doc.text(bullets.map((x) => `â€¢  ${x}`), M, y);
  footer(2);
  doc.addPage();

  // EXPERIÃŠNCIA DO SITE (composiÃ§Ã£o)
  resetText();
  doc.setFontSize(26); doc.setFont("helvetica", "bold");
  doc.setTextColor(pr[0], pr[1], pr[2]);
  doc.text("ExperiÃªncia do site", M, 90);
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M, 108, 64, 3, "F");
  doc.setTextColor(text[0], text[1], text[2]);
  // mockup desktop
  const top = 160;
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(M, top, CW, 300, 10, 10, "F");
  doc.setFillColor(pr[0], pr[1], pr[2]);
  doc.rect(M, top, CW, 46, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(13);
  doc.text(company.slice(0, 24), M + 24, top + 30);
  doc.setFillColor(sc[0], sc[1], sc[2]);
  doc.rect(M, top + 46, CW * 0.55, 150, "F");
  doc.setFillColor(180, 180, 180);
  doc.rect(M + 24, top + 90, 260, 12, "F");
  doc.rect(M + 24, top + 116, 200, 12, "F");
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M + 24, top + 150, 140, 26, "F");
  if (heroImage) {
    try { doc.addImage(heroImage.dataUrl, "JPEG", M + CW * 0.58, top + 54, CW * 0.38, 138); } catch { /* sem imagem */ }
  }
  doc.setTextColor(255, 255, 255); doc.setFontSize(12);
  doc.text("Desktop", M + CW * 0.58, top + 290);
  // mockup mobile
  const mx = W - M - 170;
  doc.setFillColor(30, 30, 34);
  doc.roundedRect(mx, 500, 170, 300, 20, 20, "F");
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(mx + 8, 508, 154, 284, 14, 14, "F");
  doc.setFillColor(pr[0], pr[1], pr[2]);
  doc.rect(mx + 8, 508, 154, 30, "F");
  doc.setFillColor(sc[0], sc[1], sc[2]);
  doc.rect(mx + 14, 560, 142, 90, "F");
  doc.setFillColor(180, 180, 180);
  doc.rect(mx + 20, 590, 90, 8, "F");
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(mx + 20, 612, 70, 18, "F");
  doc.setTextColor(0, 0, 0);
  doc.text("Mobile", mx + 70, 830, { align: "center" });
  footer(3);
  doc.addPage();

  // O QUE SERÃ ENTREGUE
  resetText();
  doc.setFontSize(26); doc.setFont("helvetica", "bold");
  doc.setTextColor(pr[0], pr[1], pr[2]);
  doc.text("O que serÃ¡ entregue", M, 90);
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M, 108, 64, 3, "F");
  doc.setTextColor(text[0], text[1], text[2]);
  doc.setFontSize(12);
  const deliverables = [
    "Website profissional com identidade visual aplicada",
    "VersÃ£o 100% responsiva (desktop, tablet e celular)",
    "NavegaÃ§Ã£o e chamadas para aÃ§Ã£o (CTAs) pensadas para conversÃ£o",
    "Estrutura otimizada e de carregamento rÃ¡pido",
    "Imagens ilustrativas integradas ao layout",
    "Arquivo completo do projeto (para alteraÃ§Ãµes futuras)",
  ];
  doc.text(deliverables.map((x) => `â€¢  ${x}`), M, 170);
  footer(4);
  doc.addPage();

  // INVESTIMENTO
  resetText();
  doc.setFontSize(26); doc.setFont("helvetica", "bold");
  doc.setTextColor(pr[0], pr[1], pr[2]);
  doc.text("Investimento", M, 100);
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M, 118, 64, 3, "F");
  doc.setTextColor(text[0], text[1], text[2]);
  doc.setFontSize(12);
  const rows: Array<[string, string]> = [
    ["Desenvolvimento do site", "R$ 499,00"],
    ["Hospedagem", "R$ 0,00"],
    ["Mensalidade", "R$ 0,00"],
    ["DomÃ­nio", "R$ 40,00/ano"],
  ];
  let y2 = 180;
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(M, y2, CW, rows.length * 40 + 20, 12, 12, "F");
  rows.forEach((r, i) => {
    const yy = y2 + 24 + i * 40;
    doc.setFont("helvetica", "normal");
    doc.text(r[0], M + 28, yy);
    doc.setFont("helvetica", "bold");
    doc.text(r[1], W - M - 28, yy, { align: "right" });
    if (i < rows.length - 1) { doc.setDrawColor(225); doc.line(M + 28, yy + 12, W - M - 28, yy + 12); }
  });
  y2 += rows.length * 40 + 60;
  doc.setFont("helvetica", "italic");
  doc.setTextColor(110);
  doc.text(doc.splitTextToSize("NÃ£o hÃ¡ mensalidade de hospedagem. O Ãºnico custo recorrente previsto Ã© o domÃ­nio, no valor de R$ 40,00 por ano.", CW), M, y2);
  footer(5);
  doc.addPage();

  // PUBLICAÃ‡ÃƒO
  resetText();
  doc.setFontSize(26); doc.setFont("helvetica", "bold");
  doc.setTextColor(pr[0], pr[1], pr[2]);
  doc.text("PublicaÃ§Ã£o / Acesso", M, 100);
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M, 118, 64, 3, "F");
  doc.setTextColor(text[0], text[1], text[2]);
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.text("PublicaÃ§Ã£o online: disponÃ­vel apÃ³s ativaÃ§Ã£o do projeto", M, 180);
  doc.setFontSize(11);
  note();
  doc.text("O endereÃ§o pÃºblico do site serÃ¡ informado assim que o projeto for ativado.", M, 220);
  footer(6);
  doc.addPage();

  // CTA FINAL
  doc.setFillColor(sc[0], sc[1], sc[2]);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(ac[0], ac[1], ac[2]);
  doc.rect(M, 150, 8, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(30);
  doc.setFont("helvetica", "bold");
  doc.text("Vamos comeÃ§ar?", M, 220);
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(`Aprove este projeto e dÃª o prÃ³ximo passo na presenÃ§a digital de ${company}.`, CW), M, 270);
  const fin = [["Desenvolvimento do site", "R$ 499,00"], ["DomÃ­nio", "R$ 40,00/ano"]];
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  let fy = 360;
  fin.forEach((r) => {
    doc.setFont("helvetica", "normal");
    doc.text(r[0], M, fy);
    doc.setFont("helvetica", "bold");
    doc.text(r[1], W - M, fy, { align: "right" });
    fy += 30;
  });
  const phone = str((content.contact && typeof content.contact === "object" ? (content.contact as Record<string, unknown>).phone : null));
  if (phone) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Para aprovar: ${phone}`, M, H - 180);
  }
  doc.setTextColor(200, 210, 210);
  doc.setFontSize(10);
  doc.text(`Â© ${new Date().getFullYear()} ${company}`, M, H - 60);
  footer(7);

  const buffer = doc.output("arraybuffer");
  return { buffer, fileName: pdfFileName(company) };
}
