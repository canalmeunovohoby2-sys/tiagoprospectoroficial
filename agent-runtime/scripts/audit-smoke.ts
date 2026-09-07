import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session.ts";
import { auditSiteInteractions } from "../src/interaction-audit.ts";

const GOOD = `<!doctype html><html><head><style>
#ov{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none}
#ov.open{display:block}
</style></head><body>
<button id="open">Abrir menu</button><div id="ov" onclick="this.classList.remove('open')"><a href="#home" onclick="document.getElementById('ov').classList.remove('open')">Item 1</a><a href="#bolos" onclick="document.getElementById('ov').classList.remove('open')">Item 2</a></div>
<section id="home"><h1>Site bom</h1><a class="cta" href="#home">Botao</a></section>
<script>document.getElementById('open').addEventListener('click',function(){document.getElementById('ov').classList.toggle('open');});</script>
</body></html>`;

// Bug clássico: abrir o menu escurece tudo e CLICAR num item NÃO fecha o overlay.
const BAD = `<!doctype html><html><head><style>
#ov{position:fixed;inset:0;background:#000;z-index:99999;display:none}
#ov.on{display:block}
</style></head><body>
<button id="btn" onclick="document.getElementById('ov').classList.add('on')">Abrir menu</button>
<div id="ov"><a href="#home">Item 1</a><a href="#bolos">Item 2</a></div>
<section id="home"><h1>Conteudo</h1></section>
</body></html>`;
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
