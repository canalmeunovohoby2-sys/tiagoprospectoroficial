// Auditoria de interação (tela preta ao clicar) — QA real pós-geração/edição.
// Duas camadas por viewport (desktop + mobile):
//  1) teste individual com reload (overlay que não fecha no clique isolado);
//  2) CAMINHADA REAL sem reload (menu abre → clica item → overlay preso/preto só
//     aparece na sequência — o bug clássico dos sites gerados).
// Puro de secrets; nunca abre contato externo.
import type { BrowserSession } from "./browser-session.js";

export interface InteractionAuditResult {
  ok: boolean;
  tested: number;
  issues: string[];
}

const WAIT_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isBlack(session: BrowserSession): Promise<boolean> {
  return (await session.measureBlackScreen()).black;
}

// Tenta destravar uma tela preta (mesmo gatilho → backdrop → Escape).
async function recoverFromBlack(session: BrowserSession, sameSel?: string): Promise<boolean> {
  try {
    if (sameSel) {
      await session.clickSelector(sameSel);
      await sleep(280);
      if (!(await isBlack(session))) return true;
    }
    const backdrop = await session.topCenterSelector();
    if (backdrop && backdrop !== sameSel) {
      try {
        await session.clickSelector(backdrop);
        await sleep(280);
        if (!(await isBlack(session))) return true;
      } catch { /* noop */ }
    }
    await session.pressKey("Escape");
    await sleep(280);
    return !(await isBlack(session));
  } catch {
    return !(await isBlack(session));
  }
}

export async function auditSiteInteractions(session: BrowserSession): Promise<InteractionAuditResult> {
  const issues: string[] = [];
  let testedTotal = 0;
  await session.open("", { width: 1366, height: 768 });

  const viewports = [
    { label: "desktop", width: 1366, height: 768 },
    { label: "mobile", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    if (vp.label === "mobile") {
      await session.setViewport(vp.width, vp.height);
    }

    // ── Fase 1: cliques individuais (reload entre eles) ────────────
    const clicks = await session.clickableElements();
    const testedList = clicks.filter((c) => c.visible).slice(0, 12);
    testedTotal += testedList.length;
    for (const c of testedList) {
      try {
        await session.reload();
        const before = await session.measureBlackScreen();
        await session.clickSelector(c.sel);
        await sleep(WAIT_MS);
        const after = await session.measureBlackScreen();
        const causedBlack = after.black && after.ratio - before.ratio >= 0.3;
        if (!causedBlack) continue;
        const recovered = await recoverFromBlack(session, c.sel);
        if (!recovered) {
          issues.push(`[${vp.label}] Clicar em "${c.text || c.sel}" (<${c.tag}>) deixa a tela PRETA e não volta com o mesmo clique/backdrop/Escape.`);
        }
      } catch (e) {
        void e; // seletor sumiu após navegação
      }
    }

    // ── Fase 2: CAMINHADA SEM RELOAD (bug que só aparece em sequência) ─
    // Realidade do usuário: abre o menu, clica num item e o overlay fica preso
    // preto. Recarregar entre cliques escondia esse bug — aqui não recarregamos.
    try {
      await session.reload();
      const seenWalk = new Set<string>();
      let walked = 0;
      for (let guard = 0; guard < 70 && walked < 16; guard++) {
        const available = (await session.clickableElements()).filter((c) => c.visible && !seenWalk.has(c.sel));
        if (!available.length) {
          if (await isBlack(session)) break; // overlay preso sem novos alvos
          break;
        }
        const next = available[0];
        seenWalk.add(next.sel);
        const before = await session.measureBlackScreen();
        await session.clickSelector(next.sel);
        await sleep(WAIT_MS);
        walked += 1;
        testedTotal += 1;
        const after = await session.measureBlackScreen();
        if (!(after.black && after.ratio - before.ratio >= 0.3)) continue;
        const recovered = await recoverFromBlack(session, next.sel);
        if (!recovered) {
          issues.push(`[${vp.label}] Navegação real: após clicar em "${next.text || next.sel}" (<${next.tag}>) a tela fica PRETA e permanece (overlay/menu preso). Correção: garantir que o item de menu fecha o overlay ao navegar.`);
          break;
        }
      }
    } catch (e) {
      void e;
    }
  }

  return { ok: issues.length === 0, tested: testedTotal, issues };
}
