// E2E 5.22 — screenshot real → base64 (cadeia de dados para visão).
// Captura um site real com Playwright e converte para data URL, provando que,
// quando um provider vision for configurado, a imagem chega pronta ao loop.
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session";
import { imageToDataUrl } from "../src/vision";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "prospector-shot-e2e-"));
  const root = join(dir, "site");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "index.html"), `<!doctype html><html><head><title>Academia Demo</title><style>.hero{height:60vh;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-family:sans-serif}</style></head><body><section class="hero"><h1>Academia Demo</h1></section></body></html>`);

  const s = new BrowserSession(root);
  console.log("abrindo site…");
  await s.open("/", { width: 1366, height: 768 });
  const insp = await s.inspectCurrent();
  console.log("title:", insp.title, "| overflow:", insp.horizontalOverflow);

  // Screenshot desktop e mobile
  const shot = await s.screenshot("academia-desktop");
  console.log("screenshot existe:", existsSync(shot), "| path:", shot);

  const img = await imageToDataUrl(shot);
  console.log("converteu para data url:", !!img, "| mediaType:", img?.mediaType);
  console.log("base64 bytes:", img ? Math.round((img.data.length * 3) / 4) : 0);

  await s.close();
  rmSync(dir, { recursive: true, force: true });

  const pass = !!img && img.mediaType === "image/png";
  console.log("\n" + (pass ? "PASS: screenshot real → data URL pronto para visão" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
