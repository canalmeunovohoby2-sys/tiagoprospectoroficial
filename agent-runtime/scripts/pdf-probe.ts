import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session.ts";

const dir = process.argv[2];
if (!dir) { console.error("use: npx tsx scripts/pdf-probe.ts <workspace-dir>"); process.exit(1); }

const session = new BrowserSession(dir);
const base = await session.startServer();
await session.open(base, { width: 1366, height: 850 });
await new Promise((r) => setTimeout(r, 1200));
const dPath = await session.screenshot("desktop", { fullPage: false });
await session.setViewport(390, 844);
await session.reload();
await new Promise((r) => setTimeout(r, 900));
const mPath = await session.screenshot("mobile", { fullPage: false });
await session.close().catch(() => {});
const toB64 = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const desktop = toB64(dPath);
const mobile = toB64(mPath);

const { buildCommercialPdf } = await import("../../src/lib/sitePdf.ts");
const spec = {
  business: { name: "Fogao de Barro Restaurante", segment: "Restaurante", city: "Campinas", state: "SP" },
  design_system: {
    colors: { primary: "#d35400", secondary: "#1f2933", accent: "#f59e0b", background: "#171310" },
    typography: { heading_font: "Sora / sans-serif" },
  },
  content: { hero: { title: "Comida de verdade, feita no fogo de barro", subtitle: "Um site sob medida para o seu restaurante — do cardápio ao contato." } },
};
const res = await buildCommercialPdf(spec as never, null, [desktop, mobile], { primary: "#d35400", accent: "#f59e0b", background: "#171310", secondary: "#1f2933" });
const out = join(tmpdir(), `proposta-teste-${Date.now()}.pdf`);
import("node:fs").then((fs) => fs.writeFileSync(out, Buffer.from(res.buffer)));
console.log(JSON.stringify({ fileName: res.fileName, sizeBytes: res.buffer.byteLength, out }));
