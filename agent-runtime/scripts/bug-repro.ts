import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSession } from "../src/browser-session.ts";

// Fluxo exato sem reload: abrir menu → clicar item → verificar tela preta.
async function flow(session: BrowserSession, vp: string, out: Record<string, unknown>) {
  const r = await session.evaluate(`(() => {
    const btn = document.querySelector('#menuToggle, .menu-toggle, [aria-label*="Abrir" i], button');
    if (!btn) return { noToggle: true };
    btn.click();
    return { opened: true };
  })()`);
  await new Promise((r2) => setTimeout(r2, 300));
  const open = await session.evaluate(`(() => ({
    bodyClass: document.body.className,
    htmlClass: document.documentElement.className,
    bodyOverflow: getComputedStyle(document.body).overflow,
    centerCovered: !!document.elementFromPoint(innerWidth/2, innerHeight/2)
  }))()`);
  const afterOpenBlack = await session.measureBlackScreen();
  const clickItem = await session.evaluate(`(() => {
    const nav = document.querySelector('#mainNav, [class*="menu"]');
    const links = Array.from(document.querySelectorAll('nav a, [class*="menu"] a, a[href^="#"]')).filter(a => a.offsetWidth);
    const l = (nav ? nav.querySelectorAll('a') : []).length ? Array.from(nav.querySelectorAll('a')).filter(a=>a.offsetWidth)[0] : links[0];
    if (!l) return { noLink: true };
    l.click();
    return { clicked: l.getAttribute('href') || '' };
  })()`);
  await new Promise((r2) => setTimeout(r2, 350));
  const afterItemRes = await session.evaluate(`(() => ({
    bodyClass: document.body.className,
    bodyOverflow: getComputedStyle(document.body).overflow,
    navOpen: !!document.querySelector('#mainNav, [class*="menu"]') && Array.from(document.querySelectorAll('#mainNav, [class*="menu"]')).some(n => n.classList.contains('open'))
  }))()`);
  const afterItem = ((afterItemRes as { value?: { bodyClass?: string; navOpen?: boolean } }).value ?? {});
  const afterItemBlack = await session.measureBlackScreen();
  out[vp] = {
    r, open, afterOpenBlack,
    clickItem,
    afterItemBlack,
    bodyClassAfter: afterItem.bodyClass ?? "",
    navStillOpen: afterItem.navOpen ?? false,
    console: await session.evaluate(`JSON.stringify(window.__errs || [])`),
  };
}

async function probe(dir: string, label: string) {
  const session = new BrowserSession(dir);
  const base = await session.startServer();
  await session.open(base, { width: 1366, height: 850 });
  await new Promise((r) => setTimeout(r, 500));
  const out: Record<string, unknown> = {};
  await flow(session, "desktop", out);
  await session.setViewport(390, 844);
  await session.reload();
  await new Promise((r) => setTimeout(r, 400));
  await flow(session, "mobile", out);
  const vulnerable = (out as Record<string, { afterItemBlack: { black: boolean } }>).desktop?.afterItemBlack?.black || (out as Record<string, { afterItemBlack: { black: boolean } }>).mobile?.afterItemBlack?.black;
  console.log(label, JSON.stringify(out));
  await session.close().catch(() => {});
  return !!vulnerable;
}

const dirArg = process.argv[2];
if (dirArg) {
  await probe(dirArg, "REAL_WORKSPACE");
} else {
  const root = mkdtempSync(join(tmpdir(), "vuln-"));
  writeFileSync(join(root, "index.html"), `<!doctype html><html><head><style>
#menuToggle{position:fixed;top:12px;right:12px;z-index:60;background:#333;color:#fff;border:0;padding:10px 14px}
#mainNav{position:fixed;inset:0;background:#000;z-index:50;display:none;flex-direction:column;justify-content:center;align-items:center}
#mainNav.open{display:flex}
</style></head><body><button id="menuToggle">Abrir</button>
<nav id="mainNav"><a href="#home">Home</a><a href="#sobre">Sobre</a></nav>
<section id="home" style="height:200vh"><h1>Home</h1><a class="cta" href="#cta">CTA</a></section></body></html>`);
  writeFileSync(join(root, "site.js"), `const b=document.getElementById('menuToggle'),n=document.getElementById('mainNav');b.addEventListener('click',()=>n.classList.add('open'));document.addEventListener('keydown',e=>{if(e.key==='Escape')n.classList.remove('open')});`);
  const html = `<!doctype html><html><head><script src="site.js"></script><style>
#menuToggle{position:fixed;top:12px;right:12px;z-index:60;background:#333;color:#fff;border:0;padding:10px 14px}
#mainNav{position:fixed;inset:0;background:#000;z-index:50;display:none;flex-direction:column;justify-content:center;align-items:center}
#mainNav.open{display:flex}
</style></head><body><button id="menuToggle">Abrir</button>
<nav id="mainNav"><a href="#home">Home</a><a href="#sobre">Sobre</a></nav>
<section id="home" style="height:100vh"><h1>Home</h1></section></body></html>`;
  writeFileSync(join(root, "index.html"), html);
  writeFileSync(join(root, "site.js"), `const b=document.getElementById('menuToggle'),n=document.getElementById('mainNav');b.addEventListener('click',()=>n.classList.add('open'));`);
  const bad = await probe(root, "PADRAO_VULNERAVEL");
  rmSync(root, { recursive: true, force: true });
  process.exit(bad ? 3 : 0);
}
