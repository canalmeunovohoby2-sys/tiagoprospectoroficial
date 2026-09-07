// Bateria de interações sem reload — mede se a INTERFACE funcional desaparece
// (texto visível, headings, interativos) em vez de só "cor preta".
import { BrowserSession } from "../src/browser-session.ts";

const dir = process.argv[2];
if (!dir) { console.error("uso: npx tsx scripts/ui-battery.ts <dir>"); process.exit(1); }
const session = new BrowserSession(dir);
const base = await session.startServer();

async function presence(): Promise<{ visibleText: number; visibleHeadings: number; interactive: number; bodyOpacity: number; bodyDisplay: string; htmlHidden: boolean; coveredCenter: boolean; blackish: number }> {
  const r = await session.evaluate(`(() => {
    const isVisible = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05 && b.width > 0 && b.height > 0; };
    const els = Array.from(document.querySelectorAll('h1,h2,h3,p,a,button,li,span')).filter(isVisible);
    let text = 0; let head = 0; let inter = 0;
    for (const el of els) {
      if (el.textContent && el.textContent.trim().length > 1) {
        const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent || '').join(' ').trim();
        if (own.length || el.tagName === 'A' || el.tagName === 'BUTTON') text++;
        if (/^H[1-3]$/.test(el.tagName) && el.textContent.trim()) head++;
      }
      if ((el.tagName === 'A' || el.tagName === 'BUTTON')) inter++;
    }
    const bs = getComputedStyle(document.body);
    const dt = document.documentElement;
    const hs = getComputedStyle(dt);
    const c = document.elementFromPoint(Math.floor(innerWidth/2), Math.floor(innerHeight/2));
    const isContent = c && (c.closest('p,h1,h2,h3,img,nav,a,button,section,main') || c.tagName === 'BODY');
    return {
      visibleText: text,
      visibleHeadings: head,
      interactive: inter,
      bodyOpacity: parseFloat(bs.opacity),
      bodyDisplay: bs.display,
      htmlHidden: hs.display === 'none' || parseFloat(hs.opacity) === 0 || hs.visibility === 'hidden',
      coveredCenter: !isContent && !!c && c !== document.body && c !== document.documentElement,
    };
  })()`);
  return (r as { value: any }).value;
}

await session.open(base, { width: 1366, height: 850 });
await new Promise((res) => setTimeout(res, 600));

const results: Array<Record<string, unknown>> = [];
async function step(label: string, act: () => Promise<void>, ctx: string) {
  const before = await presence();
  await act();
  await new Promise((res) => setTimeout(res, 300));
  const after = await presence();
  const disappeared = before.visibleText > 3 && after.visibleText <= 1;
  results.push({ ctx, label, before, after, DISAPPEARED: disappeared });
}

// Desktop + mobile: bateria sem reload.
for (const vp of [{ label: "desktop", w: 1366, h: 850 }, { label: "mobile", w: 390, h: 844 }]) {
  if (vp.label === "mobile") { await session.setViewport(vp.w, vp.h); }
  await session.reload();
  await new Promise((res) => setTimeout(res, 500));
  const C = vp.label;
  await step(C + " open-menu", async () => { await session.evaluate(`(() => { const b = document.querySelector('#menuToggle, .menu-toggle, [aria-label*="Abrir" i]'); if (b) b.click(); })()`); }, "abrir menu");
  await step(C + " click-menu-item", async () => { await session.evaluate(`(() => { const n = document.querySelector('#mainNav, [class*="menu"]'); const l = n ? n.querySelector('a') : null; if (l) l.click(); })()`); }, "clicar item do menu");
  await step(C + " scroll/secao", async () => { await session.evaluate(`window.scrollTo(0, document.body.scrollHeight / 2);`); }, "rolar para meio");
  await step(C + " cta-primeiro", async () => { await session.evaluate(`(() => { const a = Array.from(document.querySelectorAll('a[href^="#"], button')).filter(x => x.offsetWidth); const c = a.find(x => (x.className && String(x.className).match(/cta|btn/i))) || a[0]; if (c) c.click(); })()`); }, "CTA interno");
  await step(C + " back-fwd", async () => { await session.evaluate(`history.back()`); await new Promise(r => setTimeout(r, 300)); await session.evaluate(`history.forward()`); }, "voltar/avançar");
}

console.log(JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.DISAPPEARED);
console.log(`DISAPPEARED_COUNT=${bad.length}`);
await session.close().catch(() => {});
