// Auditoria de interação (tela preta ao clicar) — QA real pós-geração/edição.
// Clica em cada elemento interativo e mede se a página fica preta (cobertura de
// 25 pontos com cor final opaca escura). Se ficar preta, tenta fechar (mesmo
// gatilho/Escape); só considera bug se continuar preta. Puro de secrets.
import type { BrowserSession } from "./browser-session.js";

export interface InteractionAuditResult {
  ok: boolean;
  tested: number;
  issues: string[];
}

const WAIT_AFTER_CLICK_MS = 320;

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
    const clicks = await session.clickableElements();
    const testedList = clicks.filter((c) => c.visible).slice(0, 14);
    testedTotal += testedList.length;
    for (const c of testedList) {
      try {
        await session.reload();
        const before = await session.measureBlackScreen();
        await session.clickSelector(c.sel);
        await new Promise((r) => setTimeout(r, WAIT_AFTER_CLICK_MS));
        const after = await session.measureBlackScreen();
        // Só considera bug quando o CLIQUE causou escurecimento total: a tela
        // ficou preta E o escurecimento subiu muito em relação ao estado antes
        // (evita falso positivo de sites/hero escuros).
        const causedBlack = after.black && after.ratio - before.ratio >= 0.3;
        if (!causedBlack) continue;
        let recovered = false;
        try {
          await session.clickSelector(c.sel);
          await new Promise((r) => setTimeout(r, 280));
          recovered = !(await session.measureBlackScreen()).black;
        } catch { /* noop */ }
        if (!recovered) {
          try {
            await session.pressKey("Escape");
            await new Promise((r) => setTimeout(r, 280));
            recovered = !(await session.measureBlackScreen()).black;
          } catch { /* noop */ }
        }
        if (!recovered) {
          issues.push(`[${vp.label}] Clicar em "${c.text || c.sel}" (<${c.tag}>) deixa a tela PRETA e ela não volta com o mesmo clique nem com Escape. Causa provável: overlay/modal/menu full-screen escuro que não fecha, camada cobrindo a página ou erro JS no handler.`);
        }
      } catch (e) {
        // seletor pode ter sumido após navegação — ignora
        void e;
      }
    }
  }
  return { ok: issues.length === 0, tested: testedTotal, issues };
}
