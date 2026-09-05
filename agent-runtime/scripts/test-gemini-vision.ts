// Testa a edge gemini-vision com um screenshot real (capturado via Playwright).
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session";
import { visualReviewWithGemini, formatVisualReview } from "../src/vision-gemini";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "prospector-gv-"));
  const root = join(dir, "site");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "index.html"), `<!doctype html><html><head><title>Clínica Sorriso Prime</title><style>
    body{margin:0;font-family:Arial}.hero{height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#cfe0ff}
    h1{font-size:60px;color:#fff;text-shadow:0 0 6px #000} /* texto claro sobre fundo claro — contraste fraco */
    .cta{background:#fafafa;color:#fff;padding:40px;border-radius:4px} /* botão quase invisível */
  </style></head><body><section class="hero"><h1>Clínica Sorriso Prime</h1><p>Odontologia</p><a class="cta" href="#">Agendar</a></section></body></html>`);

  const s = new BrowserSession(root);
  await s.open("/", { width: 1366, height: 768 });
  const shot = await s.screenshot("clinica-desktop");
  await s.close();

  console.log("screenshot:", shot);
  const res = await visualReviewWithGemini({
    screenshotPath: shot,
    context: "Empresa: Clínica Sorriso Prime · Segmento: Odontologia · Objetivo: avaliar qualidade visual.",
    purpose: "QA de geração inicial — buscar problemas visuais reais",
  });
  console.log("usedVision:", res.usedVision, "| ok:", res.ok, "| error:", res.error ?? "—");
  console.log("\n--- diagnóstico ---\n" + formatVisualReview(res));

  rmSync(dir, { recursive: true, force: true });
  process.exit(res.usedVision ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
