import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session.ts";
import { auditSiteInteractions } from "../src/interaction-audit.ts";

const GOOD = `<!doctype html><html><head><style>
#ov{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none}
#ov.open{display:block}
</style></head><body>
<button id="open">Abrir menu</button><div id="ov" onclick="this.classList.remove('open')"><a href="#home">Item</a></div>
<section id="home"><h1>Site bom</h1><a class="cta" href="#home">Botao</a></section></body></html>`;

const BAD = `<!doctype html><html><head><style>
#overlay{position:fixed;inset:0;background:#000;z-index:99999;display:none}
</style></head><body>
<button id="btn" onclick="document.getElementById('overlay').style.display='block'">Clique</button><div id="overlay"></div>
<p>conteudo</p><a href="#x">link</a></body></html>`;
const BAD2 = `<!doctype html><html><body><button id="b" onclick="document.body.style.background='#000';document.body.style.color='#000'">X</button><p>oi</p></body></html>`;

async function run(label: string, html: string) {
  const root = mkdtempSync(join(tmpdir(), "audit-"));
  writeFileSync(join(root, "index.html"), html);
  const session = new BrowserSession(root);
  await session.open("", { width: 1366, height: 768 });
  const r1 = await session.evaluate(`document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"], [onclick], summary').length`);
  const r2 = await session.evaluate(`typeof CSS`);
  console.log(label, JSON.stringify({ r1, r2 }));
  const clicks = await session.clickableElements();
  const black = await session.measureBlackScreen();
  const audit = await auditSiteInteractions(session);
  await session.close().catch(() => {});
  rmSync(root, { recursive: true, force: true });
  console.log(label, JSON.stringify({ clicks, black, audit }));
}

await run("GOOD", GOOD);
await run("BAD", BAD);
