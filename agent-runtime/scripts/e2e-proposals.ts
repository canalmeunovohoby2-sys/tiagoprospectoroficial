// E2E 5.30 — PDF de proposta comercial premium INDIVIDUAL por projeto.
// Gera dois sites visualmente diferentes, captura screenshots REAIS de cada um
// (desktop + mobile) com o mesmo BrowserSession e gera os PDFs. Valida:
//  - PDFs válidos (%PDF) e distintos entre projetos;
//  - screenshots reais incorporados (objetos de imagem no PDF);
//  - nomes/identidade por projeto (sem documento genérico único).
import { ensureWorkspaceDir, cleanupWorkspace } from "../src/workspace";
import { BrowserSession } from "../src/browser-session";
import { buildCommercialPdf } from "../../src/lib/sitePdf";

interface Project {
  pid: string;
  spec: Record<string, unknown>;
  files: Record<string, string>;
}

function makeSite(bg: string, fg: string, title: string, segment: string, name: string): Record<string, string> {
  return {
    "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${name}</title><style>body{margin:0;font-family:Georgia,serif;background:${bg};color:${fg}}header{display:flex;justify-content:space-between;padding:18px 28px}nav a{color:${fg};margin-left:14px}section{padding:60px 28px}h1{font-size:44px}a.cta{background:${fg};color:${bg};padding:12px 22px;text-decoration:none;border-radius:8px}footer{padding:24px;opacity:.8}</style></head><body><header><strong>${name}</strong><nav><a>Início</a><a>Serviços</a><a>Contato</a></nav></header><section><h1>${title}</h1><p>${segment} com identidade própria, conteúdo real e layout responsivo para qualquer tela.</p><a class="cta" href="#">Falar agora</a></section><footer>© ${name}</footer></body></html>`,
  };
}

async function capture(root: string): Promise<{ desktop?: string; mobile?: string }> {
  const session = new BrowserSession(root);
  try {
    const base = await session.startServer();
    await session.open(base, { width: 1366, height: 850 });
    const d = await session.screenshot("desktop", { fullPage: false });
    await session.setViewport(390, 844);
    await session.reload();
    const m = await session.screenshot("mobile", { fullPage: false });
    const { readFileSync } = await import("node:fs");
    const toD = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
    return { desktop: toD(d), mobile: toD(m) };
  } finally {
    await session.close().catch(() => {});
  }
}

async function main() {
  const projects: Project[] = [
    {
      pid: "prop-barbearia",
      spec: {
        business: { name: "Barbearia Navalha", segment: "Barbearia", city: "São Paulo", state: "SP", whatsapp: "5511911111111" },
        design_system: {
          colors: { primary: "#8a4b1d", secondary: "#171310", accent: "#e9b65c", background: "#f6efe4", surface: "#ffffff", on_surface: "#201a15" },
          typography: { heading_font: "Fraunces" }, visual_style: "Editorial masculino premium, tons de madeira e dourado",
        },
        content: { hero: { title: "Cortes que contam história", subtitle: "Navalha, tesoura e tradição no centro de SP." }, services: { items: [{ title: "Corte clássico", description: "Tesoura e navalha com acabamento preciso." }, { title: "Barba", description: "Toalha quente e cuidado nos detalhes." }] } },
        sections: [{ type: "hero" }, { type: "services" }],
      },
      files: makeSite("#171310", "#e9b65c", "Cortes que contam história", "Barbearia premium", "Barbearia Navalha"),
    },
    {
      pid: "prop-cafeteria",
      spec: {
        business: { name: "Café Aurora", segment: "Cafeteria", city: "Curitiba", state: "PR", whatsapp: "5541999999999" },
        design_system: {
          colors: { primary: "#1e7a5a", secondary: "#123f30", accent: "#f2a65a", background: "#f4fbf7", surface: "#ffffff", on_surface: "#12241c" },
          typography: { heading_font: "Playfair Display" }, visual_style: "Editorial acolhedor, verde-esmeralda e caramelo",
        },
        content: { hero: { title: "Café de verdade, feito com calma", subtitle: "Grãos selecionados e pães da casa todos os dias." }, services: { items: [{ title: "Cafés especiais", description: "Torra própria e métodos filtrados." }, { title: "Brunch", description: "Sábados e domingos, das 9h às 13h." }] } },
        sections: [{ type: "hero" }, { type: "services" }],
      },
      files: makeSite("#f4fbf7", "#123f30", "Café de verdade, feito com calma", "Cafeteria artesanal", "Café Aurora"),
    },
  ];

  const out: Array<{ name: string; fileName: string; bytes: number; images: number; pdfOk: boolean }> = [];
  for (const p of projects) {
    const root = ensureWorkspaceDir(p.pid, p.files);
    const shots = await capture(root);
    cleanupWorkspace(p.pid);
    const heroData = null; // usa screenshots reais
    const r = await buildCommercialPdf(p.spec, heroData, [shots.desktop, shots.mobile].filter((s): s is string => !!s));
    const buf = Buffer.from(r.buffer);
    const images = (buf.toString("latin1").match(/\/Image\b/g) ?? []).length;
    const businessName = String((p.spec.business as Record<string, unknown>)?.name ?? "");
    out.push({ name: businessName, fileName: r.fileName, bytes: buf.length, images, pdfOk: buf.slice(0, 5).toString("ascii") === "%PDF-" });
    console.log(`${p.pid}: pdf=${buf.length} bytes | screenshots desktop+mobile | /Image=${images} | arquivo=${r.fileName}`);
  }

  const allPdf = out.every((o) => o.pdfOk);
  const distinct = out[0].fileName !== out[1].fileName && out[0].bytes !== out[1].bytes && JSON.stringify(out[0]) !== JSON.stringify(out[1]);
  const hasImages = out.every((o) => o.images >= 2);
  const hasContentBytes = out.every((o) => o.bytes > 30_000);
  console.log("\nPDFs válidos:", allPdf, "| distintos entre projetos:", distinct, "| screenshots reais incorporados:", hasImages, "| tamanho consistente:", hasContentBytes);
  const pass = allPdf && distinct && hasImages && hasContentBytes;
  console.log("\n" + (pass ? "PASS: PDFs individuais premium com capturas reais por projeto" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
